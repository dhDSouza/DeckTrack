import { readFile } from "node:fs/promises";
import path from "node:path";

import { AppError } from "../errors/AppError";

export type ImageSize = "small" | "normal" | "art_crop";
type Face = { name: string; artist: string; images: Record<string, string> };
export type Imagery = { name: string; url: string; faces: Face[]; missing?: boolean };
type ImageCard = { name: string; externalId?: string | null };

export function safeImageUrl(value: string) {
    try {
        const url = new URL(value);

        return (
            url.protocol === "https:" &&
            url.hostname === "cards.scryfall.io" &&
            !url.port &&
            !url.username &&
            !url.password
        );
    } catch {
        return false;
    }
}

export function imageUrl(face: Face, size: ImageSize) {
    const keys =
        size === "small"
            ? ["small", "thumb", "grid", "normal", "jpeg", "large"]
            : size === "art_crop"
              ? ["art_crop", "art", "display", "normal", "jpeg"]
              : ["normal", "display", "jpeg", "large", "small"];

    return keys.map((key) => face.images[key]).find((url) => url && safeImageUrl(url));
}

export class CardImages {
    private index?: Promise<Record<string, Imagery>>;

    private names = new Map<string, Imagery>();

    private memory = new Map<string, { expires: number; info: Imagery }>();

    private pending = new Map<string, Promise<Imagery>>();

    private queue: Promise<unknown> = Promise.resolve();

    private nextApi = 0;

    constructor(
        private indexFile = path.resolve(__dirname, "../../data/card-images.json"),
        private fetcher: typeof fetch = fetch,
        private now = () => Date.now(),
        private wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))
    ) {}

    private load() {
        if (!this.index) {
            this.index = readFile(this.indexFile, "utf8")
                .then((raw) => {
                    const cards = JSON.parse(raw).cards as Record<string, Imagery>;

                    if (!cards || typeof cards !== "object" || Array.isArray(cards)) {
                        throw new Error("Índice de imagens inválido.");
                    }

                    for (const info of Object.values(cards)) {
                        this.names.set(info.name.toLowerCase(), info);
                    }

                    return cards;
                })
                .catch((error) => {
                    if (error.code !== "ENOENT") {
                        this.index = undefined;
                        throw error;
                    }

                    return {};
                });
        }

        return this.index;
    }

    async indexed(card: ImageCard) {
        const index = await this.load();
        const oracle = card.externalId?.match(/^oracle:([0-9a-f-]{36})$/i)?.[1];

        return (oracle ? index[oracle.toLowerCase()] : undefined) ?? this.names.get(card.name.toLowerCase());
    }

    async ready() {
        await this.load();
    }

    async decorate<T extends ImageCard>(card: T): Promise<T & { imagery?: Imagery }> {
        const imagery = await this.indexed(card);

        return imagery ? { ...card, imagery } : card;
    }

    async info(card: ImageCard): Promise<Imagery> {
        const indexed = await this.indexed(card);

        if (indexed) {
            return indexed;
        }

        // Only custom/new cards absent from the bulk index need a live JSON lookup.
        const key = card.externalId || card.name,
            known = this.memory.get(key);

        if (known && known.expires > this.now()) {
            return known.info;
        }

        const pending = this.pending.get(key);

        if (pending) {
            return pending;
        }
        if (this.pending.size >= 100) {
            throw new AppError(503, "Aguarde a consulta das imagens.");
        }

        const request = this.queue
            .catch(() => {})
            .then(async () => {
                const delay = this.nextApi - this.now();

                if (delay > 60000) {
                    throw new AppError(503, "Scryfall temporariamente indisponível.");
                }
                if (delay > 0) {
                    await this.wait(delay);
                }

                this.nextApi = this.now() + 150;

                const oracle = card.externalId?.match(/^oracle:([0-9a-f-]{36})$/i)?.[1];
                const url = oracle
                    ? `https://api.scryfall.com/cards/search?${new URLSearchParams({ q: `oracleid:${oracle}`, unique: "cards" })}`
                    : `https://api.scryfall.com/cards/named?${new URLSearchParams({ exact: card.name })}`;
                const response = await this.fetcher(url, {
                    headers: { "User-Agent": "DeckTrack/1.0 (custom card image lookup)", Accept: "application/json" },
                    signal: AbortSignal.timeout(10000),
                    redirect: "error"
                });

                if (response.status === 429) {
                    this.nextApi =
                        this.now() +
                        Math.min(600, Math.max(1, Number(response.headers.get("retry-after")) || 30)) * 1000;
                    throw new AppError(503, "Scryfall solicitou uma pausa.");
                }
                if (response.status === 404) {
                    return { name: card.name, url: "https://scryfall.com", faces: [], missing: true };
                }
                if (!response.ok) {
                    throw new AppError(503, "Imagens temporariamente indisponíveis.");
                }

                const raw = await response.json(),
                    data = oracle ? raw.data?.[0] : raw;

                if (!data || (oracle && data.oracle_id !== oracle)) {
                    throw new AppError(503, "Resposta de imagem inválida.");
                }

                const faces = (data.card_faces?.some((face: any) => face.image_uris) ? data.card_faces : [data]).map(
                    (face: any) => ({
                        name: face.name || data.name,
                        artist: face.artist || data.artist || "",
                        images: Object.fromEntries(
                            Object.entries(face.image_uris || {}).filter(
                                (entry): entry is [string, string] =>
                                    typeof entry[1] === "string" && safeImageUrl(entry[1])
                            )
                        )
                    })
                );

                return {
                    name: data.name || card.name,
                    url:
                        typeof data.scryfall_uri === "string" && data.scryfall_uri.startsWith("https://scryfall.com/")
                            ? data.scryfall_uri
                            : "https://scryfall.com",
                    faces
                };
            })
            .then((info) => {
                if (this.memory.size >= 1000) {
                    this.memory.delete(this.memory.keys().next().value!);
                }

                this.memory.set(key, { expires: this.now() + 86400000, info });

                return info;
            })
            .catch((error) => {
                this.memory.set(key, {
                    expires: this.now() + 30000,
                    info: { name: card.name, url: "https://scryfall.com", faces: [], missing: true }
                });
                throw error;
            })
            .finally(() => this.pending.delete(key));

        this.queue = request;
        this.pending.set(key, request);

        return request;
    }

    async image(card: ImageCard, size: ImageSize, faceIndex: number): Promise<string> {
        const info = await this.info(card),
            face = info.faces[faceIndex],
            url = face ? imageUrl(face, size) : undefined;

        if (!url) {
            throw new AppError(404, "Imagem não disponível para esta carta ou face.");
        }

        return url;
    }
}

export const cardImages = new CardImages();

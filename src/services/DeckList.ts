type CatalogCard = { id: string; name: string; externalId?: string | null };
type Issue = { line: number; text: string; message: string };

export const MAX_QUANTITY = 2147483647;

export function normalizeCardName(name: string) {
    return name
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/æ/gi, "ae")
        .replace(/œ/gi, "oe")
        .replace(/[’‘`]/g, "'")
        .replace(/\s*\/\/\s*/g, " // ")
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase();
}

export function resolveDeckList(text: string, catalog: CatalogCard[]) {
    const exact = new Map<string, CatalogCard[]>(),
        faces = new Map<string, CatalogCard[]>();

    function index(map: Map<string, CatalogCard[]>, name: string, card: CatalogCard) {
        const key = normalizeCardName(name),
            existing = map.get(key) ?? [];

        if (!existing.some((item) => item.id === card.id)) {
            existing.push(card);
        }

        map.set(key, existing);
    }

    for (const card of catalog) {
        index(exact, card.name, card);

        if (card.name.includes("//")) {
            for (const face of card.name.split("//")) {
                index(faces, face, card);
            }
        }
    }

    const errors: Issue[] = [],
        resolved = new Map<string, { cardId: string; name: string; quantity: number; lines: number[] }>();
    const lines = text.replace(/^\uFEFF/, "").split(/\r\n?|\n/);

    if (lines.length > 1000) {
        return {
            canImport: false,
            cards: [],
            errors: [{ line: 0, text: "", message: "Use no máximo 1.000 linhas por importação." }],
            totalQuantity: 0
        };
    }

    lines.forEach((raw, position) => {
        const line = position + 1,
            value = raw
                .trim()
                .replace(/\\\s*$/, "")
                .trim();

        if (!value || /^-{3,}$/.test(value)) {
            return;
        }

        const match = /^(\d+)(?:x)?\s+(.+)$/i.exec(value);

        if (!match) {
            errors.push({ line, text: raw, message: "Use quantidade seguida do nome. Ex.: 30 Island." });

            return;
        }

        const quantity = Number(match[1]),
            name = match[2].trim();

        if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QUANTITY) {
            errors.push({ line, text: raw, message: `A quantidade deve estar entre 1 e ${MAX_QUANTITY}.` });

            return;
        }

        const key = normalizeCardName(name);
        let candidates = exact.get(key) ?? faces.get(key) ?? [];
        // Prefer the canonical imported record when a manually registered copy exists.
        const canonical = candidates.filter((card) => card.externalId?.startsWith("oracle:"));

        if (canonical.length === 1) {
            candidates = canonical;
        }
        if (candidates.length !== 1) {
            errors.push({
                line,
                text: raw,
                message: candidates.length
                    ? `Nome ambíguo: ${name}. Use o nome completo da carta.`
                    : `Carta não encontrada: ${name}. Confira o nome em inglês.`
            });

            return;
        }

        const card = candidates[0],
            previous = resolved.get(card.id);

        if ((previous?.quantity ?? 0) + quantity > MAX_QUANTITY) {
            errors.push({ line, text: raw, message: `A soma das quantidades de ${card.name} excede o limite.` });

            return;
        }

        resolved.set(card.id, {
            cardId: card.id,
            name: card.name,
            quantity: (previous?.quantity ?? 0) + quantity,
            lines: [...(previous?.lines ?? []), line]
        });
    });

    if (!resolved.size && !errors.length) {
        errors.push({ line: 0, text: "", message: "Informe pelo menos uma carta." });
    }

    const cards = [...resolved.values()];

    return {
        canImport: errors.length === 0,
        cards,
        errors,
        totalQuantity: cards.reduce((sum, card) => sum + card.quantity, 0)
    };
}

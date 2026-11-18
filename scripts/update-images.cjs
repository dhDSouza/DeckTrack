const { writeFile, rename, mkdir, readFile } = require("node:fs/promises");
const { resolve } = require("node:path");
const { imagery } = require("./image-data.cjs");
const { gunzipSync } = require("node:zlib");
const headers = { "User-Agent": "DeckTrack/1.0 (bulk image URL index)", Accept: "application/json" };

async function main() {
    console.log("Consultando o arquivo bulk do Scryfall…");

    const response = await fetch("https://api.scryfall.com/bulk-data", { headers, signal: AbortSignal.timeout(30000) });

    if (!response.ok) {
        throw new Error(`Scryfall respondeu HTTP ${response.status}.`);
    }

    const listing = await response.json(),
        bulk = listing.data?.find((file) => file.type === "oracle_cards");
    const downloadUri = bulk?.jsonl_download_uri || bulk?.download_uri;

    if (!downloadUri) {
        throw new Error("Arquivo Oracle Cards não encontrado.");
    }

    const url = new URL(downloadUri);

    if (url.protocol !== "https:" || url.hostname !== "data.scryfall.io") {
        throw new Error("Origem bulk inesperada.");
    }

    console.log("Baixando metadados em lote (nenhum arquivo de imagem será baixado)…");

    const download = await fetch(url, { headers, signal: AbortSignal.timeout(300000) });

    if (!download.ok) {
        throw new Error(`Download respondeu HTTP ${download.status}.`);
    }

    const raw = Buffer.from(await download.arrayBuffer());
    const text = (raw[0] === 0x1f && raw[1] === 0x8b ? gunzipSync(raw) : raw).toString("utf8");
    const data = text.trimStart().startsWith("[")
        ? JSON.parse(text)
        : text
              .split(/\r?\n/)
              .filter((line) => line.trim())
              .map((line) => JSON.parse(line));

    if (!Array.isArray(data) || data.length < 20000) {
        throw new Error("Arquivo bulk incompleto.");
    }

    const catalog = JSON.parse(await readFile(resolve(__dirname, "../data/catalog.json"), "utf8"));
    const wanted = new Set(catalog.cards.map((card) => card.externalId?.replace(/^oracle:/, "")));
    const cards = {};

    for (const card of data) {
        if (card.oracle_id && wanted.has(card.oracle_id)) {
            const info = imagery(card);

            if (info.faces.some((face) => Object.keys(face.images).length)) {
                cards[card.oracle_id] = info;
            }
        }
    }

    if (Object.keys(cards).length < 20000) {
        throw new Error("Índice de imagens incompleto; arquivo anterior preservado.");
    }

    const directory = resolve(__dirname, "../data");

    await mkdir(directory, { recursive: true });

    const file = resolve(directory, "card-images.json");

    await writeFile(
        file + ".tmp",
        JSON.stringify({
            source: "https://api.scryfall.com/bulk-data",
            sourceDate: bulk.updated_at,
            generatedAt: new Date().toISOString(),
            cards
        }) + "\n"
    );
    await rename(file + ".tmp", file);
    console.log(`${Object.keys(cards).length} cartas com URLs diretos em data/card-images.json. Reinicie a aplicação.`);
}

main().catch((error) => {
    console.error("Não foi possível atualizar os URLs:", error.message);
    process.exitCode = 1;
});

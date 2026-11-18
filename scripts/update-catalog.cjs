const { writeFile, rename, mkdir } = require("node:fs/promises");
const { resolve } = require("node:path");
const { gunzipSync } = require("node:zlib");
const { buildCards } = require("./catalog-data.cjs");

const source = "https://mtgjson.com/api/v5/AtomicCards.json.gz";

async function main() {
    console.log("Baixando AtomicCards do MTGJSON (esta operação pode levar alguns minutos)…");

    const response = await fetch(source, { signal: AbortSignal.timeout(300000) });

    if (!response.ok) {
        throw new Error(`MTGJSON respondeu HTTP ${response.status}.`);
    }

    const raw = Buffer.from(await response.arrayBuffer());
    // Fetch may already have decompressed a response with Content-Encoding: gzip.
    const data = JSON.parse((raw[0] === 0x1f && raw[1] === 0x8b ? gunzipSync(raw) : raw).toString("utf8"));

    if (!data.meta?.date || !data.data || Array.isArray(data.data)) {
        throw new Error("Formato inesperado do MTGJSON.");
    }

    const cards = buildCards(data.data);

    if (cards.length < 20000) {
        throw new Error("Catálogo incompleto; o arquivo anterior foi preservado.");
    }

    const setsResponse = await fetch("https://mtgjson.com/api/v5/SetList.json", { signal: AbortSignal.timeout(60000) });

    if (!setsResponse.ok) {
        throw new Error(`Lista de edições respondeu HTTP ${setsResponse.status}.`);
    }

    const setsData = await setsResponse.json();

    if (
        !Array.isArray(setsData.data) ||
        !setsData.data.every((set) => typeof set.code === "string" && typeof set.name === "string")
    ) {
        throw new Error("Lista de edições inválida.");
    }

    const sets = setsData.data.map(({ code, name, releaseDate }) => ({ code, name, releaseDate }));
    const snapshot = { source, sourceDate: data.meta.date, generatedAt: new Date().toISOString(), sets, cards };
    const directory = resolve(__dirname, "../data");

    await mkdir(directory, { recursive: true });

    const file = resolve(directory, "catalog.json");

    await writeFile(`${file}.tmp`, JSON.stringify(snapshot) + "\n", "utf8");
    await rename(`${file}.tmp`, file);
    console.log(
        `${cards.length} cartas com metadados salvas em data/catalog.json. Fonte: ${snapshot.sourceDate}. Reinicie a aplicação para importar.`
    );
}

main().catch((error) => {
    console.error("Não foi possível atualizar o catálogo:", error.message);
    process.exitCode = 1;
});

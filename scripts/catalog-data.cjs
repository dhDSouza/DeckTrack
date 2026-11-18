const { createHash } = require("node:crypto");

function buildCards(data) {
    const cards = new Map();

    for (const faces of Object.values(data)) {
        if (!Array.isArray(faces)) {
            throw new Error("Grupo de cartas inválido.");
        }

        for (const face of faces) {
            if (typeof face.name !== "string" || !face.name.trim() || face.name.length > 200) {
                throw new Error("Nome de carta inválido.");
            }

            const oracleId = face.identifiers?.scryfallOracleId;
            const externalId = oracleId
                ? `oracle:${oracleId}`
                : `mtgjson:${createHash("sha256").update(face.name).digest("hex")}`;

            if (!cards.has(externalId)) {
                cards.set(externalId, {
                    name: face.name,
                    externalId,
                    metadata: {
                        colors: [],
                        colorIdentity: [],
                        types: [],
                        keywords: [],
                        printings: [],
                        legalities: {},
                        faces: []
                    }
                });
            }

            const card = cards.get(externalId),
                metadata = card.metadata;

            for (const key of ["colors", "colorIdentity", "types", "keywords", "printings"]) {
                metadata[key] = [...new Set([...metadata[key], ...(face[key] ?? [])])].sort();
            }

            Object.assign(metadata.legalities, face.legalities ?? {});

            const details = {
                name: face.faceName || face.name,
                type: face.type || "",
                text: face.text || "",
                manaCost: face.manaCost || "",
                manaValue: Number.isFinite(face.manaValue) ? face.manaValue : null,
                side: face.side || "a"
            };

            if (!metadata.faces.some((item) => item.name === details.name && item.side === details.side)) {
                metadata.faces.push(details);
            }
        }
    }

    for (const card of cards.values()) {
        const meta = card.metadata;

        meta.faces.sort((a, b) => a.side.localeCompare(b.side));
        meta.type = [...new Set(meta.faces.map((face) => face.type))].join(" // ");
        meta.text = meta.faces.map((face) => face.text).join("\n\n");
        meta.manaCost = meta.faces
            .map((face) => face.manaCost)
            .filter(Boolean)
            .join(" // ");
        meta.manaValue = meta.faces[0]?.manaValue ?? null;
    }

    return [...cards.values()].sort((a, b) => a.name.localeCompare(b.name, "en"));
}

module.exports = { buildCards };

import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

import { AppDataSource } from "./config/dataSource";

import { Card } from "./entities/Cards";

const strings = z.array(z.string());

export const metadataSchema = z.object({
    colors: strings.default([]),
    colorIdentity: strings.default([]),
    types: strings.default([]),
    type: z.string().default(""),
    text: z.string().default(""),
    manaCost: z.string().default(""),
    manaValue: z.number().nonnegative().nullable().default(null),
    keywords: strings.default([]),
    printings: strings.default([]),
    legalities: z.record(z.string(), z.string()).default({}),
    faces: z
        .array(
            z.object({
                name: z.string(),
                type: z.string(),
                text: z.string(),
                manaCost: z.string(),
                manaValue: z.number().nonnegative().nullable(),
                side: z.string()
            })
        )
        .default([])
});

export const catalogSchema = z
    .object({
        source: z.string().url(),
        sourceDate: z.string().min(1),
        sets: z.array(z.object({ code: z.string(), name: z.string(), releaseDate: z.string().optional() })).default([]),
        cards: z
            .array(
                z.object({
                    name: z.string().trim().min(1).max(200),
                    externalId: z.string().min(1).max(100),
                    metadata: metadataSchema.optional()
                })
            )
            .min(1)
    })
    .superRefine((catalog, context) => {
        const ids = new Set<string>();

        for (const card of catalog.cards) {
            if (ids.has(card.externalId)) {
                context.addIssue({ code: "custom", message: `Identificador duplicado: ${card.externalId}` });
            }

            ids.add(card.externalId);
        }
    });
let optionsCache:
    | Promise<{ sets: { code: string; name: string; releaseDate?: string }[]; types: string[]; keywords: string[] }>
    | undefined;

export function catalogFilterOptions() {
    if (!optionsCache) {
        optionsCache = readFile(path.resolve(__dirname, "../data/catalog.json"), "utf8")
            .then((raw) => {
                const catalog = catalogSchema.parse(JSON.parse(raw));

                return {
                    sets: catalog.sets.sort((a, b) => a.name.localeCompare(b.name)),
                    types: [...new Set(catalog.cards.flatMap((card) => card.metadata?.types ?? []))].sort(),
                    keywords: [...new Set(catalog.cards.flatMap((card) => card.metadata?.keywords ?? []))].sort()
                };
            })
            .catch((error) => {
                optionsCache = undefined;
                throw error;
            });
    }

    return optionsCache;
}

export async function seedCatalog() {
    const catalog = catalogSchema.parse(
        JSON.parse(await readFile(path.resolve(__dirname, "../data/catalog.json"), "utf8"))
    );

    // One transaction prevents a failed import from leaving a partial catalog.
    // Upserts retain card UUIDs and therefore all collection/deck references.
    await AppDataSource.transaction(async (manager) => {
        const repository = manager.getRepository(Card);

        for (let offset = 0; offset < catalog.cards.length; offset += 500) {
            await repository.upsert(catalog.cards.slice(offset, offset + 500), {
                conflictPaths: ["externalId"],
                skipUpdateIfNoValuesChanged: true
            });
        }
    });

    console.log(`Catálogo disponível: ${catalog.cards.length} cartas (MTGJSON, ${catalog.sourceDate}).`);
}

import { FindOptionsWhere, ILike, Raw } from "typeorm";

import { Card } from "../entities/Cards";

import type { CardSearch } from "../controllers/schemas";

export const literalPattern = (value: string) => `%${value.replace(/[\\%_]/g, "\\$&")}%`;
const quotedColumn = (alias: string) =>
    alias
        .split(".")
        .map((part) => `"${part.replaceAll('"', "")}"`)
        .join(".");

export function buildCardWhere(input: Partial<CardSearch>, userId?: string) {
    const where: FindOptionsWhere<Card> = {};

    if (input.q) {
        where.name = ILike(literalPattern(input.q));
    }

    const conditions: string[] = [],
        parameters: Record<string, unknown> = {};

    if (input.type) {
        conditions.push("(META->>'type') ILIKE :cardType");
        parameters.cardType = literalPattern(input.type);
    }
    if (input.text) {
        conditions.push("(META->>'text') ILIKE :cardText");
        parameters.cardText = literalPattern(input.text);
    }
    if (input.keyword) {
        conditions.push(
            "EXISTS (SELECT 1 FROM jsonb_array_elements_text(COALESCE(META->'keywords','[]'::jsonb)) AS kw(value) WHERE lower(kw.value) = lower(:cardKeyword))"
        );
        parameters.cardKeyword = input.keyword;
    }
    if (input.set) {
        conditions.push("(META->'printings') ? :cardSet");
        parameters.cardSet = input.set.toUpperCase();
    }
    if (input.legalFormat) {
        conditions.push("(META->'legalities'->>:cardFormat) = 'Legal'");
        parameters.cardFormat = input.legalFormat;
    }
    if (input.manaMin !== undefined) {
        conditions.push("(META->>'manaValue')::numeric >= :manaMin");
        parameters.manaMin = input.manaMin;
    }
    if (input.manaMax !== undefined) {
        conditions.push("(META->>'manaValue')::numeric <= :manaMax");
        parameters.manaMax = input.manaMax;
    }
    if (input.colors) {
        const field = input.colorField === "colorIdentity" ? "colorIdentity" : "colors";
        const colors = [...new Set(input.colors.split(","))];

        if (input.colors === "C") {
            conditions.push(`META ? '${field}' AND jsonb_array_length(META->'${field}') = 0`);
        } else {
            parameters.cardColors = colors;

            if ((input.colorMode ?? "any") === "any") {
                conditions.push(`(META->'${field}') ?| ARRAY[:...cardColors]::text[]`);
            } else {
                conditions.push(`(META->'${field}') ?& ARRAY[:...cardColors]::text[]`);

                if (input.colorMode === "exact") {
                    conditions.push(`jsonb_array_length(META->'${field}') = :colorCount`);
                    parameters.colorCount = colors.length;
                }
            }
        }
    }
    if (conditions.length) {
        where.metadata = Raw(
            (alias) => conditions.map((condition) => condition.replaceAll("META", quotedColumn(alias))).join(" AND "),
            parameters
        );
    }
    if (input.scope === "collection" || input.deckId) {
        where.id = Raw(
            (column) => {
                const alias = quotedColumn(column);
                const scopes: string[] = [];

                if (input.scope === "collection") {
                    scopes.push(
                        `EXISTS (SELECT 1 FROM user_cards uc WHERE uc."cardId" = ${alias} AND uc."userId" = :filterUser)`
                    );
                }
                if (input.deckId) {
                    scopes.push(
                        `EXISTS (SELECT 1 FROM deck_cards dc JOIN decks d ON d.id = dc."deckId" WHERE dc."cardId" = ${alias} AND d.id = :filterDeck AND d."userId" = :filterUser)`
                    );
                }

                return scopes.join(" AND ");
            },
            { filterUser: userId, filterDeck: input.deckId }
        );
    }

    return where;
}

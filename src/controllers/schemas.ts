import { z } from "zod";

import { FORMATS } from "../entities/Deck";

export const id = z.uuid();
const email = z
    .email()
    .max(100)
    .transform((value) => value.toLowerCase());

export const register = z.object({
    username: z.string().trim().min(3).max(25),
    email,
    password: z
        .string()
        .min(8)
        .refine((value) => Buffer.byteLength(value, "utf8") <= 72, "Senha deve ter até 72 bytes.")
});

export const login = z.object({ email, password: z.string().min(1).max(1000) });

export const deck = z.object({ name: z.string().trim().min(1).max(100), format: z.enum(FORMATS) });

export const deckUpdate = deck.partial().extend({
    coverCardId: z.uuid().nullable().optional(),
    powerLevel: z.number().int().min(1).max(10).nullable().optional()
});

export const card = z.object({
    name: z.string().trim().min(1).max(200),
    externalId: z.string().trim().min(1).max(100).optional()
});

export const quantity = z.object({ quantity: z.number().int().min(0).max(2147483647) });

export const deckCardQuantity = quantity.extend({ registerOwned: z.boolean().default(false) });

export const commander = z.object({ isCommander: z.boolean() });

export const movement = z.object({
    cardId: z.uuid(),
    quantity: z.number().int().min(1).max(2147483647),
    fromDeckId: z.uuid().nullable(),
    toDeckId: z.uuid().nullable(),
    replaceCardId: z.uuid().nullable().optional(),
    operationId: z.uuid(),
    previewToken: z
        .string()
        .regex(/^[a-f0-9]{64}$/)
        .optional(),
    acknowledgeWarnings: z.boolean().default(false),
    note: z.string().trim().max(500).default("")
});

export const historySearch = z.object({
    deckId: z.uuid().optional(),
    cardId: z.uuid().optional(),
    page: z.coerce.number().int().min(1).max(100000).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(30)
});

export const versionTag = z.object({
    tag: z
        .string()
        .trim()
        .min(1)
        .max(40)
        .regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/),
    note: z.string().trim().max(500).default("")
});

export const deckList = z.object({
    text: z
        .string()
        .min(1)
        .max(30000)
        .refine((value) => value.trim().length > 0, "Informe uma lista de cartas."),
    registerOwned: z.boolean().default(false)
});

export const cardSearch = z
    .object({
        q: z.string().trim().max(200).default(""),
        page: z.coerce.number().int().min(1).max(100000).default(1),
        pageSize: z.coerce.number().int().min(1).max(100).default(60),
        type: z.string().trim().max(100).default(""),
        text: z.string().trim().max(200).default(""),
        keyword: z.string().trim().max(100).default(""),
        set: z
            .string()
            .trim()
            .max(20)
            .regex(/^[a-zA-Z0-9_]*$/)
            .transform((value) => value.toUpperCase())
            .default(""),
        colors: z
            .string()
            .regex(/^(?:[WUBRGC](?:,[WUBRGC])*)?$/)
            .default(""),
        colorMode: z.enum(["any", "all", "exact"]).default("any"),
        colorField: z.enum(["colors", "colorIdentity"]).default("colors"),
        manaMin: z.coerce.number().min(0).max(1000000).optional(),
        manaMax: z.coerce.number().min(0).max(1000000).optional(),
        legalFormat: z
            .enum(["", "commander", "pauper", "standard", "modern", "pioneer", "legacy", "vintage"])
            .default(""),
        scope: z.enum(["catalog", "collection"]).default("catalog"),
        deckId: z.uuid().optional()
    })
    .refine((input) => input.manaMin === undefined || input.manaMax === undefined || input.manaMin <= input.manaMax, {
        message: "O valor mínimo de mana deve ser menor ou igual ao máximo."
    })
    .refine((input) => !input.colors.includes("C") || input.colors === "C", {
        message: "Use Incolor sozinho no filtro de cores."
    });

export type CardSearch = z.infer<typeof cardSearch>;

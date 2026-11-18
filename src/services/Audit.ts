import { EntityManager, Raw, Not } from "typeorm";

import { AppDataSource } from "../config/dataSource";

import { Deck } from "../entities/Deck";
import { DeckCard } from "../entities/DeckCard";
import { UserCard } from "../entities/UserCard";
import { Activity } from "../entities/Activity";

import { lockCollection } from "./DeckCollection";
import { AppError } from "../errors/AppError";

export type DeckSnapshot = {
    id: string;
    name: string;
    format: string;
    coverCardId: string | null;
    powerLevel?: number | null;
    cards: { cardId: string; name: string; quantity: number; isCommander: boolean }[];
};

export async function snapshot(manager: EntityManager, userId: string, ids: string[], includeCollection = true) {
    const decks: DeckSnapshot[] = [];

    for (const id of [...new Set(ids)].sort()) {
        const deck = await manager.getRepository(Deck).findOne({ where: { id, userId } });

        if (!deck) {
            continue;
        }

        const cards = await manager.getRepository(DeckCard).find({
            where: { deckId: id },
            relations: { card: true },
            select: { id: true, cardId: true, quantity: true, isCommander: true, card: { id: true, name: true } },
            order: { cardId: "ASC" }
        });

        decks.push({
            id,
            name: deck.name,
            format: deck.format,
            coverCardId: deck.coverCardId ?? null,
            powerLevel: deck.powerLevel ?? null,
            cards: cards.map((item) => ({
                cardId: item.cardId,
                name: item.card?.name || item.cardId,
                quantity: item.quantity,
                isCommander: Boolean(item.isCommander)
            }))
        });
    }

    const owned = includeCollection
        ? await manager.getRepository(UserCard).find({
              where: { userId },
              relations: { card: true },
              select: { id: true, cardId: true, quantity: true, card: { id: true, name: true } },
              order: { cardId: "ASC" }
          })
        : [];

    return {
        decks,
        collection: owned.map((item) => ({
            cardId: item.cardId,
            name: item.card?.name || item.cardId,
            quantity: item.quantity
        }))
    };
}

export function compareDecks(before: DeckSnapshot | undefined, after: DeckSnapshot | undefined) {
    const previous = new Map((before?.cards ?? []).map((card) => [card.cardId, card])),
        next = new Map((after?.cards ?? []).map((card) => [card.cardId, card]));

    return [...new Set([...previous.keys(), ...next.keys()])].flatMap((cardId) => {
        const a = previous.get(cardId),
            b = next.get(cardId);

        if ((a?.quantity ?? 0) === (b?.quantity ?? 0) && Boolean(a?.isCommander) === Boolean(b?.isCommander)) {
            return [];
        }

        return [
            {
                cardId,
                name: b?.name || a!.name,
                before: a?.quantity ?? 0,
                after: b?.quantity ?? 0,
                commanderBefore: Boolean(a?.isCommander),
                commanderAfter: Boolean(b?.isCommander)
            }
        ];
    });
}

export function compareMetadata(before: DeckSnapshot | undefined, after: DeckSnapshot | undefined) {
    return ["name", "format", "coverCardId", "powerLevel"]
        .filter((key) => ((before as any)?.[key] ?? null) !== ((after as any)?.[key] ?? null))
        .map((key) => ({ field: key, before: (before as any)?.[key] ?? null, after: (after as any)?.[key] ?? null }));
}

export function auditDiff(before: Awaited<ReturnType<typeof snapshot>>, after: Awaited<ReturnType<typeof snapshot>>) {
    const deckIds = [...new Set([...before.decks, ...after.decks].map((deck) => deck.id))];
    const decks = deckIds
        .map((deckId) => {
            const a = before.decks.find((deck) => deck.id === deckId),
                b = after.decks.find((deck) => deck.id === deckId);

            return { deckId, name: b?.name || a!.name, cards: compareDecks(a, b), metadata: compareMetadata(a, b) };
        })
        .filter((deck) => deck.cards.length || deck.metadata.length);
    const old = new Map(before.collection.map((card) => [card.cardId, card])),
        next = new Map(after.collection.map((card) => [card.cardId, card]));
    const collection = [...new Set([...old.keys(), ...next.keys()])].flatMap((cardId) => {
        const a = old.get(cardId),
            b = next.get(cardId);

        return (a?.quantity ?? 0) === (b?.quantity ?? 0)
            ? []
            : [{ cardId, name: b?.name || a!.name, before: a?.quantity ?? 0, after: b?.quantity ?? 0 }];
    });

    return { decks, collection };
}

export async function withAudit<T>(
    userId: string,
    action: string,
    deckIds: string[],
    work: (manager: EntityManager) => Promise<T>,
    options: { operationId?: string; requestHash?: string; note?: string } = {}
) {
    return AppDataSource.transaction(async (manager) => {
        await lockCollection(manager, userId);

        if (options.operationId) {
            const previous = await manager
                .getRepository(Activity)
                .findOneBy({ userId, operationId: options.operationId });

            if (previous) {
                if (previous.payload.requestHash !== options.requestHash) {
                    throw new AppError(409, "Identificador de operação já usado com outros dados.");
                }

                return previous.payload.result as T;
            }
        }

        for (const id of [...new Set(deckIds)].sort()) {
            const deck = await manager
                .getRepository(Deck)
                .findOne({ where: { id, userId }, lock: { mode: "pessimistic_write" } });

            if (!deck) {
                throw new AppError(404, "Deck não encontrado.");
            }
        }

        const includeCollection = ["collection.updated", "deck.cards.updated", "deck.imported"].includes(action);
        const before = await snapshot(manager, userId, deckIds, includeCollection);
        const result = await work(manager);
        const affected = action === "deck.created" ? [...deckIds, (result as any).id] : deckIds;
        const after = await snapshot(manager, userId, affected, includeCollection),
            changes = auditDiff(before, after);

        if (changes.decks.length || changes.collection.length) {
            await manager.getRepository(Activity).save({
                userId,
                operationId: options.operationId ?? null,
                action,
                deckIds: [...new Set(affected)],
                cardIds: [
                    ...new Set([
                        ...changes.decks.flatMap((deck) => deck.cards.map((card) => card.cardId)),
                        ...changes.collection.map((card) => card.cardId)
                    ])
                ],
                payload: {
                    changes,
                    before: before.decks,
                    after: after.decks,
                    result,
                    requestHash: options.requestHash,
                    note: options.note ?? ""
                }
            });
        }

        return result;
    });
}

export const containsId = (id: string) => {
    const parameter = "audit_" + id.replaceAll("-", "");

    return Raw((alias) => `"${alias.split(".").join('"."')}" @> :${parameter}`, { [parameter]: JSON.stringify([id]) });
};

export async function deckChangeCount(manager: EntityManager, userId: string, deckId: string) {
    return manager.getRepository(Activity).count({
        where: {
            userId,
            deckIds: containsId(deckId),
            action: Not("version.saved"),
            payload: Raw(
                (alias) =>
                    `jsonb_array_length(COALESCE("${alias.split(".").join('"."')}"->'changes'->'decks','[]'::jsonb)) > 0`
            )
        }
    });
}

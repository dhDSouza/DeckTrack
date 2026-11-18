import { EntityManager } from "typeorm";

import { DeckOwnedCard } from "../entities/DeckOwnedCard";
import { UserCard } from "../entities/UserCard";
import { User } from "../entities/User";

import { AppError } from "../errors/AppError";
import { MAX_QUANTITY } from "./DeckList";

export async function lockCollection(manager: EntityManager, userId: string) {
    const user = await manager
        .getRepository(User)
        .findOne({ where: { id: userId }, lock: { mode: "pessimistic_write" } });

    if (!user) {
        throw new AppError(401, "Usuário não encontrado.");
    }
}

export async function registerDeckOwned(
    manager: EntityManager,
    userId: string,
    deckId: string,
    cards: { cardId: string; quantity: number }[]
) {
    const credits = manager.getRepository(DeckOwnedCard),
        collection = manager.getRepository(UserCard);
    const recorded = new Map((await credits.findBy({ deckId })).map((item) => [item.cardId, item.quantity]));
    const owned = new Map((await collection.findBy({ userId })).map((item) => [item.cardId, item.quantity]));
    const updates: { userId: string; cardId: string; quantity: number }[] = [],
        newCredits: { deckId: string; cardId: string; quantity: number }[] = [];
    let added = 0;

    for (const card of cards) {
        const difference = Math.max(0, card.quantity - (recorded.get(card.cardId) ?? 0));

        if (!difference) {
            continue;
        }

        const quantity = (owned.get(card.cardId) ?? 0) + difference;

        if (quantity > MAX_QUANTITY) {
            throw new AppError(400, "A quantidade na coleção excederia o limite permitido.");
        }

        updates.push({ userId, cardId: card.cardId, quantity });
        newCredits.push({ deckId, cardId: card.cardId, quantity: card.quantity });
        added += difference;
    }

    for (let offset = 0; offset < updates.length; offset += 250) {
        await collection.upsert(updates.slice(offset, offset + 250), ["userId", "cardId"]);
        await credits.upsert(newCredits.slice(offset, offset + 250), ["deckId", "cardId"]);
    }

    return added;
}

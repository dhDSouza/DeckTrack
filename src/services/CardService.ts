import { repositories as db } from "../repositories";
import { AppError } from "../errors/AppError";
import type { CardSearch } from "../controllers/schemas";
import { buildCardWhere } from "./CardFilters";
import { AppDataSource } from "../config/dataSource";

import { Card } from "../entities/Cards";
import { UserCard } from "../entities/UserCard";

import { lockCollection } from "./DeckCollection";
import { cardImages } from "./CardImages";
import { withAudit } from "./Audit";

export class CardService {
    async list(input: Partial<CardSearch> = {}, userId?: string) {
        const { page = 1, pageSize = 60 } = input;

        if (input.deckId && !(await db.decks.findOneBy({ id: input.deckId, userId }))) {
            throw new AppError(404, "Deck não encontrado.");
        }

        const [items, total] = await db.cards.findAndCount({
            where: buildCardWhere(input, userId),
            order: { name: "ASC", id: "ASC" },
            take: pageSize,
            skip: (page - 1) * pageSize
        });

        return { items: await Promise.all(items.map((card) => cardImages.decorate(card))), total, page, pageSize };
    }

    create(input: { name: string; externalId?: string }) {
        return db.cards.save(db.cards.create(input));
    }

    async require(id: string) {
        const card = await db.cards.findOneBy({ id });

        if (!card) {
            throw new AppError(404, "Carta não encontrada.");
        }

        return card;
    }

    async collection(userId: string) {
        const items = await db.userCards.find({ where: { userId }, relations: { card: true } });

        return Promise.all(items.map(async (item) => ({ ...item, card: await cardImages.decorate(item.card) })));
    }

    async setOwned(userId: string, cardId: string, quantity: number) {
        return withAudit(userId, "collection.updated", [], async (manager) => {
            await lockCollection(manager, userId);

            if (!(await manager.getRepository(Card).findOneBy({ id: cardId }))) {
                throw new AppError(404, "Carta não encontrada.");
            }

            const repository = manager.getRepository(UserCard);

            if (quantity === 0) {
                await repository.delete({ userId, cardId });
            } else {
                await repository.upsert({ userId, cardId, quantity }, ["userId", "cardId"]);
            }

            return { cardId, quantity };
        });
    }
}

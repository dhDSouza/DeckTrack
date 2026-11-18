import { repositories as db } from "../repositories";

import { Deck } from "../entities/Deck";

import { AppError } from "../errors/AppError";
import { AppDataSource } from "../config/dataSource";

import { Card } from "../entities/Cards";
import { DeckCard } from "../entities/DeckCard";

import { resolveDeckList } from "./DeckList";

import { DeckOwnedCard } from "../entities/DeckOwnedCard";

import { lockCollection, registerDeckOwned } from "./DeckCollection";
import { cardImages } from "./CardImages";
import { withAudit } from "./Audit";

type DeckInput = Pick<Deck, "name" | "format">;

export class DeckService {
    async list(userId: string) {
        const decks = await db.decks.find({
            where: { userId },
            relations: { coverCard: true },
            order: { name: "ASC" }
        });

        return Promise.all(
            decks.map(async (deck) => ({
                ...deck,
                coverCard: deck.coverCard ? await cardImages.decorate(deck.coverCard) : null
            }))
        );
    }

    create(userId: string, input: DeckInput) {
        return withAudit(userId, "deck.created", [], (manager) =>
            manager.getRepository(Deck).save({ ...input, userId })
        );
    }

    async require(userId: string, id: string) {
        const deck = await db.decks.findOneBy({ id, userId });

        if (!deck) {
            throw new AppError(404, "Deck não encontrado.");
        }

        return deck;
    }

    async get(userId: string, id: string) {
        const deck = await this.require(userId, id);

        const cards = await db.deckCards.find({ where: { deckId: id }, relations: { card: true } });
        const owned = await db.userCards.findBy({ userId });

        const quantities = new Map(owned.map((item) => [item.cardId, item.quantity]));
        const coverCard = deck.coverCardId ? await db.cards.findOneBy({ id: deck.coverCardId }) : null;

        return {
            ...deck,
            coverCard: coverCard ? await cardImages.decorate(coverCard) : null,
            cards: await Promise.all(
                cards.map(async (item) => ({
                    ...item,
                    card: await cardImages.decorate(item.card),
                    ownedQuantity: quantities.get(item.cardId) ?? 0
                }))
            )
        };
    }

    async update(userId: string, id: string, input: Partial<DeckInput & Pick<Deck, "coverCardId" | "powerLevel">>) {
        return withAudit(userId, "deck.updated", [id], async (manager) => {
            const deck = (await manager.getRepository(Deck).findOneBy({ id, userId }))!;

            if (
                input.coverCardId &&
                !(await manager.getRepository(DeckCard).findOneBy({ deckId: id, cardId: input.coverCardId }))
            ) {
                throw new AppError(400, "Escolha uma carta que esteja neste deck para usar como destaque.");
            }

            return manager.getRepository(Deck).save(Object.assign(deck, input));
        });
    }

    async delete(userId: string, id: string) {
        await withAudit(userId, "deck.deleted", [id], async (manager) => {
            await manager.getRepository(Deck).delete({ id, userId });
        });
    }

    async setCommander(userId: string, deckId: string, cardId: string, isCommander: boolean) {
        return withAudit(userId, "commander.changed", [deckId], async (manager) => {
            const deck = await manager
                .getRepository(Deck)
                .findOne({ where: { id: deckId, userId }, lock: { mode: "pessimistic_write" } });

            if (!deck) {
                throw new AppError(404, "Deck não encontrado.");
            }
            if (deck.format !== "commander") {
                throw new AppError(400, "A marcação de comandantes está disponível no formato Commander.");
            }

            const repository = manager.getRepository(DeckCard);

            const entry = await repository.findOneBy({ deckId, cardId });

            if (!entry) {
                throw new AppError(404, "Adicione a carta ao deck antes de marcá-la como comandante.");
            }

            await repository.update({ deckId, cardId }, { isCommander });

            return { cardId, isCommander };
        });
    }

    async setCard(userId: string, deckId: string, cardId: string, quantity: number, registerOwned = false) {
        return withAudit(userId, "deck.cards.updated", [deckId], async (manager) => {
            await lockCollection(manager, userId);

            const deck = await manager
                .getRepository(Deck)
                .findOne({ where: { id: deckId, userId }, lock: { mode: "pessimistic_write" } });

            if (!deck) {
                throw new AppError(404, "Deck não encontrado.");
            }
            if (!(await manager.getRepository(Card).findOneBy({ id: cardId }))) {
                throw new AppError(404, "Carta não encontrada.");
            }

            const repository = manager.getRepository(DeckCard);

            if (quantity === 0) {
                await repository.delete({ deckId, cardId });
            } else {
                await repository.upsert({ deckId, cardId, quantity }, ["deckId", "cardId"]);
            }
            if (quantity === 0 && deck.coverCardId === cardId) {
                await manager.getRepository(Deck).update({ id: deckId, userId }, { coverCardId: null });
            }

            const collectionAddedQuantity = registerOwned
                ? await registerDeckOwned(manager, userId, deckId, [{ cardId, quantity }])
                : 0;

            return { cardId, quantity, collectionAddedQuantity };
        });
    }

    async previewList(userId: string, deckId: string, text: string, registerOwned = false) {
        await this.require(userId, deckId);

        const preview = resolveDeckList(
            text,
            await db.cards.find({ select: { id: true, name: true, externalId: true } })
        );
        const recorded =
            registerOwned && preview.canImport
                ? await AppDataSource.getRepository(DeckOwnedCard).findBy({ deckId })
                : [];
        const credits = new Map(recorded.map((card) => [card.cardId, card.quantity]));
        const collectionAddedQuantity =
            registerOwned && preview.canImport
                ? preview.cards.reduce(
                      (sum, card) => sum + Math.max(0, card.quantity - (credits.get(card.cardId) ?? 0)),
                      0
                  )
                : 0;

        return { ...preview, collectionAddedQuantity };
    }

    async importList(userId: string, deckId: string, text: string, registerOwned = false) {
        return withAudit(userId, "deck.imported", [deckId], async (manager) => {
            await lockCollection(manager, userId);

            const deck = await manager
                .getRepository(Deck)
                .findOne({ where: { id: deckId, userId }, lock: { mode: "pessimistic_write" } });

            if (!deck) {
                throw new AppError(404, "Deck não encontrado.");
            }

            const preview = resolveDeckList(
                text,
                await manager.getRepository(Card).find({ select: { id: true, name: true, externalId: true } })
            );

            if (!preview.canImport) {
                return { ...preview, imported: false };
            }

            const repository = manager.getRepository(DeckCard);

            for (let offset = 0; offset < preview.cards.length; offset += 250) {
                await repository.upsert(
                    preview.cards
                        .slice(offset, offset + 250)
                        .map((card) => ({ deckId, cardId: card.cardId, quantity: card.quantity })),
                    ["deckId", "cardId"]
                );
            }

            const collectionAddedQuantity = registerOwned
                ? await registerDeckOwned(manager, userId, deckId, preview.cards)
                : 0;

            return { ...preview, imported: true, collectionAddedQuantity };
        });
    }
}

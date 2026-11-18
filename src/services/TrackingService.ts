import { createHash } from "node:crypto";
import { EntityManager } from "typeorm";

import { AppDataSource } from "../config/dataSource";

import { Card } from "../entities/Cards";
import { Deck } from "../entities/Deck";
import { DeckCard } from "../entities/DeckCard";
import { DeckOwnedCard } from "../entities/DeckOwnedCard";
import { UserCard } from "../entities/UserCard";

import { AppError } from "../errors/AppError";
import { lockCollection } from "./DeckCollection";
import { cardImages } from "./CardImages";
import { snapshot, withAudit } from "./Audit";
import { MAX_QUANTITY } from "./DeckList";

export type Move = {
    cardId: string;
    quantity: number;
    fromDeckId: string | null;
    toDeckId: string | null;
    replaceCardId?: string | null;
    note?: string;
    operationId: string;
    previewToken?: string;
    acknowledgeWarnings?: boolean;
};

export function availability(owned: number, assigned: number) {
    return {
        ownedQuantity: owned,
        assignedQuantity: assigned,
        poolQuantity: Math.max(0, owned - assigned),
        missingQuantity: Math.max(0, assigned - owned)
    };
}

export class TrackingService {
    async list(userId: string) {
        const owned = await AppDataSource.getRepository(UserCard).find({
            where: { userId },
            relations: { card: true }
        });
        const placed = await AppDataSource.getRepository(DeckCard).find({
            where: { owner: { userId } },
            relations: { owner: true, card: true }
        });

        const cards = new Map<string, any>();

        for (const entry of owned) {
            cards.set(entry.cardId, { card: entry.card, ownedQuantity: entry.quantity, locations: [] });
        }

        for (const entry of placed) {
            if (!cards.has(entry.cardId)) {
                cards.set(entry.cardId, { card: entry.card, ownedQuantity: 0, locations: [] });
            }

            cards.get(entry.cardId).locations.push({
                deckId: entry.deckId,
                name: entry.owner.name,
                format: entry.owner.format,
                quantity: entry.quantity,
                isCommander: entry.isCommander
            });
        }

        return Promise.all(
            [...cards.entries()].map(async ([cardId, value]) => ({
                cardId,
                card: await cardImages.decorate(value.card),
                ...availability(
                    value.ownedQuantity,
                    value.locations.reduce((sum: number, place: any) => sum + place.quantity, 0)
                ),
                locations: value.locations.sort((a: any, b: any) => a.name.localeCompare(b.name))
            }))
        );
    }

    async location(userId: string, cardId: string) {
        const card = await AppDataSource.getRepository(Card).findOneBy({ id: cardId });

        if (!card) {
            throw new AppError(404, "Carta não encontrada.");
        }

        const owned = await AppDataSource.getRepository(UserCard).findOneBy({ userId, cardId });
        const placed = await AppDataSource.getRepository(DeckCard).find({
            where: { cardId, owner: { userId } },
            relations: { owner: true }
        });

        return {
            cardId,
            card: await cardImages.decorate(card),
            ...availability(
                owned?.quantity ?? 0,
                placed.reduce((sum, entry) => sum + entry.quantity, 0)
            ),
            locations: placed
                .map((entry) => ({
                    deckId: entry.deckId,
                    name: entry.owner.name,
                    format: entry.owner.format,
                    quantity: entry.quantity,
                    isCommander: entry.isCommander
                }))
                .sort((a, b) => a.name.localeCompare(b.name))
        };
    }

    private async plan(manager: EntityManager, userId: string, input: Move) {
        if (input.fromDeckId === input.toDeckId) {
            throw new AppError(400, "Escolha origens e destinos diferentes.");
        }
        if (input.replaceCardId && (!input.toDeckId || input.replaceCardId === input.cardId)) {
            throw new AppError(400, "A substituição precisa de um deck e de outra carta.");
        }

        const ids = [...new Set([input.fromDeckId, input.toDeckId].filter((id): id is string => Boolean(id)))].sort();

        for (const id of ids) {
            if (
                !(await manager
                    .getRepository(Deck)
                    .findOne({ where: { id, userId }, lock: { mode: "pessimistic_write" } }))
            ) {
                throw new AppError(404, "Deck não encontrado.");
            }
        }

        const card = await manager.getRepository(Card).findOneBy({ id: input.cardId });

        if (!card) {
            throw new AppError(404, "Carta não encontrada.");
        }

        const before = await snapshot(manager, userId, ids);
        const owned = before.collection.find((entry) => entry.cardId === input.cardId)?.quantity ?? 0;

        const allocated = await manager
            .getRepository(DeckCard)
            .find({ where: { cardId: input.cardId, owner: { userId } }, relations: { owner: true } });

        const pool = availability(
            owned,
            allocated.reduce((sum, entry) => sum + entry.quantity, 0)
        );

        const source = before.decks.find((deck) => deck.id === input.fromDeckId),
            target = before.decks.find((deck) => deck.id === input.toDeckId);
        const sourceCard = source?.cards.find((entry) => entry.cardId === input.cardId),
            targetCard = target?.cards.find((entry) => entry.cardId === input.cardId);

        if (source ? (sourceCard?.quantity ?? 0) < input.quantity : pool.poolQuantity < input.quantity) {
            throw new AppError(
                409,
                source ? "O deck de origem não tem essa quantidade." : "Não há cópias livres suficientes na pool."
            );
        }
        if ((targetCard?.quantity ?? 0) + input.quantity > MAX_QUANTITY) {
            throw new AppError(400, "Quantidade no destino excede o limite.");
        }

        const replacement = target?.cards.find((entry) => entry.cardId === input.replaceCardId);

        if (input.replaceCardId && (!replacement || replacement.quantity < input.quantity)) {
            throw new AppError(409, "A carta a substituir não tem essa quantidade no deck de destino.");
        }

        const totals = before.decks.map((deck) => {
            const old = deck.cards.reduce((sum, entry) => sum + entry.quantity, 0);
            const total =
                old -
                (deck.id === input.fromDeckId ? input.quantity : 0) +
                (deck.id === input.toDeckId && !input.replaceCardId ? input.quantity : 0);

            return { deckId: deck.id, name: deck.name, format: deck.format, before: old, after: total };
        });
        const warnings = totals
            .filter((deck) => deck.format === "commander" && deck.after !== 100 && deck.after !== deck.before)
            .map(
                (deck) =>
                    `${deck.name} ficará com ${deck.after} cartas${deck.after < 100 ? ` (faltam ${100 - deck.after} para 100)` : ` (${deck.after - 100} acima de 100)`}.`
            );
        const fingerprint = JSON.stringify({
            decks: before.decks,
            collection: before.collection.filter((entry) => [input.cardId, input.replaceCardId].includes(entry.cardId)),
            allocated: allocated
                .map((entry) => ({ deckId: entry.deckId, quantity: entry.quantity }))
                .sort((a, b) => a.deckId.localeCompare(b.deckId)),
            input: {
                cardId: input.cardId,
                quantity: input.quantity,
                fromDeckId: input.fromDeckId,
                toDeckId: input.toDeckId,
                replaceCardId: input.replaceCardId ?? null
            }
        });
        const previewToken = createHash("sha256").update(fingerprint).digest("hex");

        return { card, sourceCard, targetCard, replacement, totals, warnings, previewToken, pool };
    }

    async preview(userId: string, input: Move) {
        return AppDataSource.transaction(async (manager) => {
            await lockCollection(manager, userId);

            const plan = await this.plan(manager, userId, input);

            return {
                card: await cardImages.decorate(plan.card),
                totals: plan.totals,
                warnings: plan.warnings,
                previewToken: plan.previewToken,
                pool: plan.pool,
                quantity: input.quantity,
                replacement: plan.replacement
            };
        });
    }

    async move(userId: string, input: Move) {
        const ids = [input.fromDeckId, input.toDeckId].filter((id): id is string => Boolean(id));
        const requestHash = createHash("sha256")
            .update(
                JSON.stringify({
                    cardId: input.cardId,
                    quantity: input.quantity,
                    from: input.fromDeckId,
                    to: input.toDeckId,
                    replace: input.replaceCardId ?? null,
                    note: input.note ?? ""
                })
            )
            .digest("hex");

        return withAudit(
            userId,
            input.replaceCardId ? "cards.replaced" : "cards.moved",
            ids,
            async (manager) => {
                const plan = await this.plan(manager, userId, input);

                if (input.previewToken !== plan.previewToken) {
                    throw new AppError(409, "Os dados mudaram. Confira a movimentação novamente.");
                }
                if (plan.warnings.length && !input.acknowledgeWarnings) {
                    throw new AppError(409, plan.warnings.join(" ") + " Confirme o aviso para continuar.");
                }

                const repository = manager.getRepository(DeckCard);
                const set = async (deckId: string, cardId: string, quantity: number) => {
                    if (!quantity) {
                        await repository.delete({ deckId, cardId });
                        await manager
                            .getRepository(Deck)
                            .update({ id: deckId, userId, coverCardId: cardId }, { coverCardId: null });
                    } else {
                        await repository.upsert({ deckId, cardId, quantity }, ["deckId", "cardId"]);
                    }
                };

                if (input.fromDeckId) {
                    await set(input.fromDeckId, input.cardId, plan.sourceCard!.quantity - input.quantity);
                }
                if (input.toDeckId) {
                    if (input.replaceCardId) {
                        await set(input.toDeckId, input.replaceCardId, plan.replacement!.quantity - input.quantity);
                    }

                    const quantity = (plan.targetCard?.quantity ?? 0) + input.quantity;

                    await set(input.toDeckId, input.cardId, quantity);

                    const credits = manager.getRepository(DeckOwnedCard),
                        credit = await credits.findOneBy({ deckId: input.toDeckId, cardId: input.cardId });

                    if ((credit?.quantity ?? 0) < quantity) {
                        await credits.upsert({ deckId: input.toDeckId, cardId: input.cardId, quantity }, [
                            "deckId",
                            "cardId"
                        ]);
                    }
                }

                return {
                    operationId: input.operationId,
                    quantity: input.quantity,
                    totals: plan.totals,
                    warnings: plan.warnings
                };
            },
            { operationId: input.operationId, requestHash, note: input.note }
        );
    }
}

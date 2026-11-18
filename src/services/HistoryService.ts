import { AppDataSource } from "../config/dataSource";

import { Activity } from "../entities/Activity";
import { DeckVersion } from "../entities/DeckVersion";
import { Deck } from "../entities/Deck";

import { AppError } from "../errors/AppError";
import { lockCollection } from "./DeckCollection";
import { snapshot, compareDecks, compareMetadata, containsId, deckChangeCount, DeckSnapshot } from "./Audit";

export class HistoryService {
    async list(userId: string, input: { deckId?: string; cardId?: string; page: number; pageSize: number }) {
        const where: any = { userId };

        if (input.deckId) {
            where.deckIds = containsId(input.deckId);
        }
        if (input.cardId) {
            where.cardIds = containsId(input.cardId);
        }

        const [rows, total] = await AppDataSource.getRepository(Activity).findAndCount({
            where,
            order: { createdAt: "DESC", id: "DESC" },
            take: input.pageSize,
            skip: (input.page - 1) * input.pageSize
        });

        const changeCount = input.deckId
            ? await deckChangeCount(AppDataSource.manager, userId, input.deckId)
            : undefined;

        return {
            items: rows.map((row) => ({
                id: row.id,
                action: row.action,
                createdAt: row.createdAt,
                deckIds: row.deckIds,
                cardIds: row.cardIds,
                note: row.payload.note || "",
                changes: row.payload.changes,
                tag: row.payload.tag,
                versionId: row.payload.versionId
            })),
            total,
            page: input.page,
            pageSize: input.pageSize,
            changeCount
        };
    }

    async detail(userId: string, id: string) {
        const event = await AppDataSource.getRepository(Activity).findOneBy({ id, userId });

        if (!event) {
            throw new AppError(404, "Evento não encontrado.");
        }

        return event;
    }

    async versions(userId: string, deckId: string) {
        const versions = await AppDataSource.getRepository(DeckVersion).find({
            where: { userId, deckId },
            order: { createdAt: "DESC", id: "DESC" }
        });

        return versions.map((version) => ({
            id: version.id,
            tag: version.tag,
            note: version.note,
            createdAt: version.createdAt,
            changeCount: version.changeCount,
            totalQuantity: (version.snapshot.cards ?? []).reduce((sum: number, card: any) => sum + card.quantity, 0)
        }));
    }

    async saveVersion(userId: string, deckId: string, tag: string, note: string) {
        return AppDataSource.transaction(async (manager) => {
            await lockCollection(manager, userId);

            if (
                !(await manager
                    .getRepository(Deck)
                    .findOne({ where: { id: deckId, userId }, lock: { mode: "pessimistic_write" } }))
            ) {
                throw new AppError(404, "Deck não encontrado.");
            }

            const data = (await snapshot(manager, userId, [deckId], false)).decks[0];

            if (await manager.getRepository(DeckVersion).findOneBy({ userId, deckId, tag })) {
                throw new AppError(409, "Já existe uma versão com essa tag neste deck.");
            }

            const changeCount = await deckChangeCount(manager, userId, deckId);

            const version = await manager
                .getRepository(DeckVersion)
                .save({ userId, deckId, tag, note, changeCount, snapshot: data });
            await manager.getRepository(Activity).save({
                userId,
                operationId: null,
                action: "version.saved",
                deckIds: [deckId],
                cardIds: data.cards.map((card) => card.cardId),
                payload: { tag, note, versionId: version.id, changes: { decks: [], collection: [] } }
            });

            return { id: version.id, tag, note, changeCount, createdAt: version.createdAt };
        });
    }

    async version(userId: string, deckId: string, id: string) {
        const saved = await AppDataSource.getRepository(DeckVersion).findOneBy({ id, userId, deckId });

        if (!saved) {
            throw new AppError(404, "Versão não encontrada.");
        }

        const current = (await snapshot(AppDataSource.manager, userId, [deckId], false)).decks[0];

        return {
            id: saved.id,
            tag: saved.tag,
            note: saved.note,
            createdAt: saved.createdAt,
            changeCount: saved.changeCount,
            snapshot: saved.snapshot,
            current: current ?? null,
            changes: compareDecks(saved.snapshot as DeckSnapshot, current),
            metadataChanges: compareMetadata(saved.snapshot as DeckSnapshot, current)
        };
    }
}

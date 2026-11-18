import { Request, Response } from "express";

import { DeckService } from "../services/DeckService";
import * as schema from "./schemas";

const service = new DeckService();

export class DeckController {
    async list(req: Request, res: Response) {
        res.json(await service.list(req.userId));
    }

    async create(req: Request, res: Response) {
        res.status(201).json(await service.create(req.userId, schema.deck.parse(req.body)));
    }

    async get(req: Request, res: Response) {
        res.json(await service.get(req.userId, schema.id.parse(req.params.id)));
    }

    async update(req: Request, res: Response) {
        res.json(await service.update(req.userId, schema.id.parse(req.params.id), schema.deckUpdate.parse(req.body)));
    }

    async delete(req: Request, res: Response) {
        await service.delete(req.userId, schema.id.parse(req.params.id));

        res.sendStatus(204);
    }

    async setCard(req: Request, res: Response) {
        const input = schema.deckCardQuantity.parse(req.body);

        res.json(
            await service.setCard(
                req.userId,
                schema.id.parse(req.params.id),
                schema.id.parse(req.params.cardId),
                input.quantity,
                input.registerOwned
            )
        );
    }

    async setCommander(req: Request, res: Response) {
        res.json(
            await service.setCommander(
                req.userId,
                schema.id.parse(req.params.id),
                schema.id.parse(req.params.cardId),
                schema.commander.parse(req.body).isCommander
            )
        );
    }

    async previewList(req: Request, res: Response) {
        const input = schema.deckList.parse(req.body);

        res.json(
            await service.previewList(req.userId, schema.id.parse(req.params.id), input.text, input.registerOwned)
        );
    }

    async importList(req: Request, res: Response) {
        const input = schema.deckList.parse(req.body);
        const result = await service.importList(
            req.userId,
            schema.id.parse(req.params.id),
            input.text,
            input.registerOwned
        );

        res.status(result.imported ? 200 : 422).json({
            ...result,
            ...(!result.imported ? { message: "A lista contém erros. Nenhuma carta foi importada." } : {})
        });
    }
}

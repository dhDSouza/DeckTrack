import { Request, Response } from "express";

import { CardService } from "../services/CardService";
import * as schema from "./schemas";
import { catalogFilterOptions } from "../catalog";

const service = new CardService();

export class CardController {
    async list(req: Request, res: Response) {
        res.json(await service.list(schema.cardSearch.parse(req.query), req.userId));
    }

    async filters(_req: Request, res: Response) {
        res.json(await catalogFilterOptions());
    }

    async create(req: Request, res: Response) {
        res.status(201).json(await service.create(schema.card.parse(req.body)));
    }

    async collection(req: Request, res: Response) {
        res.json(await service.collection(req.userId));
    }

    async setOwned(req: Request, res: Response) {
        res.json(
            await service.setOwned(
                req.userId,
                schema.id.parse(req.params.cardId),
                schema.quantity.parse(req.body).quantity
            )
        );
    }
}

import { Request, Response } from "express";

import { TrackingService } from "../services/TrackingService";
import { HistoryService } from "../services/HistoryService";
import * as schema from "./schemas";

const tracking = new TrackingService(),
    history = new HistoryService();

export class TrackingController {
    async list(req: Request, res: Response) {
        res.json(await tracking.list(req.userId));
    }

    async location(req: Request, res: Response) {
        res.json(await tracking.location(req.userId, schema.id.parse(req.params.cardId)));
    }

    async preview(req: Request, res: Response) {
        res.json(await tracking.preview(req.userId, schema.movement.parse(req.body)));
    }

    async move(req: Request, res: Response) {
        res.json(await tracking.move(req.userId, schema.movement.parse(req.body)));
    }

    async history(req: Request, res: Response) {
        res.json(await history.list(req.userId, schema.historySearch.parse(req.query)));
    }

    async event(req: Request, res: Response) {
        res.json(await history.detail(req.userId, schema.id.parse(req.params.id)));
    }

    async versions(req: Request, res: Response) {
        res.json(await history.versions(req.userId, schema.id.parse(req.params.id)));
    }

    async saveVersion(req: Request, res: Response) {
        const input = schema.versionTag.parse(req.body);

        res.status(201).json(
            await history.saveVersion(req.userId, schema.id.parse(req.params.id), input.tag, input.note)
        );
    }

    async version(req: Request, res: Response) {
        res.json(
            await history.version(req.userId, schema.id.parse(req.params.id), schema.id.parse(req.params.versionId))
        );
    }
}

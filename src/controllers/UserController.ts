import { Request, Response } from "express";

import { UserService } from "../services/UserService";
import * as schema from "./schemas";

const service = new UserService();

export class UserController {
    async register(req: Request, res: Response) {
        res.status(201).json(await service.register(schema.register.parse(req.body)));
    }

    async login(req: Request, res: Response) {
        const input = schema.login.parse(req.body);

        res.json(await service.login(input.email, input.password));
    }

    async me(req: Request, res: Response) {
        res.json(await service.me(req.userId));
    }
}

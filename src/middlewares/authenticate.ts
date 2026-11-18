import { RequestHandler } from "express";
import jwt from "jsonwebtoken";

import { jwtSecret } from "../config/auth";
import { AppError } from "../errors/AppError";

declare global {
    namespace Express {
        interface Request {
            userId: string;
        }
    }
}

export const authenticate: RequestHandler = (req, _res, next) => {
    const [scheme, token] = (req.headers.authorization ?? "").split(" ");

    if (scheme !== "Bearer" || !token) {
        return next(new AppError(401, "Autenticação necessária."));
    }

    try {
        const payload = jwt.verify(token, jwtSecret(), { algorithms: ["HS256"] });

        if (typeof payload === "string" || !payload.sub || !/^[0-9a-f-]{36}$/i.test(payload.sub)) {
            throw new Error();
        }

        req.userId = payload.sub;
        next();
    } catch {
        next(new AppError(401, "Token inválido ou expirado."));
    }
};

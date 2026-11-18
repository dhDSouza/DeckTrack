import { ErrorRequestHandler } from "express";
import { ZodError } from "zod";

import { AppError } from "../errors/AppError";

export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
    if (error instanceof ZodError) {
        res.status(400).json({ message: "Dados inválidos.", errors: error.issues });

        return;
    }
    if (error instanceof AppError) {
        res.status(error.status).json({ message: error.message });

        return;
    }
    if (error?.driverError?.code === "23505") {
        res.status(409).json({ message: "Registro já existente." });

        return;
    }
    if (error?.type === "entity.parse.failed") {
        res.status(400).json({ message: "JSON inválido." });

        return;
    }

    console.error(error);
    res.status(500).json({ message: "Erro interno do servidor." });
};

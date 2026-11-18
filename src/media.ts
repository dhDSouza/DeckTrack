import { Router } from "express";
import { z } from "zod";

import { repositories } from "./repositories";
import { AppError } from "./errors/AppError";
import { cardImages } from "./services/CardImages";

const media = Router();
const params = z.object({ id: z.uuid(), size: z.enum(["small", "normal", "art_crop"]), face: z.enum(["0", "1"]) });

media.get("/media/cards/:id/info", async (req, res) => {
    const id = z.uuid().parse(req.params.id);

    const card = await repositories.cards.findOneBy({ id });

    if (!card) {
        throw new AppError(404, "Carta não encontrada.");
    }

    try {
        const info = await cardImages.info(card);

        res.set("Cache-Control", "public, max-age=86400").json({
            name: info.name,
            url: info.url,
            faces: info.faces.map((face) => ({ name: face.name, artist: face.artist }))
        });
    } catch (error) {
        res.set("Cache-Control", "no-store");

        if (error instanceof AppError) {
            throw error;
        }

        throw new AppError(503, "Informações da imagem indisponíveis.");
    }
});
// Only public catalog imagery. No user/collection/deck information is exposed.
media.get("/media/cards/:id/:size/:face", async (req, res) => {
    const input = params.parse(req.params);

    const card = await repositories.cards.findOneBy({ id: input.id });

    if (!card) {
        throw new AppError(404, "Carta não encontrada.");
    }

    try {
        const url = await cardImages.image(card, input.size, Number(input.face));

        res.set({ "Cache-Control": "public, max-age=3600", "X-Content-Type-Options": "nosniff" });
        res.redirect(302, url);
    } catch (error) {
        res.set({ "Cache-Control": "no-store", "Retry-After": "60" });

        if (error instanceof AppError) {
            throw error;
        }

        throw new AppError(503, "Imagens temporariamente indisponíveis.");
    }
});
export { media };

import "reflect-metadata";
import express from "express";
import cors from "cors";
import path from "node:path";
import swaggerUi from "swagger-ui-express";

import { routes } from "./routes";
import { errorHandler } from "./middlewares/errorHandler";
import { media } from "./media";
import { openapi } from "./openapi";

const app = express();

app.use(cors());
app.use(express.json({ limit: "100kb" }));
app.get("/api-docs/openapi.json", (_req, res) => {
    res.json(openapi);
});
app.use(
    "/api-docs",
    swaggerUi.serve,
    swaggerUi.setup(null, {
        customSiteTitle: "DeckTrack · API",
        swaggerOptions: {
            url: "/api-docs/openapi.json",
            validatorUrl: null,
            persistAuthorization: false
        }
    })
);
app.use(express.static(path.resolve(__dirname, "../public")));
app.use(media);
app.use(routes);
app.use((_req, res) => {
    res.status(404).json({ message: "Rota não encontrada." });
});
app.use(errorHandler);
export { app };

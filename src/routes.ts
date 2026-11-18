import { Router } from "express";

import { UserController } from "./controllers/UserController";
import { CardController } from "./controllers/CardController";
import { DeckController } from "./controllers/DeckController";
import { authenticate } from "./middlewares/authenticate";
import { TrackingController } from "./controllers/TrackingController";

const routes = Router();
const users = new UserController(),
    cards = new CardController(),
    decks = new DeckController();
const tracking = new TrackingController();

routes.post("/auth/register", users.register);
routes.post("/auth/login", users.login);
routes.use(authenticate);
routes.get("/users/me", users.me);
routes.get("/cards", cards.list);
routes.get("/cards/filters", cards.filters);
routes.post("/cards", cards.create);
routes.get("/collection", cards.collection);
routes.put("/collection/:cardId", cards.setOwned);
routes.get("/decks", decks.list);
routes.post("/decks", decks.create);
routes.get("/decks/:id", decks.get);
routes.patch("/decks/:id", decks.update);

routes.delete("/decks/:id", decks.delete);

routes.put("/decks/:id/cards/:cardId", decks.setCard);
routes.put("/decks/:id/cards/:cardId/commander", decks.setCommander);
routes.post("/decks/:id/import/preview", decks.previewList);
routes.post("/decks/:id/import", decks.importList);
routes.get("/tracking", tracking.list);
routes.get("/cards/:cardId/locations", tracking.location);
routes.post("/tracking/move/preview", tracking.preview);
routes.post("/tracking/move", tracking.move);
routes.get("/history", tracking.history);
routes.get("/history/:id", tracking.event);
routes.get("/decks/:id/versions", tracking.versions);
routes.post("/decks/:id/versions", tracking.saveVersion);
routes.get("/decks/:id/versions/:versionId", tracking.version);
export { routes };

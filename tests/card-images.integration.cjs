// Optional live check: npm run build && node tests/card-images.integration.cjs
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { AppDataSource: db } = require("../dist/config/dataSource");
const { app } = require("../dist/app");
const { CardImages, cardImages } = require("../dist/services/CardImages");
const { User } = require("../dist/entities/User");
const { Deck } = require("../dist/entities/Deck");
const { Card } = require("../dist/entities/Cards");
const { DeckCard } = require("../dist/entities/DeckCard");
const { jwtSecret } = require("../dist/config/auth");
const jwt = require("jsonwebtoken");
const path = require("node:path");
let server, userId;
const originalImage = cardImages.image,
    originalInfo = cardImages.info;

(async () => {
    try {
        await db.initialize();

        const card = await db
            .getRepository(Card)
            .findOneByOrFail({ externalId: "oracle:648100cd-d44a-48f8-87e4-a1d5467f348c" });
        const tag = randomUUID().slice(0, 8),
            user = await db
                .getRepository(User)
                .save({ username: "image_test_" + tag, email: tag + "@image.test", password: "unused-test-password" });

        userId = user.id;

        const deck = await db.getRepository(Deck).save({ name: "Temporary image test", format: "commander", userId });
        await db
            .getRepository(DeckCard)
            .upsert({ deckId: deck.id, cardId: card.id, quantity: 1 }, ["deckId", "cardId"]);

        const calls = { api: 0, images: 0 };
        const directory = path.resolve(__dirname, "../data/card-images.json");
        const cache = new CardImages(directory, async (...args) => {
            calls[String(args[0]).startsWith("https://api.scryfall.com") ? "api" : "images"]++;

            return fetch(...args);
        });

        cardImages.image = cache.image.bind(cache);
        cardImages.info = cache.info.bind(cache);
        server = app.listen(0, "127.0.0.1");
        await new Promise((resolve) => server.once("listening", resolve));

        const base = "http://127.0.0.1:" + server.address().port;
        const headers = {
            "Content-Type": "application/json",
            Authorization:
                "Bearer " + jwt.sign({}, jwtSecret(), { subject: userId, algorithm: "HS256", expiresIn: 300 })
        };
        const patch = (body) =>
            fetch(base + "/decks/" + deck.id, { method: "PATCH", headers, body: JSON.stringify(body) });

        assert.equal((await patch({ coverCardId: card.id })).status, 200);

        const decks = await fetch(base + "/decks", { headers }).then((r) => r.json());

        assert.equal(decks.find((d) => d.id === deck.id).coverCard.id, card.id);
        assert.equal(decks.find((d) => d.id === deck.id).coverCard.imagery.faces.length, 2);

        const page = await fetch(base + "/cards?pageSize=60", { headers }).then((r) => r.json());

        assert.equal(page.items.length, 60);
        assert.ok(
            page.items.every((card) => card.imagery?.faces[0]?.images.small?.startsWith("https://cards.scryfall.io/"))
        );

        for (const [size, face] of [
            ["small", 0],
            ["normal", 0],
            ["art_crop", 0],
            ["normal", 1]
        ]) {
            const url = base + "/media/cards/" + card.id + "/" + size + "/" + face;
            const redirect = await fetch(url, { redirect: "manual" });

            assert.equal(redirect.status, 302);
            assert.ok(redirect.headers.get("location").startsWith("https://cards.scryfall.io/"));

            const response = await fetch(redirect.headers.get("location"), {
                headers: {
                    "User-Agent": "DeckTrack/1.0 (direct CDN integration verification)",
                    Accept: "image/webp,image/jpeg,image/png"
                }
            });

            assert.equal(response.status, 200, `${size} face ${face}`);
            assert.ok(response.headers.get("content-type").startsWith("image/"));
            assert.ok((await response.arrayBuffer()).byteLength > 1000);
        }

        const info = await fetch(base + "/media/cards/" + card.id + "/info").then((r) => r.json());

        assert.equal(info.faces.length, 2);
        assert.ok(info.faces[0].artist);

        const requestsBefore = JSON.stringify(calls);
        const restarted = new CardImages(directory, async () => {
            throw new Error("Network should not be used");
        });

        await restarted.image(card, "small", 0);
        assert.equal(JSON.stringify(calls), requestsBefore);
        assert.equal(calls.api, 0);
        assert.equal(calls.images, 0);
        assert.equal((await patch({ coverCardId: null })).status, 200);
        await patch({ coverCardId: card.id });
        assert.equal(
            (
                await fetch(base + "/decks/" + deck.id + "/cards/" + card.id, {
                    method: "PUT",
                    headers,
                    body: JSON.stringify({ quantity: 0 })
                })
            ).status,
            200
        );
        assert.equal((await db.getRepository(Deck).findOneByOrFail({ id: deck.id })).coverCardId, null);
        console.log(
            "Live CDN + PostgreSQL: 60 cards include direct image URLs; thumbnails, banners, both faces and saved covers verified with zero runtime Scryfall API calls or server image downloads.",
            calls
        );
    } catch (error) {
        console.error(error);
        process.exitCode = 1;
    } finally {
        cardImages.image = originalImage;
        cardImages.info = originalInfo;

        if (server) {
            await new Promise((resolve) => server.close(resolve));
        }
        if (db.isInitialized) {
            if (userId) {
                await db.getRepository(User).delete({ id: userId });
            }

            await db.destroy();
        }
    }
})();

// npm run build && node tests/deck-commanders.integration.cjs
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { AppDataSource: db } = require("../dist/config/dataSource");
const { app } = require("../dist/app");
const { User } = require("../dist/entities/User");
const { Deck } = require("../dist/entities/Deck");
const { Card } = require("../dist/entities/Cards");
const { DeckCard } = require("../dist/entities/DeckCard");
const { jwtSecret } = require("../dist/config/auth");
const jwt = require("jsonwebtoken");
let userId, server;

(async () => {
    try {
        await db.initialize();

        const tag = randomUUID().slice(0, 8);

        const user = await db.getRepository(User).save({
            username: "commander_test_" + tag,
            email: tag + "@commander.test",
            password: "unused-test-password"
        });

        userId = user.id;

        const deck = await db
            .getRepository(Deck)
            .save({ name: "Temporary commander test", format: "commander", userId });

        const cards = [];

        for (const name of ["Tymna the Weaver", "Thrasios, Triton Hero", "Guild Artisan"]) {
            cards.push(await db.getRepository(Card).findOneByOrFail({ name }));
        }

        await db.getRepository(DeckCard).upsert(
            cards.map((card) => ({ deckId: deck.id, cardId: card.id, quantity: 1 })),
            ["deckId", "cardId"]
        );

        server = app.listen(0, "127.0.0.1");
        await new Promise((resolve) => server.once("listening", resolve));

        const base = "http://127.0.0.1:" + server.address().port;
        const headers = (owner) => ({
            "Content-Type": "application/json",
            Authorization: "Bearer " + jwt.sign({}, jwtSecret(), { subject: owner, expiresIn: 60, algorithm: "HS256" })
        });
        const path = "/decks/" + deck.id;
        const put = async (card, isCommander, owner = userId) =>
            fetch(base + path + "/cards/" + card.id + "/commander", {
                method: "PUT",
                headers: headers(owner),
                body: JSON.stringify({ isCommander })
            });

        for (const card of cards) {
            assert.equal((await put(card, true)).status, 200);
        }

        let view = await fetch(base + path, { headers: headers(userId) }).then((r) => r.json());

        assert.equal(view.cards.filter((card) => card.isCommander).length, 3);

        const response = await fetch(base + path + "/import", {
            method: "POST",
            headers: headers(userId),
            body: JSON.stringify({ text: cards.map((card) => "1 " + card.name).join("\n") })
        });

        assert.equal(response.status, 200);
        view = await fetch(base + path, { headers: headers(userId) }).then((r) => r.json());
        assert.equal(view.cards.filter((card) => card.isCommander).length, 3);
        await fetch(base + path + "/cards/" + cards[0].id, {
            method: "PUT",
            headers: headers(userId),
            body: JSON.stringify({ quantity: 2 })
        });
        assert.equal(
            (await db.getRepository(DeckCard).findOneByOrFail({ deckId: deck.id, cardId: cards[0].id })).isCommander,
            true
        );
        assert.equal((await put(cards[1], false)).status, 200);
        assert.equal((await put(cards[0], true, randomUUID())).status, 401);
        await fetch(base + path + "/cards/" + cards[0].id, {
            method: "PUT",
            headers: headers(userId),
            body: JSON.stringify({ quantity: 0 })
        });
        assert.equal(await db.getRepository(DeckCard).countBy({ deckId: deck.id, isCommander: true }), 1);

        await db.getRepository(Deck).update({ id: deck.id }, { format: "standard" });

        assert.equal((await put(cards[1], true)).status, 400);
        console.log(
            "HTTP + PostgreSQL: multiple commanders and Background, owner/format checks, flags survive reimport and quantity edits, removal clears the association."
        );
    } catch (error) {
        console.error(error);
        process.exitCode = 1;
    } finally {
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

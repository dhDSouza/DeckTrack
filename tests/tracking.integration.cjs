// npm run build && node tests/tracking.integration.cjs
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { readFileSync } = require("node:fs");
const { AppDataSource: db } = require("../dist/config/dataSource");
const { app } = require("../dist/app");
const { User } = require("../dist/entities/User");
const { Card } = require("../dist/entities/Cards");
const { DeckCard } = require("../dist/entities/DeckCard");
const { jwtSecret } = require("../dist/config/auth");
const jwt = require("jsonwebtoken");
let server;
const users = [];

(async () => {
    try {
        await db.initialize();

        for (let i = 0; i < 2; i++) {
            const tag = randomUUID().slice(0, 8);

            users.push(
                await db.getRepository(User).save({
                    username: "tracking_" + tag,
                    email: tag + "@tracking.test",
                    password: "unused-test-password"
                })
            );
        }

        server = app.listen(0, "127.0.0.1");
        await new Promise((resolve) => server.once("listening", resolve));

        const base = "http://127.0.0.1:" + server.address().port;
        const request = async (path, method = "GET", body, owner = 0) => {
            const response = await fetch(base + path, {
                method,
                headers: {
                    "Content-Type": "application/json",
                    Authorization:
                        "Bearer " +
                        jwt.sign({}, jwtSecret(), { subject: users[owner].id, expiresIn: 300, algorithm: "HS256" })
                },
                ...(body ? { body: JSON.stringify(body) } : {})
            });
            const data = response.status === 204 ? null : await response.json();

            return { status: response.status, data };
        };
        const ok = async (path, method, body, owner = 0) => {
            const result = await request(path, method, body, owner);

            assert.ok(
                result.status >= 200 && result.status < 300,
                JSON.stringify({ path, status: result.status, data: result.data })
            );

            return result.data;
        };
        const cards = {};

        for (const name of [
            "Oboro, Palace in the Clouds",
            "Teferi's Isle",
            "Island",
            "Sol Ring",
            "Cosima, God of the Voyage // The Omenkeel"
        ]) {
            cards[name] = await db.getRepository(Card).findOneByOrFail({ name });
        }

        const oboro = cards["Oboro, Palace in the Clouds"],
            teferi = cards["Teferi's Isle"],
            island = cards.Island,
            sol = cards["Sol Ring"];
        const a = await ok("/decks", "POST", { name: "Cosima tracking test", format: "commander" }),
            b = await ok("/decks", "POST", { name: "Second deck tracking test", format: "commander" }),
            c = await ok("/decks", "POST", { name: "Third deck tracking test", format: "free" });

        await ok("/decks/" + a.id + "/import", "POST", {
            text: readFileSync("tests/fixtures/deck-list.txt", "utf8"),
            registerOwned: true
        });
        await ok("/collection/" + oboro.id, "PUT", { quantity: 1 });

        const location = async (card) => await ok("/cards/" + card.id + "/locations");

        assert.equal((await location(oboro)).poolQuantity, 1);
        assert.equal((await location(teferi)).assignedQuantity, 1);

        const v1 = await ok("/decks/" + a.id + "/versions", "POST", { tag: "v1.0", note: "Before replacing the land" });
        const input = {
            cardId: oboro.id,
            quantity: 1,
            fromDeckId: null,
            toDeckId: a.id,
            replaceCardId: teferi.id,
            operationId: randomUUID(),
            note: "Atomic land swap"
        };
        const preview = await ok("/tracking/move/preview", "POST", input);

        assert.deepEqual(preview.warnings, []);
        assert.equal(preview.totals[0].after, 100);

        const confirmed = { ...input, previewToken: preview.previewToken };

        await ok("/tracking/move", "POST", confirmed);
        await ok("/tracking/move", "POST", confirmed);
        assert.equal((await location(oboro)).locations[0].deckId, a.id);
        assert.equal((await location(oboro)).ownedQuantity, 1);
        assert.equal((await location(teferi)).poolQuantity, 1);

        let version = await ok("/decks/" + a.id + "/versions/" + v1.id);

        assert.ok(version.changes.some((card) => card.cardId === oboro.id && card.before === 0 && card.after === 1));
        assert.ok(version.changes.some((card) => card.cardId === teferi.id && card.before === 1 && card.after === 0));

        const v11 = await ok("/decks/" + a.id + "/versions", "POST", { tag: "v1.1", note: "After land swap" });

        assert.ok(v11.changeCount > v1.changeCount);
        assert.equal((await request("/decks/" + a.id + "/versions", "POST", { tag: "v1.1" })).status, 409);

        const transfer = { cardId: oboro.id, quantity: 1, fromDeckId: a.id, toDeckId: b.id, operationId: randomUUID() };
        const transferPreview = await ok("/tracking/move/preview", "POST", transfer);

        assert.ok(transferPreview.warnings.some((text) => text.includes("99")));
        assert.equal(
            (await request("/tracking/move", "POST", { ...transfer, previewToken: transferPreview.previewToken }))
                .status,
            409
        );
        await ok("/tracking/move", "POST", {
            ...transfer,
            previewToken: transferPreview.previewToken,
            acknowledgeWarnings: true
        });

        const ownedBefore = (await location(oboro)).ownedQuantity;

        await ok("/decks/" + b.id + "/cards/" + oboro.id, "PUT", { quantity: 1, registerOwned: true });
        assert.equal((await location(oboro)).ownedQuantity, ownedBefore);

        const refill = { cardId: teferi.id, quantity: 1, fromDeckId: null, toDeckId: a.id, operationId: randomUUID() };
        const refillPreview = await ok("/tracking/move/preview", "POST", refill);

        await ok("/tracking/move", "POST", { ...refill, previewToken: refillPreview.previewToken });

        const current = await ok("/decks/" + a.id);

        assert.equal(
            current.cards.reduce((sum, card) => sum + card.quantity, 0),
            100
        );
        await ok("/collection/" + oboro.id, "PUT", { quantity: 0 });
        assert.equal((await location(oboro)).missingQuantity, 1);
        await ok("/collection/" + oboro.id, "PUT", { quantity: 1 });
        await ok("/collection/" + island.id, "PUT", { quantity: 31 });

        const stale = { cardId: island.id, quantity: 1, fromDeckId: null, toDeckId: c.id, operationId: randomUUID() };
        const stalePreview = await ok("/tracking/move/preview", "POST", stale);

        await ok("/collection/" + island.id, "PUT", { quantity: 32 });
        assert.equal(
            (await request("/tracking/move", "POST", { ...stale, previewToken: stalePreview.previewToken })).status,
            409
        );
        await ok("/collection/" + sol.id, "PUT", { quantity: 1 });

        const races = [b, c].map((deck) => ({
            cardId: sol.id,
            quantity: 1,
            fromDeckId: null,
            toDeckId: deck.id,
            operationId: randomUUID()
        }));
        const previews = await Promise.all(races.map((input) => ok("/tracking/move/preview", "POST", input)));
        const results = await Promise.all(
            races.map((input, index) =>
                request("/tracking/move", "POST", {
                    ...input,
                    previewToken: previews[index].previewToken,
                    acknowledgeWarnings: true
                })
            )
        );

        assert.deepEqual(results.map((result) => result.status).sort(), [200, 409]);
        assert.equal((await location(sol)).poolQuantity, 0);
        assert.equal((await location(sol)).assignedQuantity, 1);

        const history = await ok("/history?deckId=" + a.id);

        assert.ok(history.changeCount >= 4);
        assert.ok(history.items.some((event) => event.action === "cards.replaced"));

        const cardHistory = await ok("/history?cardId=" + oboro.id);

        assert.ok(cardHistory.items.some((event) => event.action === "cards.moved"));
        assert.ok(cardHistory.items.some((event) => event.action === "collection.updated"));
        assert.equal(cardHistory.items.filter((event) => event.action === "cards.replaced").length, 1);

        const jointHistory = await ok("/history?deckId=" + a.id + "&cardId=" + oboro.id);

        assert.ok(jointHistory.total > 0);
        assert.ok(
            jointHistory.items.every((event) => event.deckIds.includes(a.id) && event.cardIds.includes(oboro.id))
        );
        assert.deepEqual(await ok("/tracking", "GET", undefined, 1), []);
        assert.equal((await request("/decks/" + a.id + "/versions/" + v1.id, "GET", undefined, 1)).status, 404);
        assert.equal((await request("/history/" + history.items[0].id, "GET", undefined, 1)).status, 404);
        assert.equal(
            (await request("/tracking/move/preview", "POST", { ...input, operationId: randomUUID() }, 1)).status,
            404
        );
        await ok("/decks/" + a.id, "DELETE");

        const deletedVersion = await ok("/decks/" + a.id + "/versions/" + v1.id);

        assert.equal(deletedVersion.current, null);
        assert.equal(
            deletedVersion.snapshot.cards.reduce((sum, card) => sum + card.quantity, 0),
            100
        );
        assert.ok((await ok("/history?deckId=" + a.id)).items.some((event) => event.action === "deck.deleted"));
        console.log(
            "Tracking HTTP + PostgreSQL passed: pool/decks, atomic replacement, Commander warning, idempotency, stale preview, concurrent allocation, stock invariance, ledger credits, audit trail, immutable tags/diffs, deleted-deck retention and private access."
        );
    } catch (error) {
        console.error(error);
        process.exitCode = 1;
    } finally {
        if (server) {
            await new Promise((resolve) => server.close(resolve));
        }
        if (db.isInitialized) {
            for (const user of users) {
                await db.getRepository(User).delete({ id: user.id });
            }

            await db.destroy();
        }
    }
})();

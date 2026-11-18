// npm run build && node tests/deck-stats.integration.cjs
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { readFileSync } = require("node:fs");
const vm = require("node:vm");
const { AppDataSource: db } = require("../dist/config/dataSource");
const { app } = require("../dist/app");
const { User } = require("../dist/entities/User");
const { Deck } = require("../dist/entities/Deck");
const { jwtSecret } = require("../dist/config/auth");
const jwt = require("jsonwebtoken");
const users = [];
let server;

(async () => {
    try {
        await db.initialize();

        for (let index = 0; index < 2; index++) {
            const tag = randomUUID().slice(0, 8);
            users.push(
                await db.getRepository(User).save({
                    username: "stats_" + tag,
                    email: tag + "@stats.test",
                    password: "unused-test-password"
                })
            );
        }

        server = app.listen(0, "127.0.0.1");
        await new Promise((resolve) => server.once("listening", resolve));
        const base = "http://127.0.0.1:" + server.address().port;
        const request = async (path, method = "GET", body, user = 0) => {
            const response = await fetch(base + path, {
                method,
                headers: {
                    "Content-Type": "application/json",
                    Authorization:
                        "Bearer " +
                        jwt.sign({}, jwtSecret(), {
                            subject: users[user].id,
                            expiresIn: 120,
                            algorithm: "HS256"
                        })
                },
                ...(body ? { body: JSON.stringify(body) } : {})
            });
            return { status: response.status, data: await response.json() };
        };
        const created = await request("/decks", "POST", { name: "Statistics sample", format: "commander" });
        assert.equal(created.status, 201);
        const id = created.data.id;

        assert.equal(
            (
                await request(`/decks/${id}/import`, "POST", {
                    text: readFileSync("tests/fixtures/deck-list.txt", "utf8")
                })
            ).status,
            200
        );

        const deck = (await request(`/decks/${id}`)).data;
        const context = { window: {}, localStorage: { getItem: () => null } };
        vm.runInNewContext(readFileSync("public/deck-page.js", "utf8"), context);
        vm.runInNewContext(readFileSync("public/deck-stats.js", "utf8"), context);
        const stats = context.window.DeckStats.compute(deck);
        assert.equal(stats.total, 100);
        assert.equal(stats.lands, 45);
        assert.equal(stats.manaCopies, 55);

        assert.equal((await request(`/decks/${id}`, "PATCH", { powerLevel: 7 })).status, 200);
        const saved = await request(`/decks/${id}/versions`, "POST", { tag: "v1.0", note: "Declared power 7" });
        assert.equal(saved.status, 201);
        assert.equal((await request(`/decks/${id}`, "PATCH", { powerLevel: 8 })).status, 200);
        const version = (await request(`/decks/${id}/versions/${saved.data.id}`)).data;
        assert.equal(version.snapshot.powerLevel, 7);
        assert.equal(version.current.powerLevel, 8);
        assert.ok(
            version.metadataChanges.some(
                (change) => change.field === "powerLevel" && change.before === 7 && change.after === 8
            )
        );

        const before = (await request(`/history?deckId=${id}`)).data.changeCount;
        await request(`/decks/${id}`, "PATCH", { powerLevel: 8 });
        assert.equal((await request(`/history?deckId=${id}`)).data.changeCount, before);

        for (const powerLevel of [0, 11, 7.5, "7"]) {
            assert.equal((await request(`/decks/${id}`, "PATCH", { powerLevel })).status, 400);
        }

        assert.equal((await request(`/decks/${id}`, "PATCH", { powerLevel: 4 }, 1)).status, 404);
        await assert.rejects(
            () => db.getRepository(Deck).update({ id }, { powerLevel: 11 }),
            (error) => error.driverError?.code === "23514"
        );
        assert.equal((await request(`/decks/${id}`, "PATCH", { powerLevel: null })).status, 200);
        assert.equal((await request(`/decks/${id}`)).data.powerLevel, null);
        console.log(
            "HTTP + PostgreSQL: full-deck statistics, declared power persistence, range validation, ownership, audit, snapshots and metadata comparisons passed."
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

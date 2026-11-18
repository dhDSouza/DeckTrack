// Optional: npm run build && node tests/card-filters.integration.cjs
// Requires the configured PostgreSQL. Creates and removes only its own test user.
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { AppDataSource: db } = require("../dist/config/dataSource");
const { seedCatalog } = require("../dist/catalog");
const { app } = require("../dist/app");
const { User } = require("../dist/entities/User");
const { Card } = require("../dist/entities/Cards");
const { Deck } = require("../dist/entities/Deck");
const { DeckCard } = require("../dist/entities/DeckCard");
const { UserCard } = require("../dist/entities/UserCard");
const { jwtSecret } = require("../dist/config/auth");
const jwt = require("jsonwebtoken");
let server, userId;

(async () => {
    try {
        await db.initialize();

        const solBefore = await db.getRepository(Card).findOneBy({ name: "Sol Ring" });

        await seedCatalog();

        const sol = await db.getRepository(Card).findOneByOrFail({ name: "Sol Ring" });

        if (solBefore) {
            assert.equal(sol.id, solBefore.id);
        }

        const island = await db.getRepository(Card).findOneByOrFail({ name: "Island" });
        const tag = randomUUID().slice(0, 8);

        const user = await db
            .getRepository(User)
            .save({ username: "filter_test_" + tag, email: tag + "@filter.test", password: "unused-test-password" });

        userId = user.id;

        const deck = await db.getRepository(Deck).save({ name: "Temporary filter test", format: "commander", userId });
        await db.getRepository(DeckCard).upsert(
            [
                { deckId: deck.id, cardId: sol.id, quantity: 1 },
                { deckId: deck.id, cardId: island.id, quantity: 30 }
            ],
            ["deckId", "cardId"]
        );
        await db.getRepository(UserCard).upsert(
            [
                { userId, cardId: sol.id, quantity: 2 },
                { userId, cardId: island.id, quantity: 30 }
            ],
            ["userId", "cardId"]
        );

        server = app.listen(0, "127.0.0.1");
        await new Promise((resolve) => server.once("listening", resolve));

        const base = "http://127.0.0.1:" + server.address().port;
        const headers = (owner) => ({
            Authorization: "Bearer " + jwt.sign({}, jwtSecret(), { subject: owner, algorithm: "HS256", expiresIn: 60 })
        });
        const get = async (query, owner = userId, status = 200) => {
            const response = await fetch(base + "/cards?" + new URLSearchParams(query), { headers: headers(owner) });

            assert.equal(response.status, status, JSON.stringify(query));

            return response.json();
        };
        const contains = (result, name) =>
            assert.ok(
                result.items.some((card) => card.name === name),
                name
            );

        contains(
            await get({
                q: "Sol Ring",
                type: "Artifact",
                colors: "C",
                manaMin: 1,
                manaMax: 1,
                text: "Add",
                set: "CMM",
                legalFormat: "commander"
            }),
            "Sol Ring"
        );
        contains(await get({ q: "Island", colors: "C" }), "Island");
        contains(await get({ q: "Island", colors: "U", colorField: "colorIdentity", colorMode: "exact" }), "Island");
        assert.ok(
            !(await get({ q: "Island", colors: "U", colorMode: "exact" })).items.some((card) => card.name === "Island")
        );
        contains(await get({ q: "Azorius Charm", colors: "W,U", colorMode: "exact" }), "Azorius Charm");
        contains(await get({ q: "Azorius Charm", colors: "W,U", colorMode: "all" }), "Azorius Charm");
        contains(await get({ q: "Azorius Charm", colors: "W", colorMode: "any" }), "Azorius Charm");
        contains(
            await get({ q: "Sphinx of the Final Word", keyword: "flying", manaMin: 7, manaMax: 7 }),
            "Sphinx of the Final Word"
        );
        contains(
            await get({ q: "Cosima", text: "Crew 1", type: "Artifact", set: "KHM" }),
            "Cosima, God of the Voyage // The Omenkeel"
        );
        assert.equal((await get({ q: "Sol Ring", legalFormat: "vintage" })).total, 0);
        assert.equal((await get({ scope: "collection", type: "Artifact" })).total, 1);
        assert.equal((await get({ deckId: deck.id, type: "Land" })).total, 1);
        assert.equal((await get({ scope: "collection" }, randomUUID())).total, 0);
        await get({ deckId: deck.id }, randomUUID(), 404);

        const options = await fetch(base + "/cards/filters", { headers: headers(userId) }).then((response) =>
            response.json()
        );

        assert.ok(options.sets.some((set) => set.code === "KHM"));

        const wholeDeck = await fetch(base + "/decks/" + deck.id, { headers: headers(userId) }).then((response) =>
            response.json()
        );

        assert.equal(
            wholeDeck.cards.reduce((sum, card) => sum + card.quantity, 0),
            31
        );
        assert.ok(wholeDeck.cards[0].card.metadata.type);
        console.log(
            "HTTP + PostgreSQL: combined filters, color modes, identity, both faces, private scopes, metadata and preserved IDs/quantities passed."
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

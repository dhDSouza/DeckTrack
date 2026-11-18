const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");

process.env.JWT_SECRET = "test-secret-with-at-least-32-characters";

const { app } = require("../dist/app");
const { repositories: db } = require("../dist/repositories");
const { DeckService } = require("../dist/services/DeckService");
const { UserService } = require("../dist/services/UserService");
const { cardImages } = require("../dist/services/CardImages");
let server, base;

before(async () => {
    server = app.listen(0, "127.0.0.1");
    await new Promise((resolve) => server.once("listening", resolve));
    base = "http://127.0.0.1:" + server.address().port;
});
after(() => new Promise((resolve) => server.close(resolve)));
test("protected routes require authentication", async () => {
    const res = await fetch(base + "/decks");

    assert.equal(res.status, 401);
    assert.equal((await res.json()).message, "Autenticação necessária.");
});
test("forged and expired tokens are rejected", async () => {
    for (const token of [
        "invalid",
        jwt.sign({}, process.env.JWT_SECRET, { subject: "11111111-1111-4111-8111-111111111111", expiresIn: -1 })
    ]) {
        const res = await fetch(base + "/decks", { headers: { Authorization: "Bearer " + token } });

        assert.equal(res.status, 401);
        assert.equal((await res.json()).message, "Token inválido ou expirado.");
    }
});
test("registration rejects invalid input before database access", async () => {
    const res = await fetch(base + "/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "a", email: "invalid", password: "123" })
    });

    assert.equal(res.status, 400);
    assert.equal((await res.json()).message, "Dados inválidos.");
});

test("Portuguese error messages retain UTF-8 accents", async () => {
    const invalidJson = await fetch(base + "/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{"
    });

    assert.equal(invalidJson.status, 400);
    assert.equal((await invalidJson.json()).message, "JSON inválido.");

    const headers = {
        Authorization:
            "Bearer " + jwt.sign({}, process.env.JWT_SECRET, { subject: "11111111-1111-4111-8111-111111111111" })
    };
    const missingRoute = await fetch(base + "/route-does-not-exist", { headers });

    assert.equal(missingRoute.status, 404);
    assert.equal((await missingRoute.json()).message, "Rota não encontrada.");

    const oversizedPassword = await fetch(base + "/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "player", email: "player@example.com", password: "é".repeat(37) })
    });

    assert.equal(oversizedPassword.status, 400);
    assert.ok(
        (await oversizedPassword.json()).errors.some((issue) => issue.message === "Senha deve ter até 72 bytes.")
    );
});
test("negative quantities and invalid formats are rejected", async () => {
    const headers = {
        "Content-Type": "application/json",
        Authorization:
            "Bearer " + jwt.sign({}, process.env.JWT_SECRET, { subject: "11111111-1111-4111-8111-111111111111" })
    };

    for (const [path, body, method] of [
        ["/collection/11111111-1111-4111-8111-111111111111", { quantity: -1 }, "PUT"],
        ["/decks", { name: "Deck", format: "invalid" }, "POST"]
    ]) {
        const res = await fetch(base + path, { method, headers, body: JSON.stringify(body) });

        assert.equal(res.status, 400);
    }
});
test("catalog rejects invalid pagination and oversized search terms", async () => {
    const headers = {
        Authorization:
            "Bearer " + jwt.sign({}, process.env.JWT_SECRET, { subject: "11111111-1111-4111-8111-111111111111" })
    };

    for (const query of [
        "page=0",
        "page=1.5",
        "pageSize=101",
        "q=" + "a".repeat(201),
        "q=a&q=b",
        "manaMin=5&manaMax=1",
        "colors=C,U",
        "colorField=bad",
        "deckId=bad",
        "type=a&type=b"
    ]) {
        const res = await fetch(base + "/cards?" + query, { headers });

        assert.equal(res.status, 400);
    }
});
test("list import endpoints require authentication and validate bodies before database access", async () => {
    const headers = {
        "Content-Type": "application/json",
        Authorization:
            "Bearer " + jwt.sign({}, process.env.JWT_SECRET, { subject: "11111111-1111-4111-8111-111111111111" })
    };

    for (const suffix of ["/import", "/import/preview"]) {
        const path = base + "/decks/11111111-1111-4111-8111-111111111111" + suffix;

        assert.equal((await fetch(path, { method: "POST" })).status, 401);

        for (const body of [
            {},
            { text: "" },
            { text: "  " },
            { text: 123 },
            { text: "a".repeat(30001) },
            { text: "1 Island", registerOwned: "true" }
        ]) {
            assert.equal((await fetch(path, { method: "POST", headers, body: JSON.stringify(body) })).status, 400);
        }
    }
});
test("public image endpoint redirects to CDN without downloading image bytes and validates size and face", async () => {
    const descriptor = Object.getOwnPropertyDescriptor(db, "cards"),
        original = cardImages.image;

    Object.defineProperty(db, "cards", {
        configurable: true,
        value: { findOneBy: async () => ({ name: "Card", externalId: null }) }
    });

    cardImages.image = async () => "https://cards.scryfall.io/display/front/a/b/card.webp";

    try {
        const path = base + "/media/cards/11111111-1111-4111-8111-111111111111";
        const image = await fetch(path + "/small/0", { redirect: "manual" });

        assert.equal(image.status, 302);
        assert.equal(image.headers.get("location"), "https://cards.scryfall.io/display/front/a/b/card.webp");
        assert.equal((await fetch(path + "/png/0")).status, 400);
        assert.equal((await fetch(path + "/small/4")).status, 400);
    } finally {
        Object.defineProperty(db, "cards", descriptor);
        cardImages.image = original;
    }
});
test("commander endpoint requires authentication and a strict boolean", async () => {
    const path =
        base + "/decks/11111111-1111-4111-8111-111111111111/cards/22222222-2222-4222-8222-222222222222/commander";

    assert.equal((await fetch(path, { method: "PUT" })).status, 401);

    const headers = {
        "Content-Type": "application/json",
        Authorization:
            "Bearer " + jwt.sign({}, process.env.JWT_SECRET, { subject: "11111111-1111-4111-8111-111111111111" })
    };

    for (const body of [{}, { isCommander: "true" }, { isCommander: 1 }]) {
        assert.equal((await fetch(path, { method: "PUT", headers, body: JSON.stringify(body) })).status, 400);
    }
});
test("tracking and history require authentication and validate request bodies before writes", async () => {
    for (const path of ["/tracking", "/history", "/decks/11111111-1111-4111-8111-111111111111/versions"]) {
        assert.equal((await fetch(base + path)).status, 401);
    }

    const headers = {
        "Content-Type": "application/json",
        Authorization:
            "Bearer " + jwt.sign({}, process.env.JWT_SECRET, { subject: "11111111-1111-4111-8111-111111111111" })
    };

    for (const path of [
        "/tracking/move",
        "/tracking/move/preview",
        "/decks/11111111-1111-4111-8111-111111111111/versions"
    ]) {
        assert.equal((await fetch(base + path, { method: "POST", headers, body: "{}" })).status, 400);
    }

    assert.equal((await fetch(base + "/history?pageSize=101", { headers })).status, 400);
});
test("decks are looked up using the authenticated owner", async () => {
    let criteria;

    Object.defineProperty(db, "decks", {
        configurable: true,
        value: {
            findOneBy: async (value) => {
                criteria = value;

                return null;
            }
        }
    });
    await assert.rejects(
        () => new DeckService().get("owner", "deck"),
        (error) => error.status === 404
    );
    assert.deepEqual(criteria, { id: "deck", userId: "owner" });
});
test("registration hashes passwords and never returns the hash", async () => {
    let saved;

    Object.defineProperty(db, "users", {
        configurable: true,
        value: {
            create: (value) => value,
            save: async (value) => {
                saved = value;

                return { ...value, id: "id" };
            }
        }
    });

    const user = await new UserService().register({
        username: "player",
        email: "player@example.com",
        password: "strong-password"
    });

    assert.equal(await bcrypt.compare("strong-password", saved.password), true);
    assert.equal(Object.hasOwn(user, "password"), false);
});

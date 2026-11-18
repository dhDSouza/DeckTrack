const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { resolveDeckList } = require("../dist/services/DeckList");
const { DeckService } = require("../dist/services/DeckService");
const { AppDataSource } = require("../dist/config/dataSource");
const { repositories: db } = require("../dist/repositories");
const { Deck } = require("../dist/entities/Deck");
const { Card } = require("../dist/entities/Cards");
const { DeckCard } = require("../dist/entities/DeckCard");
const { User } = require("../dist/entities/User");
const { UserCard } = require("../dist/entities/UserCard");
const { Activity } = require("../dist/entities/Activity");
const catalog = require("../data/catalog.json").cards.map((card) => ({ ...card, id: card.externalId }));
const example = readFileSync(join(__dirname, "fixtures/deck-list.txt"), "utf8");

test("the complete user example resolves all 100 copies, including front faces and AE spellings", () => {
    const result = resolveDeckList(example, catalog);

    assert.deepEqual(result.errors, []);
    assert.equal(result.canImport, true);
    assert.equal(result.cards.length, 71);
    assert.equal(result.totalQuantity, 100);
    assert.equal(result.cards.find((card) => card.name === "Island").quantity, 30);
    assert.ok(result.cards.some((card) => card.name.startsWith("Cosima, God of the Voyage")));
    assert.ok(result.cards.some((card) => card.name.startsWith("Docent of Perfection")));
    assert.ok(result.cards.some((card) => /[ÆA]E?therize/i.test(card.name)));
});

test("duplicate lines, Windows newlines, Markdown slashes and apostrophes are normalized", () => {
    const result = resolveDeckList("\uFEFF---\r\n1 Island\\\r\n\r\n2x island\r\n1 Bonders’ Enclave\\\r\n", catalog);

    assert.equal(result.canImport, true);
    assert.equal(result.cards[0].quantity, 3);
    assert.deepEqual(result.cards[0].lines, [2, 4]);
    assert.equal(result.totalQuantity, 4);
});

test("bad quantities, invalid lines, missing names and overflow are reported without allowing import", () => {
    for (const text of [
        "0 Island",
        "-1 Island",
        "1.5 Island",
        "2147483648 Island",
        "Island",
        "1 Missing Not A Card",
        "2147483647 Island\n1 Island",
        "\n---\n",
        "1 Island\n".repeat(1001)
    ]) {
        const result = resolveDeckList(text, catalog);

        assert.equal(result.canImport, false, text.slice(0, 60));
        assert.ok(result.errors.length);
    }

    const mixed = resolveDeckList("1 Island\n1 Not A Real Card", catalog);

    assert.equal(mixed.cards.length, 1);
    assert.equal(mixed.errors[0].line, 2);
    assert.equal(mixed.canImport, false);
});

test("ambiguous front faces are rejected, exact full names take precedence and canonical records are preferred", () => {
    const cards = [
        { id: "a", name: "Front // Back" },
        { id: "b", name: "Front // Other" },
        { id: "c", name: "Island" },
        { id: "d", name: "Island", externalId: "oracle:imported" }
    ];

    assert.equal(resolveDeckList("1 Front", cards).canImport, false);
    assert.equal(resolveDeckList("1 Front // Back", cards).cards[0].cardId, "a");
    assert.equal(resolveDeckList("1 Island", cards).cards[0].cardId, "d");
    assert.equal(resolveDeckList("1 Front", [...cards, { id: "exact", name: "Front" }]).cards[0].cardId, "exact");
});

test("preview checks ownership before reading the catalog", async () => {
    const service = new DeckService();

    service.require = async () => {
        throw Object.assign(new Error("missing"), { status: 404 });
    };

    const descriptor = Object.getOwnPropertyDescriptor(db, "cards");

    Object.defineProperty(db, "cards", {
        configurable: true,
        get: () => {
            throw new Error("Catalog should not be accessed");
        }
    });

    try {
        await assert.rejects(
            () => service.previewList("other-user", "deck", "1 Island"),
            (error) => error.status === 404
        );
    } finally {
        Object.defineProperty(db, "cards", descriptor);
    }
});

test("import enforces ownership, validates everything before writing and uses a transaction with upsert quantities", async () => {
    const original = AppDataSource.transaction;
    let owned = true,
        writes = [],
        transactions = 0;

    AppDataSource.transaction = async (callback) => {
        transactions++;

        return callback({
            getRepository: (entity) => {
                if (entity === User) {
                    return { findOne: async () => ({ id: "owner" }) };
                }
                if (entity === UserCard) {
                    return { find: async () => [] };
                }
                if (entity === Activity) {
                    return { save: async (value) => value };
                }
                if (entity === Deck) {
                    return {
                        findOne: async (options) => {
                            assert.deepEqual(options.where, { id: "deck", userId: "owner" });

                            if (options.lock) {
                                assert.equal(options.lock.mode, "pessimistic_write");
                            }

                            return owned ? { id: "deck", name: "Deck", format: "commander" } : null;
                        }
                    };
                }
                if (entity === Card) {
                    return { find: async () => catalog };
                }
                if (entity === DeckCard) {
                    return {
                        find: async () => writes.map((card) => ({ ...card, card: { name: "Card" } })),
                        upsert: async (cards, conflict) => {
                            assert.deepEqual(conflict, ["deckId", "cardId"]);
                            writes.push(...cards);
                        }
                    };
                }

                throw new Error("Unexpected repository");
            }
        });
    };

    try {
        const service = new DeckService();

        assert.equal((await service.importList("owner", "deck", "1 Island\n1 Not A Real Card")).imported, false);
        assert.equal(writes.length, 0);

        const result = await service.importList("owner", "deck", "30 Island\n1 Island");

        assert.equal(result.imported, true);
        assert.equal(writes.length, 1);
        assert.equal(writes[0].quantity, 31);
        assert.equal(writes[0].deckId, "deck");
        owned = false;
        await assert.rejects(
            () => service.importList("owner", "deck", "1 Island"),
            (error) => error.status === 404
        );
        assert.equal(writes.length, 1);
        assert.equal(transactions, 3);
    } finally {
        AppDataSource.transaction = original;
    }
});

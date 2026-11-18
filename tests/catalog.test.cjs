const { test } = require("node:test");
const assert = require("node:assert/strict");
const snapshot = require("../data/catalog.json");
const { catalogSchema, seedCatalog } = require("../dist/catalog");
const { AppDataSource } = require("../dist/config/dataSource");
const { repositories: db } = require("../dist/repositories");
const { CardService } = require("../dist/services/CardService");

test("bundled catalog is valid, complete and has stable unique identifiers", () => {
    const catalog = catalogSchema.parse(snapshot);

    assert.ok(catalog.cards.length > 20000);
    assert.equal(new Set(catalog.cards.map((card) => card.externalId)).size, catalog.cards.length);
    assert.ok(catalog.cards.some((card) => card.name === "Sol Ring"));
    assert.ok(catalog.cards.some((card) => card.name === "Lightning Bolt"));
});

test("invalid and duplicate catalog records are rejected before import", () => {
    const card = { name: "Sol Ring", externalId: "oracle:test" };

    for (const cards of [[], [card, card], [{ ...card, name: "" }], [{ ...card, externalId: "x".repeat(101) }]]) {
        assert.equal(
            catalogSchema.safeParse({ source: snapshot.source, sourceDate: snapshot.sourceDate, cards }).success,
            false
        );
    }
});

test("seed uses one transaction and bounded upserts without replacing card UUIDs", async () => {
    const original = AppDataSource.transaction;
    let transactions = 0,
        imported = 0;

    AppDataSource.transaction = async (callback) => {
        transactions++;
        await callback({
            getRepository: () => ({
                upsert: async (cards, options) => {
                    assert.ok(cards.length <= 500);
                    assert.deepEqual(options, { conflictPaths: ["externalId"], skipUpdateIfNoValuesChanged: true });
                    assert.ok(cards.every((card) => !Object.hasOwn(card, "id")));
                    imported += cards.length;
                }
            })
        });
    };

    try {
        await seedCatalog();
    } finally {
        AppDataSource.transaction = original;
    }

    assert.equal(transactions, 1);
    assert.equal(imported, snapshot.cards.length);
});

test("catalog search escapes wildcards and returns pagination metadata", async () => {
    const descriptor = Object.getOwnPropertyDescriptor(db, "cards");
    let options;
    const items = [{ id: "card", name: "100%_\\" }];

    Object.defineProperty(db, "cards", {
        configurable: true,
        value: {
            findAndCount: async (input) => {
                options = input;

                return [items, 123];
            }
        }
    });

    try {
        const result = await new CardService().list({ q: "100%_\\", page: 3, pageSize: 10 });

        assert.deepEqual(result, { items, total: 123, page: 3, pageSize: 10 });
        assert.equal(options.skip, 20);
        assert.equal(options.take, 10);
        assert.equal(options.where.name.value, "%100\\%\\_\\\\%");
    } finally {
        Object.defineProperty(db, "cards", descriptor);
    }
});

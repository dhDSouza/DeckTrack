const { test } = require("node:test");
const assert = require("node:assert/strict");
const { availability } = require("../dist/services/TrackingService");
const { compareDecks, auditDiff, containsId } = require("../dist/services/Audit");
const { movement, versionTag, historySearch } = require("../dist/controllers/schemas");

test("pool and pending quantities account for every declared deck without negative free quantities", () => {
    assert.deepEqual(availability(5, 3), {
        ownedQuantity: 5,
        assignedQuantity: 3,
        poolQuantity: 2,
        missingQuantity: 0
    });
    assert.deepEqual(availability(1, 3), {
        ownedQuantity: 1,
        assignedQuantity: 3,
        poolQuantity: 0,
        missingQuantity: 2
    });
    assert.equal(availability(0, 0).poolQuantity, 0);
});
test("audit distinguishes removals, additions, commander edits and metadata while ignoring no-op saves", () => {
    const before = {
        id: "deck",
        name: "Old name",
        format: "commander",
        coverCardId: null,
        cards: [
            { cardId: "old", name: "Old land", quantity: 1, isCommander: false },
            { cardId: "leader", name: "Leader", quantity: 1, isCommander: false }
        ]
    };
    const after = {
        ...before,
        name: "New name",
        cards: [
            { cardId: "new", name: "New land", quantity: 1, isCommander: false },
            { cardId: "leader", name: "Leader", quantity: 1, isCommander: true }
        ]
    };
    const changes = compareDecks(before, after);

    assert.equal(changes.length, 3);
    assert.equal(changes.find((card) => card.cardId === "old").after, 0);
    assert.equal(changes.find((card) => card.cardId === "new").before, 0);
    assert.equal(changes.find((card) => card.cardId === "leader").commanderAfter, true);

    const a = { decks: [before], collection: [{ cardId: "card", name: "Card", quantity: 2 }] };

    assert.deepEqual(auditDiff(a, structuredClone(a)), { decks: [], collection: [] });

    const diff = auditDiff(a, { decks: [after], collection: [] });

    assert.equal(diff.decks[0].metadata[0].field, "name");
    assert.equal(diff.collection[0].after, 0);
});
test("history parameters for card and deck do not overwrite each other", () => {
    const a = containsId("11111111-1111-4111-8111-111111111111"),
        b = containsId("22222222-2222-4222-8222-222222222222");

    assert.notEqual(Object.keys(a.objectLiteralParameters)[0], Object.keys(b.objectLiteralParameters)[0]);
});
test("movement, tag and pagination validation bound and reject malformed inputs", () => {
    const base = {
        cardId: "11111111-1111-4111-8111-111111111111",
        quantity: 1,
        fromDeckId: null,
        toDeckId: null,
        operationId: "22222222-2222-4222-8222-222222222222"
    };

    assert.equal(movement.safeParse(base).success, true);

    for (const input of [
        { ...base, quantity: 0 },
        { ...base, quantity: 1.5 },
        { ...base, operationId: "bad" },
        { ...base, acknowledgeWarnings: "true" },
        { ...base, previewToken: "bad" }
    ]) {
        assert.equal(movement.safeParse(input).success, false);
    }

    for (const tag of ["v1.0", "v1.1", "v2.0-beta"]) {
        assert.equal(versionTag.safeParse({ tag }).success, true);
    }

    for (const tag of ["", "tag with spaces", "x".repeat(41)]) {
        assert.equal(versionTag.safeParse({ tag }).success, false);
    }

    assert.equal(historySearch.safeParse({ pageSize: 101 }).success, false);
});

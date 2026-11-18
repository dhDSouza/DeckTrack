const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const vm = require("node:vm");

function interfaceFor(tracking = []) {
    const context = {
        window: {},
        state: { tracking },
        escapeHtml: (value) =>
            String(value ?? "")
                .replaceAll("<", "&lt;")
                .replaceAll('"', "&quot;"),
        CardImageUI: { register: () => {} }
    };

    vm.runInNewContext(readFileSync("public/arcane-ui.js", "utf8"), context);

    return context.window.ArcaneUI;
}

test("deck overview derives weighted totals, ownership and commanders from actual tracking locations", () => {
    const card = { id: "island", name: "Island", metadata: { colorIdentity: ["U"] } };
    const commander = { id: "cosima", name: "Cosima", metadata: { colorIdentity: ["U"] } };
    const ui = interfaceFor([
        {
            cardId: "island",
            card,
            ownedQuantity: 20,
            locations: [
                { deckId: "a", quantity: 30 },
                { deckId: "b", quantity: 4 }
            ]
        },
        {
            cardId: "cosima",
            card: commander,
            ownedQuantity: 1,
            locations: [{ deckId: "a", quantity: 1, isCommander: true }]
        }
    ]);
    const info = ui.summary({ id: "a" });

    assert.equal(info.total, 31);
    assert.equal(info.owned, 21);
    assert.equal(info.missing, 10);
    assert.equal(info.progress, 68);
    assert.equal(info.cover.id, "cosima");
    assert.deepEqual(Array.from(info.colors), ["U"]);
    assert.equal(info.cards.length, 2);
});

test("empty decks have no invented completion or activity date", () => {
    const info = interfaceFor().summary({ id: "empty" });

    assert.equal(info.total, 0);
    assert.equal(info.owned, 0);
    assert.equal(info.progress, 0);
    assert.equal(info.cover, undefined);
    assert.equal(info.activity, undefined);
});

test("mana identities reject unknown values before rendering HTML classes", () => {
    const markup = interfaceFor().mana(["U", "U", '\" onclick=alert(1)', "<script>"]);

    assert.equal((markup.match(/mana-orb/g) || []).length, 1);
    assert.ok(markup.includes("mana-U"));
    assert.ok(!markup.includes("onclick"));
    assert.ok(!markup.includes("<script>"));
});

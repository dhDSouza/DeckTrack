const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const vm = require("node:vm");
const { deckUpdate } = require("../dist/controllers/schemas");
const { compareMetadata } = require("../dist/services/Audit");

function statsModule() {
    const context = { window: {}, localStorage: { getItem: () => null } };
    vm.runInNewContext(readFileSync("public/deck-page.js", "utf8"), context);
    vm.runInNewContext(readFileSync("public/deck-stats.js", "utf8"), context);
    return context.window.DeckStats;
}

function entry(name, quantity, metadata = {}, isCommander = false) {
    return { cardId: name, quantity, isCommander, card: { name, metadata } };
}

test("statistics count physical quantities, distinguish unknown data and weight mana values", () => {
    const stats = statsModule();
    const deck = {
        format: "commander",
        cards: [
            entry("Island", 3, { types: ["Land"], colors: [], colorIdentity: ["U"], manaValue: 0 }),
            entry("Red spell", 2, { types: ["Instant"], colors: ["R"], colorIdentity: ["R"], manaValue: 1 }),
            entry("Multicolor", 2, {
                types: ["Creature"],
                colors: ["W", "U"],
                colorIdentity: ["W", "U"],
                manaValue: 2
            }),
            entry("Commander", 1, { types: ["Creature"], colors: ["U"], colorIdentity: ["U"], manaValue: 3 }, true),
            entry("Manual card", 1),
            entry("Colorless spell", 1, { types: ["Artifact"], colors: [], colorIdentity: [], manaValue: 1 })
        ]
    };
    const result = stats.compute(deck);

    assert.equal(result.total, 10);
    assert.equal(result.unique, 6);
    assert.equal(result.lands, 3);
    assert.equal(result.commanderCopies, 1);
    assert.equal(
        result.categories.reduce((sum, category) => sum + category.copies, 0),
        10
    );
    assert.equal(result.manaCopies, 6);
    assert.equal(result.averageMana, 10 / 6);
    assert.equal(result.unknownTypes, 1);
    assert.equal(result.curve.find((bucket) => bucket.label === "1").copies, 3);
    assert.equal(result.colorCopies, 7);
    assert.equal(result.colors.find((color) => color.key === "M").copies, 2);
    assert.equal(result.colors.find((color) => color.key === "C").copies, 1);
    assert.equal(result.colors.find((color) => color.key === "?").copies, 1);
    assert.equal(
        result.colors.reduce((sum, color) => sum + color.copies, 0),
        result.colorCopies
    );

    const withoutCommanders = stats.compute(deck, { excludeCommanders: true });
    assert.equal(withoutCommanders.manaCopies, 5);
    assert.equal(
        withoutCommanders.categories.reduce((sum, category) => sum + category.copies, 0),
        10
    );

    const identity = stats.compute(deck, { includeLandsInColors: true, colorField: "colorIdentity" });
    assert.equal(identity.colorCopies, 10);
    assert.equal(identity.colors.find((color) => color.key === "U").copies, 4);
});

test("mana curve preserves zero/fractional values, groups seven-plus and excludes unknown mana", () => {
    const stats = statsModule();
    const deck = {
        format: "free",
        cards: [
            entry("Zero X", 2, { types: ["Artifact"], manaValue: 0, manaCost: "{X}" }),
            entry("Fraction", 1, { types: ["Creature"], manaValue: 0.5 }),
            entry("Big", 3, { types: ["Creature"], manaValue: 8 }),
            entry("Missing cost", 1, { types: ["Creature"], manaValue: null })
        ]
    };
    const result = stats.compute(deck);

    assert.equal(result.curve.find((bucket) => bucket.label === "0").copies, 2);
    assert.equal(result.curve.find((bucket) => bucket.label === "0,5").copies, 1);
    assert.equal(result.curve.find((bucket) => bucket.label === "7+").copies, 3);
    assert.equal(result.variableMana, 2);
    assert.equal(result.unknownMana, 1);
    assert.equal(result.averageMana, 24.5 / 6);
});

test("front face defines land exclusion while all-face rules can contribute transparent signals", () => {
    const stats = statsModule();
    const item = entry("Artifact // Land", 2, {
        types: ["Artifact", "Land"],
        faces: [
            { type: "Artifact", manaCost: "{2}" },
            { type: "Land", manaCost: "" }
        ],
        manaValue: 2,
        text: "{T}: Add {U}.\nDraw a card. Search your library for a land card."
    });
    const result = stats.compute({ format: "free", cards: [item] });

    assert.equal(stats.cardType(item), "spell");
    assert.equal(result.lands, 0);
    assert.equal(result.manaCopies, 2);
    for (const key of ["mana", "draw", "search"]) {
        assert.equal(result.signals.find((signal) => signal.key === key).copies, 2);
        assert.ok(result.signals.find((signal) => signal.key === key).cards[0].evidence);
    }
});

test("complete sample deck counts all 100 copies without double-counting categories", () => {
    const catalog = require("../data/catalog.json").cards;
    const text = readFileSync("tests/fixtures/deck-list.txt", "utf8");
    const { resolveDeckList } = require("../dist/services/DeckList");
    const indexed = catalog.map((card) => ({ ...card, id: card.externalId }));
    const parsed = resolveDeckList(text, indexed);
    const byId = new Map(indexed.map((card) => [card.id, card]));
    const cards = parsed.cards.map((item) => ({ ...item, card: byId.get(item.cardId) }));
    const result = statsModule().compute({ format: "commander", cards });

    assert.equal(parsed.canImport, true);
    assert.equal(result.total, 100);
    assert.equal(result.unique, 71);
    assert.equal(result.lands, 45);
    assert.equal(result.manaCopies, 55);
    assert.equal(
        result.categories.reduce((sum, category) => sum + category.copies, 0),
        100
    );
    assert.ok(result.averageMana > 0);
});

test("empty dashboards have no invalid numbers and heuristic card names are escaped", () => {
    const stats = statsModule();
    const empty = stats.compute({ format: "free", cards: [] });

    assert.equal(empty.averageMana, null);
    assert.equal(empty.total, 0);
    assert.ok(!/NaN|Infinity/.test(stats.render({ format: "free", cards: [] })));

    const html = stats.render({
        format: "free",
        cards: [entry('<script>alert("x")</script>', 1, { types: ["Instant"], text: "Draw a card.", manaValue: 1 })]
    });
    assert.ok(!html.includes("<script>"));
    assert.ok(html.includes("&lt;script&gt;"));
    assert.ok(html.includes('role="img"'));
});

test("declared power level accepts only nullable integers 1–10 and is included in snapshot metadata differences", () => {
    for (const powerLevel of [null, 1, 5, 10]) {
        assert.equal(deckUpdate.safeParse({ powerLevel }).success, true);
    }
    for (const powerLevel of [0, 11, 1.5, "7"]) {
        assert.equal(deckUpdate.safeParse({ powerLevel }).success, false);
    }
    const before = { id: "deck", name: "Deck", format: "commander", coverCardId: null, cards: [] };
    const changes = compareMetadata(before, { ...before, powerLevel: 6 });

    assert.equal(changes.length, 1);
    assert.equal(changes[0].field, "powerLevel");
    assert.equal(changes[0].before, null);
    assert.equal(changes[0].after, 6);
});

test("dashboard saves and clears declared power through the existing audited deck endpoint", async () => {
    const stats = statsModule();
    const form = { elements: { powerLevel: { value: "7" } } };
    const status = { textContent: "" };
    const dashboard = {
        innerHTML: "",
        querySelector: (selector) => (selector === ".stats-power-form" ? form : status)
    };
    const controls = {
        "[data-stats-commanders]": { checked: false },
        "[data-stats-lands]": { checked: false },
        "[data-stats-color-field]": { value: "colors" }
    };
    const root = {
        innerHTML: "",
        querySelector: (selector) => (selector === ".stats-dashboard" ? dashboard : controls[selector]),
        querySelectorAll: () => Object.values(controls)
    };
    const calls = [];
    const deck = { id: "deck", format: "commander", cards: [], powerLevel: null };
    const button = { disabled: false };

    stats.mount(root, deck, {
        request: async (path, options) => {
            calls.push({ path, options });
            return { id: "deck", powerLevel: options.body.powerLevel };
        }
    });

    await form.onsubmit({ preventDefault() {}, target: form, submitter: button });
    assert.equal(calls[0].path, "/decks/deck");
    assert.equal(calls[0].options.method, "PATCH");
    assert.equal(calls[0].options.body.powerLevel, 7);
    assert.equal(deck.powerLevel, 7);
    assert.equal(button.disabled, false);
    assert.ok(status.textContent.includes("registrada no histórico"));

    form.elements.powerLevel.value = "";
    await form.onsubmit({ preventDefault() {}, target: form, submitter: button });
    assert.equal(calls[1].options.body.powerLevel, null);
    assert.equal(deck.powerLevel, null);
});

function completeDeck(text = "", manaValue = 5) {
    return {
        id: "deck",
        format: "commander",
        cards: [
            entry("Lands", 40, { types: ["Land"], manaValue: 0 }),
            entry("Spells", 60, { types: ["Creature"], text, manaValue })
        ]
    };
}

test("power suggestion is deterministic, explained and increases with its documented indicators", () => {
    const stats = statsModule();
    const basic = stats.suggestPower(completeDeck());
    const stronger = stats.suggestPower(
        completeDeck("Add {U}. Draw a card. Search your library. Counter target spell. Take an extra turn.", 1)
    );

    assert.equal(basic.value, stats.suggestPower(completeDeck()).value);
    assert.ok(stronger.value > basic.value);
    assert.equal(stronger.value, 8);
    assert.equal(stronger.coverage, 1);
    assert.ok(stronger.factors.every((factor) => factor.label && typeof factor.delta === "number" && factor.detail));
    assert.equal(
        stronger.raw,
        stronger.factors.reduce((sum, factor) => sum + factor.delta, 0)
    );
    assert.ok(basic.value >= 2 && basic.value <= 8);
});

test("suggestion is unavailable for empty, incomplete, unsupported or poorly documented decks", () => {
    const stats = statsModule();
    assert.equal(stats.suggestPower({ format: "commander", cards: [] }).value, null);
    assert.equal(stats.suggestPower({ ...completeDeck(), format: "standard" }).value, null);
    assert.equal(stats.suggestPower({ format: "commander", cards: [entry("Missing data", 100)] }).value, null);
    const incomplete = completeDeck();
    incomplete.cards[0].quantity = 39;
    assert.equal(stats.suggestPower(incomplete).value, null);
});

test("rendering a suggestion preserves a saved manual rating and does not change deck data", () => {
    const stats = statsModule();
    const deck = { ...completeDeck(), powerLevel: 9 };
    const before = JSON.stringify(deck);
    const html = stats.render(deck);

    assert.equal(JSON.stringify(deck), before);
    assert.ok(/value="9" selected/.test(html));
    assert.ok(html.includes("SUGESTÃO EXPERIMENTAL"));
    assert.ok(html.includes("A sugestão não substitui sua avaliação"));
    assert.ok(html.includes("Como a nota foi sugerida"));
    const automatic = stats.render(completeDeck());
    assert.ok(automatic.includes(`value="${stats.suggestPower(completeDeck()).value}" selected`));
});

test("applying a suggestion only edits the field; saving uses the audited endpoint", async () => {
    const stats = statsModule();
    const form = { elements: { powerLevel: { value: "9" } } };
    const status = { textContent: "" };
    const use = {};
    const dashboard = {
        innerHTML: "",
        querySelector: (selector) =>
            ({
                ".stats-power-form": form,
                ".stats-power-status": status,
                ".stats-use-suggestion": use
            })[selector]
    };
    const controls = {
        "[data-stats-commanders]": { checked: false },
        "[data-stats-lands]": { checked: false },
        "[data-stats-color-field]": { value: "colors" }
    };
    const root = {
        innerHTML: "",
        querySelector: (selector) => (selector === ".stats-dashboard" ? dashboard : controls[selector]),
        querySelectorAll: () => Object.values(controls)
    };
    const calls = [];
    const deck = { ...completeDeck(), powerLevel: 9 };
    stats.mount(root, deck, {
        request: async (path, options) => {
            calls.push({ path, options });
            return { id: deck.id, powerLevel: options.body.powerLevel };
        }
    });

    form.elements.powerLevel.value = "6";
    controls["[data-stats-lands]"].checked = true;
    controls["[data-stats-lands]"].onchange();
    assert.ok(dashboard.innerHTML.includes('value="6" selected'));
    use.onclick();
    assert.equal(calls.length, 0);
    assert.equal(deck.powerLevel, 9);
    assert.equal(form.elements.powerLevel.value, String(stats.suggestPower(deck).value));
    await form.onsubmit({ preventDefault() {}, target: form, submitter: { disabled: false } });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].options.body.powerLevel, stats.suggestPower(deck).value);
});

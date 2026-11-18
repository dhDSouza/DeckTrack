const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const vm = require("node:vm");
const { cardSearch } = require("../dist/controllers/schemas");
const { buildCardWhere } = require("../dist/services/CardFilters");
const { buildCards } = require("../scripts/catalog-data.cjs");
const snapshot = require("../data/catalog.json");

test("snapshot retains types, rules, colors, identity, printings and both faces without changing identifiers", () => {
    const island = snapshot.cards.find((card) => card.name === "Island");

    assert.deepEqual(island.metadata.colors, []);
    assert.deepEqual(island.metadata.colorIdentity, ["U"]);
    assert.ok(island.metadata.printings.includes("KHM"));

    const cosima = snapshot.cards.find((card) => card.name.startsWith("Cosima, God of the Voyage"));

    assert.equal(cosima.externalId, "oracle:648100cd-d44a-48f8-87e4-a1d5467f348c");
    assert.equal(cosima.metadata.faces.length, 2);
    assert.ok(cosima.metadata.types.includes("Artifact"));
    assert.ok(cosima.metadata.text.includes("Crew 1"));
    assert.ok(snapshot.sets.some((set) => set.code === "KHM" && set.name === "Kaldheim"));
});
test("converter merges faces in order and keeps front-face mana value", () => {
    const common = {
        name: "Front // Back",
        identifiers: { scryfallOracleId: "test" },
        printings: ["AAA"],
        colorIdentity: ["U"],
        legalities: { commander: "Legal" }
    };
    const result = buildCards({
        example: [
            {
                ...common,
                faceName: "Back",
                side: "b",
                type: "Artifact",
                types: ["Artifact"],
                text: "Back text",
                manaValue: 2,
                colors: []
            },
            {
                ...common,
                faceName: "Front",
                side: "a",
                type: "Creature",
                types: ["Creature"],
                text: "Front text",
                manaValue: 3,
                colors: ["U"]
            }
        ]
    });

    assert.equal(result.length, 1);
    assert.equal(result[0].metadata.faces[0].name, "Front");
    assert.equal(result[0].metadata.manaValue, 3);
    assert.equal(result[0].metadata.type, "Creature // Artifact");
    assert.deepEqual(result[0].metadata.printings, ["AAA"]);
});
test("filter query validation rejects contradictory ranges, invalid colors, scopes and injected field names", () => {
    for (const input of [
        { manaMin: 5, manaMax: 2 },
        { colors: "C,U" },
        { colors: "BLUE" },
        { colorField: "text" },
        { deckId: "bad" },
        { scope: "all-users" },
        { manaMin: -1 },
        { type: ["Creature"] },
        { legalFormat: "fake" }
    ]) {
        assert.equal(cardSearch.safeParse(input).success, false, JSON.stringify(input));
    }

    assert.equal(cardSearch.parse({ set: "khm" }).set, "KHM");
    assert.equal(cardSearch.parse({ manaMin: "0", manaMax: "3.5" }).manaMin, 0);
});
test("filter SQL uses bound values, literal wildcards, explicit color modes and private scopes", () => {
    const input = cardSearch.parse({
        type: "Creature%_",
        text: "draw' OR 1=1 --",
        colors: "U,W",
        colorMode: "exact",
        colorField: "colorIdentity",
        set: "khm",
        manaMax: 4,
        scope: "collection"
    });
    const where = buildCardWhere(input, "owner");
    const sql = where.metadata.getSql("meta");

    assert.ok(sql.includes("'colorIdentity'"));
    assert.ok(sql.includes("?&"));
    assert.ok(sql.includes("jsonb_array_length"));
    assert.ok(!sql.includes(input.text));
    assert.equal(where.metadata.objectLiteralParameters.cardText, "%draw' OR 1=1 --%");
    assert.equal(where.metadata.objectLiteralParameters.cardType, "%Creature\\%\\_%");
    assert.equal(where.metadata.objectLiteralParameters.colorCount, 2);
    assert.equal(where.id.objectLiteralParameters.filterUser, "owner");
    assert.ok(where.id.getSql("id").includes('uc."userId" = :filterUser'));
    assert.ok(buildCardWhere({ colors: "C" }).metadata.getSql("meta").includes("\"meta\" ? 'colors'"));
});
test("card details escape catalog text and show both rules and metadata", () => {
    const context = { window: {} };

    vm.runInNewContext(readFileSync("public/card-filters.js", "utf8"), context);

    const html = context.window.CardFilterUI.details({
        metadata: {
            type: "Creature",
            colors: ["U"],
            colorIdentity: ["U"],
            text: "<script>alert(1)</script>",
            keywords: ["Flying"],
            printings: ["KHM"]
        }
    });

    assert.ok(!html.includes("<script>"));
    assert.ok(html.includes("&lt;script&gt;"));
    assert.ok(html.includes("Flying"));
    assert.ok(html.includes("KHM"));
});

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { mkdtemp, rm, writeFile } = require("node:fs/promises");
const { readFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const vm = require("node:vm");
const { CardImages, safeImageUrl, imageUrl } = require("../dist/services/CardImages");
const { imagery } = require("../scripts/image-data.cjs");
const { DeckService } = require("../dist/services/DeckService");
const { repositories: db } = require("../dist/repositories");
const { AppDataSource } = require("../dist/config/dataSource");
const { Deck } = require("../dist/entities/Deck");
const { DeckCard } = require("../dist/entities/DeckCard");
const { User } = require("../dist/entities/User");
const { UserCard } = require("../dist/entities/UserCard");
const { Activity } = require("../dist/entities/Activity");
const card = { id: "card", name: "Sol Ring", externalId: "oracle:6ad8011d-3471-4369-9d68-b264cc027487" };
const uri = "https://cards.scryfall.io/display/front/a/b/card.webp";
const data = {
    name: "Sol Ring",
    oracle_id: card.externalId.slice(7),
    scryfall_uri: "https://scryfall.com/card/test",
    artist: "Artist",
    image_uris: { normal: uri }
};

async function directory(t) {
    const root = await mkdtemp(join(tmpdir(), "decktrack-image-index-"));

    t.after(() => rm(root, { recursive: true, force: true }));

    return join(root, "index.json");
}

test("image URLs are restricted to the exact HTTPS CDN and modern formats are selected from API fields", () => {
    for (const url of [
        "http://cards.scryfall.io/x",
        "https://cards.scryfall.io.evil.test/x",
        "https://evil.test/x",
        "https://user@cards.scryfall.io/x",
        "https://cards.scryfall.io:444/x"
    ]) {
        assert.equal(safeImageUrl(url), false, url);
    }

    assert.equal(safeImageUrl(uri), true);
    assert.equal(imageUrl({ images: { jpeg: uri } }, "normal"), uri);
    assert.equal(
        imagery({ ...data, image_uris: { display: uri, normal: "https://evil.test/x" } }).faces[0].images.normal,
        uri
    );
});
test("all bundled cards have local URL metadata and require zero live lookups, including after service restart", async () => {
    const source = require("../data/card-images.json");

    assert.ok(Object.keys(source.cards).length >= 35000);

    const create = () =>
        new CardImages(resolve("data/card-images.json"), async () => {
            throw new Error("Network should not be used");
        });

    for (const images of [create(), create()]) {
        const info = await images.info(card);

        assert.ok(info.faces.length);

        const url = await images.image(card, "small", 0);

        assert.ok(safeImageUrl(url));

        const decorated = await images.decorate(card);

        assert.ok(decorated.imagery.faces[0].images.normal);
        await assert.rejects(
            () => images.image(card, "normal", 1),
            (error) => error.status === 404
        );
    }
});
test("front and back image URLs are preserved without reading or downloading binary files", async (t) => {
    const file = await directory(t),
        info = {
            name: card.name,
            url: "https://scryfall.com/card/test",
            faces: [
                { name: "Front", artist: "A", images: { normal: uri } },
                { name: "Back", artist: "B", images: { normal: uri.replace("/front/", "/back/") } }
            ]
        };

    await writeFile(file, JSON.stringify({ cards: { [card.externalId.slice(7)]: info } }));

    const images = new CardImages(file, async () => {
        throw new Error("No network");
    });

    assert.equal(await images.image(card, "normal", 1), info.faces[1].images.normal);
});
test("custom-card fallbacks coalesce requests, retain metadata only in memory and honor rate limits", async (t) => {
    let clock = 1000,
        calls = [];
    const images = new CardImages(
        await directory(t),
        async () => {
            calls.push(clock);

            return Response.json(data);
        },
        () => clock,
        async (ms) => {
            clock += ms;
        }
    );
    const custom = { name: "Custom Card", externalId: null };

    await Promise.all(Array.from({ length: 12 }, () => images.info(custom)));
    assert.equal(calls.length, 1);
    await images.info({ ...custom, name: "Another Card" });
    assert.ok(calls[1] - calls[0] >= 150);
    clock += 86400001;
    await images.info(custom);
    assert.equal(calls.length, 3);
});
test("fallback respects 429 without immediate retries and retains missing-card results briefly", async (t) => {
    let calls = 0;
    const images = new CardImages(await directory(t), async () => {
        calls++;

        return new Response(null, { status: 429, headers: { "Retry-After": "30" } });
    });

    await assert.rejects(
        () => images.info(card),
        (error) => error.status === 503
    );
    assert.equal((await images.info(card)).missing, true);
    assert.equal(calls, 1);
});
test("browser thumbnails and banners use direct CDN URLs instead of the application image route", () => {
    const context = {
        window: {},
        URL,
        URLSearchParams,
        document: {
            addEventListener() {},
            createElement() {
                return {
                    querySelector() {
                        return {};
                    },
                    addEventListener() {}
                };
            },
            body: { append() {} },
            querySelector() {
                return null;
            }
        }
    };

    vm.runInNewContext(readFileSync("public/card-images.js", "utf8"), context);

    const complete = { ...card, imagery: imagery(data) };
    const html = context.window.CardImageUI.thumbnail(complete);

    assert.ok(html.includes(uri));
    assert.ok(!html.includes("/media/cards/"));
    assert.ok(html.includes('loading="lazy"'));
    assert.ok(context.window.CardImageUI.art(complete).includes(uri));
});
test("deck cover must belong to this deck and can be cleared", async () => {
    const service = new DeckService(),
        original = AppDataSource.transaction;
    let valid = false,
        saved = { id: "deck", userId: "owner", name: "Deck", format: "commander", coverCardId: null };

    AppDataSource.transaction = async (work) =>
        work({
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
                        findOne: async () => ({ ...saved }),
                        findOneBy: async () => ({ ...saved }),
                        save: async (value) => {
                            saved = value;

                            return value;
                        }
                    };
                }
                if (entity === DeckCard) {
                    return { find: async () => [], findOneBy: async () => (valid ? {} : null) };
                }

                throw new Error("Unexpected repository");
            }
        });

    try {
        await assert.rejects(
            () => service.update("owner", "deck", { coverCardId: "card" }),
            (error) => error.status === 400
        );
        valid = true;

        await service.update("owner", "deck", { coverCardId: "card" });

        assert.equal(saved.coverCardId, "card");

        await service.update("owner", "deck", { coverCardId: null });

        assert.equal(saved.coverCardId, null);
    } finally {
        AppDataSource.transaction = original;
    }
});

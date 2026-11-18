const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const vm = require("node:vm");
const { DeckService } = require("../dist/services/DeckService");
const { AppDataSource } = require("../dist/config/dataSource");
const { Deck } = require("../dist/entities/Deck");
const { DeckCard } = require("../dist/entities/DeckCard");
const { User } = require("../dist/entities/User");
const { UserCard } = require("../dist/entities/UserCard");
const { Activity } = require("../dist/entities/Activity");

test("grouping counts each copy once and gives commanders their own category", () => {
    const context = { window: {}, localStorage: { getItem: () => null } };

    vm.runInNewContext(readFileSync("public/deck-page.js", "utf8"), context);

    const cards = [
        { quantity: 1, isCommander: true, card: { metadata: { types: ["Creature"] } } },
        { quantity: 30, card: { metadata: { types: ["Land"] } } },
        { quantity: 2, card: { metadata: { types: ["Artifact", "Creature"] } } },
        { quantity: 1, isCommander: true, card: { metadata: { types: ["Enchantment"] } } },
        { quantity: 1, card: { metadata: {} } }
    ];
    const groups = context.window.DeckPage.group(cards, "commander");

    assert.equal(groups[0].key, "commanders");
    assert.equal(groups[0].cards.length, 2);
    assert.equal(groups.flatMap((group) => group.cards).length, cards.length);
    assert.equal(
        groups.flatMap((group) => group.cards).reduce((sum, item) => sum + item.quantity, 0),
        35
    );
    assert.equal(context.window.DeckPage.category(cards[2], "commander"), "Creature");
    assert.equal(context.window.DeckPage.category(cards[0], "standard"), "Creature");
    assert.equal(context.window.DeckPage.category(cards[4], "commander"), "other");
});
test("commander marking supports multiple cards, checks format/owner/membership and does not change quantities", async () => {
    const original = AppDataSource.transaction;
    const entries = new Map([
        ["partner", { quantity: 1, isCommander: false }],
        ["background", { quantity: 1, isCommander: false }]
    ]);
    let format = "commander",
        owned = true;

    AppDataSource.transaction = async (callback) =>
        callback({
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

                            return owned ? { id: "deck", name: "Deck", format } : null;
                        }
                    };
                }
                if (entity === DeckCard) {
                    return {
                        find: async () =>
                            [...entries].map(([cardId, value]) => ({ cardId, ...value, card: { name: cardId } })),
                        findOneBy: async ({ cardId }) => entries.get(cardId),
                        update: async ({ cardId }, input) => Object.assign(entries.get(cardId), input)
                    };
                }

                throw new Error("Unexpected repository");
            }
        });

    try {
        const service = new DeckService();

        for (const id of ["partner", "background"]) {
            await service.setCommander("owner", "deck", id, true);
        }

        assert.ok([...entries.values()].every((entry) => entry.isCommander && entry.quantity === 1));
        await service.setCommander("owner", "deck", "partner", false);
        assert.equal(entries.get("partner").isCommander, false);
        assert.equal(entries.get("background").isCommander, true);
        await assert.rejects(
            () => service.setCommander("owner", "deck", "missing", true),
            (error) => error.status === 404
        );
        format = "standard";
        await assert.rejects(
            () => service.setCommander("owner", "deck", "partner", true),
            (error) => error.status === 400
        );
        owned = false;
        await assert.rejects(
            () => service.setCommander("owner", "deck", "partner", true),
            (error) => error.status === 404
        );
    } finally {
        AppDataSource.transaction = original;
    }
});

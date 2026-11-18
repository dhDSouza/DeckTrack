const { test } = require("node:test");
const assert = require("node:assert/strict");
const { registerDeckOwned, lockCollection } = require("../dist/services/DeckCollection");
const { DeckOwnedCard } = require("../dist/entities/DeckOwnedCard");
const { UserCard } = require("../dist/entities/UserCard");
const { User } = require("../dist/entities/User");

function store(initial = 0) {
    const credits = new Map(),
        owned = new Map(initial ? [["card", initial]] : []);
    let writes = 0;
    const manager = {
        getRepository: (entity) => {
            if (entity === User) {
                return {
                    findOne: async (options) => {
                        assert.equal(options.lock.mode, "pessimistic_write");

                        return { id: "owner" };
                    }
                };
            }
            if (entity === DeckOwnedCard) {
                return {
                    findBy: async ({ deckId }) =>
                        [...credits]
                            .filter(([key]) => key.startsWith(deckId + ":"))
                            .map(([key, quantity]) => ({ cardId: key.slice(deckId.length + 1), quantity })),
                    upsert: async (values) => {
                        writes++;

                        for (const value of values) {
                            credits.set(value.deckId + ":" + value.cardId, value.quantity);
                        }
                    }
                };
            }
            if (entity === UserCard) {
                return {
                    findBy: async () => [...owned].map(([cardId, quantity]) => ({ cardId, quantity })),
                    upsert: async (values) => {
                        writes++;

                        for (const value of values) {
                            owned.set(value.cardId, value.quantity);
                        }
                    }
                };
            }

            throw new Error("Unexpected repository");
        }
    };

    return { manager, owned, credits, writes: () => writes };
}

test("ownership adds to existing collection, repeated registration is idempotent and another deck adds its own copies", async () => {
    const db = store(5),
        add = (deck, quantity) => registerDeckOwned(db.manager, "owner", deck, [{ cardId: "card", quantity }]);

    assert.equal(await add("deck-a", 30), 30);
    assert.equal(db.owned.get("card"), 35);
    assert.equal(await add("deck-a", 30), 0);
    assert.equal(db.owned.get("card"), 35);
    assert.equal(await add("deck-b", 2), 2);
    assert.equal(db.owned.get("card"), 37);
    assert.equal(await add("deck-a", 32), 2);
    assert.equal(db.owned.get("card"), 39);
});
test("reductions, removal and readdition do not remove physical stock or count the same copies twice", async () => {
    const db = store(),
        add = (quantity) => registerDeckOwned(db.manager, "owner", "deck", [{ cardId: "card", quantity }]);

    await add(4);

    for (const quantity of [2, 0, 4]) {
        assert.equal(await add(quantity), 0);
    }

    assert.equal(db.owned.get("card"), 4);
    assert.equal(db.credits.get("deck:card"), 4);
});
test("manual collection corrections remain authoritative on repeated registration", async () => {
    const db = store();

    await registerDeckOwned(db.manager, "owner", "deck", [{ cardId: "card", quantity: 3 }]);
    db.owned.set("card", 1);
    assert.equal(await registerDeckOwned(db.manager, "owner", "deck", [{ cardId: "card", quantity: 3 }]), 0);
    assert.equal(db.owned.get("card"), 1);
});
test("overflow is checked for the whole batch before writing any collection changes", async () => {
    const db = store(2147483647);

    await assert.rejects(
        () =>
            registerDeckOwned(db.manager, "owner", "deck", [
                { cardId: "other", quantity: 1 },
                { cardId: "card", quantity: 1 }
            ]),
        (error) => error.status === 400
    );
    assert.equal(db.writes(), 0);
    assert.equal(db.owned.has("other"), false);
});
test("collection writes lock the user and reject missing users", async () => {
    await lockCollection(store().manager, "owner");
    await assert.rejects(
        () => lockCollection({ getRepository: () => ({ findOne: async () => null }) }, "missing"),
        (error) => error.status === 401
    );
});

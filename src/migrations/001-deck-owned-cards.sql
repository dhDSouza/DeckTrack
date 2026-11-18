-- Apply once to an existing production database before deploying this version.
-- Development uses TypeORM synchronize and creates this table automatically.
CREATE TABLE IF NOT EXISTS deck_owned_cards (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "deckId" uuid NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
    "cardId" uuid NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
    quantity integer NOT NULL CHECK (quantity > 0),
    UNIQUE ("deckId", "cardId")
);

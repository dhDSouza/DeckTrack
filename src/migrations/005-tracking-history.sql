CREATE TABLE IF NOT EXISTS activities (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "userId" uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    "operationId" uuid,
    action varchar(60) NOT NULL,
    "deckIds" jsonb NOT NULL DEFAULT '[]',
    "cardIds" jsonb NOT NULL DEFAULT '[]',
    payload jsonb NOT NULL,
    "createdAt" timestamptz NOT NULL DEFAULT now(),
    UNIQUE ("userId", "operationId")
);

CREATE INDEX IF NOT EXISTS activities_user_date ON activities ("userId", "createdAt");
CREATE INDEX IF NOT EXISTS activities_decks ON activities USING gin ("deckIds");
CREATE INDEX IF NOT EXISTS activities_cards ON activities USING gin ("cardIds");

CREATE TABLE IF NOT EXISTS deck_versions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "userId" uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    "deckId" uuid NOT NULL,
    tag varchar(40) NOT NULL,
    note varchar(500) NOT NULL,
    "changeCount" integer NOT NULL,
    snapshot jsonb NOT NULL,
    "createdAt" timestamptz NOT NULL DEFAULT now(),
    UNIQUE ("userId", "deckId", tag)
);

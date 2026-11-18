-- Apply before deploying in production. Development uses synchronize.
ALTER TABLE decks ADD COLUMN IF NOT EXISTS "coverCardId" uuid REFERENCES cards(id) ON DELETE SET NULL;

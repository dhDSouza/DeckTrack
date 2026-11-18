-- Apply before deploying in production. Development uses synchronize.
ALTER TABLE decks
    ADD COLUMN IF NOT EXISTS "powerLevel" smallint;

ALTER TABLE decks
    ADD CONSTRAINT decks_power_level_range
    CHECK ("powerLevel" IS NULL OR "powerLevel" BETWEEN 1 AND 10);

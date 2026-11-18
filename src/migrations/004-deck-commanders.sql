-- Production: apply before deploying. Development uses synchronize.
ALTER TABLE deck_cards ADD COLUMN IF NOT EXISTS "isCommander" boolean NOT NULL DEFAULT false;

-- Apply before deploying to production; development uses TypeORM synchronize.
ALTER TABLE cards ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

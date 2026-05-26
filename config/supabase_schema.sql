-- Supabase SQL schema for vacancy pipeline.
-- Run in Supabase Dashboard -> SQL Editor.

CREATE TABLE IF NOT EXISTS vacancies (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  company TEXT NOT NULL,
  rating TEXT,
  location TEXT,
  easy_apply BOOLEAN DEFAULT false,
  posted TEXT,
  posted_days INTEGER,
  link TEXT NOT NULL,
  source TEXT NOT NULL,
  score INTEGER,
  tags TEXT[] DEFAULT '{}',
  reasons TEXT[] DEFAULT '{}',
  reasoning TEXT,
  relevant BOOLEAN DEFAULT false,
  status TEXT DEFAULT 'new',
  scraped_at TIMESTAMPTZ DEFAULT now(),
  scored_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'vacancies_status_check'
  ) THEN
    ALTER TABLE vacancies
      ADD CONSTRAINT vacancies_status_check
      CHECK (status IN ('new', 'sent', 'applied', 'rejected', 'archived'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_vacancies_status ON vacancies(status);
CREATE INDEX IF NOT EXISTS idx_vacancies_source ON vacancies(source);
CREATE INDEX IF NOT EXISTS idx_vacancies_score ON vacancies(score DESC);
CREATE INDEX IF NOT EXISTS idx_vacancies_relevant ON vacancies(relevant);
CREATE INDEX IF NOT EXISTS idx_vacancies_posted_days ON vacancies(posted_days);

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_vacancies_updated_at ON vacancies;
CREATE TRIGGER update_vacancies_updated_at
  BEFORE UPDATE ON vacancies
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

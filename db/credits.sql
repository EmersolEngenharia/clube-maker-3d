-- Crédito da família: o que foi pago além do custo (PIX mínimo, custo final menor, cancelamento) e o que foi abatido depois.
CREATE TABLE IF NOT EXISTS family_credits(id TEXT PRIMARY KEY,family_id INTEGER NOT NULL REFERENCES families(id),project_id INTEGER REFERENCES projects(id),kind TEXT NOT NULL CHECK(kind IN ('excess','use','adjust')),cents INTEGER NOT NULL CHECK(cents<>0),reason TEXT NOT NULL,created TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS maker_credits_family ON family_credits(family_id,created);
CREATE INDEX IF NOT EXISTS maker_credits_project ON family_credits(project_id,kind);

-- Regulamento do clube: versões publicadas (published_at preenchido) ou rascunho, e o aceite de cada responsável.
CREATE TABLE IF NOT EXISTS terms_versions(version INTEGER PRIMARY KEY,title TEXT NOT NULL,body TEXT NOT NULL,published_at TEXT,published_by INTEGER REFERENCES users(id),created TEXT NOT NULL,updated TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS terms_acceptances(version INTEGER NOT NULL REFERENCES terms_versions(version),user_id INTEGER NOT NULL REFERENCES users(id),family_id INTEGER REFERENCES families(id),name TEXT NOT NULL,accepted_at TEXT NOT NULL,PRIMARY KEY(version,user_id));
CREATE INDEX IF NOT EXISTS maker_terms_family ON terms_acceptances(family_id,version);

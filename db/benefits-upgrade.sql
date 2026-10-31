SET search_path = maker3d, pg_catalog;

CREATE TABLE IF NOT EXISTS benefits(code TEXT PRIMARY KEY,family_id INTEGER NOT NULL REFERENCES families(id),kind TEXT NOT NULL CHECK(kind IN ('hours','discount')),value INTEGER NOT NULL CHECK(value>0),period TEXT NOT NULL,reason TEXT NOT NULL,used INTEGER NOT NULL DEFAULT 0,created_by INTEGER NOT NULL REFERENCES users(id),created TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS maker_benefits_family_period ON benefits(family_id,period);
CREATE TABLE IF NOT EXISTS guardian_contacts(user_id INTEGER PRIMARY KEY REFERENCES users(id),whatsapp TEXT NOT NULL);
ALTER TABLE benefits ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS maker3d_backend ON benefits;
CREATE POLICY maker3d_backend ON benefits TO maker3d_app USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON benefits TO maker3d_app;
REVOKE ALL ON benefits FROM PUBLIC, anon, authenticated;
ALTER TABLE guardian_contacts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS maker3d_backend ON guardian_contacts;
CREATE POLICY maker3d_backend ON guardian_contacts TO maker3d_app USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON guardian_contacts TO maker3d_app;
REVOKE ALL ON guardian_contacts FROM PUBLIC, anon, authenticated;
RESET search_path;

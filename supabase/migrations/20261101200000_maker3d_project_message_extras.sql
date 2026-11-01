SET search_path = maker3d, pg_catalog;
CREATE TABLE IF NOT EXISTS message_extras(message_id INTEGER PRIMARY KEY REFERENCES messages(id),media_key TEXT,media_name TEXT,media_mime TEXT,media_size INTEGER,proposal TEXT CHECK(proposal IN ('pending','accepted','declined')),answered_by INTEGER REFERENCES users(id),answered_at TEXT,answer_note TEXT);
ALTER TABLE message_extras ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS maker3d_backend ON message_extras;
CREATE POLICY maker3d_backend ON message_extras TO maker3d_app USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON message_extras TO maker3d_app;
REVOKE ALL ON message_extras FROM PUBLIC, anon, authenticated;
RESET search_path;

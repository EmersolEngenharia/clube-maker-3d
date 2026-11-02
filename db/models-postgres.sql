SET search_path = maker3d, pg_catalog;
CREATE TABLE IF NOT EXISTS model_links(project_id INTEGER PRIMARY KEY REFERENCES projects(id),site TEXT NOT NULL,url TEXT NOT NULL,model_id TEXT,profile_id TEXT,title TEXT NOT NULL,author TEXT,license TEXT,image_key TEXT,image_mime TEXT,license_checked_by INTEGER REFERENCES users(id),license_checked_at TEXT,created TEXT NOT NULL);
ALTER TABLE model_links ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS maker3d_backend ON model_links;
CREATE POLICY maker3d_backend ON model_links TO maker3d_app USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON model_links TO maker3d_app;
REVOKE ALL ON model_links FROM PUBLIC, anon, authenticated;
RESET search_path;

-- Additive upgrade: existing families, users and financial history are preserved.
CREATE TABLE IF NOT EXISTS user_preferences(user_id INTEGER PRIMARY KEY REFERENCES users(id),theme TEXT NOT NULL DEFAULT 'atelier',avatar TEXT NOT NULL DEFAULT 'robot',experience TEXT NOT NULL DEFAULT 'guided',photo_key TEXT,photo_mime TEXT);
CREATE TABLE IF NOT EXISTS team_members(user_id INTEGER PRIMARY KEY REFERENCES users(id),granted_by INTEGER NOT NULL REFERENCES users(id),created TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS participant_settings(participant_id INTEGER PRIMARY KEY REFERENCES participants(id),age_group TEXT NOT NULL DEFAULT 'unspecified',notes TEXT NOT NULL DEFAULT '',active INTEGER NOT NULL DEFAULT 1);
CREATE TABLE IF NOT EXISTS enrollment_invites(token TEXT PRIMARY KEY,label TEXT NOT NULL,expires BIGINT NOT NULL,max_uses INTEGER NOT NULL,uses INTEGER NOT NULL DEFAULT 0,created TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS posts(id INTEGER PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES users(id),family_id INTEGER REFERENCES families(id),title TEXT NOT NULL,body TEXT NOT NULL DEFAULT '',details TEXT NOT NULL DEFAULT '{}',status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','guardian','review','approved')),consent_by INTEGER REFERENCES users(id),review_note TEXT NOT NULL DEFAULT '',created TEXT NOT NULL,updated TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS post_media(id INTEGER PRIMARY KEY,post_id INTEGER NOT NULL REFERENCES posts(id),name TEXT NOT NULL,path TEXT NOT NULL,mime TEXT NOT NULL,size INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS audit_log(id INTEGER PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES users(id),action TEXT NOT NULL,target TEXT NOT NULL,created TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS maker_projects_family_period ON projects(family_id,period);
CREATE INDEX IF NOT EXISTS maker_projects_created ON projects(created,id);
CREATE INDEX IF NOT EXISTS maker_projects_queue ON projects(approved_at,id) WHERE status='queued';
CREATE UNIQUE INDEX IF NOT EXISTS maker_one_print ON projects((status)) WHERE status='printing';
CREATE INDEX IF NOT EXISTS maker_users_family ON users(family_id);
CREATE INDEX IF NOT EXISTS maker_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS maker_sessions_expires ON sessions(expires);
CREATE INDEX IF NOT EXISTS maker_participants_family ON participants(family_id);
CREATE INDEX IF NOT EXISTS maker_events_project ON events(project_id,id);
CREATE INDEX IF NOT EXISTS maker_messages_project ON messages(project_id,id);
CREATE INDEX IF NOT EXISTS maker_files_project ON files(project_id);
CREATE INDEX IF NOT EXISTS maker_payments_family ON payments(family_id,id);
CREATE INDEX IF NOT EXISTS maker_posts_family ON posts(family_id,id);
CREATE INDEX IF NOT EXISTS maker_posts_user ON posts(user_id,id);
CREATE INDEX IF NOT EXISTS maker_media_post ON post_media(post_id,id);
CREATE INDEX IF NOT EXISTS maker_audit_created ON audit_log(created,id);

CREATE TABLE IF NOT EXISTS benefits(code TEXT PRIMARY KEY,family_id INTEGER NOT NULL REFERENCES families(id),kind TEXT NOT NULL CHECK(kind IN ('hours','discount')),value INTEGER NOT NULL CHECK(value>0),period TEXT NOT NULL,reason TEXT NOT NULL,used INTEGER NOT NULL DEFAULT 0,created_by INTEGER NOT NULL REFERENCES users(id),created TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS maker_benefits_family_period ON benefits(family_id,period);
CREATE TABLE IF NOT EXISTS guardian_contacts(user_id INTEGER PRIMARY KEY REFERENCES users(id),whatsapp TEXT NOT NULL);

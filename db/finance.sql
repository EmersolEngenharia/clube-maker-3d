
CREATE TABLE IF NOT EXISTS team_permissions(user_id INTEGER PRIMARY KEY REFERENCES users(id),access_role TEXT NOT NULL CHECK(access_role IN ('admin','finance','operator')));
CREATE TABLE IF NOT EXISTS staff_invites(token TEXT PRIMARY KEY,email TEXT NOT NULL,access_role TEXT NOT NULL CHECK(access_role IN ('admin','finance','operator')),expires BIGINT NOT NULL,created_by INTEGER NOT NULL REFERENCES users(id),created TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS benefit_terms(code TEXT PRIMARY KEY REFERENCES benefits(code),expires_on TEXT NOT NULL,redeemed_at TEXT);
CREATE TABLE IF NOT EXISTS benefit_allocations(project_id INTEGER NOT NULL REFERENCES projects(id),code TEXT NOT NULL REFERENCES benefits(code),minutes INTEGER NOT NULL CHECK(minutes>0),PRIMARY KEY(project_id,code));
CREATE INDEX IF NOT EXISTS maker_allocations_code ON benefit_allocations(code);
CREATE TABLE IF NOT EXISTS cash_entries(id INTEGER PRIMARY KEY,scope TEXT NOT NULL CHECK(scope IN ('club','family')),family_id INTEGER REFERENCES families(id),kind TEXT NOT NULL CHECK(kind IN ('income','expense','investment')),category TEXT NOT NULL,description TEXT NOT NULL,cents INTEGER NOT NULL CHECK(cents>=0),entry_date TEXT NOT NULL,source_key TEXT UNIQUE,created_by INTEGER REFERENCES users(id),created TEXT NOT NULL,voided_at TEXT,void_reason TEXT,request_key TEXT UNIQUE,CHECK(scope='club' OR (family_id IS NOT NULL AND kind!='investment')));
CREATE INDEX IF NOT EXISTS maker_cash_scope_date ON cash_entries(scope,entry_date,id);
CREATE INDEX IF NOT EXISTS maker_cash_family_date ON cash_entries(family_id,entry_date,id);
CREATE TABLE IF NOT EXISTS stock_lots(id INTEGER PRIMARY KEY,entry_id INTEGER UNIQUE NOT NULL REFERENCES cash_entries(id),material TEXT NOT NULL,color TEXT NOT NULL,supplier TEXT NOT NULL DEFAULT '',grams INTEGER NOT NULL CHECK(grams>0));
CREATE TABLE IF NOT EXISTS stock_uses(id INTEGER PRIMARY KEY,lot_id INTEGER NOT NULL REFERENCES stock_lots(id),grams INTEGER NOT NULL CHECK(grams>0),reason TEXT NOT NULL,created_by INTEGER NOT NULL REFERENCES users(id),created TEXT NOT NULL,request_key TEXT UNIQUE);
CREATE INDEX IF NOT EXISTS maker_stock_uses_lot ON stock_uses(lot_id);

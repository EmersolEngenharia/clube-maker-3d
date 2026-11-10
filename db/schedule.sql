-- Agenda da impressora: cada pedido aprovado ocupa um horário. Bloqueios, configurações e o último estado da máquina.
CREATE TABLE IF NOT EXISTS print_slots(project_id INTEGER PRIMARY KEY REFERENCES projects(id),starts_at TEXT NOT NULL,ends_at TEXT NOT NULL,created_by INTEGER REFERENCES users(id),self_service INTEGER NOT NULL DEFAULT 0,filaments TEXT NOT NULL DEFAULT '[]',est_minutes INTEGER NOT NULL DEFAULT 0,est_grams REAL NOT NULL DEFAULT 0,validated_by INTEGER REFERENCES users(id),validated_at TEXT,charged_cents INTEGER NOT NULL DEFAULT 0,charge_error TEXT,pickup_reminded_at TEXT,created TEXT NOT NULL,updated TEXT NOT NULL,CHECK(ends_at>starts_at));
CREATE INDEX IF NOT EXISTS maker_slots_start ON print_slots(starts_at);
CREATE TABLE IF NOT EXISTS schedule_blocks(id TEXT PRIMARY KEY,starts_at TEXT NOT NULL,ends_at TEXT NOT NULL,reason TEXT NOT NULL,created_by INTEGER NOT NULL REFERENCES users(id),created TEXT NOT NULL,CHECK(ends_at>starts_at));
CREATE TABLE IF NOT EXISTS schedule_settings(id INTEGER PRIMARY KEY CHECK(id=1),value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS printer_status(id INTEGER PRIMARY KEY CHECK(id=1),payload TEXT NOT NULL,updated TEXT NOT NULL);

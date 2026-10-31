CREATE TABLE IF NOT EXISTS cash_attributions(entry_id INTEGER PRIMARY KEY REFERENCES cash_entries(id),participant_id INTEGER REFERENCES participants(id),user_id INTEGER REFERENCES users(id),CHECK(participant_id IS NULL OR user_id IS NULL));
CREATE INDEX IF NOT EXISTS maker_cash_attribution_participant ON cash_attributions(participant_id);
CREATE INDEX IF NOT EXISTS maker_cash_attribution_user ON cash_attributions(user_id);

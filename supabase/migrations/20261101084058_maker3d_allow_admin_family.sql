ALTER TABLE maker3d.users DROP CONSTRAINT maker_family_role;
ALTER TABLE maker3d.users ADD CONSTRAINT maker_family_role CHECK (role='admin' OR (role='staff' AND family_id IS NULL) OR (role IN ('guardian','learner') AND family_id IS NOT NULL));

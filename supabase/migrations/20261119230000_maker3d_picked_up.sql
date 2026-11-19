SET search_path = maker3d, pg_catalog;

-- Retirada e pagamento são independentes.
-- status 'picked' = peça já retirada, pagamento ainda em aberto.
-- picked_up_at guarda o momento da retirada. Vazio nos pedidos antigos.
-- Não aplicar em produção por este arquivo sozinho: o Emerson aplica depois de aprovar.
ALTER TABLE projects ADD COLUMN IF NOT EXISTS picked_up_at TEXT;

ALTER TABLE projects DROP CONSTRAINT IF EXISTS maker_status;
ALTER TABLE projects ADD CONSTRAINT maker_status CHECK (status IN ('draft','review','question','approval','queued','printing','ready','picked','completed','cancelled','failed'));

RESET search_path;

SET search_path = maker3d, pg_catalog;

-- Custo total do lote de filamento, em centavos. O caixa pode parcelar esse valor;
-- custo/kg, valor restante e baixas leem esta coluna, não o cents de uma parcela.
-- O backfill copia o cents da cash_entry ligada (compra à vista, ou o total ainda inteiro).
-- Não sobrescreve um cost_cents já preenchido: rode isto ANTES de scripts/parcelar-compras.mjs.
-- Não aplicar em produção por este arquivo sozinho. Depois do merge, aplicar esta migration
-- e só então o script das entradas 41 a 51. O deploy sem esta coluna recusa subir.
ALTER TABLE stock_lots ADD COLUMN IF NOT EXISTS cost_cents INTEGER;

UPDATE stock_lots AS s
SET cost_cents = c.cents
FROM cash_entries AS c
WHERE c.id = s.entry_id AND s.cost_cents IS NULL;

ALTER TABLE stock_lots ALTER COLUMN cost_cents SET DEFAULT 0;
ALTER TABLE stock_lots ALTER COLUMN cost_cents SET NOT NULL;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'maker_stock_cost_cents') THEN
    ALTER TABLE stock_lots ADD CONSTRAINT maker_stock_cost_cents CHECK (cost_cents >= 0);
  END IF;
END $$;

RESET search_path;

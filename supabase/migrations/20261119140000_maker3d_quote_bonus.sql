SET search_path = maker3d, pg_catalog;

-- Bonificação do orçamento, decidida em Preparar orçamento.
-- bonus_minutes: horas abatidas das horas a cobrar (não da cota da família).
-- bonus_cents: desconto em centavos sobre o total. A aplicação impede total negativo.
-- Não substitui projects.exempt (Isento/Bonificado do pedido inteiro).
-- A proposta à família já fica em quote_note; esta migração não mexe nesse texto.
ALTER TABLE projects ADD COLUMN IF NOT EXISTS bonus_minutes INTEGER NOT NULL DEFAULT 0;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS bonus_cents INTEGER NOT NULL DEFAULT 0;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'maker_bonus_minutes') THEN
    ALTER TABLE projects ADD CONSTRAINT maker_bonus_minutes CHECK (bonus_minutes >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'maker_bonus_cents') THEN
    ALTER TABLE projects ADD CONSTRAINT maker_bonus_cents CHECK (bonus_cents >= 0);
  END IF;
END $$;

RESET search_path;

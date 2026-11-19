SET search_path = maker3d, pg_catalog;

-- Itens adicionais do orçamento (argola, ímã, embalagem), decididos em Preparar orçamento.
-- Lista de {description, quantity, unitCents}. Vazia mantém o total igual ao de antes.
-- A bonificação em centavos continua valendo sobre o total, já com estes itens.
-- Não aplicar em produção por este arquivo sozinho: o Emerson aplica depois de aprovar.
ALTER TABLE projects ADD COLUMN IF NOT EXISTS extra_items JSONB NOT NULL DEFAULT '[]'::jsonb;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'maker_extra_items') THEN
    ALTER TABLE projects ADD CONSTRAINT maker_extra_items CHECK (jsonb_typeof(extra_items) = 'array');
  END IF;
END $$;

RESET search_path;

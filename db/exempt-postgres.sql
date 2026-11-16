SET search_path = maker3d, pg_catalog;

-- Isento / Bonificado: peça que não gera cobrança (presente, amostra, uso interno).
-- 0 = financeiro em aberto ou pago pelo fluxo normal; 1 = quitado sem caixa e sem Asaas.
ALTER TABLE projects ADD COLUMN IF NOT EXISTS exempt INTEGER NOT NULL DEFAULT 0;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'maker_exempt') THEN
    ALTER TABLE projects ADD CONSTRAINT maker_exempt CHECK (exempt IN (0, 1));
  END IF;
END $$;

-- Pedidos já concluídos, sem valor e ainda não pagos (ex.: #006) viram Isento / Bonificado.
-- A etapa continua Concluído. Pedido com cobrança ou já pago não muda.
UPDATE projects SET exempt = 1
WHERE status = 'completed' AND charge = 0 AND paid = 0 AND exempt = 0;

RESET search_path;

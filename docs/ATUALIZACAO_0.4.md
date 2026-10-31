# Atualização 0.4.0 — financeiro, contatos e equipe

## Onde encontrar

- **Famílias**: contatos dos responsáveis (nome, e-mail e WhatsApp), participantes,
  concessão e histórico de benefícios e recebimento de participação.
- **Meu perfil**: o responsável cadastra e atualiza seu próprio WhatsApp com DDD.
  O número aparece para a equipe e os responsáveis da mesma família.
- **Equipe**: administrador gerencia funções de adultos existentes e cria convites
  de colaboradores. O convite é vinculado ao e-mail, de uso único e válido por
  sete dias. Copie o link na criação e compartilhe manualmente. Pode ser revogado.
- **Financeiro do clube**: administrador e financeiro registram movimentações,
  filtram períodos, exportam CSV e estornam com motivo.
- **Financeiro da família**: responsáveis registram vendas e outras despesas;
  cada família acessa somente seus próprios dados. Administradores não acessam
  as vendas particulares de outras famílias pela aplicação.
- **Estoque**: compras por material, cor, fornecedor, peso e valor total; baixa por
  lote, quantidade em gramas e motivo/projeto.

## Primeiro uso financeiro

1. Lance o dinheiro colocado para iniciar o clube como **Aporte / investimento
   inicial**. Ele aumenta o caixa e fica separado da receita operacional.
2. Lance os equipamentos comprados como **Despesa → Equipamentos**, com a data
   e o valor efetivamente pagos. Não lance a mesma compra como aporte.
3. Em **Estoque → Registrar compra**, informe os filamentos iniciais, inclusive
   fornecedor, peso e valor total pago, com frete se aplicável. Uma operação
   registra a saída no caixa e a entrada do lote no estoque.
4. Continue registrando mensalidades e anuidades na ficha da família e os custos
   de impressão no projeto concluído. Ambos entram no caixa como receitas e no
   financeiro da família como despesas, sem lançar duas vezes.
5. Registre as demais despesas e novas compras. A baixa de estoque informa o
   filamento consumido ou perdido; não gera uma segunda saída financeira.
6. Cada família lança as vendas recebidas e os gastos adicionais de sua atividade,
   como embalagem e entrega. Pagamentos ao clube já aparecem automaticamente.

Os registros seguem o **regime de caixa**. O resultado do período é receita menos
pagamentos/despesas. Aportes não compõem esse resultado. O saldo final do clube
inclui saldo anterior, aportes, receitas e despesas. O painel da família informa
resultado de caixa; não calcula lucro contábil, impostos, contas a pagar/receber,
depreciação, custo por produto ou estoque próprio das famílias.

Recebimentos antigos de participação e projetos marcados como pagos são incorporados
uma única vez ao histórico financeiro ao iniciar. Para projetos antigos, a data
usada é a última atualização disponível; não havia uma data de recebimento separada.
Confira o extrato histórico antes de usar os totais em um fechamento.

Estornos preservam o lançamento, o motivo e a autoria no histórico. Valores
estornados não entram nos totais. Recebimentos de impressão estornados deixam o
projeto novamente pendente de pagamento. Cupons usados permanecem utilizados
mesmo se o recebimento for estornado; conceda outro código se necessário.
Compras de estoque com baixas não podem ser estornadas, para preservar as
quantidades. Ajustes financeiros posteriores podem ser lançados separadamente.

## Benefícios

- Cupons têm desconto fixo em reais, são exclusivos da família e de uso único.
  São aplicados apenas à mensalidade/anuidade. O resumo mostra valor original,
  desconto e total automaticamente; o servidor revalida ao confirmar.
- Isenção total exige o valor original e um motivo. Não gera entrada de dinheiro.
- Horas de bônus são concedidas uma vez e têm vencimento próprio, independente da
  renovação mensal da franquia. Não se renovam nem alteram orçamentos aprovados.
- Na aprovação de projetos, a aplicação usa primeiro a franquia e depois os bônus
  que vencem antes. Reservas já aprovadas continuam válidas após o vencimento.
  Cancelamento/falha libera a reserva; saldo vencido não volta a ficar disponível.
- O histórico mostra responsável pela concessão, motivo, validade, saldo, uso e
  reserva; cupons aparecem disponíveis, utilizados ou vencidos.

## Funções

| Função | Permissões |
| --- | --- |
| Administrador | Equipe, funções, preços, famílias, operação e financeiro do clube. |
| Financeiro | Contatos, benefícios, recebimentos, caixa, compras e baixas de estoque. |
| Operador de impressão | Famílias, convites de família, orçamentos, produção, revisão de conteúdos e baixas de estoque. Sem caixa ou recebimentos. |
| Responsável | Sua família, aprovação de projetos, contatos, benefícios e financeiro particular. |
| Aprendiz | Projetos e atividades; sem financeiro ou concessão de acessos. |

Alterações de função revogam as sessões. O colaborador entra novamente para usar
as novas permissões. O administrador inicial é preservado; ninguém altera o próprio
acesso. Colaboradores sem família removidos da equipe perdem acesso ao portal.

## Atualização em produção

A entrega é local. Não foi modificada a VPS nem o Supabase remoto.

1. Faça backup e confirme a versão atualmente instalada.
2. Se a migração de perfis 0.3 ainda não estiver aplicada, aplique-a primeiro.
   Não reaplique as migrações originais já executadas.
3. Aplique, nesta ordem, **db/benefits-upgrade.sql** e **db/finance-postgres.sql**
   no schema privado maker3d usando a conexão administrativa. Esses dois scripts
   são idempotentes. O segundo adiciona as tabelas e permite contas `staff`
   sem família, preservando as restrições das contas familiares.
4. Instale o código 0.4.0. O Dockerfile inclui os módulos novos. Preserve as
   variáveis privadas, o domínio, os dados e os volumes existentes.
5. Reinicie o serviço. O backend recusa iniciar se faltar o schema necessário.
6. Confira contatos, convite de colaborador, recebimento, extrato familiar,
   aporte, compra/baixa e permissões com contas de teste.

SQLite cria as tabelas automaticamente. PostgreSQL mantém RLS em todas as tabelas,
com acesso apenas pelo backend dedicado maker3d_app. Não houve alteração nos
schemas de outros sistemas. Nenhuma credencial acompanha o código.

## Validação

A suíte automatizada cobre SQLite e PostgreSQL embarcado (PGlite com o papel
maker3d_app), isolamento entre famílias, funções, convites, descontos, isenção,
recebimentos automáticos, estornos, aportes, estoque, idempotência e bônus com
validade entre meses. O navegador verifica os fluxos principais, CSV, convites,
contatos e telas em computador e celular. Não foi feito teste na VPS ou com o
PostgreSQL remoto real.

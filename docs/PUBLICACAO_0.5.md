# Publicação 0.5.0 — dashboard compacto e aprendizado em família

Publicada em 31/10/2026, às 19:42, horário de Brasília.

- URL: https://maker3d.emersol.ai
- SHA implantado: `f8cf018bd86f25a60c86a3343b01f92495586e04`.
- Release: `/opt/maker3d/releases/f8cf018bd86f25a60c86a3343b01f92495586e04`.
- Imagem: `maker3d:f8cf018bd86f25a60c86a3343b01f92495586e04`.
- Backup da configuração: `/opt/maker3d/backups/deploy-f8cf018bd86f-20261031T224200Z`.
- Release anterior imediato: `9c7ffb873f5300829b7250872beaf0093bf15e7a` (mesma funcionalidade, antes do esclarecimento sobre repasses internos).
- Release anterior à atualização financeira: `135499cc2c0dc0c8c1b5fb45a1acbbc6edd745aa`.
- Backup anterior à atualização: `/opt/maker3d/backups/deploy-9c7ffb873f53-20261031T223939Z`.
- Migração Supabase: `20261031223853_maker3d_family_finance_attribution_and_learning`.

## Resultado

Indicadores e período em uma área compacta, com lançamentos logo abaixo. Busca,
filtros e ordenação são locais: não disparam consultas repetidas ao alterar a
lista. Há paginação e CSV dos registros filtrados. O modelo escolhido é um
financeiro compartilhado por família, identificando participantes em cada registro.
Responsáveis escolhem o participante; registros de aprendizes usam seu próprio
acesso. Inclui explicações e calculadora de lucro/prejuízo que não grava dinheiro.
Consulte `FINANCEIRO_DIDATICO.md` para uso e regras de acesso.

## Validação

- 41 testes aprovados em SQLite e 41 em PostgreSQL/PGlite.
- Navegador em desktop e celular: painel compacto, filtros, ordenação, estornados,
  CSV filtrado, caixa, estoque, participante, calculadora e fluxo do aprendiz.
- Os lançamentos ficam visíveis mais acima: o cabeçalho da tabela aparece antes
  de 650 px na configuração desktop de QA (1440 × 1000).
- Busca, filtro e ordenação não adicionam requisições financeiras.
- A calculadora foi conferida com lucro e prejuízo e sem criar registros.
- Em produção, APIs autenticadas do administrador e do responsável retornam 200
  nos escopos permitidos; família continua sem acesso ao caixa do clube, equipe
  e estoque. Não foram lançados valores fictícios em produção.
- App.js, operations.js e brand.css públicos correspondem ao checkout final.
- Contêiner saudável, porta em loopback e healthcheck HTTPS 200.
- Sessão temporária de QA removida e nenhuma tarefa temporária Plesk remanescente.
- Os cinco lançamentos financeiros existentes foram comparados por ID, escopo,
  tipo, valor, data e descrição antes/depois, sem diferenças. A migração só adiciona
  a tabela de identificação; não reclassifica nem altera lançamentos antigos.
- A nova tabela possui RLS e não concede SELECT a anon ou authenticated.

## Rollback

Para reverter apenas o esclarecimento de texto, restaurar version.env do backup
final e apontar current ao release anterior imediato. Para voltar ao layout e às
permissões anteriores à atualização, usar o backup anterior e o release 135499c.
Em ambos os casos, manter runtime, contas, anexos e todas as tabelas; executar
`/opt/maker3d/service.sh up -d --no-build` e validar HTTPS/healthcheck. Não apagar
cash_attributions nem restaurar o banco sobre alterações reais posteriores.

O código antigo não permite aprendizes no financeiro; considerar isso antes de
reverter após o início das atividades didáticas. Commits posteriores apenas de
documentação e sincronização da migração não alteram o SHA da imagem publicado.

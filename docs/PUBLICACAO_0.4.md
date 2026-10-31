# Publicação 0.4.0 — financeiro, estoque, benefícios e funções

Publicada em 31/10/2026 às 19:02, horário de Brasília.

- URL: https://maker3d.emersol.ai
- SHA implantado: `b7edee1b0267de9d680d38ae0f7915e33b9aa0e9`.
- Release: `/opt/maker3d/releases/b7edee1b0267de9d680d38ae0f7915e33b9aa0e9`.
- Imagem: `maker3d:b7edee1b0267de9d680d38ae0f7915e33b9aa0e9`.
- Anterior: `dbafc523369ab6317d93565dd416b9cf92be7217`.
- Backup da configuração e rollback: `/opt/maker3d/backups/deploy-b7edee1b0267-20261031T220210Z`.
- Snapshot privado dos dados antes da migração: `/opt/maker3d/backups/pre-v04-20261031T220138Z/maker3d-data.json` (root, modo 600).
- Migração registrada no Supabase: `20261031220153_maker3d_finance_stock_benefits_roles_v04`.

## Verificações

A base recente de main foi integrada antes da publicação, preservando a marca
Clube Maker 3D Emersol, favicon e assets existentes. O merge passou nos 40 testes
SQLite e nos 40 testes PostgreSQL/PGlite. O navegador verificou os novos fluxos em
computador e celular, sem erros JavaScript ou overflow da página.

O procedimento existente construiu a imagem, conferiu um candidato em loopback,
ativou o release e concluiu com resultado zero. O contêiner está saudável,
executando como node, com filesystem somente leitura e porta restrita a
127.0.0.1:3183. O serviço continua sendo `/opt/maker3d/service.sh`.

Página e healthcheck públicos retornam 200. HTTP redireciona para HTTPS. App.js,
features.js, operations.js, themes.css, brand.css, brand-icon.svg e favicon.svg
publicados foram comparados byte a byte com o checkout testado. O domínio vizinho
emersol.ai retornou 200 antes e depois. Logs recentes não apresentaram falhas
persistentes.

O banco possui 27 tabelas privadas, todas com RLS. As tabelas novas não concedem
SELECT a anon/authenticated. Foram preservados os 7 usuários e as 6 famílias
existentes. Nenhuma conta foi recriada ou senha alterada. Não foram registrados
recebimentos, despesas, vendas, compras ou impressões fictícios em produção.

A conferência autenticada usa somente leituras e uma sessão temporária exclusiva
para QA, removida ao final. Endpoints de administrador (dashboard, financeiro,
estoque e equipe) foram conferidos no servidor publicado. O responsável acessa
somente o financeiro e contatos de sua família; APIs de caixa do clube, equipe e
estoque permanecem restritas.

A migração é aditiva: não apaga tabelas, famílias, usuários ou anexos. Os scripts
anteriores de bootstrap/provisionamento não foram executados. Tarefas temporárias
Plesk são inativas, sem notificações, e são removidas após o uso. O snapshot privado
permanece no servidor; não contém dados em arquivos do repositório.

## Rollback

Restaurar a cópia `version.env` no backup acima para `/etc/maker3d/version.env`,
preservando root/modo 600; apontar `/opt/maker3d/current` atomicamente ao release
anterior e executar `/opt/maker3d/service.sh up -d --no-build`. Conferir contêiner,
healthcheck e página por HTTPS. Não apagar as novas tabelas nem restaurar dados
sobre alterações reais posteriores. O código anterior tolera as tabelas adicionais.
Se colaboradores sem família já tiverem sido criados na versão 0.4, avaliar essa
compatibilidade antes de reverter o aplicativo, pois a versão anterior não conhece
o perfil staff.

Commits posteriores apenas de documentação e sincronização do arquivo da migração
não alteram o SHA da imagem implantada acima.

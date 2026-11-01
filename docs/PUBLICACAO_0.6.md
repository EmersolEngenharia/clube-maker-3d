# Publicação 0.6 — cobranças Asaas

Publicada em https://maker3d.emersol.ai em 01/11/2026, verificada às 04:24 de Brasília.
SHA efetivo: `7e6b09bc2e47c2514df84584248cb4529c6a2302`.
Anterior: `f8cf018bd86f25a60c86a3343b01f92495586e04`.
Backup: `/opt/maker3d/backups/deploy-7e6b09bc2e47-20261101T072429Z`.
Backup privado do runtime anterior: `/opt/maker3d/backups/asaas-runtime-20261031T231546Z/runtime.env`.

Migração `20261031231352_maker3d_asaas_billing_contracts_and_receipts`
aplicada, tabelas privadas com RLS. Os cinco lançamentos existentes mantêm o
fingerprint `d05caeb0e1babb7e5cf1ce5f78dbc0f1`. Nenhum cliente, cobrança ou recibo
real criado nesta publicação.

Validação: 55 testes em SQLite e 55 em PostgreSQL/PGlite; testes focados após o
ajuste de privacidade; QA de interface em desktop/celular. Container saudável,
healthcheck externo 200 e hashes de billing.js, operations.js, app.js e brand.css
iguais aos locais. Tarefas temporárias Plesk removidas.

ASAAS_ENV=production; token de webhook presente; chave da API ausente. A versão
está publicada com modo manual. O webhook não foi cadastrado no painel Asaas.
Testes usam mocks: emissão, checkout, conta e entrega real do webhook ainda
precisam de homologação com credenciais. Ver [configuração](ASAAS.md).

Rollback: seguir docs/DEPLOY_RAPIDO.md, usando o backup acima. Preservar as
novas tabelas, os dados e o runtime privado; não desfazer a migração nem apagar
recibos. Este registro documental não altera o SHA da imagem publicada.

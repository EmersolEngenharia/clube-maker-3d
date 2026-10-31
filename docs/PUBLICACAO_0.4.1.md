# Publicação 0.4.1 — desempenho

Publicada em 31/10/2026 às 19:23, horário de Brasília.

- URL: https://maker3d.emersol.ai
- SHA implantado: `135499cc2c0dc0c8c1b5fb45a1acbbc6edd745aa`.
- Anterior: `b7edee1b0267de9d680d38ae0f7915e33b9aa0e9`.
- Backup: `/opt/maker3d/backups/deploy-135499cc2c0d-20261031T222319Z`.
- Não há migração, modificação de dados financeiros ou alteração de credenciais.

## Problema e correção

O dashboard fazia quatro consultas de saldo por família, além das consultas do
painel. Seis famílias geravam dezenas de viagens entre a VPS e o banco. Cada
navegação também aguardava o dashboard antes de buscar a tela de destino.

No PostgreSQL, os dados autorizados do dashboard agora são lidos em uma única
consulta com subconsultas agregadas. O cálculo de saldo reaproveita esses dados
em memória. Filtros por família e restrições de acesso permanecem no SQL. A
configuração local de cada transação passou a ser enviada em uma viagem ao banco,
preservando os limites, bloqueio de escritas, commit e rollback.

Financeiro, estoque, perfil e atividades abrem sem recarregar o dashboard. As
páginas que dependem dele continuam consultando dados novos; não foi adicionado
cache compartilhado ou cache de autorização. Quando uma ação exige atualizar
painel e tela específica, as duas leituras são iniciadas juntas. Toda gravação,
aprovação e registro de pagamento continua validada no servidor.

## Medições externas autenticadas

Três requisições sequenciais por endpoint antes e depois, com a mesma rotina
Python, incluindo tráfego HTTPS externo. Valores abaixo são médias, não garantias
de latência para todos os dispositivos ou redes.

| Endpoint | Antes | Depois |
| --- | --- | --- |
| `/api/dashboard` | 8180 ms | 1041 ms |
| `/api/finance?scope=club` | 1580 ms | 1052 ms |
| `/api/stock` | 1761 ms | 1285 ms |
| `/healthz` | 1550 ms | 896 ms |

Além da redução no endpoint do painel, entrar no financeiro elimina a chamada
anterior ao dashboard: a navegação espera apenas sua consulta financeira.

## Validação e rollback

Os 40 testes passaram em SQLite e PostgreSQL/PGlite. O navegador validou os fluxos
financeiros, concessões, contatos, convites, CSV e celular, incluindo a ausência de
requisição redundante ao dashboard ao abrir o financeiro. A publicação usou o
candidato em loopback e o procedimento existente de ativação com rollback. O
contêiner final está saudável e o app.js público corresponde ao checkout.

As verificações autenticadas em produção são somente de leitura. A sessão de QA
é exclusiva e é removida depois das verificações. Os lançamentos reais são
preservados. Nenhuma compra ou recebimento fictício foi registrado.

Para rollback, restaurar version.env do backup acima, apontar current ao release
anterior e executar `/opt/maker3d/service.sh up -d --no-build`; conferir HTTPS e
healthcheck. Não alterar banco, contas ou anexos. Commits posteriores apenas de
documentação não mudam o SHA da imagem implantada.

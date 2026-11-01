# Auditoria de desempenho — 01/11/2026

Objetivo: descobrir por que o portal parece lento e o que fazer, em ordem de impacto.

## Resumo

O código é leve: ~190 KB de front-end sem bibliotecas, tabelas pequenas e consultas
indexadas. O tempo se perde **na distância**:

| Peça | Onde está |
| --- | --- |
| Famílias e equipe | Itumbiara–GO, Brasil |
| Aplicação (VPS Contabo `185.215.180.60`) | Lauterbourg, **França** |
| Banco (Supabase `hzsuckglbihyraaotzba`, session pooler) | **São Paulo** (`sa-east-1`) |

Toda tela faz o caminho Brasil → França → São Paulo (várias vezes) → França → Brasil.
Medido de fora em 01/11/2026, com a conexão já aberta:

| Requisição | Tempo até o 1º byte | Idas ao banco |
| --- | --- | --- |
| `/favicon.svg` (sem banco) | ~0,21 s | 0 |
| `/api/session` sem login | ~0,58 s | 3 |
| `/healthz` | ~0,80 s | 3 |

Cada ida e volta França ↔ São Paulo custa **~0,12–0,2 s**. Por isso o número de
idas ao banco por tela é o que define a velocidade.

## Idas ao banco por tela (medidas com contador, Postgres embutido)

| Tela / ação | Antes | Depois desta revisão |
| --- | --- | --- |
| Abrir projeto `GET /api/projects/:id` | 11 | **6** |
| Aprovar orçamento | 16 | **10** |
| Benefícios da família | 9 | **6** |
| Cobrança/WhatsApp (equipe, 5 famílias) | 29, **+4 por família** | **6, fixo** |
| Painel `/api/dashboard` | 4 | 4 (já otimizado) |
| Sessão, financeiro, estoque, publicações | 4–6 | sem mudança |

Com ~0,15 s por ida, abrir um projeto passa de ~1,7 s para ~0,9 s de banco e a
tela de cobrança de ~4,4 s (crescendo com o clube) para ~0,9 s.

## O que foi alterado nesta revisão

1. **Saldo de horas em uma consulta** (`quota.mjs`): família, projetos, bônus e
   reservas vêm juntos via `db.snapshot` (4 → 1). Beneficia orçamento, aprovação e
   benefícios. Cálculo (`computeQuota`) intacto.
2. **Detalhe do projeto** (`server.mjs`): mensagens, eventos e arquivos numa
   consulta (3 → 1).
3. **Visão da automação** (`messaging/automation.mjs`): era uma transação de
   escrita (com a trava global) que repetia o *seed* e 2 consultas **para cada
   família**. Agora é leitura em lote, constante; o *seed* só roda quando há
   família sem configuração ou responsável a preencher.
4. **Conexões quentes com o banco** (`db.mjs`): a conexão era fechada após 30 s
   ociosa e cada reabertura TLS para São Paulo custa vários round trips. Agora
   `min: 1`, ociosidade de 5 min (`DATABASE_IDLE_MS`), `keepAlive` e renovação a
   cada 30 min.
5. **Projeto + painel em paralelo** (`public/app.js`): `openProject` buscava um
   depois do outro; após cada ação no projeto economiza uma requisição inteira.
6. **Cache dos arquivos estáticos** (`server.mjs`): `index.html` aponta para
   `/app.js?v=<hash>`; com a versão correta o navegador guarda por 1 ano
   (`immutable`) e não pergunta de novo a cada abertura. Endereços sem versão
   continuam revalidando, e a verificação de assets do `deploy-release.sh`
   segue funcionando. ETag pré-calculado e compressão máxima (Brotli 11, gzip 9)
   feita uma vez na inicialização.

Testes: `npm test` e `npm run test:postgres` 63/63 (2 novos testes);
`browser-smoke`, `browser-features` e `browser-finance` aprovados (desktop e celular,
sem erros JS/CSP).

## Recomendações ainda não aplicadas (por impacto)

### 1. Aproximar aplicação e banco — maior ganho, decisão de infraestrutura
Mover a aplicação para uma VPS em São Paulo (ou o mais próximo possível do banco)
reduziria cada ida ao banco de ~150 ms para ~1–5 ms e também a distância das
famílias até o servidor. Estimativa: telas de ~1 s caem para ~0,2–0,3 s. Exige
nova hospedagem, o que o `AGENTS.md` hoje proíbe sem decisão explícita do
responsável. Alternativa inversa (banco na Europa) piora para os usuários.

### 2. Tirar envios ao Storage de dentro da trava global
Toda gravação usa `pg_advisory_xact_lock(733031930)`: só uma escrita por vez no
clube inteiro. Envio de arquivo de projeto, foto de perfil e mídia de publicação
sobem para o Supabase Storage **com essa trava aberta** (até 10 MB, até 20 s de
timeout), bloqueando todas as outras gravações. Sugestão: enviar o arquivo antes
da transação e, dentro dela, só gravar a linha (removendo o objeto se a gravação
falhar). Médio prazo: trocar a trava global por travas por família/projeto.

### 3. Cache de fotos de perfil e mídias
`/api/avatars/:id` e `/api/post-media/:id` respondem com `no-store`, então cada
exibição baixa de novo do Storage em São Paulo, passando pela França. Como a chave
do arquivo muda a cada envio, dá para usar `Cache-Control: private, max-age=86400`
com ETag baseado na chave.

### 4. Automação a cada minuto
`automation.tick()` roda a cada 60 s e, para **cada família vinculada**, consulta
a API do Asaas (paginada), além de checar a Evolution e fazer o *seed* sob a trava
global. As mensagens só são criadas após 9h e são deduplicadas por dia, então
consultar o Asaas a cada 10–15 min (e só após 9h) teria o mesmo resultado com
muito menos tráfego e conexões ocupadas (pool de 5).

### 5. Menos recarregamentos completos no navegador
Após cada ação o front-end recarrega o painel inteiro (`/api/dashboard`), que para
a equipe traz todos os projetos de todas as famílias. Com 10 famílias está ok;
ao crescer, paginar projetos concluídos e devolver o item alterado na própria
resposta da ação.

### 6. Upload em base64 dentro de JSON
Arquivos STL/3MF de até 10 MB viajam como base64 (+33%) e ficam inteiros na memória
(contêiner com 384 MB). Envio binário direto (ou URL assinada do Storage) reduz
tempo e memória.

### 7. Itens menores
- Banco: Supabase aponta 11 chaves estrangeiras sem índice e 8 índices nunca usados
  no schema `maker3d`. No tamanho atual não afeta a velocidade; revisar se o clube
  crescer.
- Segurança (não desempenho): o Supabase lista políticas RLS de tabelas do schema
  `public` (outros sistemas do projeto Emersoft) aplicáveis ao papel
  `maker3d_app` (provavelmente criadas `TO public`). Vale confirmar que
  `maker3d_app` não tem `GRANT` nessas tabelas.

## Publicação

Esta revisão não foi publicada. Não há migração de banco; é atualização de código
comum, seguindo `docs/DEPLOY_RAPIDO.md`.

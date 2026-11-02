# Publicação — Pedido de impressão por link de sites de modelos 3D

Publicada em 02/11/2026, por volta de 00:45, horário de Brasília (03:45 UTC).

- URL: https://maker3d.emersol.ai
- SHA implantado: `be8458eb2e37d276c8eac02cec0839b59a5bcd0a` (funcionalidade em `6299ff9` + correção do Dockerfile).
- Anterior: `02d38e44292e9afbedfdde403d8b1a4d87c07419`.
- Log: `/opt/maker3d/deploy-be8458eb2e37.log`; backup em `/opt/maker3d/backups/deploy-be8458eb2e37-20261102T034506Z`.
- Migração Supabase (projeto Emersoft, schema `maker3d`) aplicada **antes** do deploy:
  `maker3d_model_links` — tabela `model_links`, RLS só para `maker3d_app`, sem acesso de
  `anon`/`authenticated` (conferido). O `db.mjs` desta versão exige a tabela.

## Alteração

- Assistente de novo projeto: opção "Escolhi uma peça na internet". Aceita link de qualquer site;
  reconhece MakerWorld (com `#profileId`), Printables, Thingiverse, Cults3D e Thangs.
- O clube guarda só o link, os dados da peça e, quando o site permite, uma miniatura pequena no
  armazenamento privado. Nenhum STL/3MF é armazenado; a equipe baixa do site na hora de imprimir.
- Licença restritiva (não comercial, "Standard Digital File", etc.) ou não informada: a equipe
  precisa marcar "licença conferida" antes de preparar o orçamento. Fica registrado no histórico.
- Rotas: `POST /api/model-links/preview` (fora da transação do banco, limite de 30 buscas a cada
  10 minutos por usuário), `POST /api/projects/:id/license`, `GET /api/model-image/:id`.

## Busca automática a partir da produção (02/11/2026)

- Printables (API pública): 200 — título, autor, licença e miniatura preenchidos.
- Thingiverse e MakerWorld: 403 (Cloudflare). A família digita o nome da peça; o pedido segue igual.

## Incidente durante a publicação

A primeira tentativa (`6299ff9`) não passou no healthcheck do candidato: o `Dockerfile` copia os
módulos um a um e não incluía `models.mjs`. O script não ativou a versão; produção ficou em
`02d38e4` o tempo todo. Corrigido em `be8458e`. Ao criar um módulo `.mjs` na raiz, incluí-lo no
`COPY` do `deploy/Dockerfile`.

Observação: o Plesk recusa comandos acima de ~800 caracteres; bundles Git não passam. Como o
repositório é público, a release foi obtida com `git fetch https://github.com/EmersolEngenharia/clube-maker-3d.git <SHA>`.

## Verificação

- `npm test` e `npm run test:postgres`: 75 testes aprovados (novos: leitura de links, licenças,
  busca com falhas, fluxo completo do pedido por link com conferência da licença).
- QA local no navegador (desktop e celular): Printables preenchido automaticamente; MakerWorld com
  nome digitado; lista da equipe com miniatura e aviso; conferência da licença; sem erros no console.
- Externo: `/healthz` 200; HTTP 301 para HTTPS; SHA256 de app.js e brand.css igual ao commit;
  `/api/model-image/1` e `/api/model-links/preview` sem sessão retornam 401.
- Pedido real em produção não criado (sem dados de teste na base real).

## Rollback

Como root na VPS (a tabela nova pode ficar; a versão anterior não a usa):

```sh
cp -p /opt/maker3d/backups/deploy-be8458eb2e37-20261102T034506Z/version.env /etc/maker3d/version.env
ln -s /opt/maker3d/releases/02d38e44292e9afbedfdde403d8b1a4d87c07419 /opt/maker3d/current.rollback
mv -Tf /opt/maker3d/current.rollback /opt/maker3d/current
/opt/maker3d/service.sh up -d --no-build
```

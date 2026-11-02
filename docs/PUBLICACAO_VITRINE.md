# Publicação — Vitrine do clube

Publicada em 02/11/2026, por volta de 03:54, horário de Brasília (06:54 UTC).

- URL: https://maker3d.emersol.ai (menu "Vitrine do clube").
- SHA implantado: `a20fece7dc3415660870fd7384b6b2c96d72a9b1`.
- Anterior: `be8458eb2e37d276c8eac02cec0839b59a5bcd0a` (pedido por link).
- Log: `/opt/maker3d/deploy-a20fece7dc34.log`; backup em `/opt/maker3d/backups/deploy-a20fece7dc34-20261102T065330Z`.
- Migração Supabase (projeto Emersoft, schema `maker3d`) aplicada **antes** do deploy:
  `maker3d_gallery` — tabela `gallery_items`, RLS só para `maker3d_app`, sem acesso de
  `anon`/`authenticated` (conferido). O `db.mjs` desta versão exige a tabela.

## Alteração

- Página "Vitrine do clube" para famílias e equipe, com coleções, fotos reais, tempo e material da
  impressão, crédito ao autor do modelo e link para o site original. Nenhum STL/3MF é guardado.
- Equipe: "Levar para a vitrine" na página de um pedido pronto ou concluído (foto da peça; obrigatória
  quando o pedido não tem miniatura do site). A peça fica "Aguardando a família".
- Responsável: autoriza ou recusa, escolhe se aparece o primeiro nome do participante e pode tirar a
  peça da vitrine depois. O nome da família nunca aparece.
- Equipe também adiciona modelos testados por link (dados do Printables automáticos), edita, oculta e
  remove.
- "Quero um igual": abre o assistente já preenchido; o servidor copia link, dados, miniatura e a
  licença conferida da peça da vitrine (não confia no link enviado pelo navegador).
- Rotas: `GET/POST /api/gallery`, `POST /api/gallery/:id/(authorize|edit|visibility|remove)`,
  `GET /api/gallery-image/:id/(photo|site)`.

## Verificação

- `npm test` e `npm run test:postgres`: 76 testes aprovados (novo: autorização da família, privacidade
  entre famílias, curadoria, "Quero um igual" com licença herdada, ocultar/remover).
- QA local no navegador: equipe levou pedido pronto à vitrine; responsável autorizou com o primeiro
  nome; "Quero um igual" criou o pedido com licença já conferida; largura de celular sem rolagem
  lateral; sem erros no console. Capturas de tela não foram possíveis (janela em segundo plano).
- Externo: `/healthz` 200; HTTP 301 para HTTPS; SHA256 de app.js, gallery.js, features.js e brand.css
  igual ao commit; `/api/gallery` e `/api/gallery-image/1/photo` sem sessão retornam 401.
- Nenhuma peça real criada na vitrine de produção.

## Rollback

Como root na VPS (a tabela nova pode ficar; a versão anterior não a usa):

```sh
cp -p /opt/maker3d/backups/deploy-a20fece7dc34-20261102T065330Z/version.env /etc/maker3d/version.env
ln -s /opt/maker3d/releases/be8458eb2e37d276c8eac02cec0839b59a5bcd0a /opt/maker3d/current.rollback
mv -Tf /opt/maker3d/current.rollback /opt/maker3d/current
/opt/maker3d/service.sh up -d --no-build
```

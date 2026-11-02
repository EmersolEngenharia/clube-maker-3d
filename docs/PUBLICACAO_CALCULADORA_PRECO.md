# Publicação — Calculadora de preço

Publicada em 02/11/2026 pelo Emerson (script Plesk preparado nesta sessão, senha digitada por ele).

- URL: https://maker3d.emersol.ai — menu "Calculadora de preço" (famílias: Descobrir; equipe: Educação e marketing).
- SHA implantado: `92ae2934d8be82b489b8c9e20b0062e3cacd85eb` (anterior `5f94da9b0b60adffb34c57e73868183b303e09cf`).
- Log: `/opt/maker3d/deploy-92ae2934d8be.log`; backup em `/opt/maker3d/backups/deploy-92ae2934d8be-*`.
- Sem migração e sem dados salvos: o cálculo roda só no navegador.

## Alteração

- Novo `public/pricing.js` (incluído em `index.html`, `server.mjs` e na checagem de assets do `deploy-release.sh`).
- Custo por peça = horas de impressão × valor da hora (padrão: hora extra do clube) + horas de trabalho
  × valor da hora do maker (padrão R$ 15) + material (g × R$/kg do material cadastrado) + 20% de reserva
  sobre o material + outros custos.
- Lucro sobre o custo conforme a personalização: modelo pronto 100%, toque pessoal 150%, adaptada 200%,
  criação exclusiva 300%; ajuste fino com mínimo de 100%. Preço arredondado para cima até ,90.
- "Copiar orçamento" gera texto para o cliente (sem custos).

## Verificação

- `npm test` e `npm run test:postgres`: 77 testes aprovados.
- QA local (desktop e celular): cálculos conferidos à mão, troca de nível atualiza o lucro, sem erros de CSP.
- Externo: `/healthz` 200; HTTP 301 para HTTPS; SHA256 de pricing.js, app.js, features.js e styles.css
  igual ao commit; `index.html` serve `/pricing.js?v=<hash>`.

## Rollback

Como root na VPS:

```sh
cp -p /opt/maker3d/backups/deploy-92ae2934d8be-*/version.env /etc/maker3d/version.env
ln -s /opt/maker3d/releases/5f94da9b0b60adffb34c57e73868183b303e09cf /opt/maker3d/current.rollback
mv -Tf /opt/maker3d/current.rollback /opt/maker3d/current
/opt/maker3d/service.sh up -d --no-build
```

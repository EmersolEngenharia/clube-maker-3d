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

## Atualização — horas decimais como no MakerWorld (02/11/2026)

- SHA implantado: `c391a5938c3fb14140e8e630ac3eebf6dbff6bc6` (anterior `92ae293`). Sem migração.
- Horas de impressão e de trabalho aceitam decimal (1,2 h = 1h12), minutos opcionais; ajuda indica
  onde ler tempo e gramas no MakerWorld/Bambu Studio e pede para somar as placas.
- Log: `/opt/maker3d/deploy-c391a5938c3f.log`. Verificado: 77 testes; QA local com 1,2 h e 32 g
  (R$ 37,90 como modelo pronto); `/healthz` 200; HTTP 301; SHA256 de pricing.js, app.js e styles.css
  igual ao commit. Rollback: procedimento acima, apontando para o release `92ae293…` e o backup
  `deploy-c391a5938c3f-*`.

## Atualização — tela compacta e material puro separado (02/11/2026)

- SHA implantado: `04fb7ce12d5f7a6ee62d900624594e0f22d1ec1c` (anterior `c391a59`). Sem migração.
- 4 passos retráteis com subtotal no título (duas colunas a partir de 1200 px; fechados no celular,
  com barra fixa de preço). Unidades dentro dos campos e dicas de MakerWorld/preço por kg.
- Resultado em blocos Tempo / Material (material puro g × R$/kg, reserva de 20%) / totais; pedido com
  várias peças mostra também o material puro total. Faixa da cota escondida nesta página.
- Log: `/opt/maker3d/deploy-04fb7ce12d5f.log`. Verificado: 77 testes; QA local em 1586×860 (cabe sem
  rolar) e 375×812, tema escuro; externo: um 502 isolado logo após a troca e depois `/healthz` 200
  por 1 min seguido; SHA256 de pricing.js, app.js e styles.css igual ao commit. Rollback: procedimento
  acima, apontando para o release `c391a59…` e o backup `deploy-04fb7ce12d5f-*`.

## Atualização — ícones, interruptores e orçamento em imagem (04/11/2026)

- SHA implantado: `01c72d47e2760e12b92626de504d73bbb59f7064` (funcionalidade em `c1148f1`; anterior `04fb7ce`). Sem migração.
- Primeira publicação automática por `scripts/publicar.sh` via Tailscale SSH. Backup `deploy-01c72d47e276-20261104T042528Z`.
- Verificado: 77 testes; `DEPLOY_EXIT=0`; externo `/healthz` 200, HTTP 301, SHA256 dos assets igual ao commit.

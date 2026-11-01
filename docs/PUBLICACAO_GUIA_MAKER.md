# Publicação — Guia do Maker

Publicada em 01/11/2026, por volta de 12:35, horário de Brasília (15:34 UTC).

- URL: https://maker3d.emersol.ai — guia em https://maker3d.emersol.ai/guia-impressao-3d.html
- SHA implantado: `8c62c039249ccf77822cb3e526b02b6b00e707bd`.
- Anterior: `dc3902ace045888f3c404cf9c647d00bf584f204`.
- Log da implantação: `/opt/maker3d/deploy-8c62c039249c.log`; backup em `/opt/maker3d/backups/deploy-8c62c039249c-20261101T153437Z`.
- Sem migração, nem alteração de contas, bucket, proxy ou credenciais.

## Alteração

- `public/guia-impressao-3d.html`: guia independente (pode ser baixado e funciona offline) com formatos
  de arquivo, sites de modelos gratuitos, programas de modelagem e fatiadores, com links oficiais.
- Página **Aprender**: bloco "Guia do Maker" com links resumidos e botões para abrir ou baixar o HTML.
- `server.mjs`: serve o guia com CSP própria. O estilo inline é permitido por hash SHA-256 calculado
  na inicialização; não há scripts.

## Verificação

- `npm test` e `npm run test:postgres`: 69 testes aprovados em cada um.
- Commit enviado como git bundle pelo Plesk e conferido com `rev-parse` antes do deploy.
- Externo: `/healthz` 200; HTTP 301 para HTTPS; guia 200 com CSP por hash, estilo aplicado e sem
  erros no console; SHA256 do guia, de `app.js` e de `brand.css` igual ao commit e ao `?v=` do HTML.

## Rollback

Como root na VPS:

```sh
cp -p /opt/maker3d/backups/deploy-8c62c039249c-20261101T153437Z/version.env /etc/maker3d/version.env
ln -s /opt/maker3d/releases/dc3902ace045888f3c404cf9c647d00bf584f204 /opt/maker3d/current.rollback
mv -Tf /opt/maker3d/current.rollback /opt/maker3d/current
/opt/maker3d/service.sh up -d --no-build
```

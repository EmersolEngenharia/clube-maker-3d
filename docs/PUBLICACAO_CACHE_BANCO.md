# Publicação — menos idas ao banco e cache de assets

Publicada em 01/11/2026 às 09:59, horário de Brasília.

- URL: https://maker3d.emersol.ai
- SHA implantado: `494c3d4203ca4a33c1ecb63b197765f671cc30d4`.
- Anterior: `868ab31bd87de17efe4484c520f1d81361957761`.
- Backup: `/opt/maker3d/backups/deploy-494c3d4203ca-20261101T125921Z`.
- Não há migração, alteração de dados, contas, bucket, proxy ou credenciais.

## Alteração

Detalhes e medições em `docs/AUDITORIA_DESEMPENHO.md`. Saldo de horas e detalhe do
projeto leem em uma consulta; a visão da automação lê em lote; o pool mantém uma
conexão quente com o banco remoto. O `index.html` referencia os assets com `?v=<hash>`,
servidos com `Cache-Control: public, max-age=31536000, immutable`; a URL sem versão
continua com revalidação.

## Verificação

- `npm test`: 63 testes aprovados localmente antes da publicação.
- Candidata em porta loopback com runtime existente: healthcheck e comparação dos assets
  aprovados antes da troca. Resets de conexão nos primeiros segundos da candidata foram
  transitórios.
- Contêiner `maker3d-app-1` saudável com a imagem `maker3d:494c3d4…`.
- Externo: `/healthz` e página com HTTPS 200; HTTP 301 para HTTPS; título e favicon
  corretos. SHA256 de brand.css, brand-icon.svg, favicon.svg, app.js, features.js,
  operations.js, billing.js, styles.css e themes.css igual aos arquivos do commit, e
  igual ao `?v=` publicado no HTML. Asset versionado retornou cache imutável.
- Login renderizado em desktop e celular, sem erros no console. Nenhuma operação real.

## Rollback

Como root na VPS:

```sh
cp -p /opt/maker3d/backups/deploy-494c3d4203ca-20261101T125921Z/version.env /etc/maker3d/version.env
ln -s /opt/maker3d/releases/868ab31bd87de17efe4484c520f1d81361957761 /opt/maker3d/current.rollback
mv -Tf /opt/maker3d/current.rollback /opt/maker3d/current
/opt/maker3d/service.sh up -d --no-build
```

Conferir contêiner saudável e HTTPS. Não alterar banco, contas ou anexos. Commits
posteriores apenas de documentação não mudam o SHA da imagem implantada.

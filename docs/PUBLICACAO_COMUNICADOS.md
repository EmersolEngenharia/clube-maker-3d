# Publicação — Comunicados por WhatsApp

Publicada em 01/11/2026, por volta de 12:20, horário de Brasília.

- URL: https://maker3d.emersol.ai
- SHA implantado: `dc3902ace045888f3c404cf9c647d00bf584f204`.
- Anterior: `494c3d4203ca4a33c1ecb63b197765f671cc30d4`.
- Log da implantação: `/opt/maker3d/deploy-dc3902ace045.log`; backup em `/opt/maker3d/backups/deploy-dc3902ace045-*`.
- Migração Supabase (projeto Emersoft, schema `maker3d`) aplicada **antes** do deploy:
  `20261101120000_maker3d_whatsapp_broadcasts` — tabelas `broadcasts` e `broadcast_deliveries`,
  RLS só para `maker3d_app`, sem acesso de `anon`/`authenticated`. O `db.mjs` desta versão
  exige essas tabelas na inicialização.
- Sem alteração de contas, bucket, proxy ou credenciais.

## Alteração

Menu **Comunicados**, visível só ao primeiro administrador (id 1, conta do Emerson, conferido no
banco). Texto, foto, vídeo ou PDF (até 10 MB) para responsáveis principais, todos ou escolhidos;
fila com intervalo de 3 s, histórico por pessoa, nova tentativa conferida e cancelamento.
Detalhes em `docs/WHATSAPP.md`.

## Verificação

- `npm test` e `npm run test:postgres`: 69 testes aprovados em cada antes da publicação.
- O `git fetch origin main` no release ativo falhou (remoto sem `main`); o commit foi enviado
  como git bundle dentro do script Plesk e conferido com `rev-parse` antes do deploy.
- Externo: `/healthz` 200; HTTP 301 para HTTPS; título correto; SHA256 de messages.js, app.js,
  features.js e brand.css igual ao commit e ao `?v=` do HTML. `/api/messages` sem sessão
  retorna 401. Tela de login renderizada sem erros no console.
- Envio real de foto/vídeo pela Evolution ainda não testado.

## Rollback

Como root na VPS (o backup tem o `version.env` anterior):

```sh
cp -p /opt/maker3d/backups/deploy-dc3902ace045-*/version.env /etc/maker3d/version.env
ln -s /opt/maker3d/releases/494c3d4203ca4a33c1ecb63b197765f671cc30d4 /opt/maker3d/current.rollback
mv -Tf /opt/maker3d/current.rollback /opt/maker3d/current
/opt/maker3d/service.sh up -d --no-build
```

As tabelas novas podem ficar; a versão anterior não as usa.

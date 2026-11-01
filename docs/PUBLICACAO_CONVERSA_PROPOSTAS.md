# Publicação — Conversa com imagens e propostas para aceite

Publicada em 01/11/2026, por volta de 17:27, horário de Brasília (20:27 UTC).

- URL: https://maker3d.emersol.ai
- SHA implantado: `02d38e44292e9afbedfdde403d8b1a4d87c07419`.
- Anterior: `4f5c8bf372f85e2d06cc2a0110725b473ebec32e`.
- Log da implantação: `/opt/maker3d/deploy-02d38e44292e.log`; backup em `/opt/maker3d/backups/deploy-02d38e44292e-20261101T202707Z`.
- Migração Supabase (projeto Emersoft, schema `maker3d`) aplicada **antes** do deploy:
  `20261101200000_maker3d_project_message_extras` — tabela `message_extras`, RLS só para
  `maker3d_app`, sem acesso de `anon`/`authenticated` (conferido). O `db.mjs` desta versão exige a tabela.

## Alteração

- Conversa do projeto: mensagens podem levar uma imagem (JPG, PNG ou WebP, até 10 MB), verificada pelo conteúdo.
- A equipe pode marcar "Pedir o aceite do responsável". O projeto passa a "Precisamos de você"; o
  responsável vê **Aceitar proposta** ou **Pedir ajuste** (com texto obrigatório). Respondidas as
  propostas pendentes, o projeto volta para avaliação.
- Mensagens da equipe avisam o responsável principal pelo WhatsApp, com a imagem, pela fila dos
  Comunicados (aparecem também no histórico de Comunicados).
- Imagens servidas em `/api/message-media/:id` somente para quem tem acesso ao projeto.

## Verificação

- `npm test` e `npm run test:postgres`: 71 testes aprovados em cada um (novos: aceite/recusa,
  permissões, imagem inválida, aviso só ao responsável principal).
- QA local: equipe enviou proposta com imagem; responsável viu a imagem e os botões e aceitou;
  projeto voltou para avaliação; menu das famílias conferido; sem erros no console.
- Externo: `/healthz` 200; HTTP 301 para HTTPS; SHA256 de app.js e brand.css igual ao commit e ao
  `?v=`; `/api/message-media/1` sem sessão retorna 401.
- Envio real pelo WhatsApp não testado em produção.

## Rollback

Como root na VPS (a tabela nova pode ficar; a versão anterior não a usa):

```sh
cp -p /opt/maker3d/backups/deploy-02d38e44292e-20261101T202707Z/version.env /etc/maker3d/version.env
ln -s /opt/maker3d/releases/4f5c8bf372f85e2d06cc2a0110725b473ebec32e /opt/maker3d/current.rollback
mv -Tf /opt/maker3d/current.rollback /opt/maker3d/current
/opt/maker3d/service.sh up -d --no-build
```

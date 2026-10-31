# Atualizar para 0.3.0

## Computador local (SQLite)

1. Pare o servidor e faça backup consistente de toda a pasta `data/`.
2. Atualize os arquivos do projeto, preservando a pasta `data/` e as configurações.
3. Execute `npm ci` e `npm start` com Node.js 24 ou superior.
4. As tabelas e índices novos de `db/extensions.sql` são criados automaticamente.
   Famílias, contas, senhas e histórico existentes são mantidos.

## PostgreSQL / Supabase / VPS

A migração preparada é
`supabase/migrations/20261031081259_maker3d_profiles_publications_and_invites.sql`.
Ela cria sete tabelas privadas e índices, com RLS e grants para `maker3d_app`.
Não reaplique a migração inicial que cria o schema.

1. Faça backup do banco e confirme o projeto/schema de destino (`maker3d`).
2. Aplique a nova migração pelo processo de migrations do projeto, como proprietário
   do schema, em uma transação. Não conceda DDL ao usuário de runtime.
3. Construa a imagem com o Dockerfile atualizado e implante a versão 0.3.0.
4. Preserve `PUBLIC_ORIGIN`, cookies HTTPS, papel dedicado e bucket privado.
5. Valide cadastro, login, foto, vídeo, proteção entre famílias, aprovação de
   orçamento e reprodução de mídia atrás do proxy real.

O bucket existente aceita `application/octet-stream`, que continua sendo o tipo
de upload do adaptador. O backend valida o conteúdo e responde com o tipo correto
somente após autorização. O limite de 10 MB por objeto continua compatível.

A aplicação recusa iniciar em PostgreSQL quando detecta ausência das tabelas-base
da atualização. Nenhuma migração remota ou implantação foi feita nesta entrega.

## Fluxos novos para conferir

- **Meu perfil:** escolha tema/avatar, salve e recarregue; a preferência deve voltar.
- **Famílias:** edite nome/plano/franquia; cadastre e desative participantes.
- **Equipe:** promova um membro, confirme a revogação da sessão anterior e entre
  novamente. A pessoa deve manter acesso à família e ganhar operações da equipe.
- **Convidar famílias:** gere um link, abra em outra sessão e complete a inscrição.
- **Quero que poste…:** aprendiz envia → responsável autoriza → equipe aprova.
  Alterar o conteúdo deve exigir nova revisão. Não há integração social ativa.
- **Minha cota:** confira franquia compartilhada, extras, filamento e CSV mensal.

## Testes

```bash
npm test
npm run test:postgres
PLAYWRIGHT_MODULE=/caminho/playwright/index.mjs node scripts/browser-smoke.mjs
PLAYWRIGHT_MODULE=/caminho/playwright/index.mjs node scripts/browser-features.mjs
```

Os dois testes de navegador precisam de Chromium. O teste de novos recursos usa
FFmpeg para gerar um vídeo curto real, bases descartáveis e a porta 3181.
`CHROMIUM_PATH` e `QA_OUTPUT` permitem escolher o navegador e a pasta de capturas
(padrão: `work/previews`).

## Reversão

Como a atualização é aditiva, o código anterior continua entendendo suas tabelas
originais. Em uma reversão de código, os recursos novos ficam indisponíveis e seus
dados permanecem nas tabelas adicionadas. Não remova tabelas como parte de uma
reversão de interface. Restauração de banco deve seguir o backup da operação.

# Prompt para publicar o Clube Maker 3D no Plesk

Você é o agente responsável pela implantação. Publique o Clube Maker 3D em
**https://maker3d.emersol.ai** na VPS Plesk indicada abaixo. O usuário autorizou a
publicação. Faça as verificações e continue até comprovar o funcionamento ou
identificar uma dependência concreta de acesso. Não é necessário redesenhar o portal.

## Destino e fonte

- VPS Contabo: **185.215.180.60**, `vmi2823713`, identificada como “Servidor 1 — Sites Plesk”.
- Tailscale informado pelo usuário: `srv-plesk` / `100.100.10.64`. Use apenas se seu
  ambiente já tiver acesso autorizado; não altere a configuração da VPN.
- Domínio: **maker3d.emersol.ai**. O registro A já foi verificado apontando para a VPS.
- Repositório: **https://github.com/EmersolEngenharia/clube-maker-3d**, branch `main`.
  Registre o SHA implantado e leia README.md e este documento da versão baixada.
- Supabase: projeto **Emersoft**, ref **hzsuckglbihyraaotzba**, região São Paulo.
- Preserve todos os sites, bancos, serviços, certificados e configurações existentes.
  Não troque portas globais, não remova aplicações e não substitua configurações
  geradas pelo Plesk. Faça backup de qualquer configuração específica que editar.

## O que já está pronto

O portal tem área da equipe e da família, convites, pedidos, anexos, orçamentos,
aprovação, fila, saldo de horas e pagamentos manuais. A autenticação é própria do
backend; não altere usuários ou configurações de Supabase Auth do Emersoft.

A migração **20261030181544_maker3d_private_schema_and_storage** já está aplicada
no Supabase. **Não reaplique** `db/postgres.sql` nem a migração inicial. Ela criou:

- Schema privado `maker3d` com 11 tabelas, índices e RLS.
- Papel `maker3d_app`, sem bypass de RLS, ainda sem login/senha de runtime.
- Bucket privado `maker3d-projects`, limite de 10 MB por arquivo.
- Nenhum acesso ao schema para `anon` ou `authenticated`.

Não altere tabelas `public` nem buckets de outros sistemas.

## Implantação

1. Inspecione o Plesk, a assinatura de `emersol.ai`, o proxy existente, os serviços
   e a disponibilidade de Docker. Confirme que `127.0.0.1:3183` está livre.
2. Crie somente o subdomínio/site `maker3d.emersol.ai` na assinatura correta.
   Configure certificado Let's Encrypt e redirecionamento HTTP → HTTPS usando o
   gerenciamento de certificados do Plesk, sem substituir certificados dos outros sites.
3. Preferência: Docker Compose do repositório (`deploy/compose.yml`). O serviço
   publica somente `127.0.0.1:3183`, reinicia automaticamente e tem healthcheck.
   Prepare um diretório próprio para o checkout e mantenha uma referência de rollback.
   Se Docker não estiver disponível, utilize Node.js 24+ com serviço dedicado sob
   usuário sem privilégios. Não instale/reconfigure componentes globais sem avaliar
   impacto nos sites existentes. Não adapte o portal para hospedagem PHP ou estática.
4. Prepare `/etc/maker3d/runtime.env`, acessível somente ao administrador, fora do
   repositório. Use `.env.example` como referência e preencha:
   - `DATABASE_URL`: Session pooler do Supabase, usando o papel **maker3d_app**.
     Copie o host real em Supabase → Emersoft → Connect; não adivinhe o host.
     No pooler, o usuário normalmente é `maker3d_app.hzsuckglbihyraaotzba`.
     Codifique caracteres especiais da senha na URL. TLS deve validar o certificado.
   - `SUPABASE_URL=https://hzsuckglbihyraaotzba.supabase.co`.
   - `SUPABASE_SECRET_KEY`: chave de servidor, preferencialmente dedicada ao app.
     Use um segredo já autorizado ou obtenha-o por canal seguro. Não use chave
     publishable/anon para este backend e não exponha a chave no navegador.
   - `SUPABASE_STORAGE_BUCKET=maker3d-projects`.
   O Compose já configura origem HTTPS, modo PostgreSQL, cookies Secure e proxy.
   Se precisar do CA do banco, monte o certificado no contêiner e informe
   `DATABASE_CA_FILE`; nunca use `rejectUnauthorized=false`.
5. Provisione a senha do papel dedicado sem rotacionar a senha do banco principal.
   O script `scripts/provision-database.mjs` usa `DATABASE_ADMIN_URL` e
   `MAKER_DATABASE_PASSWORD` (24+ caracteres), fornecidos em arquivo de ambiente
   temporário, privado. Ele habilita somente o papel existente maker3d_app e recusa
   alterar uma conta já habilitada. Nunca imprima ou coloque senhas na linha de comando.
   Remova os segredos temporários após usar. A conta admin do banco serve somente
   para esse provisionamento; o runtime exige o papel dedicado.
6. Execute `npm ci` e os testes, ou faça isso no checkout de preparação. Construa a
   imagem: `docker compose -f deploy/compose.yml build`. Para provisionar antes de
   iniciar, use `docker run --rm --env-file /etc/maker3d/provision.env
   maker3d:local node scripts/provision-database.mjs` (ajuste a tag da imagem).
   O arquivo temporário contém DATABASE_ADMIN_URL e MAKER_DATABASE_PASSWORD;
   use somente seu caminho em argumentos, nunca os valores dos segredos.
   Em seguida: `docker compose -f deploy/compose.yml up -d`.
7. Crie a conta inicial com `scripts/bootstrap-admin.mjs`, usando
   `MAKER_ADMIN_EMAIL`, `MAKER_ADMIN_NAME` e `MAKER_ADMIN_PASSWORD` em ambiente
   temporário privado. Combine os dados com o proprietário por canal seguro. Não
   use senha padrão e não a publique em logs ou no GitHub. O endpoint web de
   configuração inicial é desativado em produção. O script não altera contas existentes.
8. No vhost **desse subdomínio**, configure o encaminhamento a `http://127.0.0.1:3183`
   usando um mecanismo suportado pelo Plesk (extensão Docker/proxy ou diretivas por
   domínio). Preserve `Host` e sobrescreva `X-Real-IP` com o IP real da conexão.
   Não duplique blocos `location /` gerados pelo Plesk. O arquivo
   `deploy/nginx-http.conf` é somente uma referência genérica — não o copie por cima
   dos arquivos gerados. Valide a configuração antes de recarregar o proxy.
   Limite de corpo HTTP: **15 MB**, pois arquivos de 10 MB são enviados em base64.

## Validação e entrega

- Verifique `https://maker3d.emersol.ai/healthz` e a página inicial por HTTPS.
- Confirme o certificado, cookies HttpOnly/Secure e ausência de segredos no frontend.
- Faça um teste controlado: entrar como equipe, convidar uma família de teste,
  criar projeto, anexar arquivo no bucket privado, preparar e aprovar orçamento.
  Não acione impressora nem registre pagamentos reais para testar.
- Confirme que outra família não consegue ler o projeto/anexo.
- Confirme que recarregar/reiniciar a aplicação preserva os dados no Supabase.
- Inspecione logs de erro, healthcheck e os sites preexistentes após a alteração.
- Registre URL, SHA implantado, diretório, nome do serviço e procedimento de rollback.
  Rollback de código não deve apagar schema/bucket/dados do Supabase.
- Não afirme que está publicado sem testar o endereço externo. Se faltar acesso
  administrativo, segredo ou DNS, informe exatamente o que falta; não substitua
  credenciais, não reconfigure o Emersoft e não exponha o banco para contornar o bloqueio.

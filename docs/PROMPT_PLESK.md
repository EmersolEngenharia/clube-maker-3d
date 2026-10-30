# Prompt reutilizável — publicação e atualização do Clube Maker 3D

Atualizado em 30/10/2026. Este guia não contém segredos. Confira o estado real da VPS antes de executar; os SHAs abaixo são referências históricas.

## Prompt para colar em outra conversa

> Publique ou atualize o Clube Maker 3D em https://maker3d.emersol.ai, na VPS Plesk 185.215.180.60, com o código da branch main de https://github.com/EmersolEngenharia/clube-maker-3d. Leia integralmente docs/PROMPT_PLESK.md e README.md da versão baixada. A aplicação já foi publicada: preserve contas, famílias, projetos, anexos, segredos e os demais sites da VPS. Não reaplique a migração inicial, não refaça a conta inicial e não redefina a senha principal do banco. Faça backup da configuração específica, preserve uma versão para rollback, teste a versão candidata, publique e valide externamente por HTTPS. Não imprima credenciais. Se houver uma dependência concreta de acesso, informe exatamente o que falta. Entregue URL, SHA efetivamente implantado, resultado das verificações e procedimento de rollback.

Este documento orienta a execução de pedidos autorizados na conversa atual; não concede autorização independente para publicar, alterar permissões ou compartilhar dados.

## 1. Destino e estado conhecido

| Item | Referência |
| --- | --- |
| Portal | https://maker3d.emersol.ai |
| VPS | 185.215.180.60, vmi2823713, Servidor 1 — Sites Plesk |
| Plesk | https://plesk.emersol.ai:8443 |
| Assinatura | emersol.ai |
| Sistema observado | Ubuntu 22.04, Plesk Obsidian, Docker e Docker Compose |
| Fonte | EmersolEngenharia/clube-maker-3d, branch main |
| Versões | /opt/maker3d/releases/<SHA> |
| Versão selecionada | /opt/maker3d/current, link para o checkout |
| Comando de operação | /opt/maker3d/service.sh |
| Projeto / serviço Compose | maker3d / app |
| Contêiner | maker3d-app-1 |
| Porta | somente 127.0.0.1:3183 |
| Segredos | /etc/maker3d/runtime.env, root, modo 600 |
| Diretório de segredos | /etc/maker3d, root, modo 700 |
| Seleção de imagem | /etc/maker3d/version.env, variável MAKER3D_VERSION |
| Complemento Compose | /etc/maker3d/compose-runtime.yml |
| CA pública do banco | /etc/maker3d/supabase-ca.crt |
| Backups | /opt/maker3d/backups/ |
| Registro operacional | /opt/maker3d/deployment.txt e /opt/maker3d/DEPLOYMENT.md |

Última versão funcional publicada nesta operação: `6990ef237bbcba32a08a6a4736d05aee0eb2902d`. A anterior, `f55bbfe852453ece5163c80a2079418a97e1efd0`, também foi preservada. Leia a versão real na VPS antes de atualizar. Commits posteriores podem alterar somente documentação e ainda não estar implantados.

O portal aceita senhas de **6 a 200 caracteres**, sem exigir símbolos ou maiúsculas. Isso vale para contas do portal, não para credenciais técnicas. Uma reversão à regra antiga de 10/14 caracteres pode impedir o login de contas novas com senhas mais curtas.

## 2. Acesso e segredos

- Reutilize acesso administrativo autorizado. O registro de infraestrutura no Notion chama-se **Servidor 1 - Sites | Plesk**, dentro de **Servidores**. Consulte somente se a conexão estiver disponível e o acesso fizer parte do pedido. Não copie credenciais para respostas ou documentos.
- SSH por chave recusado não comprova ausência de acesso. Confira usuário e método autorizado. Senhas existentes podem ser fornecidas por entrada oculta ou arquivo privado; nunca como argumento de comando ou em logs.
- Verifique a identidade do host SSH. Não desative a verificação do host ou dos certificados.
- Tailscale informado anteriormente: srv-plesk / 100.100.10.64. Use apenas se já houver acesso; não reconfigure VPN.
- Preserve runtime.env. Não imprima seu conteúdo, não execute env/docker inspect sem selecionar campos e não capture telas contendo chaves.
- Se faltar segredo, peça arquivo privado ou entrada segura, não texto na conversa. Em Windows, restrinja o arquivo ao usuário proprietário.
- A conta inicial já existe. Não execute bootstrap nem altere contas em uma atualização comum.

## 3. Inspecionar e preparar

1. Leia README e este documento. Registre o SHA candidato de main, o SHA executado, a imagem e o destino atual do link current.
2. Confira `/opt/maker3d/service.sh ps`, logs recentes e healthcheck. A porta 3183 deve pertencer ao Maker 3D existente; procure porta livre somente em instalação realmente nova.
3. Confira assinatura, subdomínio, certificado e proxy. Não recrie o site quando ele já existir.
4. Registre respostas HTTP/HTTPS dos outros sites para comparar depois, incluindo falhas preexistentes.
5. Faça backup apenas da configuração afetada: version.env, destino de current, complemento Compose e, se houver alteração de proxy, diretivas específicas do subdomínio. Guarde em pasta exclusiva sob backups, modo 700.
6. Use checkout novo em `/opt/maker3d/releases/<SHA>`. Não modifique a versão ativa e não copie segredos para o checkout. Confirme o SHA após baixar.
7. Com Node.js 24+, execute em preparação `npm ci`, `npm test` e `npm run test:postgres`. As suítes usam bases temporárias; não as aponte ao banco real.
8. Construa a imagem com o SHA e confirme sucesso antes de trocar a versão:

```sh
cd /opt/maker3d/releases/<SHA_CANDIDATO>
docker build -t maker3d:<SHA_CANDIDATO> -f deploy/Dockerfile .
```

Substitua os marcadores `<...>` pelos valores conferidos; não os execute literalmente. Preserve imagens/checkouts anteriores. Não limpe Docker nem reconfigure componentes globais para atualizar este portal.

## 4. Publicar a atualização

O wrapper service.sh executa o Compose do checkout selecionado, usando o projeto maker3d, version.env e compose-runtime.yml. Esse complemento monta a CA do banco somente para leitura.

1. Preserve imagem anterior, destino anterior de current e cópia de version.env.
2. Defina `MAKER3D_VERSION=<SHA_CANDIDATO>` em version.env; mantenha root/modo 600.
3. Aponte current ao checkout candidato. Prefira link temporário e renomeação atômica dentro de /opt/maker3d. Verifique caminhos completos antes de substituir o link; não mova/apague releases.
4. Execute:

```sh
/opt/maker3d/service.sh up -d --no-build
/opt/maker3d/service.sh ps
```

5. Aguarde o healthcheck. A primeira inicialização pode levar segundos; uma única conexão recusada nesse intervalo não comprova falha permanente. Se não estabilizar, inspecione logs e reverta conforme necessário.
6. Atualize deployment.txt e DEPLOYMENT.md com versões anterior/nova e verificações concluídas.

Operação posterior:

```sh
/opt/maker3d/service.sh ps
/opt/maker3d/service.sh logs --tail 100 app
/opt/maker3d/service.sh restart app
```

Atualização comum não exige recriar contas, trocar segredos, modificar proxy ou pedir novo certificado.

## 5. Supabase existente — preservar

- Projeto **Emersoft**, ref hzsuckglbihyraaotzba, região São Paulo.
- Migração **20261030181544_maker3d_private_schema_and_storage** já aplicada: 11 tabelas no schema privado maker3d, índices, RLS e papel dedicado maker3d_app. Não reaplique db/postgres.sql nem a migração inicial.
- O papel já tem login e senha no runtime.env. Não reexecute provisionamento nem altere sua senha durante atualizações.
- Bucket maker3d-projects privado, limite de 10 MiB por arquivo. Não modifique outros buckets ou tabelas public.
- Autenticação própria do backend; não altere Supabase Auth do Emersoft.
- Runtime usa Session pooler com usuário maker3d_app.hzsuckglbihyraaotzba. Host consultado no painel: aws-0-sa-east-1.pooler.supabase.com:5432, banco postgres. Se reconstruir a conexão, confira no painel Connect; não adivinhe o host pela região.
- SUPABASE_SECRET_KEY deve ser chave de servidor autorizada. A legacy service_role funciona; anon/publishable não serve para este backend. A chave fica somente no servidor.
- TLS valida certificado. DATABASE_CA_FILE=/run/secrets/supabase-ca.crt; o complemento Compose monta a CA pública nesse caminho, somente para leitura. Nunca use rejectUnauthorized=false.
- A CA oficial foi obtida pelo botão Download certificate em Database Settings: https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt . Confirme a fonte atual antes de substituir o certificado.

### Se realmente for necessária uma reconstrução

Recupere primeiro runtime.env de um backup autorizado. Não redefina a senha principal do banco para contornar falta de acesso.

Somente para um papel ainda sem login, scripts/provision-database.mjs exige DATABASE_ADMIN_URL e MAKER_DATABASE_PASSWORD de 24+ caracteres em ambiente temporário privado. O script recusa alterar conta já habilitada. Monte a CA e configure DATABASE_CA_FILE também nessa execução. Remova o ambiente temporário ao terminar.

Na primeira implantação, a senha administrativa fornecida foi recusada. A alternativa usada foi a conexão administrativa Supabase já autorizada: habilitou somente o papel existente, com as mesmas verificações (existe, sem login, sem bypass de RLS) e um verificador SCRAM gerado para senha aleatória exclusiva. Nenhuma senha principal foi rotacionada. Não repita isso para papel já habilitado.

scripts/bootstrap-admin.mjs só serve quando não há contas e recusa sobrescrevê-las. Se realmente necessário, combine nome/e-mail/senha inicial por canal privado e remova o ambiente temporário. Não há senha padrão. Nunca use a conta administrativa do banco como runtime.

## 6. Plesk, certificado e proxy

O subdomínio já existe na assinatura emersol.ai, com certificado Let's Encrypt próprio gerenciado pelo Plesk e redirecionamento HTTP → HTTPS. Não substitua certificados dos outros sites.

Configuração validada: Nginx gerado pelo Plesk recebe HTTPS e encaminha ao Apache; preserva Host e sobrescreve X-Real-IP com o IP real da conexão. As diretivas Apache exclusivas desse subdomínio ficam em `/var/www/vhosts/system/maker3d.emersol.ai/conf/vhost.conf` e `vhost_ssl.conf`:

```apache
ProxyPreserveHost On
ProxyPass / http://127.0.0.1:3183/ connectiontimeout=5 timeout=60
ProxyPassReverse / http://127.0.0.1:3183/
LimitRequestBody 15728640
```

O limite de 15 MiB acomoda arquivos de 10 MiB enviados em base64. Não copie deploy/nginx-http.conf sobre arquivos gerados pelo Plesk e não duplique location /.

Se precisar alterar as diretivas, faça backup específico e confira as opções da versão instalada. Nesta implantação, a regeneração sem recarga e os testes foram:

```sh
/usr/local/psa/admin/sbin/httpdmng --reconfigure-domain maker3d.emersol.ai -no-restart
apache2ctl configtest
nginx -t
```

Somente após ambas as validações passarem, recarregue pelo mecanismo do Plesk:

```sh
/usr/local/psa/admin/sbin/httpdmng --reload
```

Não reconfigure todos os domínios para modificar este subdomínio.

## 7. Validar e entregar

- Teste externamente, com verificação normal de certificado, a página e `https://maker3d.emersol.ai/healthz`: HTTP 200; healthz com `{ "ok": true }`. Confirme HTTP → HTTPS.
- Confirme contêiner saudável, escuta somente em loopback, usuário node, filesystem somente leitura e reinício automático.
- Teste as funções afetadas. Em autenticação, verifique login e cookies HttpOnly/Secure/SameSite, sem registrar senhas/tokens. Política atual: 5 caracteres falha, 6 funciona; contas existentes continuam entrando.
- Em instalação inicial/reconstrução ou mudança de persistência/Storage/autorização, faça fluxo controlado: equipe autorizada, convite, família, projeto, anexo privado, orçamento e aprovação. Outra família não pode ler projeto/anexo. Não acione impressora nem registre pagamentos reais.
- Em mudança de infraestrutura/persistência, confirme dados e arquivo após reiniciar. Não repita testes disruptivos sem necessidade em mudanças apenas documentais.
- Identifique registros de QA e remova somente esses registros, anexos e sessões. Não apague famílias reais nem sessões do proprietário que não sejam do teste.
- Inspecione logs recentes e diferencie falhas transitórias de reinício de erros persistentes. Compare os demais sites com a medição anterior.
- Remova ambientes temporários de provisionamento/bootstrap, cópias temporárias locais de senhas geradas já salvas no runtime seguro e scripts de teste com sessões. Preserve os arquivos privados do proprietário conforme combinado.
- Atualize o registro operacional sem segredos e entregue URL, SHA implantado, checkout, serviço, verificações e rollback. Um build bem-sucedido, sozinho, não comprova publicação.

## 8. Rollback de código

Antes de cada publicação, preserve SHA, imagem, checkout e version.env anteriores. Para reverter: restaure MAKER3D_VERSION anterior, aponte current ao checkout correspondente e execute `/opt/maker3d/service.sh up -d --no-build`. Valide healthz e página externa por HTTPS. Preserve runtime.env e o complemento de CA.

Nunca apague schema, tabelas, bucket, anexos ou contas do Supabase para reverter código. Verifique compatibilidade com dados e contas atuais, especialmente senhas de 6 caracteres.

Para interromper só o portal: `/opt/maker3d/service.sh stop app`. Preserva dados, mas deixa o proxy sem backend. Não remova outros serviços.
# Publicação 0.3.0 — 31/10/2026

Portal: https://maker3d.emersol.ai

- SHA implantado: `66d48c95b2d49e0c17d974a8618bae5931e2a7e2`.
- SHA anterior preservado: `6990ef237bbcba32a08a6a4736d05aee0eb2902d`.
- Release: `/opt/maker3d/releases/66d48c95b2d49e0c17d974a8618bae5931e2a7e2`.
- Serviço: `/opt/maker3d/service.sh`, projeto Compose `maker3d`, contêiner `maker3d-app-1`.
- Backup privado: `/opt/maker3d/backups/deploy-66d48c95b2d4-20261031`.
- Migração aplicada: `20261031152441_maker3d_profiles_publications_and_invites`.

O backup contém configuração anterior, snapshot consistente das onze tabelas
originais e schema anterior. Runtime e credenciais existentes foram preservados.
As dezoito tabelas atuais têm RLS; anon e authenticated não têm acesso ao schema.

## Verificação

As duas suítes passaram na VPS. O teste foi executado sequencialmente em contêiner
temporário com 2 GB de memória, após o limite inicial de 1 GB provocar OOM. O prazo
de inicialização do teste de integração foi ajustado de 6 para 20 segundos para
acomodar a inicialização de PostgreSQL embarcado com CPU limitada.

Antes da ativação, a imagem candidata foi validada com credenciais de runtime e
Storage reais: login/cookies seguros, inscrição por convite, perfil, foto privada,
dependentes, mídia privada, autorização de responsável, revisão, anexo privado de
projeto e promoção/revogação de equipe. Nenhuma impressão ou cobrança foi gerada.
Os registros e objetos temporários foram removidos pelo teste.

Após ativação, HTTPS respondeu 200 para a página, healthcheck, scripts e estilos.
Os hashes dos cinco arquivos públicos conferiram com os arquivos locais. HTTP
redirecionou para HTTPS; configuração inicial permaneceu desativada. O contêiner
está saudável, executa como node e usa filesystem somente leitura.

As seis famílias e sete usuários preexistentes foram preservados. A consulta final
confirmou zero usuários e famílias de QA restantes.

## Rollback

Como administrador da VPS, restaure `version.env` do backup para
`/etc/maker3d/version.env`, aponte `/opt/maker3d/current` ao release anterior e execute
`/opt/maker3d/service.sh up -d --no-build`. Confira healthcheck e HTTPS. Preserve
`runtime.env`, o complemento de CA, as tabelas novas e os dados existentes.

Commits posteriores que apenas atualizam documentação e sincronizam o nome da
migração não alteram o SHA da imagem implantada acima.

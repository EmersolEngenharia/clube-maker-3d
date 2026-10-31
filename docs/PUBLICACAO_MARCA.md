# Publicação da marca — 31/10/2026

Portal: https://maker3d.emersol.ai. Publicação concluída às 18:27 de Brasília.

- SHA efetivamente implantado: `dbafc523369ab6317d93565dd416b9cf92be7217`.
- Release: `/opt/maker3d/releases/dbafc523369ab6317d93565dd416b9cf92be7217`.
- Versão anterior preservada: `66d48c95b2d49e0c17d974a8618bae5931e2a7e2`.
- Backup: `/opt/maker3d/backups/deploy-dbafc523369a-20261031T212721Z`.
- Imagem: `maker3d:dbafc523369ab6317d93565dd416b9cf92be7217`.
- Serviço: `/opt/maker3d/service.sh`; contêiner `maker3d-app-1`, saudável e limitado a `127.0.0.1:3183`.

## Alteração

Identidade Clube Maker 3D Emersol, foguete vetorial na marca e favicon, nova ilustração,
componentes compartilhados renovados e paleta azul-marinho, turquesa, laranja e amarelo.
Cinco temas e navegação móvel preservados. Nenhuma migração, mudança de contas,
rotação de credenciais ou alteração do proxy foi necessária.

## Verificação

- `npm test`: 29 testes aprovados; `npm run test:postgres`: 29 aprovados em base descartável.
- QA local no navegador: cadastro, família, dependentes, mídia, consentimento, revisão,
  cotas, equipe, projetos, orçamento, aprovação e cancelamento aprovados.
- Cinco temas em 390 px sem overflow horizontal ou erros JavaScript/CSP.
- Candidata iniciada com runtime existente, em porta aleatória de loopback. Healthcheck
  e comparação dos assets aprovados antes da troca da versão ativa.
- Contêiner de produção saudável; página e healthcheck externos com HTTPS 200.
- HTTP redireciona para HTTPS. Título e favicon corretos; hashes SHA256 dos nove assets
  externos iguais aos arquivos locais: HTML, app.js, features.js, styles.css, themes.css,
  brand.css, brand-icon.svg, favicon.svg e art.svg.
- Login de produção renderizado em desktop e celular, foguete carregado, sem overflow
  horizontal ou erros JavaScript. Sem cadastros ou operações reais de QA em produção.

## Acesso e aprendizado preservado

Publicação via API REST administrativa do Plesk, usando tarefa temporária inativa,
executada uma vez e removida. SSH direto recusado neste ambiente; não foi reconfigurado.
A primeira candidata foi descartada antes da ativação porque a verificação de assets
precisava enviar `Host: maker3d.emersol.ai`. O script foi corrigido e validado na publicação
acima. Erros transitórios de conexão durante inicialização não persistiram.

Para a próxima publicação, começar por **docs/DEPLOY_RAPIDO.md** e usar os scripts
`scripts/plesk-exec.py` e `scripts/deploy-release.sh`. `AGENTS.md` aponta para esse guia.
Não reinvestigar acesso ou recriar infraestrutura sem necessidade concreta.

## Rollback desta publicação

Como root na VPS:

```sh
cp -p /opt/maker3d/backups/deploy-dbafc523369a-20261031T212721Z/version.env /etc/maker3d/version.env
ln -s /opt/maker3d/releases/66d48c95b2d49e0c17d974a8618bae5931e2a7e2 /opt/maker3d/current.rollback
mv -Tf /opt/maker3d/current.rollback /opt/maker3d/current
/opt/maker3d/service.sh up -d --no-build
```

Conferir contêiner saudável e HTTPS. Preservar runtime.env, CA, banco e arquivos.
Commits posteriores somente de documentação não alteram o SHA da imagem acima.

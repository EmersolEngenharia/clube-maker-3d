# Clube Maker 3D Emersol

Para publicar ou atualizar, leia primeiro `docs/DEPLOY_RAPIDO.md`.
Destino existente: https://maker3d.emersol.ai. Não criar outra hospedagem.
O guia inclui o acesso Plesk que funciona neste ambiente, scripts reutilizáveis,
verificação do SHA real, publicação com rollback e validação externa.
Não imprimir credenciais nem recriar banco, contas, bucket ou proxy numa atualização visual.

## Ciclo de git e publicação

1. Ao começar, o hook `SessionStart` (`.claude/hooks/git-sync.sh`) faz fetch e fast-forward. Se avisar de divergência ou alteração pendente, resolva antes de editar.
2. Ao terminar as edições, sem esperar pedido: `npm test` (e `npm run test:postgres` se mexeu em server.mjs, db.mjs ou rotas), depois `git add <arquivos> && git commit -m "<mensagem em português>" && git push` direto na `main`. Perguntar antes só se houver segredo em arquivo, conflito, alteração no `git status` que não foi sua ou migração de banco que dependa de validação.
3. O push na `main` publica sozinho quando a variável `DEPLOY_VPS` do repositório é `true`: `.github/workflows/deploy.yml` roda os testes e pede à VPS `deploy <SHA>` por SSH. A VPS (`/opt/maker3d/deploy-gate.sh`) constrói a imagem, troca a versão e faz rollback se falhar (`scripts/deploy-release.sh`). Leva de 3 a 8 min; o último passo confere `https://maker3d.emersol.ai`. Acompanhe com `gh run list --limit 1` e `gh run watch`.
4. Sem `DEPLOY_VPS` ativa, ou com o Actions fora: `bash scripts/publicar.sh` (Tailscale SSH) ou `/publicar`.
5. A chave do Actions (`maker3d-github-actions` em `/root/.ssh/authorized_keys`) só aceita `deploy <SHA da main>`. Nunca imprimir, ler ou gravar chaves e senhas. O `--delete` não existe aqui: a publicação não apaga arquivos de outros sites.
6. O hook `Stop` (`.claude/hooks/git-publish-check.sh`) avisa se sobrou commit sem push.

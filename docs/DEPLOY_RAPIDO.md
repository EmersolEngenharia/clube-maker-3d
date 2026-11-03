# Publicar o Clube Maker 3D Emersol

Guia operacional para futuras sessões. Leia este arquivo antes de investigar infraestrutura.

## Destino e acesso conhecidos

- Portal: https://maker3d.emersol.ai — VPS Plesk 185.215.180.60.
- Plesk: https://plesk.emersol.ai:8443. API REST administrativa disponível.
- GitHub: EmersolEngenharia/clube-maker-3d, branch main. `gh` e Git funcionam no ambiente atual; conferir novamente na próxima sessão.
- SSH direto à porta 22 foi recusado neste ambiente em 31/10/2026. Não repetir tentativas nem reconfigurar SSH/VPN: usar Plesk HTTPS se continuar disponível.
- Credencial administrativa existente: registro Notion **Servidor 1 - Sites | Plesk**, ID `204d2717-b36b-80eb-931f-d3fea8fa7b51`. Consultar somente para publicação autorizada; nunca imprimir a página inteira, senha ou tokens. Preferir entrada oculta ou arquivo privado modo 600. Remover cópias temporárias ao terminar.
- Não usar Sites: a aplicação já está hospedada na VPS.

## Caminho curto

1. Confirmar autorização na conversa. Ler este guia, `git status`, buscar main e integrar alterações recentes sem sobrescrever trabalho local.
2. Mudança de interface: `npm test`, `npm run test:postgres` e QA relevante. `PLAYWRIGHT_MODULE=/opt/codex/cua_node/lib/node_modules/playwright/index.mjs node scripts/browser-features.mjs` funciona neste ambiente, quando o módulo estiver disponível. Os testes usam bases descartáveis; não fornecer credenciais de produção.
3. Commitar arquivos selecionados e enviar para main sem force. Anotar SHA completo. Não incluir `work/`, credenciais ou dados.
4. Usar `scripts/plesk-exec.py` para executar comandos administrativos autorizados via HTTPS. Python padrão; sem instalação adicional. Senha via prompt oculto ou `--password-file /caminho/privado`. O script lê comandos de stdin ou `--script arquivo.sh`. Não passar senha como argumento. **Atalho:** com `~/.maker3d/plesk-api-key` (criada uma vez por `python scripts/plesk-criar-chave.py`, senha digitada pelo Emerson), `bash scripts/publicar.sh [SHA]` faz os passos 5–8 e a validação externa sem senha. Skill do Claude Code: `/publicar`.
5. Inspecionar versão atual: `readlink -f /opt/maker3d/current`, `/opt/maker3d/service.sh ps`, `docker inspect --format '{{.Config.Image}} {{.State.Health.Status}}' maker3d-app-1`. Não imprimir runtime.env nem inspect completo.
6. Preparar checkout **novo**, em `/opt/maker3d/releases/<SHA>`, a partir do repositório existente ou de um bundle Git transferido pelo mesmo acesso autorizado. Confirmar `git rev-parse HEAD`. Não editar o release ativo.
7. No checkout novo, executar `bash scripts/deploy-release.sh`. O script constrói a imagem, salva configuração e caminho anterior, inicia candidato em porta loopback aleatória com runtime existente, confere healthcheck e assets, troca o link atomicamente e valida HTTPS. Falha após ativação aciona rollback. Não remove releases/imagens anteriores. Para operações >50 s, iniciar em segundo plano com log privado e consultar status; não repetir uma operação em andamento após timeout.
8. Validar de fora da VPS: healthcheck e página 200, HTTP → HTTPS, SHA256 dos assets remotos igual aos arquivos locais, título e favicon. Conferir login visual em desktop/celular, sem criar dados reais. Comparar serviços vizinhos antes/depois caso infraestrutura seja alterada.
9. Registrar resultado em `docs/PUBLICACAO_MARCA.md` (ou registro posterior), com SHA efetivo, versão anterior, backup, verificações e rollback. Enviar documentação ao GitHub. Um commit posterior somente documental não muda o SHA da imagem já publicada.
10. Apagar arquivos temporários de credencial. Confirmar que a tarefa Plesk temporária foi removida. Entregar URL e resultado verificável.

## O que os scripts fazem

`plesk-exec.py` usa `/api/v2/cli/scheduler/call`: cria uma tarefa **inativa**, root, notificações desligadas, executa uma vez e remove no `finally`. Não modifica tarefas existentes. Plesk só retorna stdout em falha; o wrapper usa saída 1 no transporte, marca `MAKER3D_EXIT` com o resultado real e o cliente devolve esse código. Uma mensagem interna “Completed with error” não representa falha do deploy quando o marcador real é zero. Base64 evita o tratamento de aspas aninhadas pelo Plesk; não é criptografia. Nunca colocar segredos no script enviado, argumentos, descrição ou log.

`deploy-release.sh` exige root, checkout limpo e caminho igual ao SHA; usa trava de implantação. Os logs operacionais ficam em `/opt/maker3d/deployment.txt` e `DEPLOYMENT.md`. O serviço é `/opt/maker3d/service.sh`, Compose `maker3d`, contêiner `maker3d-app-1`, porta `127.0.0.1:3183`. Runtime: `/etc/maker3d/runtime.env`; seleção: `/etc/maker3d/version.env`; CA e complemento Compose existentes são preservados.

## Rollback

Ler `previous-release.txt` no backup da implantação. Restaurar sua cópia de `version.env` para `/etc/maker3d/version.env`, mantendo root/modo 600; apontar `/opt/maker3d/current` ao release anterior com link temporário e `mv -Tf`; executar `/opt/maker3d/service.sh up -d --no-build`; conferir healthcheck e HTTPS. Não tocar em contas, anexos, tabelas ou bucket.

## Limites

Atualização visual não exige migração, bootstrap, rotação de senha, novo certificado, alteração do proxy ou reinício global do Plesk. Para mudança de schema/persistência ou reconstrução, ler também `docs/PROMPT_PLESK.md` e a documentação Supabase pertinente. O último registro de produção deve ser conferido na VPS; referências históricas não substituem o estado real.

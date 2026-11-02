# Publicação — Responsável entra na conta do dependente

Publicada em 02/11/2026, por volta de 04:12, horário de Brasília (07:12 UTC).

- URL: https://maker3d.emersol.ai (tela inicial do responsável e "Minha família").
- SHA implantado: `d8a29c853de377a484855bf6fef281d56d534c90`.
- Anterior: `a20fece7dc3415660870fd7384b6b2c96d72a9b1` (vitrine).
- Log: `/opt/maker3d/deploy-d8a29c853de3.log`; backup em `/opt/maker3d/backups/deploy-d8a29c853de3-20261102T071144Z`.
- Sem migração: usa as tabelas `users`, `sessions` e `participants` existentes.

## Alteração

- Tela inicial do responsável: bloco "Quem vai criar agora?" com os avatares dos dependentes ativos.
  Um toque entra na conta de aprendiz do dependente, sem senha. Em "Minha família", cada dependente
  ganha o botão "Entrar como …".
- Na conta do dependente aparece a faixa "Você está usando o clube como …" com "Voltar para
  <responsável>". "Sair" encerra as duas sessões no aparelho.
- Dependente cadastrado só pelo nome recebe, no primeiro uso, uma conta `learner` com e-mail reservado
  `dependente-<id do participante>@maker3d.invalid` e senha aleatória descartada — não há login direto.
  Aprendizes com conta própria (convite) também aparecem; mesmo nome que um participante = mesma pessoa.
  O e-mail reservado não é exibido ("Acesso pela conta do responsável").
- Sessão do responsável guardada no cookie HttpOnly `maker_guardian`; só vale se o responsável for da
  mesma família do aprendiz em uso.
- Rotas: `GET /api/family-accounts`, `POST /api/family-accounts/enter` (`participantId` ou `userId`),
  `POST /api/family-accounts/return`. `/api/session` informa `user.guardian`.

## Verificação

- `npm test` e `npm run test:postgres`: 77 testes aprovados (novo: só responsável lista/entra, outra
  família não entra, aprendiz não entra em outra conta, voltar restaura a sessão, sair encerra tudo,
  e-mail reservado não permite login).
- QA local no navegador: avatares na tela inicial, entrada como dependente, faixa e "Voltar",
  botões em "Minha família", largura de celular; sem erros no console.
- Externo: `/healthz` 200; HTTP 301 para HTTPS; SHA256 de app.js, operations.js e styles.css igual ao
  commit; rotas novas sem sessão retornam 401. Nenhuma conta real criada em produção.

## Rollback

Como root na VPS (contas `dependente-*@maker3d.invalid` criadas podem ficar; a versão anterior não as usa):

```sh
cp -p /opt/maker3d/backups/deploy-d8a29c853de3-20261102T071144Z/version.env /etc/maker3d/version.env
ln -s /opt/maker3d/releases/a20fece7dc3415660870fd7384b6b2c96d72a9b1 /opt/maker3d/current.rollback
mv -Tf /opt/maker3d/current.rollback /opt/maker3d/current
/opt/maker3d/service.sh up -d --no-build
```

## Atualização — cards compactos das famílias (02/11/2026, ~04:40 Brasília)

- SHA implantado: `5f94da9b0b60adffb34c57e73868183b303e09cf` (anterior `d8a29c8`). Sem migração.
- "Famílias do clube" (equipe): 4 cards por linha (3 abaixo de 1500 px, 2 abaixo de 1150 px, 1 no
  celular) e barra de horas resumida; o detalhamento completo segue na visão da própria família.
- Verificado: 77 testes; QA local a 1800 px com 6 famílias; `/healthz` 200; SHA256 de operations.js e
  styles.css igual ao commit. Rollback: mesmo procedimento acima, apontando para o release `d8a29c8…`
  e o backup `deploy-5f94da9b0b60-*`.

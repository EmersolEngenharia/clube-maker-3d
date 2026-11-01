# Publicação — Menu em seções e Painel financeiro

Publicada em 01/11/2026, por volta de 16:47, horário de Brasília (19:47 UTC).

- URL: https://maker3d.emersol.ai
- SHA implantado: `4f5c8bf372f85e2d06cc2a0110725b473ebec32e`.
- Anterior: `8c62c039249ccf77822cb3e526b02b6b00e707bd`.
- Log da implantação: `/opt/maker3d/deploy-4f5c8bf372f8.log`; backup em `/opt/maker3d/backups/deploy-4f5c8bf372f8-20261101T194658Z`.
- Sem migração, nem alteração de contas, bucket, proxy ou credenciais.

## Alteração

- Menu da equipe: Visão geral e Famílias fixos; Operacional (Pedidos, Produção, Estoque), Financeiro
  (Painel, Lançamentos, Cobranças), Educação e marketing (Aprender, Divulgação, Convidar famílias,
  Comunicados), Minha família e Configurações (Equipe, Configurações do clube, Meu perfil) abrem e fecham.
- Celular: barra com Visão geral, Famílias, Pedidos, Produção e Mais; a folha "Mais" lista as seções.
- Menu das famílias: mesmos itens, com títulos de seção (Criar, Minha família, Descobrir, Conta).
- Novo Painel financeiro (`finance-dashboard`): saldo, receitas, despesas e resultado do mês com
  comparação, valor a receber, gráfico e tabela de seis meses, maiores despesas, cobranças em aberto,
  estoque e aportes. Calculado no navegador a partir de `/api/finance`, `/api/billing` e `/api/stock`.

## Verificação

- `npm test` e `npm run test:postgres`: 69 testes aprovados em cada um.
- QA local: menu em computador e celular, folha "Mais" e Painel com lançamentos de teste, sem erros no console.
- Externo: `/healthz` 200; HTTP 301 para HTTPS; SHA256 de app.js, features.js, operations.js,
  brand.css e themes.css igual ao commit e ao `?v=` do HTML; tela de login sem erros no console.
- Menu das famílias não foi testado com uma conta de família.

## Rollback

Como root na VPS:

```sh
cp -p /opt/maker3d/backups/deploy-4f5c8bf372f8-20261101T194658Z/version.env /etc/maker3d/version.env
ln -s /opt/maker3d/releases/8c62c039249ccf77822cb3e526b02b6b00e707bd /opt/maker3d/current.rollback
mv -Tf /opt/maker3d/current.rollback /opt/maker3d/current
/opt/maker3d/service.sh up -d --no-build
```

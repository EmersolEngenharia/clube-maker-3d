# Clube Maker 3D

Portal do clube da Emersol, em Itumbiara–GO — versão 0.6.0.
Interface em português, adaptada para computador e celular, com foco em crianças,
famílias e adultos iniciantes.

## Atualização 0.6.0 — Asaas

Tela Cobranças, adaptador PaymentProvider para PIX e cartão, webhook autenticado,
conciliação idempotente, vigência, cancelamentos e diagnóstico administrativo.
Na ausência dos segredos, mantém solicitação e recebimento manual. Não captura
cartão no portal. [Configuração, decisões e homologação pendente](docs/ASAAS.md).

**Publicada em 01/11/2026**. Após a publicação, o usuário informou que a chave de
produção foi instalada e o contêiner recriado; conexão e webhook seguem pendentes
de validação. [Estado atualizado](docs/HANDOFF_ASAAS_2026-11-01.md) e
[registro da publicação](docs/PUBLICACAO_0.6.md).

## Atualização 0.5.0 — dashboard financeiro e matemática em família

Resumo compacto no topo, lançamentos com busca, filtros, ordenação, paginação e
CSV dos resultados filtrados. Responsáveis e aprendizes compartilham o financeiro
da família, identificando o participante em cada registro. Há explicações e uma
calculadora de venda, custos, lucro e margem que não cria lançamentos reais.
Veja [o guia de uso](docs/FINANCEIRO_DIDATICO.md).
**Publicada em 31/10/2026**; [registro e rollback](docs/PUBLICACAO_0.5.md).

## Atualização 0.4.1 — desempenho

Publicada em 31/10/2026. O dashboard agrupa leituras, reaproveita os dados de saldo
por família e evita viagens repetidas ao PostgreSQL. Financeiro e estoque abrem
sem recarregar o painel completo. Nas medições externas, o dashboard caiu de
aproximadamente 8,2 s para 1,0 s. Veja [medições e publicação](docs/PUBLICACAO_0.4.1.md).

## Atualização 0.4.0 — financeiro, estoque e acessos

- Financeiro do clube: aportes separados de receitas, despesas, recebimentos,
  saldo anterior/final, filtro de datas, exportação CSV e estorno com motivo.
- Financeiro privado de cada família: despesas ao clube entram automaticamente;
  responsáveis lançam vendas e outros custos e acompanham o resultado de caixa.
- Compras de filamento alimentam caixa e estoque por lote; baixas em gramas,
  fornecedor, custo por kg e valor do saldo. Baixas são registradas pela equipe.
- Contatos dos responsáveis com e-mail e botão para WhatsApp na ficha da família.
- Cupons e horas com validade configurável e histórico. Pagamentos têm resumo
  automático de desconto, confirmação do recebido e opção de isenção total.
- Administrador, financeiro e operador possuem permissões distintas. Convites
  permitem cadastrar colaboradores sem vínculo com uma família.

Veja [o guia completo e os passos para produção](docs/ATUALIZACAO_0.4.md).
**Versão 0.4.0 publicada em https://maker3d.emersol.ai em 31/10/2026, com a atualização do banco aplicada.**
Veja [o registro da publicação e rollback](docs/PUBLICACAO_0.4.md).

## Atualização 0.3.0

A versão adiciona cinco temas por usuário, avatar/foto, gestão editável de famílias
e dependentes, equipe operacional, convites de inscrição de novas famílias,
conteúdos para divulgação com autorização e revisão, bateria da franquia familiar
e extrato CSV. O painel usa consultas em lote, respostas resumidas e cache HTTP
com Brotli/Gzip para a interface.

- [Auditoria, resultados, limites e próximos recursos](docs/AUDITORIA_0.3.md)
- [Guia de atualização e validação](docs/ATUALIZACAO_0.3.md)

**Versão 0.3.0 publicada em https://maker3d.emersol.ai em 31/10/2026.**
Migração adicional aplicada e funcionamento validado com PostgreSQL e Storage reais.
Consulte [o registro da publicação](docs/PUBLICACAO_0.3.md). A publicação automática
em redes sociais será uma integração futura; atualmente o portal organiza e revisa
os conteúdos com acesso privado.

## Publicar uma atualização

Leia primeiro [o guia rápido de publicação](docs/DEPLOY_RAPIDO.md). Ele contém o acesso
validado, scripts reutilizáveis, verificações e rollback. A identidade **Clube Maker 3D
Emersol** já está online; veja [o registro da publicação](docs/PUBLICACAO_MARCA.md).
`AGENTS.md` orienta as próximas sessões a começar pelo guia.

## Executar

Requer **Node.js 24 ou superior**. Execute `npm ci` para instalar as dependências com as versões fixadas.

```bash
cd clube-maker-3d
npm ci
npm start
```

Abra **http://127.0.0.1:3000** no mesmo computador que executa o servidor.
O primeiro acesso apresenta o cadastro da equipe. Não existe senha padrão. As senhas do portal aceitam de 6 a 200 caracteres, sem exigência de símbolos ou letras maiúsculas.
Esse cadastro só funciona por conexão local e é desativado após a primeira conta.

1. Cadastre a equipe responsável.
2. Em **Famílias**, cadastre uma família e gere um convite de responsável.
3. Abra o convite em outro perfil do navegador ou janela privada e crie a conta da família.
4. Na conta da família, escolha **Criar projeto** e envie uma ideia.
5. Na conta da equipe, abra **Pedidos**, avalie a ideia e prepare um orçamento.
6. A família aprova o orçamento; o projeto aparece na fila.
7. A equipe confere a máquina e registra início, conclusão e pagamento.
8. A equipe ou o responsável confirma a retirada.

Os dados ficam em `data/maker.sqlite` e os arquivos em `data/files/`.
Não são dados temporários do navegador. Pare o servidor antes de copiar **toda a
pasta `data/`** para um backup consistente; guarde o backup fora deste diretório.

## Implementado

- Cadastro inicial local da equipe, entrada e saída com sessões HttpOnly.
- Convites de uso único, validade de sete dias, para responsáveis e aprendizes.
- Separação de famílias e autorização de cada operação no servidor.
- Perfis de participantes dentro da família; acesso de aprendiz opcional por convite.
- Assistente de criação de projetos, rascunhos editáveis e avaliação.
- Arquivos STL/3MF e referências PNG/JPG, até cinco arquivos de 10 MB por projeto.
- Download de arquivos restrito à família do projeto e à equipe.
- Conversa e histórico de eventos por projeto.
- Orçamento manual a partir do fatiador, incluindo tempo e material totais.
- Aprovação exclusiva de responsável, com reserva de horas e revalidação do saldo.
- Fila por aprovação; uma impressão ativa por vez; conferência obrigatória.
- Registro de consumo real, falhas, cancelamento e retirada.
- Cota mensal, histórico de custos e registro manual de pagamentos.
- Configuração de preços, franquia de novas famílias, materiais e cores disponíveis.
- Sete conteúdos introdutórios com atividades didáticas.

## Regras adotadas

Consulte [docs/REGRAS_DO_MVP.md](docs/REGRAS_DO_MVP.md).
As regras também aparecem dentro do portal. Preços e materiais são editáveis na
área da equipe; regras estruturais, como não acumular horas, estão no código e
podem ser alteradas na próxima iteração.

O PLA de R$ 100/kg é um **valor inicial de configuração**, não uma cotação de fornecedor.
A equipe deve cadastrar o custo real e as cores existentes antes de emitir orçamentos.
Não há famílias ou projetos fictícios na base de uso normal. Capturas e testes usam
bases separadas e descartáveis.

## Testes

```bash
npm test
```

Os testes usam um banco temporário, sobem um servidor em `127.0.0.1:3167` e o
encerram ao terminar. Cobrem cálculo, virada do mês, permissões, arquivos privados,
convites, aprovação, saldo, produção, falha, retirada e pagamentos. O ambiente de
execução precisa permitir escutar uma porta local.

Para a verificação opcional de navegador, instale Playwright no ambiente de QA
ou informe `PLAYWRIGHT_MODULE` com o caminho do módulo instalado:

```bash
PLAYWRIGHT_MODULE=/caminho/playwright-core/index.mjs \
CHROMIUM_PATH=/caminho/chromium \
node scripts/browser-smoke.mjs
```

O script usa uma base temporária e a porta 3180. As capturas ficam em
`docs/previews/`. Não é uma dependência do portal.

## Supabase e publicação na VPS

O código suporta dois modos: SQLite/local para teste no computador e
PostgreSQL + Supabase Storage para produção. A interface e as regras de negócio
são as mesmas. A autenticação continua no backend do clube, com sessões HttpOnly;
ela não reutiliza as contas do Emersoft nem altera o Supabase Auth desse projeto.

Destino definido: **https://maker3d.emersol.ai**, VPS Plesk **185.215.180.60**.
Projeto Supabase: **Emersoft**, referência `hzsuckglbihyraaotzba`.
A migração `20261030181544_maker3d_private_schema_and_storage` já foi aplicada:
11 tabelas no schema privado `maker3d`, RLS habilitado, papel dedicado
`maker3d_app` ainda sem login e bucket privado `maker3d-projects`.
As tabelas dos demais sistemas não foram modificadas.

**Estado:** banco preparado; implantação na VPS e teste ponta a ponta com Storage
real ainda dependem do agente com acesso ao servidor e das credenciais de runtime.
Nenhuma credencial de produção está neste repositório. Não reaplique a migração.

- [Prompt para o agente do Plesk](docs/PROMPT_PLESK.md)
- [.env.example](.env.example): nomes das variáveis, sem segredos.
- [deploy/compose.yml](deploy/compose.yml): serviço isolado em `127.0.0.1:3183`.
- [deploy/Dockerfile](deploy/Dockerfile): Node 24, usuário sem privilégios e healthcheck.
- `npm run test:postgres`: testes com PostgreSQL embarcado PGlite e papel dedicado.

A aplicação recusa iniciar em produção com SQLite, Storage local, usuário de banco
compartilhado ou cookies sem HTTPS. O acesso do frontend é sempre via backend;
`anon` e `authenticated` não têm acesso ao schema privado. Aprovações e mudanças
de etapa são transacionais; um bloqueio no banco serializa escritas entre instâncias.
Os arquivos só são entregues depois da autorização de família/equipe no servidor.

## Configuração de execução

| Variável | Padrão | Uso |
|---|---|---|
| `HOST` | `127.0.0.1` | Interface de escuta |
| `PORT` | `3000` | Porta HTTP |
| `DATA_DIR` | `./data` | Diretório persistente do SQLite e anexos |
| `PUBLIC_ORIGIN` | origem local | Origem exata autorizada, por exemplo `https://clube.exemplo.com` |
| `COOKIE_SECURE` | desativado localmente | Defina `1` quando servido por HTTPS |

Para operar com famílias em diferentes dispositivos, é necessária uma hospedagem
Node com armazenamento persistente, HTTPS e backup. Preserve o cabeçalho Host no
proxy e configure PUBLIC_ORIGIN. Faça a configuração inicial por acesso local
antes de expor o serviço. Esta versão **não foi publicada na internet**.

## Limites desta entrega

- A impressora ainda é operada presencialmente. Não há integração com Bambu Lab,
  fatiamento, câmera, impressão remota ou orçamento automático.
- Pagamentos são registrados pela equipe; não há cobrança automática ou gateway.
- A atualização da fila acontece ao abrir a tela, sem notificações externas.
- Acesso por e-mail e senha, sem envio de e-mails ou recuperação automática de senha.
  O onboarding inicial e a gestão dos convites são feitos pela equipe.
- A implantação para uso real das dez famílias, a recuperação de conta e a rotina
  operacional de backup são próximos passos; o servidor atual é uma entrega local.
- O SQLite serve para testes locais; em produção, PostgreSQL centraliza os dados.
  O import de cadastros criados em computadores locais não é automático.
- A revisão técnica de modelos e a adequação física das peças continuam com a equipe.

## Organização

- `server.mjs`: servidor HTTP, autenticação, autorização e operações transacionais.
- `db.mjs` e `storage.mjs`: adaptadores PostgreSQL/SQLite e Supabase/local.
- `domain.mjs`: regras de período, alocação de horas e acerto de consumo.
- `operations.mjs`, `permissions.mjs` e `quota.mjs`: financeiro, estoque, benefícios, funções e saldo de horas.
- `public/operations.js`: telas dos novos recursos.
- `features.mjs`: perfis, equipe, edição de famílias, inscrição e publicações privadas.
- `public/features.js` e `public/themes.css`: telas dos recursos novos e temas.
- `public/`: interface, estilos responsivos e ilustração vetorial original.
- `test/`: testes de domínio e integração.
- `scripts/browser-smoke.mjs`: validação opcional em navegador real.

O modo de produção usa o projeto Supabase escolhido pelo usuário. O modo local mantém SQLite. O fluxo de publicação
Sites não estava disponível neste ambiente porque seus helpers e starter não
estavam instalados; por isso foi entregue um projeto Node local completo.

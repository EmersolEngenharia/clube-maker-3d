# Clube Maker 3D

Primeira implementação funcional do portal do clube da Emersol, em Itumbiara–GO.
Interface em português, adaptada para computador e celular, com foco em crianças,
famílias e adultos iniciantes.

## Executar

Requer **Node.js 24 ou superior**. Não há dependências de execução para instalar.

```bash
cd clube-maker-3d
npm start
```

Abra **http://127.0.0.1:3000** no mesmo computador que executa o servidor.
O primeiro acesso apresenta o cadastro da equipe. Não existe senha padrão.
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
- O SQLite atende ao piloto em uma única instância. Não executar múltiplas instâncias
  com cópias independentes do banco.
- A revisão técnica de modelos e a adequação física das peças continuam com a equipe.

## Organização

- `server.mjs`: servidor HTTP, autenticação, autorização, SQLite e armazenamento.
- `domain.mjs`: regras de período, alocação de horas e acerto de consumo.
- `public/`: interface, estilos responsivos e ilustração vetorial original.
- `test/`: testes de domínio e integração.
- `scripts/browser-smoke.mjs`: validação opcional em navegador real.

A implementação não depende de Supabase ou serviços pagos. O fluxo de publicação
Sites não estava disponível neste ambiente porque seus helpers e starter não
estavam instalados; por isso foi entregue um projeto Node local completo.

# Financeiro compacto e aprendizado em família — 0.5.0

## Organização da tela

O resumo do período aparece no topo, com saldo, receitas, aportes quando aplicável,
despesas e resultado. As principais despesas têm atalhos de filtro por categoria.
Logo abaixo estão os lançamentos, com busca, filtros por tipo, categoria, situação
e participante (na família), além de ordenação por data, valor ou descrição.

A lista mostra vinte linhas por página. CSV exporta todos os registros que atendem
aos filtros, na ordem escolhida, e não apenas a página visível. Filtros da lista
não alteram os indicadores do período completo. Períodos rápidos: este mês, mês
anterior e este ano; também é possível informar datas personalizadas.

## Modelo escolhido: um financeiro compartilhado por família

Responsáveis e aprendizes acessam **Financeiro da família**. Não são criadas contas
financeiras individuais. O participante é identificado em cada lançamento:

- O responsável pode escolher um membro, um perfil de participante ou Família.
- O aprendiz registra receitas/despesas com seu próprio nome automaticamente.
  Não pode se passar por outro participante.
- O responsável pode estornar registros da família. O aprendiz só pode estornar
  lançamentos que ele próprio criou. Registros e motivos ficam no histórico.
- Pagamentos confirmados ao clube continuam entrando automaticamente como despesas
  compartilhadas, identificadas como Família. A criança não pode estorná-los.
- Lançamentos antigos continuam com os valores originais. Quando não havia
  identificação de participante, é apresentado o autor do registro como referência.
- Outra família e administradores sem vínculo familiar não têm acesso ao financeiro
  particular. O caixa do clube continua restrito à equipe financeira autorizada.

Perfis sem login podem ter lançamentos feitos pelo responsável. Para uma criança
usar o sistema diretamente, gere um convite de aprendiz na família e permita que
ela crie seu acesso. O filtro de participantes diferencia os registros por acesso
ou perfil; não associa pessoas automaticamente apenas pela semelhança do nome.

## Matemática financeira

A seção expansível **Aprender em família** explica receita, despesa, saldo e lucro.
O saldo inclui vendas e valores recebidos de fora da família. Repasses internos,
como mesada de um membro para outro, não criam nova receita familiar e não devem
ser contados novamente; esta versão não possui uma operação de transferência interna. Lucro de uma venda é venda
menos custos; não deve ser confundido com mesada, aporte ou saldo do caixa.

A calculadora usa quantidade, preço de venda por peça e custo por peça. Mostra o
valor das vendas, os custos, lucro/prejuízo e margem sobre a venda. Por exemplo,
3 peças a R$ 10, com R$ 4 de custo por peça: vendas R$ 30, custos R$ 12, lucro
estimado R$ 18 e margem de 60%. É um exercício: não grava entradas nem despesas.
Os resultados dependem dos custos informados; não incluem impostos omitidos.

## Atualização

A nova tabela privada `cash_attributions` identifica os participantes dos novos
registros familiares. `db/attribution-postgres.sql` é aditivo e idempotente, com RLS
e acesso apenas pelo backend dedicado. Não altera valores de lançamentos antigos.
No SQLite, a tabela é criada automaticamente. O arquivo da migração aplicada ao
Supabase deve ser sincronizado com a versão retornada pelo serviço.

A validação cobre isolamento de famílias, lançamentos feitos por aprendizes,
identificação automática, tentativa de atribuir registros a outra família,
estornos, filtros e calculadora sem gravações. A interface é conferida em desktop
e celular, inclusive ausência de chamadas redundantes de API ao filtrar a lista.

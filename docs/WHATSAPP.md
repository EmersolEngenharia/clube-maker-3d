# WhatsApp — Evolution API e automação financeira

Configuração autorizada: https://evolution.emersol.ai, instância Emerson (v2.3.7
segundo a documentação da infraestrutura). Conexão `open` e credencial específica
da instância verificadas por consulta de leitura; nenhum envio de teste real.

## Configuração privada

No runtime da VPS, manter EVOLUTION_URL, EVOLUTION_INSTANCE, EVOLUTION_API_KEY e
WHATSAPP_AUTOMATION_ENABLED=true. A chave não vai ao navegador, logs, Git nem
respostas de diagnóstico. Recriar o serviço depois de alterar o runtime. Candidatos
de implantação têm automação desativada, evitando envios antes da promoção.

Administração: Cobranças → WhatsApp, relatórios e cobrança automática → Testar
conexão Evolution. Esse teste só consulta a conexão e não envia mensagem.

## Família e cadastro

Novas inscrições de família exigem CPF/CNPJ válido, celular WhatsApp e escolha de
PIX mensal recorrente ou anual parcelado no cartão (1 a 12x). A primeira cobrança
vence no dia do cadastro e é criada pelo trabalhador após o commit da inscrição.
Cartão só é preenchido no checkout Asaas; as taxas são absorvidas pelo clube.
Os preços vêm da configuração do clube: R$ 150/mês e R$ 1.500/ano por padrão.

O responsável que inscreve a família é o principal. Para famílias existentes, o
primeiro responsável cadastrado é selecionado inicialmente; o financeiro pode
alterá-lo em Configurar. A troca exige o CPF/CNPJ e o celular do novo responsável.
Não é exigida uma nova adesão, mas não se inventa CPF, telefone ou pagamento.
Famílias sem dados completos ficam bloqueadas com motivo visível. Solicitações
manuais e pagamentos já recebidos no mês também impedem duplicação automática.
Cadastros por convite de acesso a uma família já criada continuam sendo acessos;
a configuração financeira é concluída na página Cobranças.

Cupons de desconto ainda válidos e não usados, ou a marcação de condição especial,
impedem nova emissão automática e envio de cobrança até a revisão financeira.
A configuração não transforma cupons em desconto recorrente permanente.

## Agenda e cobrança

- O primeiro link é enfileirado assim que o Asaas confirma a emissão. O trabalhador
  roda a cada minuto; indisponibilidade mantém a fila, sem travar o cadastro.
- O Asaas gera as mensalidades da mesma assinatura PIX, começando no dia do
  cadastro. O sistema consulta as faturas para enviar o link às 9h do vencimento.
  PIX recorrente significa cobrança repetida; o responsável paga cada PIX.
  O comportamento do Asaas em meses sem o dia escolhido precisa ser homologado
  no calendário da assinatura; não se criam assinaturas paralelas para compensar.
- Um lembrete é enfileirado às 9h do dia seguinte se a cobrança ainda estiver
  pendente. Antes do envio, o estado é consultado novamente no Asaas.
- Anual é uma compra parcelada, sem emissão automática de outro anual. Depois
  da vigência, o responsável recebe um pedido para escolher novamente o plano.
- Horários: America/Sao_Paulo. A consulta de faturas inclui paginação.
- Pausar cobranças na configuração pausa a emissão inicial e os envios. Para
  encerrar uma recorrência já criada no Asaas, usar Encerrar recorrência na
  cobrança. A pausa local não cancela cobranças remotas já emitidas.

## Relatório didático

No dia 1 às 9h, somente ao principal: resumo do mês anterior com receitas, vendas,
despesas, resultado, pagamentos ao clube, projetos e valores por participante.
Pagamentos ao clube são despesas da família e entram uma única vez. Lançamentos
estornados não entram. Mesadas/presentes não são apresentados como lucro de vendas.
Projetos são contados pela data de criação; a situação é a atual no envio.
Sem registros não se inventam vendas ou resultados. Não há comparação com outra
família. O relatório é texto no WhatsApp, assinado Equipe Financeiro.
Se o serviço estiver fora do ar no dia 1, o relatório pendente do mês corrente
pode ser enfileirado ao retornar, sem reenviar os já processados.

## Entrega e revisão

Uma chave única identifica cada relatório/mês, fatura e lembrete. A fila persiste no
banco privado e a mensagem é reclamada atomicamente antes de enviar. Aceitação
pela Evolution não prova entrega/leitura no aparelho. Erro incerto (timeout ou
resposta incompleta) exige conferência; não se repete cegamente. Envios
interrompidos há mais de cinco minutos também exigem revisão. O financeiro pode
recolocar na fila após confirmar que não houve envio na instância. Consultas
falhas ao Asaas não criam um pagamento nem enviam um link sem validação.

## Homologação

Testes locais usam Evolution e Asaas simulados. Conferir em produção a instância,
a primeira inscrição, o link real, o ciclo mensal, o lembrete e o relatório.
Não criar cobrança ou mensagem artificial em nome de uma família para testar
sem combinar o destinatário e o propósito. O trabalhador pode fazer envios
operacionais previstos nesta funcionalidade quando estiver habilitado.

## Comunicados

Menu Comunicados, visível somente ao administrador do clube (a primeira conta
administradora; administradores delegados da equipe não têm acesso). Envia texto,
foto (JPG, PNG, WebP), vídeo (MP4, 3GP) ou PDF de até 10 MB para os responsáveis
principais, todos os responsáveis ou responsáveis escolhidos com WhatsApp válido.
`{nome}` vira o primeiro nome de cada destinatário; com anexo, o texto é a legenda.

O anexo é conferido pelo conteúdo e guardado no bucket privado. Cada destinatário
vira uma entrega em `broadcast_deliveries`, enviada pelo trabalhador a cada 20 s,
com 3 s entre mensagens, somente com a automação habilitada e a instância conectada.
Envio incerto vai para conferência e só volta à fila com confirmação; pendentes
podem ser cancelados. Migração: `20261101120000_maker3d_whatsapp_broadcasts`.

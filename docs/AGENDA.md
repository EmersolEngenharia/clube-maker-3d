# Agenda da impressora (0.8.0)

Cada pedido aprovado ocupa um horário na impressora. A família agenda sozinha, a
equipe valida, e cobrança, baixa e avisos seguem sem trabalho manual.

## O caminho de um agendamento

1. **A família agenda** em *Agenda da impressora*: nome, tempo, filamentos (material,
   cor e peso) e início. Um `.3mf` ou `.gcode` fatiado preenche tempo e peso sozinho.
   Fotos e outros arquivos entram depois, na página do pedido.
2. **Conta na cota na hora.** Conta de responsável: as horas são reservadas e o
   valor previsto (horas além da cota + filamento) é calculado. Conta de aprendiz: o
   horário fica reservado, mas o responsável aprova o valor antes.
3. **A equipe valida.** Sem validação a impressão não inicia. A equipe pode mudar
   horário, tempo e peso; a alteração exige um motivo e a família recebe o antes e
   depois pelo WhatsApp. Antes da validação, a própria família pode alterar.
4. **Início.** O horário passa a ser o real. Se isso atropelar o próximo, a agenda
   empurra os seguintes e avisa quem mudou.
5. **Conclusão.** A equipe registra tempo e peso reais. O responsável recebe o aviso
   de retirada e, havendo valor, o link do PIX (Asaas). O webhook do Asaas dá baixa
   no pedido, lança no caixa e avisa a família e a equipe.

Pedidos do fluxo antigo (orçamento da equipe aprovado pelo responsável) recebem
sozinhos o próximo horário livre e seguem os passos 4 e 5.

## Quem vê o quê

- Todos veem horários livres, ocupados e bloqueios.
- De outras famílias aparece só "Ocupado": sem nome, pedido, pessoa ou valor.
- A família vê os próprios agendamentos completos; a equipe vê todos.
- Estado da impressora (livre, progresso, tempo restante) é de todos. A imagem da
  câmera aparece só para a família dona da peça em impressão e para a equipe.

## Regras de custo

- Agendamento feito pela família: vale o **consumo real** registrado ao concluir.
  Se sobrar cota no mês do agendamento, os minutos a mais saem dela.
- Orçamento feito pela equipe (fluxo antigo): continua valendo o teto aprovado.
- Falha ou cancelamento: sem cobrança, horas devolvidas, horário liberado.

## Regras da agenda (administrador)

Botão *Regras da agenda*: horário e dias com equipe presente (a impressão só
**começa** nesse horário, mas pode terminar depois), intervalo entre impressões,
antecedência mínima, dias de agenda aberta, duração máxima, limite de agendamentos
abertos por família, lembrete de retirada, local de retirada e WhatsApp da equipe.

**Quando enviar o PIX**
- *Ao concluir* (padrão): uma cobrança, pelo consumo real.
- *Ao validar* (pré-pago): cobra o valor previsto na validação. Se a equipe editar
  antes do pagamento, a cobrança antiga é cancelada e sai outra. Ao concluir, a
  diferença a maior vira uma cobrança complementar; a menor é avisada à equipe para
  devolução (o portal não faz estorno sozinho).

## O que precisa estar configurado

- Asaas (`ASAAS_API_KEY`, `ASAAS_WEBHOOK_TOKEN`) e CPF/CNPJ do responsável principal
  em Cobranças. Sem CPF, a cobrança não sai: a equipe é avisada e o pedido mostra
  *Emitir cobrança* para tentar de novo. Sem Asaas, a família recebe o valor por
  mensagem e a equipe usa *Registrar pagamento*.
- WhatsApp (Evolution) ligado. Os avisos usam a fila de Comunicados, que mostra
  falhas e permite reenviar.
- Banco: `db/schedule-postgres.sql` (migração
  `supabase/migrations/20261110120000_maker3d_print_schedule.sql`) aplicado **antes**
  de publicar; sem as tabelas o servidor não inicia e o deploy volta à versão anterior.
- Impressora ao vivo: opcional, veja [IMPRESSORA.md](IMPRESSORA.md).

## Avisos enviados

| Quando | Família | Equipe |
| --- | --- | --- |
| Novo agendamento | aprendiz agendou: pedir aprovação | validar |
| Validação / edição da equipe | confirmação ou antes→depois | — |
| Família altera ou cancela | — | sim |
| Agenda empurrou o horário | novo horário | — |
| Início | começou + previsão de término | — |
| Impressora terminou (ponte) | terminou, aguardando conferência | registrar consumo |
| Conclusão | retirar na Emersol + valor | — |
| Cobrança | link do PIX | falha ao emitir |
| Pagamento | recebido | recebido e baixado |
| Peça não retirada | lembrete após N dias | — |

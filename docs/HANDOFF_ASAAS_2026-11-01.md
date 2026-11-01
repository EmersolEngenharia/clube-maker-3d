# Atualização recebida — Asaas e conta compartilhada

Registrada em 01/11/2026 a partir do arquivo HANDOFF_MAKER3D.md fornecido pelo
usuário. Este registro distingue o relato recebido de verificações executadas:
não houve nova inspeção da VPS ou do painel Asaas nesta atualização documental.

## Avanços informados após a publicação 0.6

- Gerada chave de API de produção na conta Emersol Serviços LTDA, separada da
  chave do Solzi, com a opção de operações de saque desmarcada.
- Preenchido `/etc/maker3d/runtime.env` com ASAAS_API_KEY (dólar inicial escapado
  para o Compose), ASAAS_ENV=production e o ASAAS_WEBHOOK_TOKEN já existente.
- Recriado o contêiner com `/opt/maker3d/service.sh up -d --force-recreate`.
- Conferida dentro do contêiner a presença da chave e o ambiente production.

O estado anterior “chave ausente” descreve a conferência feita na publicação,
não o estado mais recente relatado pelo usuário. Nenhum segredo foi incluído
no handoff ou neste registro.

## Conta compartilhada com o Solzi

Segundo o handoff, o Solzi (https://solzi.com.br) usa a mesma conta Asaas e a
mesma VPS, com webhook próprio. Eventos da conta podem chegar aos dois sistemas;
cada aplicação deve ignorar cobranças que não reconhece, sem gravar dados nem
retornar falha para esses eventos. Preservar o webhook existente do Solzi.

O documento informa que a proteção do caminho de estorno no Solzi foi tratada
no PR https://github.com/EmersolEngenharia/solar-monitor-platform/pull/244.
O conteúdo e o estado de merge desse PR não foram verificados nesta atualização.
A afirmação do handoff sobre pausa de fila após 15 falhas e impacto nos dois
sistemas também não foi validada com o provedor; manter o filtro defensivo
independentemente desse detalhe operacional.

## Pendências relatadas

1. No Maker3D, testar conexão em Cobranças → Diagnóstico da integração → Testar
   conexão; conferir a identidade da conta Emersol. Presença de variável não
   confirma validade da chave, permissões ou sucesso de emissão.
2. Revisar o handler antes de ativar o webhook: eventos com referência alheia,
   referência não UUID, sem referência, tipo desconhecido ou valor ausente/zero
   devem ser ignorados com HTTP 200 e sem consumir idempotência. Autenticação
   deve ocorrer antes do parse, com comparação em tempo constante.
3. Cadastrar webhook novo para
   `https://maker3d.emersol.ai/api/webhooks/asaas`, API v3, envio sequencial,
   token igual ao ASAAS_WEBHOOK_TOKEN privado. Eventos: PAYMENT_CONFIRMED,
   PAYMENT_RECEIVED, PAYMENT_OVERDUE, PAYMENT_REFUNDED e
   PAYMENT_CHARGEBACK_REQUESTED. Ativar após validar a conexão e o handler.
4. Homologar entrega e conciliação. O handoff propõe cobrança de R$ 1,00 com
   confirmação manual em dinheiro; isso cria registros reais no Asaas e pode
   afetar o financeiro, mesmo sem transferência bancária. Não foi executado e
   não está autorizado apenas por constar no anexo. Uma cobrança avulsa sem
   referência do Maker3D verifica o descarte/canal, mas não prova conciliação de
   cobrança emitida pelo sistema.

Este trabalho apenas atualiza documentação. Não altera código, infraestrutura,
webhooks, cobranças, dados financeiros ou o SHA da versão publicada.

## Conferência remota posterior — 01/11/2026

Com autorização do usuário para testar, foram feitas consultas de leitura à API
Asaas usando as credenciais já existentes no contêiner, sem exibir segredos:

- Diagnóstico respondeu com nome EMERSOL SERVICOS e CNPJ correspondente à Emersol.
- GET /webhooks confirmou Maker3D na URL esperada, enabled=true,
  interrupted=false, API v3, SEQUENTIALLY e os cinco eventos especificados.
- Webhook Solzi permanece cadastrado, ativo e sem interrupção.
- A resposta não disponibilizou authToken; correspondência do token cadastrado
  no painel com o runtime não foi confirmada pela consulta.
- POSTs HTTPS sintéticos com o token do runtime retornaram HTTP 200 e descarte
  esperado: evento desconhecido, recebimento sem referência e estorno com
  referência externa não UUID. Não criaram cobranças ou lançamentos.

Não foi provocada entrega pelo Asaas nem criada cobrança real. Entrega assinada
pelo provedor e conciliação de uma cobrança emitida pelo Maker3D permanecem
pendentes. O teste direto do endpoint confirma alcance e autenticação com o
segredo do runtime, mas não comprova o token salvo no painel.

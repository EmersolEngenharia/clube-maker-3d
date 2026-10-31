# Integração Asaas — Clube Maker 3D Emersol

## Escopo

Integração isolada em `payments/asaas.mjs`, atrás do contrato PaymentProvider de
`payments/types.d.ts`. O domínio e o financeiro usam centavos inteiros. Métodos:
PIX avulso, PIX recorrente, cartão recorrente e cartão em 1–12 parcelas sem juros.
Recorrência é mensal/anual de acordo com o plano; cartão parcelado é uma única
compra, não uma assinatura. PIX recorrente emite cobrança por ciclo, não PIX
Automático com débito autorizado.

Em **Cobranças**, responsável emite apenas para sua família. Administrador e
financeiro gerenciam solicitações das famílias. Aprendizes não têm acesso a
cobrança nem diagnóstico. A finalidade pode ser participação ou impressão avulsa
já concluída e ainda sem pagamento. Impressão não aceita recorrência.

O comprador preenche nome, e-mail, CPF/CNPJ e telefone; nenhum formulário do portal
solicita dados de cartão. O documento é enviado ao Asaas sem ser persistido no
banco do clube. O pagamento ocorre no invoiceUrl HTTPS validado para domínio
Asaas. PIX oferece também QR Code/copia-e-cola obtidos pelo backend.

Cupons e isenções anteriores permanecem no registro manual de participação. Não
são aplicados automaticamente a uma assinatura recorrente, evitando transformar
um cupom de uso único em desconto permanente. O formulário mostra essa condição
antes da emissão; preço e valor do projeto são sempre recalculados no servidor.

## Ativação privada

Variáveis exclusivamente do servidor:

- ASAAS_API_KEY
- ASAAS_WEBHOOK_TOKEN
- ASAAS_ENV=production ou sandbox
- ASAAS_SPLIT_RULES opcional, JSON de recipientId/percentage, definido pelo servidor.

Chave e token ausentes não são inventados. Sem os dois, a criação usa provider
manual, sem chamadas de emissão ao gateway. A tela informa isso e o diagnóstico
exibe somente presença das variáveis e ambiente. Apenas o financeiro pode
confirmar o efetivo recebimento manual, de forma idempotente.

Use a conta Emersol Serviços LTDA, CNPJ 45.356.855/0001-98. Gere chave sem permissão
de saque, guarde-a no ambiente privado da VPS e não envie pelo chat, Git ou URL.
Sandbox e produção têm segredos e dados separados. O adaptador recusa prefixos de
chave incompatíveis com o ambiente. Em produção, também confere o CNPJ antes de
emitir cobranças; divergência impede a operação.

### Docker e o caractere dólar

O Compose existente usa /etc/maker3d/runtime.env. Nesse env_file, siga o briefing e
escape o dólar inicial como $$aact_prod_... (ou o prefixo sandbox real). Não grave
uma chave real no .env.example. Não acrescente aspas à chave que serão preservadas
pelo docker run do candidato. O adaptador reconhece apenas o prefixo exato
$$aact_ e remove o dólar adicional quando o arquivo é lido cru pelo docker run;
no serviço Compose, a interpolação já entrega o prefixo simples. Tokens novos de
webhook devem preferir caracteres hexadecimais para não depender de interpolação.

Verifique sem mostrar nenhum trecho de segredo:

```
docker exec maker3d-app-1 node scripts/check-asaas-env.mjs
```

O comando informa presença, ambiente e compatibilidade, nunca prefixos ou valores.
Depois de alterar o runtime privado, recrie o serviço com o release selecionado;
reiniciar um contêiner sem recriá-lo não carrega as variáveis novas.

## Diagnóstico e webhook

Administrador: **Cobranças → Diagnóstico da integração → Testar conexão**.
Backend: GET /api/billing/diagnostic e POST /api/billing/diagnostic/test.
O diagnóstico consulta /myAccount; se indisponível (404), usa
/myAccount/commercialInfo. Completa o CNPJ por commercialInfo quando necessário.
Nome/e-mail/walletId são retornados quando a API os disponibiliza, nunca a chave.

Configure no Asaas, API v3, envio sequencial:

https://maker3d.emersol.ai/api/webhooks/asaas

Token do painel igual ao ASAAS_WEBHOOK_TOKEN. Eventos:
PAYMENT_RECEIVED, PAYMENT_CONFIRMED, PAYMENT_OVERDUE, PAYMENT_REFUNDED e
PAYMENT_CHARGEBACK_REQUESTED. Só ative webhook e fila depois de configurar os
segredos e testar a conexão. Não foi criado ou ativado um webhook no painel por
esta entrega: a configuração depende das credenciais do proprietário.

O corpo é recebido como texto, limitado em tamanho, e o adaptador autentica o
header asaas-access-token em tempo constante antes de interpretar o JSON. Eventos
não tratados, sem externalReference local, de outro ambiente ou de cobrança
incompatível retornam 200 sem movimentar o financeiro. Um valor pago zero/ausente
não cria recibo nem consome sua chave de idempotência.

## Integridade financeira

billing_receipts possui chave primária (gateway,gateway_charge_id). Confirmação e
recebimento da mesma cobrança são NO-OP depois da primeira baixa. Pagamento,
lançamento de caixa, recibo e vigência são gravados em uma transação com o bloqueio
existente do aplicativo. Falha parcial faz rollback integral antes de devolver
500, permitindo reentrega limpa. Falha do aviso não desfaz o recebimento.

As fontes cash_entries payment:<id> e project:<id> preservam a compatibilidade com
o backfill anterior: reiniciar o serviço não cria outra receita. A despesa da
família continua sendo espelhada do mesmo registro do clube. Dados históricos não
são convertidos em cobranças nem emitidos novamente.

Conforme o briefing, PAYMENT_CONFIRMED já registra o valor bruto, mesmo antes da
liquidação do cartão. PAYMENT_RECEIVED não duplica o registro. Isso não significa
que o saldo esteja disponível para saque no Asaas. Taxas, disponibilidade e saldo
líquido devem ser conferidos no gateway; despesas de tarifas não são inferidas.

Vigência é prorrogada uma vez por cobrança de recorrência. Em cartão parcelado,
a primeira parcela paga concede a vigência do produto e parcelas seguintes não
acrescentam anos/meses novamente. Cada parcela efetivamente comunicada entra pelo
próprio valor. O status não funciona como bloqueio de acesso às atividades do clube.

Refund e chargeback revertem o lançamento relacionado e recalculam vigência com
os recibos não estornados. Um estorno recebido antes do pagamento deixa um registro
terminal, impedindo reativação por evento atrasado. Cobranças antigas em atraso
não derrubam uma vigência ainda válida. Status cancelled é preservado; pagamentos
legítimos de faturas previamente emitidas ainda são conciliados.

Estorno de receita Asaas deve ocorrer no painel do gateway. O portal bloqueia
estorno apenas contábil desses registros e aguarda o webhook, para manter valor e
vigência coerentes. Estornar um recebimento manual vinculado também ajusta o recibo.

Splits opcionais são calculados em centavos e enviados em fixedValue. Não aceitamos
recebedores do navegador. Sem recebedor/walletId, o split é omitido. Este clube não
mantém uma tabela de comissões pendentes: não há comissão local a apagar; o Asaas
administra o split. Regras com recebedores reais exigem homologação do contrato,
taxas e parcelamento antes de configurar ASAAS_SPLIT_RULES em produção.

## Cancelamento e recuperação

Solicitações de emissão são persistidas antes da chamada externa. A chamada Asaas
ocorre fora da transação do banco, para não travar pagamentos/projetos durante uma
resposta lenta. Finalização posterior não sobrescreve webhook que chegou primeiro.
Um requestKey repetido não emite outra cobrança.

Falha incerta fica em needs_review. Atualizar/recuperar faz busca por referência,
sem repetir POST cegamente. Durante a emissão, o sistema pede aguardar. Se a busca
não encontrar cobrança, o financeiro pode confirmar que conferiu o painel e
encerrar a tentativa; o servidor busca novamente antes de liberar uma nova emissão.
Isso não é cancelamento de cobrança paga nem estorno automático.

Encerrar recorrência chama DELETE /subscriptions/<id>. Faturas já emitidas são
preservadas. Cancelar cobrança avulsa em aberto chama DELETE /payments/<id>.
404 é sucesso. Erro de comunicação mantém o estado local para permitir nova
conferência; a base não afirma cancelamento que o gateway não confirmou.
O sistema impede usar outro ambiente para cancelar/consultar uma cobrança antiga.

## Pontos de implementação em relação ao briefing

- Amanhã é calculado no fuso America/Sao_Paulo, corrigindo o exemplo UTC do texto.
- DDD 55 não é removido de celular de 11 dígitos; o prefixo de país só é removido
  em número de 13 dígitos, para não rejeitar celulares legítimos desse DDD.
- Falha ao completar CPF é mostrada ao usuário e não é silenciosamente ignorada:
  continuar com cliente inválido repetiria o ciclo de cobrança impossível.
- Mensagens de erro conservam a explicação do Asaas, com limites e remoção dos
  próprios segredos caso uma resposta externa os repita. Nenhum segredo é logado.
- O adapter permite checkout ausente em falha de consulta da primeira fatura,
  preservando a assinatura e oferecendo recuperação posterior por referência.
- Avisos adicionais por WhatsApp/e-mail do clube não estão configurados. O hook
  não bloqueante está disponível; lembretes padrão do Asaas ficam habilitados.

## Homologação ainda necessária

Nesta sessão não havia chave, token ou ambiente configurados na VPS. As páginas
públicas de referência Asaas consultadas retornaram HTTP 403; o contrato fornecido
foi a referência de implementação. Testes de rede externa com credenciais e de
checkout real não foram executados ou declarados aprovados.

Depois de configurar os segredos, testar a conexão e conferir nome/CNPJ da conta.
Somente com autorização específica, testar uma cobrança sandbox e os cinco eventos;
se usar produção, combinar previamente o teste de valor real e eventual estorno.
Não foram criados testes de R$ 1,00, clientes, cobranças, webhooks ou mensagens reais.
As conferências 2–4 do briefing permanecem pendentes até essa homologação.

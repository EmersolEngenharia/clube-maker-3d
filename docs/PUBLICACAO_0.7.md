# Publicação 0.7 — WhatsApp financeiro

Publicada em https://maker3d.emersol.ai em 01/11/2026 às 05:25 de Brasília.
SHA: `cb306ca21930e24c52e4e490145f31d3875d7150`.
Anterior: `7e6b09bc2e47c2514df84584248cb4529c6a2302`.
Backup: `/opt/maker3d/backups/deploy-cb306ca21930-20261101T082447Z`.
Runtime anterior guardado privadamente em `/etc/maker3d/runtime.env.before-evolution`.

## Configuração e validação

Evolution URL https://evolution.emersol.ai, instância Emerson, chave específica da
instância instalada no runtime privado, automação habilitada. Transferência da
credencial cifrada para uma chave temporária gerada na VPS; material temporário
removido. Nenhum segredo em código, logs ou documentação.

- 61 testes aprovados em SQLite e 61 em PostgreSQL/PGlite.
- QA desktop/celular: inscrição com CPF/CNPJ e WhatsApp, configuração financeira,
  condição especial, diagnóstico e fluxos financeiros anteriores.
- Container saudável; healthcheck HTTPS 200; hashes de billing.js, features.js,
  app.js e operations.js iguais aos locais.
- Diagnósticos autenticados reais: Evolution conectada e Asaas conectado.
- Migração `20261101082247_maker3d_whatsapp_family_automation` aplicada.
  Duas novas tabelas com RLS e sem SELECT para anon/authenticated. Consulta de
  advisors sem menção às novas tabelas.
- As seis famílias foram incluídas na configuração local. Na conferência, quatro
  tinham responsável principal e nenhuma tinha CPF/CNPJ para emissão automática.
  Esses dados devem ser completados em Cobranças; não foram inventados.
- Sessão temporária de verificação removida; tarefas temporárias Plesk removidas.

Não foram criadas mensagens/cobranças artificiais para teste. Os cinco lançamentos
anteriores mantêm o fingerprint `d05caeb0e1babb7e5cf1ce5f78dbc0f1`.
A automação habilitada pode enviar mensagens operacionais conforme a agenda e os
dados disponíveis. Testes locais de envio e conciliação usam provedores simulados;
primeira cobrança e entrega real no WhatsApp ainda devem ser acompanhadas.

## Operação e rollback

Ver [guia WhatsApp](WHATSAPP.md). Dados financeiros incompletos, solicitação manual
em andamento ou recebimento já registrado impedem emissão inicial duplicada.
Relatórios usam somente o responsável principal e os registros da própria família.
A fila não repete envios incertos sem conferência do financeiro.

Para rollback, seguir DEPLOY_RAPIDO.md com o backup acima, preservando tabelas,
recibos e histórico. Para suspender envios emergencialmente, definir
WHATSAPP_AUTOMATION_ENABLED=false no runtime e recriar o serviço. Isso não cancela
assinaturas Asaas: usar o cancelamento da cobrança para encerrar recorrências.
Um commit posterior apenas documental não altera o SHA da imagem publicada.

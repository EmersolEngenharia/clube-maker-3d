# Cupons, horas e WhatsApp

Registro da implementação inicial, incorporada à versão 0.4.0. Para o comportamento atual e a publicação, consulte ATUALIZACAO_0.4.md e PUBLICACAO_0.4.md.

- Em Famílias, use **Dar cupom ou horas**. Horas são concedidas em minutos ao saldo compartilhado do mês atual (Brasília), expiram ao virar o mês e valem para novas aprovações. Não alteram orçamentos anteriores nem a franquia permanente.
- Cupons oferecem desconto fixo em reais, são exclusivos de uma família, válidos no mês atual e de uso único. Para resgatar, informe código, valor original e valor efetivamente recebido em **Registrar pagamento**. O servidor confere o desconto. Isenção total permite valor recebido zero. Não afetam material ou pagamentos de projetos.
- Concessões ficam no histórico administrativo; o pagamento identifica o cupom e o desconto aplicado. Apenas a equipe pode conceder benefícios e registrar recebimentos.
- Responsáveis cadastram e atualizam o WhatsApp em **Meu perfil**, com DDD. Números brasileiros sem código de país recebem 55. Campo opcional e privado do responsável. O login continua por e-mail e senha.
- O administrador usa **Equipe e acessos → Adicionar à equipe** para conceder acesso operacional a usuários já cadastrados. Eles devem entrar novamente. A função não transforma o membro em administrador: preços e concessão de acessos continuam exclusivos do administrador original.

## Aplicação em produção

Antes de instalar esta versão, aplique `db/benefits-upgrade.sql` no banco PostgreSQL que já possui a atualização de perfis 0.3. A operação é aditiva e idempotente, com RLS e acesso exclusivo ao papel maker3d_app. Não reaplique as migrações anteriores. Faça backup antes da atualização. Depois instale o código, reinicie o serviço e confira os fluxos com uma família de teste.

No SQLite as tabelas adicionais são criadas automaticamente. Nenhuma alteração foi aplicada no Supabase remoto por esta entrega.

# Auditoria e evolução — Clube Maker 3D 0.3.0

Data: 31/10/2026. Escopo: código disponível neste repositório, interface, regras de
negócio, SQLite, compatibilidade PostgreSQL/PGlite, armazenamento e configuração de
implantação. A auditoria não é um teste de invasão do servidor de produção.

## Resultado

A versão 0.3.0 implementa os recursos pedidos mantendo o fluxo original de criação,
orçamento, aprovação, produção e retirada. A franquia continua compartilhada pela
família, conforme escolha do usuário. As novas funções têm autorização no backend,
persistência no banco e telas funcionais; não são apenas demonstrações visuais.

O código foi validado localmente. A migração de produção está preparada, mas não foi
aplicada ao projeto Supabase compartilhado e não houve publicação na VPS.

## Recursos entregues

| Área | Comportamento |
|---|---|
| Aparência | Temas Ateliê, Oceano, Inventor, Galáxia e Alto contraste; prévia ao selecionar e persistência por usuário. |
| Perfil | Nome editável, oito avatares, foto PNG/JPG/WebP de até 2 MB e remoção da foto do perfil. |
| Navegação | Modo com orientações ou compacto; menu móvel com quatro destinos principais e botão “Mais”; suporte a foco por teclado e redução de movimento. |
| Famílias | Equipe edita nome, plano e franquia; responsável edita o nome da própria família. Reduções não podem invalidar horas usadas ou reservadas no mês atual. |
| Dependentes | Criar, editar e desativar participantes; faixa etária opcional e preferências de aprendizagem. Desativação não apaga projetos antigos. |
| Equipe | Administrador concede/revoga acesso operacional de usuários de famílias; nome de membro editável. Vínculo familiar e papel de responsável/aprendiz são preservados. |
| Convites | Link para apresentação e inscrição de uma nova família; validade de 1 a 30 dias, limite de 1 a 10 inscrições e encerramento manual. |
| Divulgação | “Quero que poste…” com rascunho, texto, até cinco imagens/vídeos de 10 MB cada, revisão e autorização. |
| Campos opcionais | Nome da peça, legenda, público, preço sugerido, chamada para ação, redes de preferência e observações. |
| Consumo | Bateria da franquia, horas usadas/reservadas/disponíveis, horas extras e filamento discriminados, custos pendentes separados e extrato CSV do mês. |
| Rastreabilidade | Registro de alterações de famílias, dependentes, equipe, convites e fluxo de publicações; últimos 50 eventos visíveis ao administrador. |

“Integrante da equipe” concede acesso operacional ao clube. Não transforma a pessoa
em administrador: alteração de preços e concessão de acessos continuam exclusivas
do administrador. Participantes sem conta precisam aceitar um convite antes de
serem adicionados à equipe. Mudanças de acesso encerram as sessões dessa pessoa.

## Regras da bateria e dos custos

- Verde: saldo disponível; amarelo: saldo livre de até 20%; vermelho: existência
  de horas extras efetivamente consumidas no período.
- Uma reserva reduz o saldo livre, mas continua identificada separadamente do uso.
- Extras previstos na fila são apresentados como estimativas aprovadas; não são
  somados ao custo confirmado antes da conclusão.
- Todos os membros da mesma família veem a mesma franquia. Administradores sem
  família não recebem uma franquia fictícia; consultam as baterias das famílias.
- O período financeiro continua sendo o mês da aprovação do projeto, no horário
  de Brasília. Uma impressão realizada depois permanece no mês da cota reservada.
  Portanto, este relatório não representa exclusivamente a data física de impressão.
- Preços de material e hora extra são os gravados no orçamento. Alterar preços
  atuais não recalcula os orçamentos existentes.
- Mantido o teto aprovado: consumo abaixo da estimativa reduz cobrança; excesso
  além do orçamento é absorvido pelo clube. Falhas não consomem a franquia nem
  geram cobrança. Mensalidade/anuidade não está incluída em “adicionais confirmados”.

Exemplo validado: 12 h incluídas, 14 h faturáveis a R$ 6/h extra e 80 g de filamento
a R$ 120/kg resultam em 2 h extras (R$ 12) + R$ 9,60 de filamento = R$ 21,60.

## Achados e correções

| Prioridade | Evidência no código anterior | Tratamento |
|---|---|---|
| Alta — desempenho | `/api/dashboard` consultava família, projetos e membros repetidamente para cada família. | Consultas em lote, agrupamento em memória e uso dos projetos já carregados. Em administrador sem vínculo familiar: de 35 para 7 consultas com dez famílias, incluindo a sessão. |
| Alta — volume de resposta | Listagem carregava descrições extensas e notas de orçamento de todos os projetos. | Projeção de campos resumidos. Textos completos continuam disponíveis no detalhe do projeto. |
| Média — bloqueio da interface de rede | `scryptSync` bloqueava o event loop durante autenticação. | Derivação assíncrona de senhas, preservando os hashes existentes. Escritas continuam serializadas no piloto. |
| Média — entrega dos arquivos estáticos | Leitura síncrona de arquivos em cada requisição, sem ETag e passando pelo contexto do banco. | Arquivos pré-carregados, Brotli/Gzip pré-calculados, ETag com revalidação, `Vary: Accept-Encoding` e entrega fora da transação do banco. APIs privadas continuam `no-store`. |
| Média — SQLite | Faltavam índices presentes no PostgreSQL e consultas eram preparadas novamente a cada execução. | Índices para família/período, fila, usuários e relações; cache limitado a 100 statements. |
| Alta — autorização das novas funções | A base só tinha administrador, responsável e aprendiz. | Acesso operacional adicional sem eliminar família; controle administrativo separado e bloqueio de aprovação de custo de outra família, inclusive para responsáveis que integram a equipe. |
| Alta — mídia e crianças | Não havia fluxo de publicações e autorização. | Aprendiz → responsável → equipe; conteúdo privado; alteração de texto/arquivos exige novo rascunho e revoga autorização anterior. Sem publicação automática. |
| Média — cadastros | Famílias e participantes não podiam ser editados. | Rotas autorizadas, limites, preservação do histórico e formulários completos. |
| Média — consumo | Indicador simples de uso/reserva sem extras e material consolidados. | Cálculo mensal separado por natureza e bateria de saldo livre com texto, valores e cores. |
| Média — manutenção | Nenhuma rotina de descarte de sessões vencidas no login; mapa de tentativas mantinha entradas expiradas. | Limpeza de sessões expiradas ao entrar e descarte periódico de entradas vencidas do limitador. |
| Média — implantação | O Dockerfile copiava apenas os módulos antigos. | Inclusão do módulo de recursos; verificação de existência da atualização do banco ao iniciar em PostgreSQL. |

## Medição reproduzida nesta sessão

Comparação da revisão original com a versão modificada, mesmo ambiente local,
SQLite, dez famílias e 500 projetos. Cada projeto tinha uma descrição de 2.600
caracteres. Foram cinco requisições de aquecimento e 50 medidas sequenciais ao
painel de administrador.

| Medida | Original | Versão 0.3 |
|---|---:|---:|
| Corpo JSON do painel | 1.664.306 bytes | 190.357 bytes |
| Latência mediana local | 12,52 ms | 3,68 ms |
| Latência p95 local | 16,69 ms | 4,83 ms |

Redução de aproximadamente 88,6% no volume da resposta e 70,6% na mediana local.
O resultado não prevê a latência da VPS, do Supabase ou de dispositivos reais. Não
foi realizado teste de capacidade com centenas de usuários simultâneos. A nova
interface acrescenta funcionalidades e arquivos; sua entrega inicial usa compressão
e as visitas seguintes podem reutilizar conteúdo validado por ETag.

## Segurança verificada

- Consultas parametrizadas; dados textuais escapados antes de renderizar HTML.
- Sessões HttpOnly/SameSite e proteção de origem mantidas; cookies seguros exigidos
  em produção; tokens de convite e sessão armazenados como hash.
- RLS nas 18 tabelas do schema privado; acesso negado a `anon` e `authenticated`.
  O backend usa o papel dedicado e faz a autorização de família/equipe em cada rota.
- Novas mídias verificadas por extensão, tamanho e assinatura de arquivo; sem HTML
  ou SVG enviados pelo usuário. A assinatura não substitui uma análise antimalware.
- Fotos e mídia acessíveis somente ao dono, responsável autorizado da família ou
  equipe. Não foi criado bucket público nem URL pública de crianças.
- Identificadores de arquivo não bastam para download: autorização precede leitura.
- Nenhuma chave de produção foi inserida no frontend ou no repositório.
- Migração aditiva, testada duas vezes no mesmo banco PostgreSQL embarcado para
  verificar reaplicação e isolamento. A migração original não foi alterada.
- `npm audit --omit=dev`: zero vulnerabilidades conhecidas reportadas na consulta
  desta sessão. Isso não comprova ausência de vulnerabilidades desconhecidas.

## Validação executada

- `npm test`: 29 testes aprovados, incluindo subtestes.
- `npm run test:postgres`: os mesmos 29 testes aprovados em PostgreSQL embarcado.
- Teste de navegador original: cadastro, convites, projeto, orçamento, aprovação,
  saldo, aprendizado, cancelamento e configuração.
- Teste de navegador novo: inscrição por link, tema persistente, nome da família,
  dependente, imagem, vídeo MP4 real, autorização de responsável, revisão de equipe,
  bateria vermelha, exportação CSV e promoção de membro.
- Cinco temas em viewport de 390 px sem rolagem horizontal; desktop de 1.440 px;
  ausência de erros JavaScript/CSP nos fluxos exercitados.
- Verificação de sintaxe dos módulos e `git diff --check`.

Não foram medidos todos os critérios WCAG com auditoria especializada, navegadores
Safari/Firefox, dispositivos físicos, Storage Supabase real, proxy TLS ou envio para
redes sociais. PGlite valida SQL e regras do PostgreSQL, mas não reproduz a rede e
o ambiente gerenciado do Supabase.

## Pendências e próximos recursos recomendados

| Prioridade | Próxima melhoria | Motivo |
|---|---|---|
| Antes de produção | Aplicar migração, implantar versão e fazer teste com banco/Storage reais | A versão local não atualiza a VPS automaticamente. |
| Antes de ampliar o uso | Recuperação de senha e MFA para administradores | Ainda há apenas e-mail/senha e atendimento manual para recuperação. |
| Operação | Política de retenção, limpeza de objetos órfãos e restauração de backup testada | Trocar/remover fotos e remover anexos corta o acesso no portal, mas não apaga fisicamente o objeto do Storage. Upload seguido de rollback também pode deixar objeto órfão. |
| Escala | Paginação de projetos e agregação SQL dos indicadores | Publicações já usam cursor; o painel ainda carrega todos os resumos de projetos. |
| Escala | Transações menores e bloqueios por família/impressora | O bloqueio global é adequado ao piloto, mas uploads/Storage dentro da requisição transacional podem atrasar outras escritas. |
| Segurança operacional | Limitador compartilhado e monitoramento | O limite de tentativas é local à instância e não substitui proteção no proxy. Limites de armazenamento total por família ainda não existem. |
| Mídia | Processamento de imagens, remoção de EXIF, thumbnails e antivírus | Evita manter metadados de localização e reduz transferência de mídia. O código atual armazena o original. |
| Divulgação | Integração por fila com redes sociais, consentimento versionado e registro do link publicado | O estado “Pronto para divulgação” é interno. Não promete publicação externa. |
| Aprendizado | Missões maker, diário de descobertas e conquistas por habilidade | Incentiva evolução sem criar ranking de gastos ou competição entre crianças. |
| Comunidade | Galeria optativa de projetos e desafios em família | Compartilhamento com aprovação do responsável e sem exposição automática. |
| Gestão | Estoque de filamento por cor, alertas de reposição e custo real | Complementa o orçamento e evita prometer material indisponível. |
| Transparência | Avisos configuráveis de saldo baixo e limite de orçamento familiar | Ajuda o responsável a controlar extras sem bloquear a criatividade. |
| Atendimento | Agenda de oficinas e retirada; lista de espera do clube | Organiza a operação sem complicar o fluxo de criação. |

As sugestões acima são próximas etapas; não são funcionalidades implementadas
nesta versão, exceto onde explicitamente descrito como entregue.

# Impressora ao vivo (Bambu Lab X2D)

O portal fica na internet e a impressora na rede da Emersol. Um programa pequeno,
a **ponte**, roda num computador dessa rede, lê a impressora e envia o estado e uma
foto da câmera ao portal. É só leitura: o portal nunca comanda a impressora.

**Situação (10/11/2026):** em produção pelo Home Assistant. X2D (serial final 2505) na integração Bambu Lab v2.3.0, HA `ha-escritorio` em `100.71.78.56:8123` no mesmo tailnet da VPS. Estado e câmera confirmados no portal. A ponte própria continua testada só com impressora simulada.
O protocolo é o MQTT local das Bambu Lab, documentado pela comunidade (não pela
Bambu). O primeiro teste na máquina de verdade ainda precisa ser feito.

## O que o usuário ganha

- Cartão *Impressora ao vivo* na Agenda: livre/imprimindo, %, tempo restante, camada.
- Imagem da câmera a cada ~10 s, só para a família dona da peça e para a equipe.
- Quando a impressora termina, a equipe e a família são avisadas pelo WhatsApp e a
  equipe vê o tempo medido para registrar a conclusão.

## Caminho recomendado: Home Assistant (sem programa extra)

O servidor do portal já está no Tailscale. Se o Home Assistant da Emersol estiver no
mesmo tailnet, o portal lê a impressora direto dele, a cada 15 s, sem ponte.

1. **Home Assistant → integração Bambu Lab.** Instale pelo HACS o repositório
   `greghesp/ha-bambulab` (suporta a X2D), reinicie e adicione a integração. Ela
   encontra a impressora na rede local; informe o **código de acesso** que aparece na
   tela da X2D (Configurações → Rede / LAN). Confira se surgem os sensores de status,
   progresso e a câmera.
2. **Token.** No HA, entre com um usuário **administrador** → Perfil → Segurança →
   *Tokens de acesso de longa duração* → Criar. Copie o token.
3. **Portal.** Agenda da impressora → *Conectar a impressora* → endereço do HA no
   Tailscale (`http://100.x.y.z:8123` ou `http://<nome>.<tailnet>.ts.net:8123`) e o
   token. O portal procura a impressora, mostra o nome/modelo e começa a ler.

O token fica criptografado no banco (AES-GCM, chave derivada de um segredo que só o
servidor tem) e nunca volta para a tela. Alternativa: `HA_URL` e `HA_TOKEN` em
`/etc/maker3d/runtime.env`, que têm prioridade.

Se aparecer *"Não foi possível conectar ao Home Assistant"*: confira se o mini PC e a
VPS estão no mesmo tailnet (painel do Tailscale) e se o endereço abre a partir da VPS
(`curl http://100.x.y.z:8123/api/` deve responder 401).

## Alternativa: ponte própria (sem Home Assistant)

### Passo a passo

1. **Na impressora:** ative *Somente LAN* / *Modo desenvolvedor* e a visualização
   pela LAN. Anote o IP, o número de série e o código de acesso.
2. **No servidor do portal:** crie um segredo longo (32+ caracteres) e grave em
   `/etc/maker3d/runtime.env` como `PRINTER_BRIDGE_TOKEN=...`; recrie o contêiner.
3. **Num computador ligado na mesma rede** (Node 20+; `ffmpeg` instalado para a câmera):

   ```
   PRINTER_HOST=192.168.0.50 \
   PRINTER_SERIAL=NUMERO_DE_SERIE \
   PRINTER_ACCESS_CODE=codigo \
   PRINTER_BRIDGE_TOKEN=o_mesmo_segredo \
   node scripts/printer-bridge.mjs
   ```

   Opcionais: `PORTAL_URL` (padrão `https://maker3d.emersol.ai`),
   `PRINTER_CAMERA=off`, `PRINTER_CAMERA_URL` (padrão
   `rtsps://bblp:<código>@<ip>:322/streaming/live/1`), `PRINTER_MODEL`.
   O arquivo não tem dependências: basta copiar `scripts/printer-bridge.mjs`.
4. Deixe iniciando com o computador (Agendador de Tarefas, systemd ou pm2).

## Se não funcionar

- *"A impressora recusou a conexão"*: código de acesso errado ou modo LAN desligado.
- Estado aparece, câmera não: confira o `ffmpeg` e se a visualização pela LAN está
  ativa. Firmwares recentes mudam o acesso à câmera; o estado continua funcionando.
- *"Portal recusou o envio (401)"*: o segredo da ponte difere do servidor.
- Cartão mostra "Sem conexão": a ponte parou há mais de 3 minutos.

Não grave código de acesso nem segredo no repositório.

## Configuração atual da X2D

- *Visualização Liveview Apenas LAN*: **ligada** (necessária para a câmera).
- *Somente LAN*: desligado (mantém Bambu Cloud e Handy).
- Equipe vê a câmera da mesa a qualquer momento (quadro pedido ao HA só enquanto alguém olha, no
  máximo a cada 10 s); famílias, só durante a impressão da própria peça.

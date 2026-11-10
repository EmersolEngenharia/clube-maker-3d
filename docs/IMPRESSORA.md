# Impressora ao vivo (Bambu Lab X2D)

O portal fica na internet e a impressora na rede da Emersol. Um programa pequeno,
a **ponte**, roda num computador dessa rede, lê a impressora e envia o estado e uma
foto da câmera ao portal. É só leitura: o portal nunca comanda a impressora.

**Situação:** a ponte foi testada com uma impressora simulada, não com a X2D real.
O protocolo é o MQTT local das Bambu Lab, documentado pela comunidade (não pela
Bambu). O primeiro teste na máquina de verdade ainda precisa ser feito.

## O que o usuário ganha

- Cartão *Impressora ao vivo* na Agenda: livre/imprimindo, %, tempo restante, camada.
- Imagem da câmera a cada ~10 s, só para a família dona da peça e para a equipe.
- Quando a impressora termina, a equipe e a família são avisadas pelo WhatsApp e a
  equipe vê o tempo medido para registrar a conclusão.

## Passo a passo

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

#!/usr/bin/env bash
# Publica na VPS existente um commit que já está em origin/main e valida de fora.
# Uso: bash scripts/publicar.sh [SHA]   (padrão: HEAD). Acesso: Tailscale SSH ou ~/.maker3d/plesk-api-key.
set -euo pipefail
cd "$(dirname "$0")/.."
export PYTHONIOENCODING=utf-8
sha=$(git rev-parse "${1:-HEAD}") short=${sha:0:12} site=https://maker3d.emersol.ai
git fetch -q origin main
git merge-base --is-ancestor "$sha" origin/main || { echo "ERRO: $short não está em origin/main; faça push antes."; exit 1; }
# Caminho preferido: SSH pelo Tailscale (srv-plesk, sem senha). Sem Tailscale: Plesk HTTPS com a chave de API.
vps=root@100.100.10.64
if ssh -o BatchMode=yes -o ConnectTimeout=8 $vps true 2>/dev/null; then plesk() { ssh -o BatchMode=yes $vps bash; }
else plesk() { "$(command -v python || command -v python3)" scripts/plesk-exec.py; }; fi
log=/opt/maker3d/deploy-$short.log
if echo 'readlink -f /opt/maker3d/current' | plesk | grep -q "/$sha"; then
  echo "Produção já está em $short."
else
  plesk <<EOF
R=/opt/maker3d/releases/$sha
[ -d \$R/.git ] || { git init -q \$R && cd \$R && git fetch -q https://github.com/EmersolEngenharia/clube-maker-3d.git $sha && git checkout -q FETCH_HEAD; } || exit 1
cd \$R && setsid nohup bash -c 'bash scripts/deploy-release.sh; echo DEPLOY_EXIT=\$?' > $log 2>&1 < /dev/null &
echo iniciado
EOF
  for i in $(seq 1 40); do
    sleep 20
    out=$(echo "grep -a DEPLOY_EXIT= $log || true" | plesk)
    [[ "$out" == *DEPLOY_EXIT=* ]] && break
  done
  [[ "$out" == *DEPLOY_EXIT=0* ]] || { echo "ERRO: deploy falhou ou não terminou ($out). Log:"; echo "tail -n 25 $log" | plesk; exit 1; }
  echo "tail -n 6 $log | grep -v '^ *$'" | plesk
fi
# Validação externa: saúde, redirecionamento para HTTPS e arquivos servidos iguais ao commit.
for i in $(seq 1 12); do code=$(curl -s -o /dev/null -w '%{http_code}' $site/healthz); [[ $code == 200 ]] && break; sleep 5; done
echo "healthz: $code · http: $(curl -s -o /dev/null -w '%{http_code}' http://maker3d.emersol.ai/)"
[[ $code == 200 ]] || exit 1
bad=0
for f in app.js features.js operations.js billing.js gallery.js schedule.js schedule.css terms.js pricing.js styles.css brand.css brand-icon.svg; do
  [[ "$(curl -s $site/$f | sha256sum | cut -c1-64)" == "$(git show $sha:public/$f | sha256sum | cut -c1-64)" ]] || { echo "DIFERENTE: $f"; bad=1; }
done
(( bad == 0 )) && echo "OK: produção em $short; arquivos servidos iguais ao commit." || exit 1

#!/usr/bin/env bash
# Prepara a VPS para o GitHub Actions publicar o maker3d. Rodar como root, uma vez (é idempotente):
#   ssh root@100.100.10.64 bash < scripts/vps-instalar-deploy-automatico.sh
# Cria uma chave ed25519 só para isso e a registra no authorized_keys com comando forçado: quem tiver
# a chave só consegue pedir "deploy <SHA>" de um commit que esteja na main do GitHub. Sem shell, sem
# túneis. Para revogar: apague a linha "maker3d-github-actions" de /root/.ssh/authorized_keys.
set -Eeuo pipefail
gate=/opt/maker3d/deploy-gate.sh
key=/root/.ssh/maker3d_deploy

cat > "$gate" <<'GATE'
#!/usr/bin/env bash
# Comando forçado da chave maker3d-github-actions. Aceita só: deploy <SHA de 40 caracteres hex>.
set -Eeuo pipefail
read -r verbo sha extra <<<"${SSH_ORIGINAL_COMMAND:-}"
[[ "${verbo:-}" == deploy && "${sha:-}" =~ ^[0-9a-f]{40}$ && -z "${extra:-}" ]] || { echo 'uso: deploy <sha40>' >&2; exit 2; }
repo=https://github.com/EmersolEngenharia/clube-maker-3d.git
short=${sha:0:12} release=/opt/maker3d/releases/$sha log=/opt/maker3d/deploy-$short.log
if [[ "$(readlink -f /opt/maker3d/current)" == "$release" ]]; then echo "Produção já está em $short."; exit 0; fi
# Só publica commit que está na main do GitHub.
check=$(mktemp -d); trap 'rm -rf "$check"' EXIT
git init -q "$check"
git -C "$check" fetch -q --depth=200 --no-tags "$repo" main
git -C "$check" cat-file -e "$sha^{commit}" 2>/dev/null && git -C "$check" merge-base --is-ancestor "$sha" FETCH_HEAD \
  || { echo "ERRO: $short não está nos 200 últimos commits da main do GitHub." >&2; exit 3; }
if [[ ! -d $release/.git ]]; then
  git init -q "$release"; git -C "$release" fetch -q --no-tags "$repo" "$sha"; git -C "$release" checkout -q FETCH_HEAD
fi
[[ "$(git -C "$release" rev-parse HEAD)" == "$sha" ]]
# O deploy segue mesmo se a conexão cair; a chave espera o resultado e devolve o código de saída real.
rm -f "$log" "$log.exit"
( cd "$release" && setsid nohup bash -c 'bash scripts/deploy-release.sh; echo $? > "$0.exit"' "$log" > "$log" 2>&1 < /dev/null & )
for _ in $(seq 1 180); do [[ -f $log.exit ]] && break; sleep 5; done
[[ -f $log.exit ]] || { echo "ERRO: deploy não terminou em 15 min; veja $log" >&2; exit 4; }
code=$(<"$log.exit"); rm -f "$log.exit"
tail -n 8 "$log"
exit "$code"
GATE
chmod 700 "$gate"

if [[ ! -f $key ]]; then ssh-keygen -q -t ed25519 -N '' -C maker3d-github-actions -f "$key"; fi
if ! grep -q 'maker3d-github-actions' /root/.ssh/authorized_keys; then
  printf 'restrict,command="%s" %s\n' "$gate" "$(cat "$key.pub")" >> /root/.ssh/authorized_keys
fi
echo "Instalado. Gate: $gate · chave privada: $key (nunca impressa) · IP público: $(curl -s4 ifconfig.me)"

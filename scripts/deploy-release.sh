#!/usr/bin/env bash
# Run as root on the existing VPS, from a clean /opt/maker3d/releases/<SHA> checkout.
set -Eeuo pipefail
exec 9>/opt/maker3d/deploy.lock
flock -n 9 || { echo 'Another deployment is running'; exit 1; }
release=$(pwd -P)
sha=$(git rev-parse HEAD)
[[ "$release" == "/opt/maker3d/releases/$sha" ]]
[[ -z "$(git status --porcelain)" ]]
previous=$(readlink -f /opt/maker3d/current)
[[ -d "$previous" && "$previous" != "$release" ]]
backup="/opt/maker3d/backups/deploy-${sha:0:12}-$(date -u +%Y%m%dT%H%M%SZ)"
install -d -m 700 "$backup"
cp -p /etc/maker3d/version.env "$backup/version.env"
cp -p /etc/maker3d/compose-runtime.yml "$backup/compose-runtime.yml"
printf '%s\n' "$previous" > "$backup/previous-release.txt"
printf '%s\n' "$sha" > "$backup/candidate-sha.txt"
docker build -t "maker3d:$sha" -f deploy/Dockerfile .
candidate="maker3d-candidate-${sha:0:12}"
activated=0
cleanup() {
  code=$?
  trap - EXIT
  docker rm -f "$candidate" >/dev/null 2>&1 || true
  if (( code != 0 && activated )); then
    cp -p "$backup/version.env" /etc/maker3d/version.env
    ln -s "$previous" /opt/maker3d/current.rollback
    mv -Tf /opt/maker3d/current.rollback /opt/maker3d/current
    /opt/maker3d/service.sh up -d --no-build
    echo "Rollback restored $previous"
  fi
  exit "$code"
}
trap cleanup EXIT
docker run -d --name "$candidate" --env-file /etc/maker3d/runtime.env -e WHATSAPP_AUTOMATION_ENABLED=false \
  -e NODE_ENV=production -e HOST=0.0.0.0 -e PORT=3000 \
  -e DATABASE_MODE=postgres -e FILE_STORAGE=supabase \
  -e PUBLIC_ORIGIN=https://maker3d.emersol.ai -e COOKIE_SECURE=1 -e TRUST_PROXY=1 \
  -e DATABASE_CA_FILE=/run/secrets/supabase-ca.crt \
  -v /etc/maker3d/supabase-ca.crt:/run/secrets/supabase-ca.crt:ro \
  --read-only --tmpfs /tmp:size=32m,mode=1777 --cap-drop ALL \
  --security-opt no-new-privileges:true --memory 384m --cpus 1 \
  -p 127.0.0.1::3000 "maker3d:$sha" >/dev/null
port=$(docker port "$candidate" 3000/tcp | sed 's/127.0.0.1://')
healthy=0
for i in {1..20}; do
  if curl -fsS "http://127.0.0.1:$port/healthz" > "$backup/candidate-health.json"; then healthy=1; break; fi
  sleep 1
done
[[ "$healthy" == 1 ]]
for asset in brand.css brand-icon.svg favicon.svg app.js features.js operations.js billing.js; do
  curl -fsS -H "Host: maker3d.emersol.ai" "http://127.0.0.1:$port/$asset" | cmp - "public/$asset"
done
docker rm -f "$candidate" >/dev/null
printf 'MAKER3D_VERSION=%s\n' "$sha" > /etc/maker3d/version.env
chmod 600 /etc/maker3d/version.env
activated=1
ln -s "$release" /opt/maker3d/current.next
mv -Tf /opt/maker3d/current.next /opt/maker3d/current
/opt/maker3d/service.sh up -d --no-build
healthy=0
for i in {1..30}; do
  if [[ "$(docker inspect --format '{{.State.Health.Status}}' maker3d-app-1)" == healthy ]]; then healthy=1; break; fi
  sleep 1
done
[[ "$healthy" == 1 ]]
curl -fsS https://maker3d.emersol.ai/healthz
for asset in brand.css brand-icon.svg favicon.svg app.js features.js operations.js billing.js; do
  curl -fsS "https://maker3d.emersol.ai/$asset" | cmp - "public/$asset"
done
printf 'sha=%s\nprevious=%s\nbackup=%s\nchecked_utc=%s\n' "$sha" "$previous" "$backup" "$(date -u +%FT%TZ)" | tee /opt/maker3d/deployment.txt
printf '\n## %s\n\n' "$(date -u +%FT%TZ)" >> /opt/maker3d/DEPLOYMENT.md
cat /opt/maker3d/deployment.txt >> /opt/maker3d/DEPLOYMENT.md
/opt/maker3d/service.sh ps

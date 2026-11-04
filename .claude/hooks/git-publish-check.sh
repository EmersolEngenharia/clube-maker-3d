#!/usr/bin/env bash
# Stop hook: não deixa a sessão terminar com trabalho fora do origin.
# (maker3d: ignora .agents/ e .claude/launch.json, arquivos locais que não vão para o repositório.)
# Avisa quando sobrou coisa sem commit ou commit sem push — o Claude então
# fecha o ciclo (git add/commit/push — o push na main publica sozinho) antes de parar.
# Bloqueia no máximo uma vez por parada (stop_hook_active), para não virar loop
# quando o commit é impossível (conflito, credencial, nada a publicar).

set -uo pipefail
entrada=$(cat 2>/dev/null || echo '{}')

# Segunda passada: já avisamos, deixa parar.
printf '%s' "$entrada" | grep -q '"stop_hook_active"[[:space:]]*:[[:space:]]*true' && exit 0

cd "${CLAUDE_PROJECT_DIR:-$(pwd)}" 2>/dev/null || exit 0
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || exit 0

sujo=$(git status --porcelain -- . ':!.agents' ':!.claude/launch.json' 2>/dev/null | head -30)
ahead=$(git rev-list --count '@{u}..HEAD' 2>/dev/null || echo 0)

[ -z "$sujo" ] && [ "$ahead" = "0" ] && exit 0

if [ -n "$sujo" ]; then
  motivo="Ainda ha alteracoes nao commitadas neste repositorio. Rode git add/commit/push antes de encerrar (o push na main publica sozinho). Se a mudanca for intencionalmente temporaria, diga isso ao usuario. Arquivos: $(printf '%s' "$sujo" | tr '\n' ';' | cut -c1-500)"
else
  motivo="Existem $ahead commit(s) locais sem push. Rode git push antes de encerrar (o push na main publica sozinho)."
fi

motivo=$(printf '%s' "$motivo" | sed 's/\\/\\\\/g; s/"/\\"/g')
printf '{"decision":"block","reason":"%s"}\n' "$motivo"
exit 0

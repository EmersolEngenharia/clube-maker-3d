#!/usr/bin/env bash
# SessionStart hook: mantém a pasta local sincronizada com o origin.
# - fetch sempre
# - fast-forward automático quando a árvore está limpa e não há commits locais
# - apenas avisa (não mexe) quando há trabalho local, divergência ou conflito
# Saída: JSON (systemMessage p/ o usuário, additionalContext p/ o Claude).

set -uo pipefail
cd "${CLAUDE_PROJECT_DIR:-$(pwd)}" 2>/dev/null || exit 0
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || exit 0

# Trava anti-duplicacao: se o hook de projeto E o global estiverem ativos, os
# dois disparam no mesmo SessionStart. O segundo sai calado.
guard="$HOME/.claude/.git-sync-$(pwd | cksum | cut -d' ' -f1)"
now=$(date +%s)
last=$(cat "$guard" 2>/dev/null || echo 0)
[ $((now - last)) -lt 15 ] && exit 0
printf '%s' "$now" > "$guard" 2>/dev/null

emit() { # $1 = mensagem
  printf '%s\t%s\t%s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$(pwd)" "$1" >> "$HOME/.claude/git-sync.log" 2>/dev/null
  msg=$(printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g')
  printf '{"systemMessage":"%s","hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"Estado do git nesta máquina: %s"}}\n' "$msg" "$msg"
  exit 0
}

branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null)
git fetch --quiet --prune 2>/dev/null || emit "git fetch falhou (offline?) — pasta local pode estar desatualizada."

upstream=$(git rev-parse --abbrev-ref --symbolic-full-name '@{u}' 2>/dev/null) || emit "Branch '$branch' não tem upstream — nada para sincronizar."

counts=$(git rev-list --left-right --count "$upstream...HEAD" 2>/dev/null) || emit "Não foi possível comparar '$branch' com '$upstream'."
behind=$(printf '%s' "$counts" | cut -f1)
ahead=$(printf '%s' "$counts" | cut -f2)

[ "$behind" = "0" ] && emit "Pasta local já em dia com $upstream (ahead: $ahead)."

dirty=$(git status --porcelain 2>/dev/null | head -c 1)

if [ -n "$dirty" ]; then
  emit "ATENCAO: faltam $behind commit(s) de $upstream, mas ha alteracoes locais nao commitadas. Rode: git stash && git pull --ff-only && git stash pop"
fi

if [ "$ahead" != "0" ]; then
  emit "ATENCAO: branch '$branch' divergiu ($ahead local x $behind remoto). Resolva com: git pull --rebase"
fi

if git merge --ff-only --quiet "$upstream" 2>/dev/null; then
  emit "Pasta local atualizada automaticamente: $behind commit(s) trazidos de $upstream."
fi

emit "ATENCAO: nao foi possivel fazer fast-forward de $behind commit(s) de $upstream. Rode git pull manualmente."

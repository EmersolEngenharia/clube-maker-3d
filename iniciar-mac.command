#!/bin/bash
cd -- "$(dirname -- "$0")" || exit 1
if ! command -v node >/dev/null 2>&1; then
  echo 'Instale Node.js 24 ou superior em https://nodejs.org e tente novamente.'
  read -r -p 'Pressione Enter para fechar.'
  exit 1
fi
if ! node -e "if (Number(process.versions.node.split('.')[0]) < 24) process.exit(1)"; then
  echo 'Atualize o Node.js para a versão 24 ou superior.'
  exit 1
fi
echo 'Clube Maker 3D: mantenha esta janela aberta. Ctrl+C encerra o servidor.'
(sleep 2; open http://127.0.0.1:3000) &
node server.mjs

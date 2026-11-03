---
name: publicar
description: Publica o Clube Maker 3D em produção (maker3d.emersol.ai) — testes, commit, push, deploy na VPS via Plesk e validação externa. Use quando o Emerson pedir para publicar, subir, colocar no ar ou fazer deploy do maker3d.
---

Autorização permanente do Emerson: publicar sem pedir confirmação. Seja econômico: não leia docs inteiras nem o log todo; o script já resume.

1. Se houver mudanças não commitadas que façam parte do pedido: `npm test` (e `npm run test:postgres` se mexeu em server.mjs, db.mjs ou rotas). Commit em português, direto na `main` (fluxo deste repositório), e `git push origin main`.
   - Arquivo `.mjs` novo na raiz → incluir no `COPY` de `deploy/Dockerfile`.
   - Asset novo em `public/` → incluir em `staticFiles` (server.mjs) e nos dois laços de `scripts/deploy-release.sh`.
   - Migração de banco → aplicar antes do deploy e registrar; nunca recriar banco, contas, bucket ou proxy.
2. `bash scripts/publicar.sh` (em background se possível; leva de 3 a 8 min). Ele busca o commit no GitHub, roda `deploy-release.sh` na VPS (com rollback automático), espera e valida de fora (healthz, 301, SHA256 dos arquivos).
   - Sem `~/.maker3d/plesk-api-key`: peça ao Emerson para rodar uma vez `python scripts/plesk-criar-chave.py` no terminal (ele digita a senha; você nunca digita nem lê senha ou chave).
   - Falhou: mostre o trecho de erro; produção continua na versão anterior. Não repita às cegas.
3. Registre em uma linha no doc da funcionalidade em `docs/` (SHA, anterior, data, resultado), commit e push. Não publique de novo por causa desse commit de documentação.
4. Responda curto: o que foi ao ar, SHA, validação.

Nunca imprima, leia ou copie a chave (`~/.maker3d/plesk-api-key`) nem senhas do Notion.

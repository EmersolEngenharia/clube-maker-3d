#!/usr/bin/env python3
"""Cria uma chave de API do Plesk e a guarda em ~/.maker3d/plesk-api-key, só para este usuário.

A senha é pedida uma única vez, em prompt oculto, e não é gravada. A chave nunca é impressa.
Para revogar: Plesk > Ferramentas e Configurações > API, ou `plesk bin secret_key --delete -key <chave>`.
"""
import base64, getpass, json, os, pathlib, subprocess, sys, urllib.request
host = 'https://plesk.emersol.ai:8443'
target = pathlib.Path.home() / '.maker3d' / 'plesk-api-key'
if target.exists() and '--substituir' not in sys.argv:
    sys.exit(f'Já existe {target}. Use --substituir para criar outra.')
password = getpass.getpass('Senha Plesk (root): ')
req = urllib.request.Request(host + '/api/v2/auth/keys',
    data=json.dumps({'description': 'Maker3D: publicação pelo Claude Code'}).encode(),
    headers={'Authorization': 'Basic ' + base64.b64encode(('root:' + password).encode()).decode(), 'Content-Type': 'application/json'})
with urllib.request.urlopen(req, timeout=30) as response:
    key = json.load(response)['key']
target.parent.mkdir(exist_ok=True)
target.write_text(key + '\n')
if os.name == 'nt':
    subprocess.run(['icacls', str(target), '/inheritance:r', '/grant:r', f'{os.environ["USERNAME"]}:F'], check=True, capture_output=True)
else:
    target.chmod(0o600)
print(f'Chave criada e guardada em {target} (acesso só deste usuário).')

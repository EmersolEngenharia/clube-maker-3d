#!/usr/bin/env python3
"""Execute an authorized script through Plesk HTTPS; no third party dependencies."""
import argparse, base64, getpass, json, pathlib, re, sys, urllib.request
p = argparse.ArgumentParser(description=__doc__)
p.add_argument('--password-file', type=pathlib.Path)
p.add_argument('--host', default='https://plesk.emersol.ai:8443')
p.add_argument('--user', default='root')
p.add_argument('--script', type=pathlib.Path, help='Shell script; otherwise reads stdin')
a = p.parse_args()
password = a.password_file.read_text().rstrip('\r\n') if a.password_file else getpass.getpass('Senha Plesk: ')
auth = 'Basic ' + base64.b64encode((a.user + ':' + password).encode()).decode()
def api(params):
    req = urllib.request.Request(a.host + '/api/v2/cli/scheduler/call',
        data=json.dumps({'params': params}).encode(),
        headers={'Authorization': auth, 'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=50) as response:
        result = json.load(response)
    if result.get('code') != 0:
        raise RuntimeError('Plesk CLI rejected the operation: ' + str(result.get('code')))
    return result['stdout']
script = a.script.read_text() if a.script else sys.stdin.read()
# Plesk hides stdout on success. Exit 1 only in the transport wrapper and decode
# the real exit code below. Encoding also avoids Plesk's nested quote handling.
wrapped = '(\n' + script + '\n)\nresult=$?\nprintf "\\nMAKER3D_EXIT=%s\\n" "$result"\nexit 1\n'
command = 'echo ' + base64.b64encode(wrapped.encode()).decode() + ' | base64 -d | bash'
task = str(json.loads(api(['--create', '-user', a.user, '-type', 'exec',
    '-command', command, '-active', 'false', '-schedule', '0 0 1 1 *',
    '-notify', 'ignore', '-description', 'Maker3D temporary deployment operation', '-json']))['id'])
try:
    result = api(['--run', task])
    match = re.search(r'MAKER3D_EXIT=(\d+)', result)
    if not match:
        raise RuntimeError('No completion marker; inspect the operation before retrying.')
    output = result.split('output: ', 1)[-1]
    print(re.sub(r'\nMAKER3D_EXIT=\d+\s*$', '', output))
    code = int(match.group(1))
finally:
    api(['--delete', task])
sys.exit(code)

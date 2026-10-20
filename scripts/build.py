"""Rebuild checked-in plugins and deterministic, auditable install inventory."""
from pathlib import Path
import hashlib, json, subprocess
ROOT = Path(__file__).resolve().parents[1]
for name in ('personal-project-pages', 'personal-system-tools'):
    subprocess.run(['node', str(ROOT/'plugins'/name/'build.js')], check=True)
for p in ROOT.rglob('*.ps1'):
    if '.git' not in p.parts:
        text=p.read_text(encoding='utf-8-sig').replace('\r\n','\n')
        p.write_bytes(b'\xef\xbb\xbf'+text.replace('\n','\r\n').encode())
for p in ROOT.rglob('*.cmd'):
    if '.git' not in p.parts:
        p.write_bytes(p.read_text(encoding='utf-8-sig').replace('\r\n','\n').replace('\n','\r\n').encode())
files=[]
def add(source, destination):
    p=ROOT/source
    files.append({'source':source,'destination':destination,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()})
for p in sorted((ROOT/'vault-template').rglob('*')):
    if p.is_file():add(p.relative_to(ROOT).as_posix(),p.relative_to(ROOT/'vault-template').as_posix())
plugins=[]
for name in ('personal-project-pages','personal-system-tools'):
    folder=ROOT/'plugins'/name/'plugin';manifest=json.loads((folder/'manifest.json').read_text())
    plugins.append({'id':manifest['id'],'version':manifest['version'],'minAppVersion':manifest['minAppVersion']})
    for p in sorted(folder.rglob('*')):
        if p.is_file():add(p.relative_to(ROOT).as_posix(),'.obsidian/plugins/'+name+'/'+p.relative_to(folder).as_posix())
release={'schemaVersion':1,'version':'1.1.0','systemRoot':'personal-system-starter','plugins':plugins,'files':files}
(ROOT/'release.json').write_text(json.dumps(release,ensure_ascii=False,indent=2)+'\n')
backup=ROOT/'backup';checks={p.name:hashlib.sha256(p.read_text(encoding='utf-8-sig').replace('\r\n','\n').encode()).hexdigest() for p in sorted(backup.iterdir()) if p.is_file() and p.name!='checksums.json'}
(backup/'checksums.json').write_text(json.dumps(checks,ensure_ascii=False,indent=2)+'\n')
print(f'Release {release["version"]}: {len(files)} installable files, {len(plugins)} plugins')

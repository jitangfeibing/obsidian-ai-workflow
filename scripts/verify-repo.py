"""Check install completeness, rendered-view links, payload privacy and checksums."""
from pathlib import Path
import hashlib, json, re, subprocess
import yaml
ROOT=Path(__file__).resolve().parents[1]
release=json.loads((ROOT/'release.json').read_text())
assert release['schemaVersion']==1
destinations=set()
for item in release['files']:
    for key in ('source','destination'):
        p=Path(item[key]);assert not p.is_absolute() and '..' not in p.parts and '\\' not in item[key], item
    assert item['destination'] not in destinations,item['destination'];destinations.add(item['destination'])
    source=ROOT/item['source'];assert source.is_file() and not source.is_symlink()
    assert hashlib.sha256(source.read_bytes()).hexdigest()==item['sha256'],str(source)
assert len(release['plugins'])==2
seed=ROOT/'vault-template';views={}
for p in seed.rglob('*.base'):
    data=yaml.safe_load(p.read_text());assert isinstance(data['views'],list)
    assert 'file.inFolder("personal-system-starter")' in data['filters']['and'],f'Unscoped view: {p}'
    views[p.relative_to(seed).as_posix()]={v['name'] for v in data['views']}
for p in seed.rglob('*.md'):
    text=p.read_text();m=re.match(r'^---\n([\s\S]*?)\n---',text)
    assert m,f'Frontmatter missing: {p}'
    fm=yaml.safe_load(m[1]);assert isinstance(fm,dict)
    template='91_模板' in p.parts
    if not template:assert fm.get('type') in {'dashboard','guide'},f'Personal record in starter: {p}'
    assert not re.search(r'Newtalk|tiao|app\.notion\.com|tunnel_6acc|/workspace/scratch|C:\\Users\\',text,re.I),f'Private context: {p}'
    for target in re.findall(r'!?\[\[([^\]]+)\]\]',text):
        target=target.split('|')[0];path,sep,heading=target.partition('#')
        if '{{' in path or not path:continue
        if path.endswith('.base'):
            assert path in views,f'Missing Base {path} in {p}'
            if sep:assert heading in views[path],f'Missing Base view {heading} in {p}'
        else:assert (seed/path).exists() or (seed/(path+'.md')).exists(),f'Missing link {path} in {p}'
clip=json.loads((ROOT/'clipper/Obsidian-Web-Clipper.json').read_text())
assert clip['path']=='personal-system-starter/01_收集' and not clip.get('vault')
assert not re.search(r'tunnel_[0-9a-f]{32}|sk-[A-Za-z0-9_-]{25,}',json.dumps(clip))
checks=json.loads((ROOT/'backup/checksums.json').read_text())
for name,sha in checks.items():
    assert '/' not in name and '\\' not in name
    assert hashlib.sha256((ROOT/'backup'/name).read_text(encoding='utf-8-sig').replace('\r\n','\n').encode()).hexdigest()==sha
# Generic documentation links must resolve locally (images included).
for p in [ROOT/'README.md',*list((ROOT/'docs').glob('*.md'))]:
    for link in re.findall(r'\]\(([^)]+)\)',p.read_text()):
        if '://' in link or link.startswith('#'):continue
        path=link.split('#')[0]
        assert (p.parent/path).exists(),f'Broken doc link {path} in {p}'
for p in ROOT.rglob('*.ps1'):
    assert p.read_bytes().startswith(b'\xef\xbb\xbf'),f'Windows PowerShell UTF-8 BOM missing: {p}'
print(f'PASS {len(destinations)} payload files; 11 templates; Base/document links; empty generic vault; plugin/backup hashes; Windows encodings')

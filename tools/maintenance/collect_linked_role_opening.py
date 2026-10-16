"""Collect current advert-link source/tests only. No runtime imports, network, credentials or database access."""
import argparse,hashlib,json,re,sys
from pathlib import Path

def collect(root):
    selected=set()
    fixed=[
        'templates/standard-cover-letter.md',
        'src/domain/cover-letter/generate-cover-letter.js',
        'src/domain/cover-letter/validate-cover-letter.js',
        'src/domain/cover-letter/fill-template.js',
        'src/domain/shared/legacy-advert-normalization.js',
        'src/application/compose-outreach-letter.js',
        'src/application/outreach-message-snapshot.js',
        'src/application/outreach-final-identity.js',
        'src/application/outreach-recipient-identity.js',
        'src/application/cover-letter-controls.js',
        'src/interfaces/http/cover-letter-html.js'
    ]
    selected.update(fixed)
    pattern=re.compile(r'normalizeLegacyAdvert|embedCanonicalAdvertHtml|composeOutreachLetter|extractOutreachExperienceBody|renderCoverLetterHtml|snapshotMessage|finalizeOutreachIdentity|generateCoverLetter|Job advert:|jobAdvertLink')
    for directory in ('src','tests'):
        base=root/directory
        if not base.is_dir():continue
        for p in base.rglob('*.js'):
            if p.is_symlink() or not p.resolve().is_relative_to(root):continue
            if any(x in ('node_modules','__pycache__','.git') for x in p.relative_to(root).parts):continue
            content=p.read_text(encoding='utf-8-sig')
            if pattern.search(content):selected.add(p.relative_to(root).as_posix())
    files=[]
    for relative in sorted(selected):
        p=root/relative
        if p.is_symlink() or not p.resolve().is_relative_to(root):raise RuntimeError('Refusing symlink/outside path: '+relative)
        if not p.is_file():files.append({'path':relative,'missing':True});continue
        raw=p.read_bytes()
        files.append({'path':relative,'missing':False,'sha256':hashlib.sha256(raw).hexdigest(),'content':raw.decode('utf-8-sig')})
    return {'purpose':'Current source for linked-role opening patch; no application code executed','files':files}

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root',type=Path,default=Path.cwd())
    args=parser.parse_args();root=args.root.resolve()
    if not (root/'src').is_dir() or not (root/'package.json').is_file():raise RuntimeError('Run from the NewModularProduct project root or supply --root.')
    data=collect(root);folder=root/'tools/maintenance';folder.mkdir(parents=True,exist_ok=True)
    output=folder/'linked-role-opening-source.json'
    with output.open('x',encoding='utf-8') as f:json.dump(data,f,ensure_ascii=False,indent=2)
    print('SOURCE CAPTURE COMPLETE: '+str(output))
    print('Files captured: '+str(sum(not e['missing'] for e in data['files'])))
    print('Bytes: '+str(output.stat().st_size))
    print('Application source unchanged. Review the bundle for hard-coded private information before sharing.')
if __name__=='__main__':
    try:main()
    except Exception as e:print('ERROR: '+str(e),file=sys.stderr);sys.exit(1)

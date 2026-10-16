"""Bootstrap isolated local-production directories and capture deployment inputs in one run.
Does NOT commit, deploy, load .env, copy runtime data or start application/Gmail workers.
"""
import argparse,hashlib,json,os,subprocess,sys
from pathlib import Path
from datetime import datetime,timezone

def git(root,*args):
    r=subprocess.run(['git',*args],cwd=root,env={**os.environ,'GIT_OPTIONAL_LOCKS':'0'},capture_output=True)
    if r.returncode:raise RuntimeError('Git inspection failed: '+' '.join(args))
    return r.stdout.decode('utf-8','replace')
def zero(v):return [x for x in v.split('\0') if x]
def create_once(path,content):
    if path.exists():return False
    with path.open('x',encoding='utf-8') as f:f.write(content)
    return True

def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--root',type=Path,default=Path.cwd());p.add_argument('--production-root',type=Path);a=p.parse_args();root=a.root.resolve()
    if not (root/'package.json').is_file():raise RuntimeError('Run from NewModularProduct project root.')
    repository=Path(git(root,'rev-parse','--show-toplevel').strip()).resolve()
    prod=(a.production_root if a.production_root else Path(root.anchor)/(root.name+'-Production')).resolve()
    if prod==root or prod.is_relative_to(repository) or repository.is_relative_to(prod):raise RuntimeError('Production root must be outside and separate from the repository.')
    if prod.is_symlink():raise RuntimeError('Production root cannot be a symlink.')
    marker=prod/'bootstrap-manifest.json'
    if prod.exists() and any(prod.iterdir()) and not marker.is_file():raise RuntimeError('Existing nonempty destination is not owned by this bootstrap. Supply another --production-root.')
    folders=['releases','shared/config','shared/data','shared/logs','shared/backups','verification']
    for relative in folders:
        target=prod/relative
        if target.is_symlink() or not target.resolve().is_relative_to(prod):raise RuntimeError('Unsafe production directory.')
    productionMeta={'kind':'NewModularProduct-local-production-bootstrap-v1','state':'UNPROVISIONED','sourceProject':str(root),'productionRoot':str(prod),'proposedHost':'127.0.0.1','proposedPort':3100,'activeRelease':None,'note':'Directory scaffold only. No application has been deployed or started.'}
    if marker.is_file():
        existing=json.loads(marker.read_text(encoding='utf-8'))
        if existing.get('kind')!=productionMeta['kind'] or existing.get('sourceProject')!=str(root):raise RuntimeError('Existing bootstrap belongs to another source/project.')
    staged=zero(git(root,'diff','--cached','--name-only','-z'));prefix=git(root,'rev-parse','--show-prefix').strip()
    files=['package.json','package-lock.json','.gitignore','.gitattributes','playwright.config.js','playwright.contacts.config.js',
      'src/interfaces/http/run-local-server.js','src/interfaces/http/create-local-server.js','src/config/load-runtime-config.js','src/config/validate-runtime-config.js',
      'src/infrastructure/applications/sqlite-review-store.js','src/infrastructure/outreach/sqlite-outreach-repository.js','src/application/recruiter-contact-store.js','scripts/run-tests-concise.mjs']
    files.extend(x.relative_to(root).as_posix() for x in root.glob('*.bat') if not x.is_symlink())
    for folder in ('python-worker','tools/deploy'):
        base=root/folder
        if base.is_dir():
            files.extend(x.relative_to(root).as_posix() for x in base.rglob('*') if x.is_file() and not x.is_symlink() and (x.name.startswith('requirements') and x.suffix=='.txt' or x.name=='pyproject.toml'))
    sources=[]
    for name in sorted(set(files)):
        file=root/name
        if file.is_symlink() or not file.resolve().is_relative_to(root):raise RuntimeError('Unsafe source path: '+name)
        if file.is_file():
            raw=file.read_bytes();sources.append({'path':name,'missing':False,'sha256':hashlib.sha256(raw).hexdigest(),'content':raw.decode('utf-8-sig')})
        else:sources.append({'path':name,'missing':True})
    versions={}
    for command in (['git','--version'],['node','--version'],[sys.executable,'--version']):
        r=subprocess.run(command,cwd=root,capture_output=True,text=True);versions[command[0]]=(r.stdout or r.stderr).strip()
    audit={'purpose':__doc__,'bootstrap':productionMeta,'repositoryRoot':str(repository),'projectPrefix':prefix,'branch':git(root,'branch','--show-current').strip(),'head':git(root,'rev-parse','HEAD').strip(),
      'stagedRepositoryRelative':staged,'stagedOutsideProject':[s for s in staged if prefix and not s.startswith(prefix)],
      'unstaged':zero(git(root,'diff','--name-only','-z','--','.')),'untracked':zero(git(root,'ls-files','--others','--exclude-standard','-z','--','.')),
      'tracked':zero(git(root,'ls-files','-z','--','.')),'versions':versions,'sources':sources,
      'privacy':'No .env, credential, CV, database or contact-data contents loaded. No Git diff or remote URL collected. Review source and launcher contents for hard-coded private values before uploading.'}
    for relative in folders:(prod/relative).mkdir(parents=True,exist_ok=True)
    create_once(marker,json.dumps(productionMeta,indent=2))
    create_once(prod/'shared/config/production.env.example',
      '# EXAMPLE ONLY. Not active configuration; do not place credentials in Git.\nHOST=127.0.0.1\nPORT=3100\nENABLE_GMAIL=false\nENABLE_GMAIL_SENDING=false\nENABLE_GMAIL_DRAFT_CREATION=false\nENABLE_GMAIL_MAILBOX_CHECK=false\nENABLE_GMAIL_SIGNATURE=false\nENABLE_PERPLEXITY_RESEARCH=false\nENABLE_COVER_LETTER_REFINEMENT=false\n')
    create_once(prod/'README-LOCAL-PRODUCTION.txt',
      'Local production scaffold — NOT YET DEPLOYED\n\nReleases belong under releases; runtime configuration/data/logs/backups belong under shared.\nNo development data, secrets or OAuth tokens were copied. No server was started.\nUse a tested committed release, isolated dependencies, explicit storage paths, coordinated backups and non-side-effecting health checks before promotion.\nNever rewind mail-operation history blindly during code rollback.\nNo automatic promotion or email sending is enabled by this bootstrap.\n')
    output=root/'tools/maintenance';output.mkdir(parents=True,exist_ok=True)
    report=output/('local-production-audit-'+datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')+'.json')
    with report.open('x',encoding='utf-8') as f:json.dump(audit,f,ensure_ascii=False,indent=2)
    print('PRODUCTION DIRECTORY SCAFFOLD READY: '+str(prod));print('DEPLOYMENT STATUS: UNPROVISIONED — no application running from this scaffold.')
    print('AUDIT: '+str(report));print('Git index/history and application runtime data unchanged.')
if __name__=='__main__':
    try:main()
    except Exception as e:print('ERROR: '+str(e),file=sys.stderr);sys.exit(1)

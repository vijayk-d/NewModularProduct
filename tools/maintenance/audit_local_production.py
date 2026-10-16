"""Read-only Git/runtime source audit for local production planning. Never stages, commits, deploys or loads .env."""
import argparse,hashlib,json,subprocess,sys
from pathlib import Path
from datetime import datetime,timezone

def git(root,*args):
    r=subprocess.run(['git',*args],cwd=root,capture_output=True)
    if r.returncode:raise RuntimeError('Git inspection failed: '+' '.join(args))
    return r.stdout.decode('utf-8','replace')
def split0(value):return [v for v in value.split('\0') if v]
def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--root',type=Path,default=Path.cwd());a=p.parse_args();root=a.root.resolve()
    if not (root/'package.json').is_file():raise RuntimeError('Run from the application project root.')
    top=git(root,'rev-parse','--show-toplevel').strip();prefix=git(root,'rev-parse','--show-prefix').strip()
    branch=git(root,'branch','--show-current').strip();head=git(root,'rev-parse','HEAD').strip()
    staged=split0(git(root,'diff','--cached','--name-only','-z'))
    unstaged=split0(git(root,'diff','--name-only','-z','--','.'))
    untracked=split0(git(root,'ls-files','--others','--exclude-standard','-z','--','.'))
    tracked=split0(git(root,'ls-files','-z','--','.'))
    def sensitive(n):
        path=Path(n);low=n.lower();parts=[s.lower() for s in path.parts]
        return path.name.lower().startswith('.env') or path.suffix.lower() in ('.db','.sqlite','.sqlite3','.pem','.pfx','.key','.pdf','.docx') or any(x in parts for x in ('node_modules','__pycache__','backups')) or any(x in low for x in ('credential','refresh-token','client-secret'))
    stagedOutside=[n for n in staged if prefix and not n.startswith(prefix)]
    fixed=['package.json','package-lock.json','.gitignore','.gitattributes','playwright.config.js','playwright.contacts.config.js',
        'src/interfaces/http/run-local-server.js','src/interfaces/http/create-local-server.js',
        'src/config/load-runtime-config.js','src/config/validate-runtime-config.js',
        'src/infrastructure/applications/sqlite-review-store.js','src/infrastructure/outreach/sqlite-outreach-repository.js',
        'src/application/recruiter-contact-store.js','scripts/run-tests-concise.mjs']
    for p in root.glob('*.bat'):fixed.append(p.relative_to(root).as_posix())
    for folder in ('python-worker','tests'):
        d=root/folder
        if d.exists():
            for p in d.rglob('*'):
                if p.is_file() and not p.is_symlink() and (p.name.lower().startswith('requirements') and p.suffix=='.txt' or p.name=='pyproject.toml'):
                    fixed.append(p.relative_to(root).as_posix())
    sources=[]
    for n in sorted(set(fixed)):
        f=root/n
        if f.is_symlink() or not f.resolve().is_relative_to(root):raise RuntimeError('Unsafe source path: '+n)
        if not f.is_file():sources.append({'path':n,'missing':True});continue
        raw=f.read_bytes();sources.append({'path':n,'missing':False,'sha256':hashlib.sha256(raw).hexdigest(),'content':raw.decode('utf-8-sig')})
    versions={}
    for command in (['git','--version'],['node','--version'],[sys.executable,'--version']):
        r=subprocess.run(command,cwd=root,capture_output=True,text=True);versions[command[0]]=(r.stdout or r.stderr).strip()
    storage=[]
    for directory in ('data','output','var'):
        d=root/directory
        if d.is_dir():
            for p in d.glob('*'):
                if p.is_file() and not p.is_symlink() and p.suffix.lower() in ('.db','.sqlite','.sqlite3'):
                    storage.append({'path':p.relative_to(root).as_posix(),'sizeBytes':p.stat().st_size})
    result={'purpose':__doc__,'projectRoot':str(root),'repositoryRoot':top,'projectPrefix':prefix,'branch':branch,'head':head,
        'versions':versions,'stagedPathsRepositoryRelative':staged,'stagedOutsideProject':stagedOutside,
        'unstagedPaths':unstaged,'untrackedPaths':untracked,'trackedPathsRequiringPrivacyReview':[n for n in tracked if sensitive(n)],
        'stagedPathsRequiringPrivacyReview':[n for n in staged if sensitive(n)],'databaseFileMetadataOnly':storage,'sources':sources,
        'notes':['No Git index/history writes. No remote URLs or raw diffs collected. No .env, database, CV, contact-data or log contents collected.',
        'Paths, launcher commands and source/config files can contain private information or hard-coded secrets; review before sharing.']}
    out=root/'tools/maintenance';out.mkdir(parents=True,exist_ok=True)
    target=out/('local-production-audit-'+datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')+'.json')
    with target.open('x',encoding='utf-8') as f:json.dump(result,f,ensure_ascii=False,indent=2)
    print('AUDIT READY: '+str(target));print('Branch: '+branch);print('HEAD: '+head)
    print('Staged outside project: '+str(len(stagedOutside)));print('Staged privacy-review paths: '+str(len(result['stagedPathsRequiringPrivacyReview'])))
    print('Git index/history, application source and runtime data unchanged. Only this audit file was created.')
if __name__=='__main__':
    try:main()
    except Exception as e:print('ERROR: '+str(e),file=sys.stderr);sys.exit(1)

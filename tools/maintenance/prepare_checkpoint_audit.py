"""Read-only Git/maintenance/docs audit; optional current-source text bundle."""
import argparse
from datetime import datetime,timezone
import json
from pathlib import Path
import shutil
import subprocess

DOCS=('NewModularProduct-Overall-Plan-Status.md','NewModularProduct-Full-Migration-Plan.md','NewModularProduct-Architecture.md')
SKIP={'node_modules','.git','.venv','venv','__pycache__','dist','build','.next','coverage','archive','backups'}
SOURCE_EXT={'.js','.mjs','.cjs','.jsx','.ts','.tsx','.py','.css','.html'}
MAINT_EXT={'.py','.ps1','.bat','.mjs','.js','.zip','.bak','.txt','.log'}

def default_root():
    p=Path(__file__).resolve()
    return p.parents[2] if p.parent.name=='maintenance' and p.parent.parent.name=='tools' else Path.cwd()

def git(root,*args,required=True):
    r=subprocess.run(['git','--no-optional-locks','-C',str(root),*args],capture_output=True,timeout=30)
    if r.returncode and required:raise RuntimeError('Git inspection failed: '+r.stderr.decode('utf-8','replace').strip())
    return r.stdout

def sensitive(name):
    p=Path(name);base=p.name.lower();parts=[v.lower() for v in p.parts]
    return (base.startswith('.env') and base not in ('.env.example','.env.sample','.env.template')) or (parts and parts[0] in ('output','data','var','backups')) or p.suffix.lower() in ('.db','.sqlite','.sqlite3','.pdf','.docx','.pem','.p12','.key','.bak','.log') or ('contact' in base and p.suffix.lower()=='.json')

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root',type=Path,default=default_root())
    parser.add_argument('--include-source',action='store_true')
    args=parser.parse_args();root=args.root.resolve()
    if not (root/'src').is_dir():raise RuntimeError('Project root with src is required.')
    if not shutil.which('git'):raise RuntimeError('Git is not on PATH; no project changes made.')
    top=Path(git(root,'rev-parse','--show-toplevel').decode().strip()).resolve()
    if not root.is_relative_to(top):raise RuntimeError('Unexpected Git root.')
    prefix=root.relative_to(top).as_posix();prefix='' if prefix=='.' else prefix+'/'
    project_path=lambda name:name[len(prefix):] if prefix and name.startswith(prefix) else name
    tracked={project_path(v.decode('utf-8','replace')) for v in git(root,'ls-files','--full-name','-z','--','.').split(b'\0') if v}
    tokens=[v.decode('utf-8','replace') for v in git(root,'status','--porcelain=v1','-z','--untracked-files=all','--','.').split(b'\0') if v]
    status=[];i=0
    while i<len(tokens):
        item=tokens[i];i+=1
        row={'index':item[:1],'worktree':item[1:2],'path':project_path(item[3:])}
        if 'R' in item[:2] or 'C' in item[:2]:
            if i<len(tokens):row['originalPath']=project_path(tokens[i]);i+=1
        status.append(row)
    staged_all=[v.decode('utf-8','replace') for v in git(top,'diff','--cached','--name-only','-z').split(b'\0') if v]
    staged_inside=[project_path(v) for v in staged_all if not prefix or v.startswith(prefix)]
    outside=[v for v in staged_all if prefix and not v.startswith(prefix)]
    scans=[]
    for folder in ('src','python-worker','tests','test','scripts','.github','.vscode'):
        directory=root/folder
        if directory.is_symlink():continue
        for p in directory.rglob('*'):
            rel=p.relative_to(root)
            if any(v.lower() in SKIP for v in rel.parts) or p.is_symlink() or not p.is_file():continue
            if not p.resolve().is_relative_to(root) or p.stat().st_size>2*1024*1024:continue
            if p.suffix.lower() not in SOURCE_EXT|{'.json','.yml','.yaml','.toml','.ps1','.bat'}:continue
            try:scans.append((rel.as_posix(),p.read_text(encoding='utf-8-sig').replace('\\','/')))
            except (UnicodeError,OSError):pass
    for name in ('package.json','start-local-server.bat'):
        p=root/name
        if p.is_file() and not p.is_symlink():
            try:scans.append((name,p.read_text(encoding='utf-8-sig').replace('\\','/')))
            except (UnicodeError,OSError):pass
    candidates=[]
    for p in root.iterdir():
        if p.is_file() and not p.is_symlink() and p.suffix.lower() in MAINT_EXT and p.name not in ('start-local-server.bat',):candidates.append(p)
    for folder in ('tools','scripts'):
        directory=root/folder
        if directory.is_symlink():continue
        for p in directory.rglob('*'):
            rel=p.relative_to(root)
            if any(v.lower() in SKIP for v in rel.parts) or p.is_symlink() or not p.is_file():continue
            if p.suffix.lower() in MAINT_EXT and p.resolve().is_relative_to(root):candidates.append(p)
    utilities=[]
    for p in sorted(set(candidates)):
        name=p.relative_to(root).as_posix()
        refs=[path for path,body in scans if path!=name and name in body]
        if name.startswith('tools/patches/'):classification='REVIEW_APPLIED_PACKAGE_KEEP_ROLLBACK_CHAIN'
        elif refs:classification='KEEP_OR_REFACTOR_REFERENCED'
        elif name.startswith('tools/maintenance/'):classification='REVIEW_REUSABLE_VS_ONE_OFF'
        else:classification='ARCHIVE_CANDIDATE_REQUIRES_APPROVAL'
        utilities.append({'path':name,'tracked':name in tracked,'classification':classification,'runtimeReferenceEvidence':refs[:30]})
    docs={};missing=[]
    for name in DOCS:
        p=root/name
        if not p.is_file() or p.is_symlink():missing.append(name);continue
        if p.stat().st_size>2*1024*1024:raise RuntimeError('Plan document exceeds 2 MiB: '+name)
        docs[name]=p.read_text(encoding='utf-8-sig')
    source={}
    if args.include_source:
        for folder in ('src','python-worker','tests','test'):
            directory=root/folder
            if directory.is_symlink():continue
            for p in directory.rglob('*'):
                rel=p.relative_to(root)
                if any(v.lower() in SKIP for v in rel.parts) or p.is_symlink() or not p.is_file():continue
                if p.suffix.lower() not in SOURCE_EXT or not p.resolve().is_relative_to(root):continue
                if any(v in p.name.lower() for v in ('credentials','client_secret','token_cache')):continue
                if p.stat().st_size>2*1024*1024:raise RuntimeError('Source file exceeds 2 MiB: '+rel.as_posix())
                source[rel.as_posix()]=p.read_text(encoding='utf-8-sig')
        p=root/'package.json'
        if p.is_file() and not p.is_symlink():source['package.json']=p.read_text(encoding='utf-8-sig')
    report={'purpose':'Read-only checkpoint preparation; no Git writes, deletion or commit',
        'branch':git(root,'branch','--show-current').decode().strip(),
        'head':git(root,'rev-parse','--short','HEAD',required=False).decode().strip() or '[no HEAD]',
        'projectPrefixInRepository':prefix or '.',
        'status':status,'stagedProjectPaths':staged_inside,'stagedOutsideProject':outside,
        'sensitiveStagedPaths':[v for v in staged_inside if sensitive(v)],
        'sensitiveChangedPaths':[v['path'] for v in status if sensitive(v['path'])],
        'utilityInventory':utilities,'missingPlanDocuments':missing,
        'notes':['Reference scanning is evidence, not proof. Dynamic calls/hooks may be missed.',
                 'No raw git diff, remote URL, .env, database, CV or log contents were collected.',
                 'Source/docs may contain hard-coded secrets or private information: review before upload.',
                 'Git index, branches, commit history, source files and architecture docs were not changed.']}
    total=sum(len(s.encode('utf-8')) for s in {**docs,**source}.values())
    if total>30*1024*1024:raise RuntimeError('Bundle exceeds 30 MiB; no output written.')
    folder=root/'var/maintenance/bundles'
    if any(p.is_symlink() for p in (root/'var',root/'var/maintenance',folder)):raise RuntimeError('Unsafe output directory.')
    folder.mkdir(parents=True,exist_ok=True)
    output=folder/('codebase-checkpoint-audit-'+datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')+'.txt')
    with output.open('x',encoding='utf-8',newline='\n') as f:
        f.write('CODEBASE CHECKPOINT AUDIT\n')
        for name,body in [('CHECKPOINT_AUDIT.json',json.dumps(report,indent=2,ensure_ascii=True)),*docs.items(),*source.items()]:
            f.write(f'========== BEGIN FILE: {name} ==========\n{body}\n========== END FILE: {name} ==========\n\n')
    print(f'Audit: {output}')
    print(f'Utility candidates: {len(utilities)}; plan documents: {len(docs)}; source files: {len(source)}')
    print(f'Sensitive staged paths: {len(report["sensitiveStagedPaths"])}; staged outside project: {len(outside)}')
    print('No commit/deletion/staging occurred. Review the text before uploading.')
if __name__=='__main__':
    try:main()
    except Exception as e:raise SystemExit('ERROR: '+str(e))

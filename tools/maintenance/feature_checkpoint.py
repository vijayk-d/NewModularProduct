"""Explicit feature checkpoint: preview by default; documentation and staging are opt-in. Never commits/pushes."""
import argparse,csv,hashlib,json,os,re,subprocess,sys
from datetime import datetime,timezone
from pathlib import Path,PurePosixPath
HERE=Path(__file__).resolve().parent
SCOPE_HASH='f3892f9e4ba3533c11e8b972de55b478f77a2b9817cf681614b052492b818f5e'
MARKER='<!-- feature-checkpoint-reconciliation-20261015 -->'
def sha(value):return hashlib.sha256(value).hexdigest()
def normalized(value):return sha(value.decode('utf-8-sig').replace('\r\n','\n').rstrip('\n').encode())
def encoded(text,old):
    value=text.encode('utf-8')
    if b'\r\n' in old:value=value.replace(b'\n',b'\r\n')
    return (b'\xef\xbb\xbf' if old.startswith(b'\xef\xbb\xbf') else b'')+value

def safe(root,name):
    rel=PurePosixPath(name)
    if rel.is_absolute() or '..' in rel.parts or '\\' in name or ':' in name:raise RuntimeError('Unsafe relative path.')
    p=root.joinpath(*rel.parts)
    if not p.resolve().is_relative_to(root):raise RuntimeError('Path leaves project: '+name)
    q=p
    while q!=root:
        if q.is_symlink():raise RuntimeError('Refusing symlink: '+name)
        q=q.parent
    return p

def git(root,*args,allow_one=False):
    env={**os.environ,'GIT_OPTIONAL_LOCKS':'0'}
    r=subprocess.run(['git',*(['--literal-pathspecs'] if args[0]!='check-ignore' else []),*args],cwd=root,env=env,capture_output=True)
    if r.returncode not in ([0,1] if allow_one else [0]):raise RuntimeError('Git failed: '+r.stderr.decode('utf-8','replace').strip())
    return r.stdout

def status(root):
    fields=git(root,'status','--porcelain=v1','-z','--untracked-files=all').decode('utf-8').split('\0');out=[];i=0
    while i<len(fields) and fields[i]:
        value=fields[i];i+=1;record={'state':value[:2],'path':value[3:]}
        if 'R' in value[:2] or 'C' in value[:2]:record['oldPath']=fields[i];i+=1
        out.append(record)
    return out

def ignored(root,name):return bool(git(root,'check-ignore','--no-index','--',name,allow_one=True))
def guards(root,scope):
    if Path(git(root,'rev-parse','--show-toplevel').decode().strip()).resolve()!=root:raise RuntimeError('Use the audited repository root, not a subfolder.')
    head=git(root,'rev-parse','HEAD').decode().strip();branch=git(root,'branch','--show-current').decode().strip()
    if branch!=scope['auditBranch'] or not head.startswith(scope['auditHead']):raise RuntimeError('Branch/HEAD changed since the reviewed audit. Stop and review; no automatic override.')
    if git(root,'diff','--cached','--name-only','-z'):raise RuntimeError('Existing staged changes found. Nothing will be reset, overwritten or mixed into this checkpoint.')
    tracked=git(root,'ls-files','-z').decode('utf-8').split('\0')
    private=[p for p in tracked if p and (p.lower().startswith(('.env','output/','data/','var/maintenance/')) or p.lower().endswith(('.db','.sqlite','.sqlite3','.pyc','.bak')))]
    # checkpoint-bytecode-holdback-v1
    private=[p for p in private if p!='tests/worker/__pycache__/test_gmail_draft_worker.cpython-312.pyc']
    if private:raise RuntimeError('Tracked private/generated paths require separate review (do not automatically delete): '+', '.join(private))
    if not ignored(root,'var/maintenance/feature-checkpoint-v1/plan.json'):raise RuntimeError('var/maintenance must be ignored before writing checkpoint reports.')
    return head,branch

def doc_proposals(root,scope,block):
    out=[]
    for item in scope['documents']:
        p=safe(root,item['path']);old=p.read_bytes();text=old.decode('utf-8-sig').replace('\r\n','\n')
        if MARKER in text:
            if not text.rstrip().endswith(block.rstrip()):raise RuntimeError('Existing reconciliation differs; review '+item['path'])
            continue
        if normalized(old)!=item['baseline']:raise RuntimeError('Document differs from audited baseline; preserving it: '+item['path'])
        out.append((item['path'],old,encoded(text.rstrip()+'\n\n'+block,old)))
    return out

def apply_docs(root,scope,block):
    proposals=doc_proposals(root,scope,block)
    if not proposals:print('DOCUMENTS ALREADY UPDATED');return
    folder=safe(root,'var/maintenance/backups/checkpoint-docs-'+datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ'));folder.mkdir(parents=True,exist_ok=False)
    for name,old,new in proposals:(folder/name).write_bytes(old)
    written=[]
    try:
        for name,old,new in proposals:
            p=safe(root,name)
            if p.read_bytes()!=old:raise RuntimeError('Document changed before write: '+name)
            p.write_bytes(new);written.append((name,old,new))
    except Exception:
        for name,old,new in reversed(written):
            if safe(root,name).read_bytes()==new:safe(root,name).write_bytes(old)
        raise
    print('DOCUMENTS UPDATED: '+str(len(proposals))+'; historical sections preserved.')
    print('Backup: '+str(folder));print('No application code, Git index or runtime data was changed. Run preview again.')

TOKEN=re.compile(r'pplx-[A-Za-z0-9]{20,}|ya29\.[A-Za-z0-9_-]{20,}|GOCSPX-[A-Za-z0-9_-]{15,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----')
def build(root,scope,block):
    head,branch=guards(root,scope);all_status=status(root);by_path={r['path']:r for r in all_status}
    files=[];changes=[];warnings=[]
    tracked=set(git(root,'ls-files','-z').decode('utf-8').split('\0'))
    if 'tests/worker/__pycache__/test_gmail_draft_worker.cpython-312.pyc' in tracked:warnings.append('Historical tracked bytecode held back, not removed or staged: tests/worker/__pycache__/test_gmail_draft_worker.cpython-312.pyc. Review in the separate cleanup checkpoint.')
    for item in scope['features']+scope['documents']:
        name=item['path'];p=safe(root,name)
        if not p.is_file():raise RuntimeError('Required source/document missing; no deletion will be staged: '+name)
        value=p.read_bytes()
        if len(value)>2*1024*1024:raise RuntimeError('Unexpectedly large checkpoint file: '+name)
        text=value.decode('utf-8-sig')
        if TOKEN.search(text):raise RuntimeError('Possible token/private-key literal in '+name+' (value withheld). Review before staging.')
        if item in scope['features'] and item['baseline'] and normalized(value)!=item['baseline']:raise RuntimeError('Source changed since audit; inspect it before preparing a new allowlist: '+name)
        if name=='.gitignore' and not all(rule in text.splitlines() for rule in ['__pycache__/','*.py[cod]']):warnings.append('Python bytecode ignore hardening is not present; bytecode still remains excluded from this explicit scope.')
        state=by_path.get(name,{}).get('state','  ')
        if state not in ['  ',' M','??']:raise RuntimeError('Unexpected state '+repr(state)+' for '+name+'; no automatic recovery.')
        if name not in tracked and ignored(root,name):raise RuntimeError('Required new source is ignored: '+name)
        files.append({'path':name,'sha256':sha(value),'state':state})
        if state!='  ':changes.append(name)
    wanted={f['path'] for f in files};held=[r for r in all_status if r['path'] not in wanted]
    pending_docs=doc_proposals(root,scope,block)
    if pending_docs:warnings.append('Roadmap reconciliation is not yet applied; use --apply-docs, then preview again.')
    warnings.append('Pattern checks are not a secret/PII audit. Review exact contents, including untracked files, before approving staging.')
    core={'version':1,'root':str(root),'branch':branch,'head':head,'files':files,'changes':changes,'heldBack':held,'warnings':warnings,'pendingDocuments':[p[0] for p in pending_docs]}
    digest=sha(json.dumps(core,sort_keys=True,separators=(',',':')).encode())
    return core,digest

def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--root',type=Path,default=HERE.parents[1])
    group=parser.add_mutually_exclusive_group();group.add_argument('--apply-docs',action='store_true');group.add_argument('--stage',action='store_true')
    parser.add_argument('--approve',help='Exact SHA-256 printed by the reviewed preview. Required for --stage.')
    args=parser.parse_args();root=args.root.resolve()
    if any(os.environ.get(k) for k in ['GIT_DIR','GIT_WORK_TREE','GIT_INDEX_FILE','GIT_OBJECT_DIRECTORY','GIT_ALTERNATE_OBJECT_DIRECTORIES']):raise RuntimeError('Custom Git directory/index/object environment detected; refusing ambiguity.')
    raw=(HERE/'feature-checkpoint-v1/scope.json').read_bytes()
    if sha(raw)!=SCOPE_HASH:raise RuntimeError('Checkpoint scope changed; refusing an unreviewed allowlist.')
    scope=json.loads(raw);block=(HERE/'feature-checkpoint-v1/reconciliation.md').read_text(encoding='utf-8')
    if sha(block.encode())!=scope['reconciliationSha256']:raise RuntimeError('Reconciliation content changed.')
    guards(root,scope)
    if args.apply_docs:apply_docs(root,scope,block);return
    core,digest=build(root,scope,block)
    for name in core['changes']:print('INCLUDE '+name)
    print('HOLD BACK '+str(len(core['heldBack']))+' changed paths; no deletions/archives are included.')
    for warning in core['warnings']:print('NOTE: '+warning)
    if args.stage:
        if args.approve!=digest:raise RuntimeError('Approval hash missing/stale. Preview and review current files again.')
        if core['pendingDocuments']:raise RuntimeError('Apply/review the documentation reconciliation first, then create a fresh preview.')
        if not core['changes']:print('Nothing to stage.');return
        fresh,fresh_digest=build(root,scope,block)
        if fresh_digest!=digest:raise RuntimeError('Workspace changed before staging; nothing staged.')
        git(root,'add','--',*core['changes'])
        staged=set(git(root,'diff','--cached','--name-only','-z').decode().strip('\0').split('\0'))
        if staged!=set(core['changes']):raise RuntimeError('Unexpected staged path set. STOP and inspect the index; it was not reset automatically.')
        if any(sha(safe(root,f['path']).read_bytes())!=f['sha256'] for f in core['files']):raise RuntimeError('Source changed during staging. STOP and review the index; no commit was made.')
        print('FEATURE PATHS STAGED: '+str(len(staged))+'. No commit or push was made. Review git diff --cached before any commit.');return
    folder=safe(root,'var/maintenance/feature-checkpoint-v1');folder.mkdir(parents=True,exist_ok=True)
    (folder/'plan.json').write_text(json.dumps({**core,'approvalSha256':digest},indent=2),encoding='utf-8')
    with (folder/'paths.csv').open('w',encoding='utf-8',newline='') as f:
        writer=csv.DictWriter(f,fieldnames=['path','state','sha256']);writer.writeheader();writer.writerows(core['files'])
    print('DRY RUN PASSED. Git index, source, documents and runtime data unchanged; local metadata reports written.')
    print('Plan: '+str(folder/'plan.json'));print('APPROVAL_SHA256='+digest)
    print('Review tracked diff AND untracked file contents. This hash binds file bytes, branch, HEAD, scope and held-back status; it is not proof of safety.')

if __name__=='__main__':
    try:main()
    except Exception as error:raise SystemExit('ERROR: '+str(error))

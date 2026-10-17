"""Root-folder commit and production deployment launchers. No push, reseeding or feature enablement."""
import argparse,importlib.util,json,os,re,socket,subprocess,sys
from pathlib import Path
sys.dont_write_bytecode=True
ROOT_LAUNCHERS={'commit-changes.bat','deploy-production.bat'}
class WorkflowError(RuntimeError):pass
def require(value,message):
    if not value:raise WorkflowError(message)
def run(args,root,capture=True):
    result=subprocess.run([str(x) for x in args],cwd=root,capture_output=capture)
    if result.returncode:
        if capture and result.stderr:print(result.stderr.decode('utf-8','replace'),file=sys.stderr)
        raise WorkflowError('Command failed: '+str(args[0])+' '+str(args[1] if len(args)>1 else ''))
    return result.stdout if capture else b''
def git(root,*args):return run(['git',*args],root)
def meta(root,*args):return git(root,*args).decode('utf-8').strip()
def paths(raw):return [x.decode('utf-8','surrogateescape') for x in raw.split(b'\0') if x]
def load_delivery(root):
    path=root/'tools/deploy/local_delivery.py';require(path.is_file(),'Existing tools/deploy/local_delivery.py was not found.')
    spec=importlib.util.spec_from_file_location('root_workflow_delivery',path);module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);module.ROOT=root;return module

def eligible(root,name,delivery,untracked=False):
    if name not in ROOT_LAUNCHERS and not delivery.safe_source(name):return False
    p=root/name
    if p.is_symlink():return False
    if p.exists() and not p.resolve().is_relative_to(root):return False
    if untracked and name.endswith('.user.js') and not name.endswith('-dual-port.user.js'):
        if (root/(name[:-len('.user.js')]+'-dual-port.user.js')).is_file():return False
    return True

def staged_paths(root):
    prefix=meta(root,'rev-parse','--show-prefix')
    global_paths=paths(git(root,'diff','--cached','--no-relative','--no-renames','--name-only','-z'))
    require(not prefix or all(n.startswith(prefix) for n in global_paths),'Other projects have staged changes. Review the index before using this launcher.')
    return [n[len(prefix):] for n in global_paths]
def candidates(root,delivery):
    tracked=paths(git(root,'diff','HEAD','--relative','--no-renames','--name-only','-z','--','.'))
    untracked=paths(git(root,'ls-files','--others','--exclude-standard','-z','--','.'))
    selected=sorted({n for n in tracked if eligible(root,n,delivery)}|{n for n in untracked if eligible(root,n,delivery,True)})
    excluded=sorted((set(tracked)|set(untracked))-set(selected));return selected,excluded

def scan(delivery,name,data):
    delivery.scan(name,data)
    if re.search(rb'(?:pplx-[0-9A-Za-z_-]{24,}|GOCSPX-[0-9A-Za-z_-]{15,})',data):raise WorkflowError('Possible credential in '+name+'. Its value was not printed.')
def show_paths(title,names):
    print(title)
    for name in names:print('  '+json.dumps(name,ensure_ascii=True))

def commit_changes(root,delivery,ask=input):
    parent=meta(root,'rev-parse','HEAD');branch=meta(root,'branch','--show-current');require(branch,'Detached HEAD: choose your development branch first.')
    existing=staged_paths(root);fresh=not existing
    if existing:
        selected=sorted(existing);excluded=[]
        require(all(eligible(root,n,delivery) for n in selected),'Existing staging contains excluded/private paths. Review it manually; no changes made.')
        print('Existing staged snapshot detected. Only that staged snapshot will be committed; unstaged changes will not be added.')
    else:selected,excluded=candidates(root,delivery)
    if excluded:show_paths('Excluded local/unsupported/duplicate files (left untouched):',excluded)
    if not selected:print('NOTHING TO COMMIT. No eligible source changes.');return
    show_paths('Review commit scope on branch '+branch+':',selected)
    print('Review file contents locally. Secret scanning is not a privacy guarantee.')
    prefix=meta(root,'rev-parse','--show-prefix');snapshots={}
    for name in selected:
        if fresh:
            p=root/name;snapshots[name]=p.read_bytes() if p.is_file() else None
            if snapshots[name] is not None:scan(delivery,name,snapshots[name])
        else:
            result=subprocess.run(['git','show',':'+prefix+name],cwd=root,capture_output=True)
            if result.returncode==0:scan(delivery,name,result.stdout)
    message=ask('Commit message: ').strip();require(message,'A non-empty commit message is required.')
    print('Message: '+message)
    if ask('Type COMMIT to commit only the listed scope: ').strip()!='COMMIT':print('CANCELLED. No staging or commit performed by this launcher.');return
    require(meta(root,'rev-parse','HEAD')==parent and meta(root,'branch','--show-current')==branch,'HEAD/branch changed during review. Stop and inspect Git.')
    if fresh:
        require(not staged_paths(root),'Index changed during review. Stop and inspect Git.')
        for name,data in snapshots.items():
            p=root/name;require((p.read_bytes() if p.is_file() else None)==data,'File changed during review: '+name)
        for start in range(0,len(selected),30):git(root,'add','-A','--',*selected[start:start+30])
    require(set(staged_paths(root))==set(selected),'Staged scope changed. Nothing committed; staged files were not discarded.')
    for name in selected:
        result=subprocess.run(['git','show',':'+prefix+name],cwd=root,capture_output=True)
        if result.returncode==0:scan(delivery,name,result.stdout)
    index_tree=meta(root,'write-tree')
    run(['git','commit','-m',message],root,capture=False)
    commit=meta(root,'rev-parse','HEAD')
    require(meta(root,'rev-parse','HEAD^')==parent and meta(root,'rev-parse','HEAD^{tree}')==index_tree,'Commit created, but hooks/concurrent activity changed its parent/tree. Stop and inspect before deployment.')
    print('COMMIT COMPLETE: '+commit)
    print('No push, deployment or test suite run. This launcher does not certify that the changes were tested.')
    remaining=paths(git(root,'status','--porcelain=v1','--untracked-files=no','-z','--','.'))
    if remaining:print('Tracked changes still remain. Review/commit them before deployment; this can happen when you commit an existing staged snapshot.')

def port_open(port):
    try:
        with socket.create_connection(('127.0.0.1',port),timeout=.4):return True
    except OSError:return False

def read_active(prod):
    p=prod/'active.json';return json.loads(p.read_text(encoding='utf-8-sig')) if p.is_file() else {}
def invoke_controller(root,prod,command,*args):
    env={**os.environ,'NMP_SOURCE_ROOT':str(root)}
    result=subprocess.run([sys.executable,str(root/'tools/deploy/local_delivery.py'),'--production-root',str(prod),command,*map(str,args)],cwd=root,env=env)
    require(result.returncode==0,'Delivery controller '+command+' failed. Inspect its log/window. Failed releases and locks are NOT automatically deleted.')
def launch_supervisor(prod):
    require(os.name=='nt','Automatic .bat launch requires Windows.')
    os.startfile(str(prod/'start-production.bat'))

def deploy(root,prod,delivery,ask=input):
    require((prod/'shared/config/production.env').is_file() and (prod/'start-production.bat').is_file(),'Production is not initialised at the selected directory. This launcher will not initialise or seed data.')
    require(not paths(git(root,'status','--porcelain=v1','--untracked-files=no','-z','--','.')),'Tracked changes are uncommitted. Run commit-changes.bat first.')
    selected,excluded=candidates(root,delivery)
    require(not selected,'Untracked source/launcher files are not committed. Run commit-changes.bat first.')
    commit=meta(root,'rev-parse','--verify','HEAD^{commit}');require(re.fullmatch('[0-9a-f]{40,64}',commit),'Invalid commit identifier.')
    if read_active(prod).get('commit')!=commit:require(not port_open(3000),'Stop development on port 3000 first. Leave an existing production supervisor open.')
    print('Deploy commit: '+commit);print('Production: '+str(prod))
    print('Uses existing release verification, backups, promotion and health checks. Dependencies/tests will run for a new release.')
    print('Production .env, persistent data, and integration settings are retained. No reseeding or push.')
    if ask('Type DEPLOY to continue: ').strip()!='DEPLOY':print('CANCELLED. No deployment or launch performed.');return
    invoke_controller(root,prod,'deliver','--ref',commit)
    require(read_active(prod).get('commit')==commit,'Active release differs from the requested commit. Stop and inspect production.')
    if not (prod/'supervisor.lock').exists():
        print('Starting the production supervisor. Keep its window open.');launch_supervisor(prod)
    else:print('Supervisor lock exists; a second instance will not be started.')
    invoke_controller(root,prod,'health')
    require(read_active(prod).get('commit')==commit,'Another deployment changed the active release during verification.')
    print('DEPLOYMENT COMPLETE: '+commit);print('Production: http://127.0.0.1:3100')

def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('action',choices=['commit','deploy']);p.add_argument('--root',type=Path,default=Path(__file__).resolve().parents[2]);p.add_argument('--production-root',type=Path,default=Path('D:/NewModularProduct-Production'));a=p.parse_args()
    root=a.root.resolve();require((root/'package.json').is_file(),'Run from the NewModularProduct project root.');d=load_delivery(root)
    commit_changes(root,d) if a.action=='commit' else deploy(root,a.production_root.resolve(),d)
if __name__=='__main__':
    if hasattr(sys.stdout,'reconfigure'):sys.stdout.reconfigure(errors='replace')
    try:main()
    except KeyboardInterrupt:print('\nINTERRUPTED. Inspect Git/production status before retrying. Nothing will be reset automatically.');sys.exit(130)
    except Exception as e:print('STOPPED: '+str(e),file=sys.stderr);sys.exit(1)

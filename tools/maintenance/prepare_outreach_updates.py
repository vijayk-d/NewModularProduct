BASELINES={'src/domain/cover-letter/generate-cover-letter.js': 'b8f1704006fef692f605ff4d1ebb3ffb4c425c0e002f20788e1c081947875995', 'src/application/prepare-application.js': 'ec26c5f3e8b40e8ed91e7bb6f5da240df84f96ec82b45a2cc8f2dd689f75a53d', 'src/interfaces/http/run-local-server.js': '74a7bb50cda37565ba384f2d9b9e6ca5d68dfbee1ab9baa1c8920e8ed2880065', 'src/interfaces/http/create-local-server.js': '7653ec7c0406f1801612d024caafefc1a97a00af02cf61ac14e64906e921b24b', 'src/interfaces/http/rendering.js': '7330cc06423e4d35d696b2d21d109e5fdf945e6191be75a806b8b8ffec5b2560', 'src/interfaces/http/cover-letter-html.js': 'ce4c272de026124e438eadba9977ca14c503ed48fbc33b037fd9c846192aecdf', 'src/application/confirmed-gmail-draft-service.js': 'eb659e9aa8f2461b83954f5822662cb377f89920ebaf7f93582e8e60fe2def96', 'src/application/gmail-send-service.js': 'aad5b173ae9fa7d45acc4aef30c055e348e81b2c59ede9616103b981eead911f', 'src/application/queue-message-editor.js': '8136c49b7ca7968f9ed15ac56d230b5a7b1126541d79315811ff999416f858f9', 'src/application/outreach-message-snapshot.js': '1f2d16a28521bac15d7497480ab52d5f34cdbaa0836acab7b3db0cbe94ab5ac9', 'src/application/outreach-queue-service.js': '77c3ce9e3f4dd3b7aa714b1822a7367c7dca5a66cccf492d14bc48df5aa4c15e', 'src/infrastructure/outreach/sqlite-outreach-repository.js': 'f6af9633ec913652cc8ccee96a4660d5cfd7f203863b330f1380b600046c0924', 'src/interfaces/http/outreach-queue-http.js': '20fa8175fe5b63fba2a9c170c0e5dbb07b80ae863ff0e20788a7269b37e52233', 'src/interfaces/http/outreach-simple-contacts.js': '4c204aeb220ba8e016ed5df7514381786f2039a472476357f28da4b348c8e066', 'src/interfaces/http/outreach-queue-browser.js': '795b272d09f22bf7ad2308d47d8a3eb10510d6c22794d08cacf93216f9e72bcf', 'python-worker/gmail_draft_worker.py': '424e4cac0f413bbcd8df6adf7b94242c3392ffe57441ca1cb1e2c03a38505bef', 'python-worker/gmail_confirmed_draft_worker.py': '1eec7e18cbff593bdb27c60145ac0bfa5673357d744b12489030de4a3c2c8fcc', 'python-worker/gmail_send_worker.py': 'f8ab819e982d084da51c0b8d9704b809f0ef525bbaf1f6c96e83f5c4206eef44'}

import argparse,hashlib,json,os,re,subprocess,urllib.request,urllib.parse
from collections import Counter
from pathlib import Path

def fingerprint(b):return hashlib.sha256(b.decode('utf-8-sig').replace('\r\n','\n').rstrip('\n').encode()).hexdigest()
def classify(item):
    if item.get('status')=='sent' or item.get('sentAt') or (item.get('sendAction') or {}).get('mode')=='repeat':return 'EXCLUDE_SENT'
    if item.get('status') in ['send_pending','send_unknown','draft_creating','draft_unknown']:return 'LOCKED_ACTIVE_OR_UNCERTAIN'
    if item.get('status')=='drafted':return 'REVIEW_EXISTING_GMAIL_DRAFT' if item.get('draftId') else 'BLOCK_DRAFT_ID_MISSING'
    if item.get('status')=='new':return 'LOCAL_EDITABLE' if item.get('canEditMessage') is True else 'BLOCK_LOCAL_READ_ONLY'
    return 'REVIEW_OTHER_STATE'
class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self,*args,**kwargs):return None

def collect(root,base):
    u=urllib.parse.urlsplit(base)
    if u.scheme not in ['http','https'] or u.hostname not in ['127.0.0.1','localhost','::1'] or u.username or u.password:raise RuntimeError('Loopback application URL only.')
    out={'mode':'READ_ONLY_PREIMPLEMENTATION','source':[],'queue':[],'notes':['No source/.env/CV/database writes or Gmail/provider calls.','Drafted classification is local state only; Gmail must still be rechecked before any mutation.','No recipient addresses, subject/body, CV contents, signature HTML or credentials are included.']}
    env={**os.environ,'GIT_OPTIONAL_LOCKS':'0'}
    for label,args in [('head',['rev-parse','HEAD']),('branch',['branch','--show-current']),('stagedPaths',['diff','--cached','--name-only'])]:
        r=subprocess.run(['git',*args],cwd=root,env=env,capture_output=True,text=True,encoding='utf-8',errors='replace')
        out[label]=r.stdout.strip().splitlines() if label=='stagedPaths' else r.stdout.strip()
        if r.returncode:out[label]='Git inspection unavailable; no mutation attempted.'
    for name,expected in BASELINES.items():
        p=root/name
        if not p.is_file():out['source'].append({'path':name,'exists':False});continue
        if p.is_symlink() or not p.resolve().is_relative_to(root):raise RuntimeError('Source symlink/out-of-project target: '+name)
        data=p.read_bytes();value=fingerprint(data);text=data.decode('utf-8-sig')
        entry={'path':name,'exists':True,'normalizedSha256':value,'matchesUploadedAudit':value==expected}
        if name.startswith('python-worker/'):entry['markers']={'standardAttachmentName': 'Vijay_DAFAL-CV.pdf' in text,'sendAsReference': 'sendAs' in text,'draftUpdateReference': bool(re.search(r'drafts\(\)\.update|drafts\.update',text))}
        out['source'].append(entry)
    template=root/'templates/standard-cover-letter.md'
    if template.is_file() and not template.is_symlink():
        t=template.read_text(encoding='utf-8-sig')
        out['defaultTemplate']={'path':'templates/standard-cover-letter.md','normalizedSha256':fingerprint(t.encode()),'placeholderNames':sorted(set(re.findall(r'\{\{\s*(\w+)\s*\}\}',t))),'usesJdKeywords':bool(re.search(r'\{\{\s*jdKeywords\s*\}\}',t)),'claimsExperienceFromJdKeywords':bool(re.search(r'My experience in[^\n]*\{\{\s*jdKeywords\s*\}\}',t,re.I))}
    else:out['defaultTemplate']={'exists':False,'note':'Non-default template paths are not read; no .env parsed.'}
    url=urllib.parse.urljoin(base.rstrip('/')+'/', 'api/outreach-queue')
    try:
        with urllib.request.build_opener(NoRedirect).open(urllib.request.Request(url,headers={'Accept':'application/json'}),timeout=20) as response:
            data=response.read(32*1024*1024+1)
        if len(data)>32*1024*1024:raise RuntimeError('Queue response exceeds read-only bound.')
        result=json.loads(data)
        if not result.get('ok') or not isinstance(result.get('items'),list):raise RuntimeError('Unexpected local queue response.')
        for item in result['items']:
            state=classify(item);entry={'queueId':item.get('id'),'status':item.get('status'),'classification':state}
            if state!='EXCLUDE_SENT':entry.update({'draftId':item.get('draftId') or None,'version':item.get('editVersion') or None})
            out['queue'].append(entry)
        out['queueCounts']=dict(Counter(r['classification'] for r in out['queue']))
    except Exception as e:out['queueReadError']=type(e).__name__+': local queue could not be inspected; no update attempted.'
    out['signatureDiagnosticAvailable']=(root/'tools/maintenance/check_gmail_signature.mjs').is_file()
    return out

def main():
    p=argparse.ArgumentParser(description='Read-only metadata preflight for unsent/drafted updates; excludes sent and locks uncertain states.');p.add_argument('--root',type=Path,default=Path(__file__).resolve().parents[2]);p.add_argument('--base',default='http://127.0.0.1:3000');a=p.parse_args()
    print(json.dumps(collect(a.root.resolve(),a.base),indent=2,ensure_ascii=True))
if __name__=='__main__':
    try:main()
    except Exception as e:raise SystemExit('ERROR: '+str(e))

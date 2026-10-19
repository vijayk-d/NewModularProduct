"""Collect Slice 1 development source and CV role metadata, without modifying application/production files."""
import argparse,hashlib,json,os,re,shutil,subprocess,sys
from pathlib import Path
from datetime import datetime,timezone
PATHS=['package.json', 'playwright.config.js', 'src/interfaces/http/rendering.js', 'src/interfaces/http/create-local-server.js', 'src/interfaces/http/run-local-server.js', 'src/interfaces/http/review-page.js', 'src/interfaces/http/form-body.js', 'src/interfaces/http/application-review-http.js', 'src/interfaces/http/application-review-controls.js', 'src/interfaces/http/job-import-controls.js', 'src/interfaces/http/job-import-http.js', 'src/application/prepare-application.js', 'src/application/prepare-application-from-repositories.js', 'src/application/selected-cv-evidence-loader.js', 'src/application/durable-review-store.js', 'src/application/save-application-review.js', 'src/application/refine-cover-letter.js', 'src/application/accept-refined-cover-letter.js', 'src/application/cover-letter-controls.js', 'src/application/review-subject.js', 'src/application/outreach-message-snapshot.js', 'src/application/outreach-final-identity.js', 'src/domain/cover-letter/generate-cover-letter.js', 'src/domain/cover-letter/fill-template.js', 'src/domain/shared/linked-role-opening.js', 'src/domain/shared/legacy-advert-normalization.js', 'src/infrastructure/cv-inventory/json-cv-inventory-repository.js', 'src/infrastructure/documents/pdf-text-extractor.js', 'src/infrastructure/documents/resolve-cv-path.js', 'src/infrastructure/templates/file-template-repository.js', 'src/infrastructure/refinement/perplexity-cover-letter-refinement-adapter.js', 'tools/deploy/assets/standard-cover-letter.md', 'tests/application/prepare-application.test.js', 'tests/application/prepare-application-from-repositories.test.js', 'tests/application/selected-cv-evidence-loader.test.js', 'tests/application/refinement-evidence-contract.test.js', 'tests/application/application-save-resume.test.js', 'tests/domain/cover-letter/generate-cover-letter.test.js', 'tests/interfaces/http/create-local-server.test.js', 'tests/ui/application-preparation.spec.js']
KNOWN={'playwright.config.js': '81145c7225ab7fb2f143084f337e2d6d86ab78c124acbc709fb2457a6f9046a8', 'src/interfaces/http/rendering.js': '6a23f9e01edd57c7b60d1a91f89495e4bceee313f4c985e1d650d012513f57d4', 'src/interfaces/http/create-local-server.js': '992aa266fe5c9d637a53b0406d18cd1df28b74ab504a55040e858fe5739c6fa1', 'src/interfaces/http/run-local-server.js': 'ac3199bf512f62d84d7992ac59f0aeaff0f14bae5d043b87fe50c6003a56c64c', 'src/interfaces/http/review-page.js': '8c0a920b10a9577811637e5f32112d380df9bb0beb1b53bb704f2ee8ed6182b3', 'src/interfaces/http/form-body.js': 'a66d30e653dbf5e3cac250b2b1a3a741167cab39e3abbccd2f02680a4048cf05', 'src/interfaces/http/application-review-http.js': '1c78e8c39d2938d9cc9cc6cbb0f9b60a7d658c4ff6a30f3286257e1811f386a0', 'src/interfaces/http/application-review-controls.js': '00c1479c676a60405ed06b7ccfa428f22a23d07acad7f193c3b0a61aa56ebdd8', 'src/interfaces/http/job-import-controls.js': '22f9aa8b484addbb2f81a799a39f2ebe11cd4f6ecdacd23fca68200f39a49b7c', 'src/interfaces/http/job-import-http.js': '04955f02bb281a93aefe0d62eef47922c246b6c03b1c09ab25bd0102159adb2b', 'src/application/prepare-application.js': '5c4e116f9866ac8bde9597646bde824b019b46ca2bb8feaf3941b809f7dce17e', 'src/application/selected-cv-evidence-loader.js': '290846817971c268f4f4cc50a627a7081e00f67b7c7f269d9d189515206a5e2c', 'src/application/durable-review-store.js': '3dc9398f6e4008893244ff018dfa917d98f400aee9c45a05fd7e60dc195828df', 'src/application/save-application-review.js': '057ddaeed36db1763e547f15abfd925b15dc303c00e3710a5f4f968dce914f74', 'src/application/refine-cover-letter.js': 'cb7482dc678961285b76e672fdb8a10b0cf9d482bbeecd5c13455d567e2e2829', 'src/application/cover-letter-controls.js': 'fa751a9edca8293eb2f50927340e5aac73eb05840b3059c4b00be4e706400c90', 'src/application/outreach-message-snapshot.js': 'd7fd0aa533f5eb0b516617225dd5116de15699081ceec7bb625b2d9ae11b5755', 'src/application/outreach-final-identity.js': '440f9751730e90fa8b519249bb3866b235a09b67cddea9d0479aeb07d324e8f1', 'src/domain/cover-letter/generate-cover-letter.js': '984bf94272801bdb2fb241407687c8eb86e6388c63dff0796caec734d93a0352', 'src/domain/cover-letter/fill-template.js': '821a2b45be71514ee5ad58bc6e585fe8c4ca7c4f5ddb0db0dc3cbfb03e8923fa', 'src/domain/shared/legacy-advert-normalization.js': '524916470b0f69f3c635ad362e0c91bc78e9781c893cf1e0693a08e15034f3c1', 'src/infrastructure/refinement/perplexity-cover-letter-refinement-adapter.js': '9e2c68e51ac52707ad41140da60ea0fa6fcaee2e8575fff517e90abb1e6f5ddf', 'tests/application/prepare-application.test.js': 'a17e4893194ee58096927da69c22f7e98b8f3e9b990561c7f2d99568264c3a17', 'tests/application/prepare-application-from-repositories.test.js': '853606be5127ec0a2d82bc9715253e459b14fe3ccbadd6014361e2d49a5d1db7', 'tests/application/application-save-resume.test.js': '8dceb7d65c1c5d13985fe7fc42a525128cdfab635ec3ca6b3ef28019ad3f3ab0', 'tests/domain/cover-letter/generate-cover-letter.test.js': 'c378642e45e04110d443913873f2d82969d04f407649490c1f4c54a96bd4b70c', 'tests/interfaces/http/create-local-server.test.js': 'c9fdd70eec9f24eca4d6590b886812249bd49f5a0ced12e0f10f900d08fbaf31', 'tests/ui/application-preparation.spec.js': 'cbcc5ce82f28a4b8b8ae085bdba3f03d1aeb50950ea7611ec31bd815e443f862'}
def sha(b):return hashlib.sha256(b).hexdigest()
def normalize(s):return s.replace('\r\n','\n')
def resolve_source(root,name):
    p=root/name
    if p.is_symlink() or not p.resolve().is_relative_to(root):raise RuntimeError('Symlink/outside-project source refused: '+name)
    return p

def inventory_roles(root):
    node=shutil.which('node');config=root/'.env'
    if not node or not config.is_file():return {'status':'unavailable','reason':'Node or development configuration missing. No credential contents collected.','roles':[]}
    if config.is_symlink():return {'status':'unavailable','reason':'Configuration symlink refused.','roles':[]}
    keep={'PATH','PATHEXT','SYSTEMROOT','SYSTEMDRIVE','WINDIR','COMSPEC','TEMP','TMP','USERPROFILE','HOME','APPDATA','LOCALAPPDATA','PROGRAMFILES','PROGRAMFILES(X86)','PROGRAMW6432','COMMONPROGRAMFILES','NUMBER_OF_PROCESSORS'}
    env={k:v for k,v in os.environ.items() if k.upper() in keep};env['NODE_OPTIONS']=''
    js="console.log(JSON.stringify({inventory:process.env.CV_INVENTORY_PATH||'',folder:process.env.CV_FOLDER||''}));"
    r=subprocess.run([node,'--env-file='+str(config),'-e',js],cwd=root,env=env,capture_output=True,text=True,encoding='utf-8',timeout=20)
    if r.returncode:return {'status':'unavailable','reason':'Configuration-path probe failed; output withheld.','roles':[]}
    try:
        settings=json.loads(r.stdout);name=settings.get('inventory','')
        if not name:return {'status':'unavailable','reason':'CV inventory path is not configured.','roles':[]}
        p=Path(name);p=p if p.is_absolute() else root/p
        data=json.loads(p.read_text(encoding='utf-8-sig'))
        entries=data.get('cv_inventory',{}).get('cvs') if isinstance(data.get('cv_inventory'),dict) else None
        if entries is None:entries=data.get('cvs')
        if not isinstance(entries,list):return {'status':'unavailable','reason':'Inventory schema requires review.','roles':[]}
        records=[]
        for item in entries:
            if not isinstance(item,dict):continue
            records.append({'role_code':str(item.get('role_code','')),'role_name':str(item.get('role_name','')),'hasDocumentPath':bool(item.get('local_path'))})
        return {'status':'ok','roles':records}
    except Exception:return {'status':'unavailable','reason':'Could not read the inventory role metadata; private error details withheld.','roles':[]}

def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--root',type=Path,default=Path.cwd());p.add_argument('--show',choices=PATHS);a=p.parse_args();root=a.root.resolve()
    if not (root/'package.json').is_file():raise RuntimeError('Run from the development project root.')
    if a.show:
        target=resolve_source(root,a.show)
        print('===== '+a.show+' =====');print(target.read_text(encoding='utf-8-sig'));return
    entries=[]
    for name in PATHS:
        path=resolve_source(root,name)
        if not path.is_file():entries.append({'path':name,'missing':True});continue
        raw=path.read_bytes();text=path.read_text(encoding='utf-8-sig');digest=sha(normalize(text).encode())
        entries.append({'path':name,'missing':False,'sha256':sha(raw),'normalisedSha256':digest,'captureComparison':'MATCH' if KNOWN.get(name)==digest else 'DIFFERENT' if name in KNOWN else 'NOT_PREVIOUSLY_CAPTURED','content':text})
    def git(*args):
        r=subprocess.run(['git',*args],cwd=root,capture_output=True,timeout=15)
        if r.returncode:raise RuntimeError('Git metadata check failed; no source files changed.')
        return r.stdout.decode('utf-8','replace')
    head=git('rev-parse','HEAD').strip();branch=git('branch','--show-current').strip();status=git('status','--short','--','.').strip()
    roles=inventory_roles(root)
    doc={'purpose':'Slice 1 development source snapshot + CV role labels only','createdAt':datetime.now(timezone.utc).isoformat(),'branch':branch,'head':head,'gitStatus':status,'cvInventory':roles,'files':entries,'privacy':'No .env contents, API keys, OAuth values, database records, contact records, CV contents or production files included. Development configuration is loaded only in a short Node subprocess to locate inventory/folder; no application entry point is run. Review source for hard-coded private values before sharing.'}
    output=root/'var/maintenance/development-slices';output.mkdir(parents=True,exist_ok=True)
    target=output/('slice1-source-'+datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')+'.json');target.write_text(json.dumps(doc,ensure_ascii=False,indent=2),encoding='utf-8')
    print('SLICE 1 CAPTURE READY');print('Branch: '+branch);print('Commit: '+head)
    print('Files: '+str(len(entries))+'; missing: '+str(sum(bool(e.get('missing')) for e in entries)))
    print('Current CV role options:')
    if roles['status']=='ok':
        for role in roles['roles']:print('  '+role['role_code']+' | '+role['role_name']+' | document path configured: '+str(role['hasDocumentPath']))
    else:print('  '+roles['reason'])
    print('Source needing updated content (other than matching captured versions):')
    for e in entries:
        if e.get('missing'):print('  MISSING: '+e['path'])
        elif e['captureComparison']!='MATCH':print('  '+e['captureComparison']+': '+e['path'])
    print('Full source capture: '+str(target));print('No application source, Git state, production configuration or production data changed. Only this diagnostic file was written.')
if __name__=='__main__':
    if hasattr(sys.stdout,'reconfigure'):sys.stdout.reconfigure(errors='replace')
    try:main()
    except Exception as e:print('ERROR: '+str(e),file=sys.stderr);sys.exit(1)

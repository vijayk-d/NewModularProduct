"""Enable Perplexity in development + production without changing API keys or application source."""
import argparse,importlib.util,json,os,re,subprocess,sys
from pathlib import Path
from datetime import datetime,timezone
sys.dont_write_bytecode=True
MAIL=('ENABLE_GMAIL','ENABLE_GMAIL_SENDING','ENABLE_GMAIL_DRAFT_CREATION','ENABLE_GMAIL_MAILBOX_CHECK','ENABLE_GMAIL_SIGNATURE')
COMMON={**{k:'false' for k in MAIL},'ENABLE_PERPLEXITY_RESEARCH':'true','ENABLE_COVER_LETTER_REFINEMENT':'true'}
def patch(raw,values):
    bom=raw.startswith(b'\xef\xbb\xbf');text=raw.decode('utf-8-sig');eol='\r\n' if '\r\n' in text else '\n';text=text.replace('\r\n','\n')
    for key,value in values.items():
        pattern=r'(?m)^[ \t]*(?:export[ \t]+)?'+re.escape(key)+r'[ \t]*=[^\n]*$'
        matches=list(re.finditer(pattern,text))
        if len(matches)>1:raise RuntimeError('Duplicate setting requires review: '+key)
        if matches:
            line=matches[0].group(0);old=line.split('=',1)[1].strip()
            if old.startswith(('"',"'")) and old.count(old[0])<2:raise RuntimeError('Multiline feature flag refused: '+key)
            text=re.sub(pattern,lambda m:key+'='+value,text,count=1)
        else:text=text.rstrip('\n')+'\n'+key+'='+value+'\n'
    return (b'\xef\xbb\xbf' if bom else b'')+text.replace('\n',eol).encode('utf-8')
def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--root',type=Path,default=Path.cwd());p.add_argument('--production-root',type=Path,default=Path('D:/NewModularProduct-Production'));p.add_argument('--apply',action='store_true');a=p.parse_args();root=a.root.resolve();prod=a.production_root.resolve()
    spec=importlib.util.spec_from_file_location('perplexity_config_support',root/'tools/deploy/local_delivery.py');d=importlib.util.module_from_spec(spec);spec.loader.exec_module(d);d.ROOT=root
    if a.apply and (d.busy(3000) or d.busy(3100)):raise RuntimeError('Stop the development server and production supervisor with Ctrl+C first. No config changes made.')
    active=json.loads((prod/'active.json').read_text(encoding='utf-8-sig'));commit=active['commit']
    if not re.fullmatch('[a-f0-9]{40,64}',commit):raise RuntimeError('Invalid active release identifier.')
    release=prod/'releases'/commit
    cases=[('DEVELOPMENT',root,root/'.env',{**COMMON,'NMP_ALLOW_DEVELOPMENT_INTEGRATIONS':'true'}),('PRODUCTION',release,prod/'shared/config/production.env',COMMON)]
    node=d.node();env=d.base_env()
    def probe(project,path):
        runtime=(project/'src/config/deployment-runtime.js').resolve().as_uri()
        js="""const {deploymentRuntime}=await import(%s);const raw={...process.env};const effective={...raw};deploymentRuntime({env:effective,projectRoot:%s});const keys=%s;console.log(JSON.stringify({key:raw.PERPLEXITY_API_KEY||'',raw:Object.fromEntries(keys.map(k=>[k,raw[k]||''])),effective:Object.fromEntries(keys.map(k=>[k,effective[k]||''])),keyPresentAfterPolicy:Boolean(String(effective.PERPLEXITY_API_KEY||'').trim())}));""" % (json.dumps(runtime),json.dumps(str(project)),json.dumps([*COMMON,'NMP_ALLOW_DEVELOPMENT_INTEGRATIONS']))
        result=subprocess.run([node,'--env-file='+str(path),'--input-type=module','-e',js],cwd=project,env=env,capture_output=True,text=True,encoding='utf-8')
        if result.returncode:raise RuntimeError('Configuration probe failed; raw output withheld to protect credentials: '+str(path))
        try:return json.loads(result.stdout)
        except Exception:raise RuntimeError('Invalid configuration probe response; contents withheld.')
    changes=[];before={}
    for label,project,path,values in cases:
        if path.is_symlink() or not path.resolve().is_relative_to((root if label=='DEVELOPMENT' else prod)):raise RuntimeError('Unsafe configuration path.')
        raw=path.read_bytes();before[label]=probe(project,path)
        if not before[label]['key'].strip():raise RuntimeError(label+' key is absent. No files changed. Do not share credentials in chat.')
        updated=patch(raw,values)
        if raw!=updated:changes.append((path,raw,updated))
    if not a.apply:
        print('DRY RUN PASSED. Enable research/refinement in both environments; development opt-in true; all Gmail flags false.')
        print('API keys are present and will be preserved. Files needing changes: '+str(len(changes)));return
    backup=None
    if changes:
        backup=prod/'shared/backups'/('perplexity-config-'+datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ'));backup.mkdir(parents=True,exist_ok=False)
        for label,project,path,values in cases:
            dest=backup/(label.lower()+'.env');dest.write_bytes(path.read_bytes());os.chmod(dest,0o600)
    for path,raw,updated in changes:
        if path.read_bytes()!=raw:raise RuntimeError('Concurrent configuration edit. No writes made.')
    written=[]
    try:
        for path,raw,updated in changes:path.write_bytes(updated);written.append((path,raw,updated))
        for label,project,path,values in cases:
            result=probe(project,path)
            if result['key']!=before[label]['key']:raise RuntimeError('Credential preservation check failed: '+label)
            if not result['keyPresentAfterPolicy']:raise RuntimeError('Runtime still clears the Perplexity key: '+label)
            if any(result['raw'][k]!=value or result['effective'][k]!=value for k,value in values.items()):raise RuntimeError('Feature-policy verification failed: '+label)
            print(label+': research ON; refinement ON; key retained by runtime; Gmail features OFF.')
    except BaseException:
        for path,raw,updated in reversed(written):
            if path.read_bytes()==updated:path.write_bytes(raw)
        raise
    print('PERPLEXITY CONFIGURATION VERIFIED. Existing API keys unchanged.')
    print('No application code, release manifest, database or Git state changed. No API request made.')
    if backup:print('Private configuration backups (contain credentials; do not upload): '+str(backup))
    print('Restart both servers to use the updated configuration.')
if __name__=='__main__':
    try:main()
    except Exception as e:print('ERROR: '+str(e),file=sys.stderr);sys.exit(1)

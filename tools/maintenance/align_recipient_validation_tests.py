"""Align the legacy recipient-escaping test with current name validation. No runtime code changes."""
import argparse,hashlib,json,os,shutil,subprocess,sys
from pathlib import Path
from datetime import datetime,timezone
OLD="test('HTML recipient substitution escapes markup',()=>{\n  const result=prepareDraftSnapshot({id:uuid,status:'new',email:'a@example.test',subject:'Application',firstname:'A<&',bodyPlainText:'Dear {{firstname}},',bodyHtml:'Dear {{firstname}},'});\n  assert.equal(result.bodyHtml,'Dear A&lt;&amp;,');\n  assert.equal(result.bodyPlainText,'Dear A<&,');\n});"
NEW='test(\'HTML recipient substitution escapes permitted name characters\',()=>{\n  for(const [firstname,escaped] of [[\'A&B\',\'A&amp;B\'],["O\'Neil",\'O&#39;Neil\']]){\n    const result=prepareDraftSnapshot({id:uuid,status:\'new\',email:\'a@example.test\',subject:\'Application\',firstname,bodyPlainText:\'Dear {{firstname}},\',bodyHtml:\'Dear {{firstname}},\'});\n    assert.equal(result.bodyHtml,`Dear ${escaped},`);\n    assert.equal(result.bodyPlainText,`Dear ${firstname},`);\n  }\n});\ntest(\'recipient substitution rejects markup-like names before HTML generation\',()=>{\n  assert.throws(\n    ()=>prepareDraftSnapshot({id:uuid,status:\'new\',email:\'a@example.test\',subject:\'Application\',firstname:\'A<&\',bodyPlainText:\'Dear {{firstname}},\',bodyHtml:\'Dear {{firstname}},\'}),\n    error=>error.statusCode===400 && /Recipient name must be plain single-line text/.test(error.message)\n  );\n});'
TARGET='tests/application/outreach-rich-snapshot.test.js'
def main():
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('--root',type=Path,default=Path.cwd());p.add_argument('--apply',action='store_true');a=p.parse_args();root=a.root.resolve();target=root/TARGET
 if target.is_symlink() or not target.resolve().is_relative_to(root):raise RuntimeError('Unsafe test target.')
 raw=target.read_bytes();text=raw.decode('utf-8-sig').replace('\r\n','\n');old_count=text.count(OLD);new_count=text.count(NEW)
 if old_count==0 and new_count==1:updated=raw;already=True
 elif old_count==1 and new_count==0:
  revised=text.replace(OLD,NEW,1)
  if b'\r\n' in raw:revised=revised.replace('\n','\r\n')
  updated=(b'\xef\xbb\xbf' if raw.startswith(b'\xef\xbb\xbf') else b'')+revised.encode();already=False
 else:raise RuntimeError('Test block differs from reviewed source. No changes made.')
 if not a.apply:print('DRY RUN PASSED. '+('Already aligned.' if already else 'One legacy test will be replaced by escaping + rejection coverage.'));return
 node=shutil.which('node')
 if not node:raise RuntimeError('Node required.')
 folder=None
 if not already:
  folder=root/'var/maintenance/backups'/('recipient-test-contract-'+datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ'));folder.mkdir(parents=True,exist_ok=False);(folder/'outreach-rich-snapshot.test.js.before').write_bytes(raw)
  if target.read_bytes()!=raw:raise RuntimeError('Concurrent test edit; refusing write.')
  target.write_bytes(updated)
 env=os.environ.copy()
 for k in list(env):
  if k.startswith(('GMAIL_','GOOGLE_','PERPLEXITY_','NMP_')):env.pop(k,None)
 for k in ['ENABLE_GMAIL','ENABLE_GMAIL_SENDING','ENABLE_GMAIL_DRAFT_CREATION','ENABLE_GMAIL_MAILBOX_CHECK','ENABLE_GMAIL_SIGNATURE','ENABLE_PERPLEXITY_RESEARCH','ENABLE_COVER_LETTER_REFINEMENT']:env[k]='false'
 reports=[]
 try:
  for args in [[node,'--check',TARGET],[node,'--test','--test-name-pattern=recipient substitution',TARGET]]:
   r=subprocess.run(args,cwd=root,env=env,capture_output=True,text=True,encoding='utf-8',errors='replace',timeout=90);reports.append(r.stdout+r.stderr)
   if r.returncode:raise RuntimeError(r.stdout+r.stderr)
  if folder:(folder/'test-report.txt').write_text('\n'.join(reports),encoding='utf-8')
  print('\n'.join(reports));print('RECIPIENT TEST CONTRACT PASSED. Runtime validation unchanged. No Git staging/commit or production action.')
  if folder:print('Backup: '+str(folder))
 except BaseException:
  if not already and target.read_bytes()==updated:target.write_bytes(raw)
  raise
if __name__=='__main__':
 try:main()
 except Exception as e:print('ERROR: '+str(e),file=sys.stderr);sys.exit(1)

"""Correct two rendered-text assertions and keep the browser runner's guards aligned."""
import argparse,ast,copy,sys
from pathlib import Path
from datetime import datetime,timezone
NAME='tests/ui/contact-regression.spec.js'
HELPER='tools/maintenance/repair_browser_verification.py'
TITLE='test("organisation summary follows refresh domain saving and unlinking"'
def norm(raw):return raw.decode('utf-8-sig').replace('\r\n','\n')
def encode(text,original):
    if b'\r\n' in original:text=text.replace('\n','\r\n')
    return (b'\xef\xbb\xbf' if original.startswith(b'\xef\xbb\xbf') else b'')+text.encode('utf-8')
def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--root',type=Path,default=Path.cwd());p.add_argument('--apply',action='store_true');a=p.parse_args();root=a.root.resolve()
    targets=[root/NAME,root/HELPER]
    for target in targets:
        if target.is_symlink() or not target.resolve().is_relative_to(root):raise RuntimeError('Unsafe target.')
    test_raw,helper_raw=[x.read_bytes() for x in targets];test,helper=map(norm,[test_raw,helper_raw])
    tree=ast.parse(helper)
    assignments=[x for x in tree.body if isinstance(x,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='PATCHES' for t in x.targets)]
    if len(assignments)!=1:raise RuntimeError('Unrecognized browser-runner structure. No writes.')
    assignment=assignments[0];patches=ast.literal_eval(assignment.value)
    if test!=patches[NAME]['after']:raise RuntimeError('Test differs from the browser runner reviewed version. No writes.')
    start=test.index(TITLE);end=test.index('\ntest(',start+1);section=test[start:end]
    old='.toHaveText(draft);';new='.toHaveText(draft, {useInnerText:true});'
    if section.count(old)==0 and section.count(new)==2:print('ALREADY ALIGNED. Use the existing browser runner --verify.');return
    if section.count(old)!=2 or section.count(new):raise RuntimeError('Expected exactly two assertions in the summary test. No writes.')
    updated=test[:start]+section.replace(old,new)+test[end:]
    patches[NAME]['after']=updated
    lines=helper.splitlines(keepends=True);lines[assignment.lineno-1:assignment.end_lineno]=['PATCHES = '+repr(patches)+'\n'];new_helper=''.join(lines);ast.parse(new_helper)
    if not a.apply:print('DRY RUN PASSED. Two assertions + browser-runner expected version will be aligned.');return
    backup=root/'var/maintenance/browser-verification/backups'/('innertext-'+datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ'));backup.mkdir(parents=True,exist_ok=False)
    for target,raw in zip(targets,[test_raw,helper_raw]):
        dest=backup/target.relative_to(root);dest.parent.mkdir(parents=True,exist_ok=True);dest.write_bytes(raw)
    changes=list(zip(targets,[test_raw,helper_raw],[encode(updated,test_raw),encode(new_helper,helper_raw)]))
    for target,raw,_ in changes:
        if target.read_bytes()!=raw:raise RuntimeError('Concurrent edit. No writes.')
    written=[]
    try:
        for target,raw,revised in changes:target.write_bytes(revised);written.append((target,raw,revised))
    except BaseException:
        for target,raw,revised in reversed(written):
            if target.read_bytes()==revised:target.write_bytes(raw)
        raise
    print('MULTILINE ASSERTIONS ALIGNED. No application code changed and no tests run.')
    print('Backup: '+str(backup))
if __name__=='__main__':
    try:main()
    except Exception as e:print('ERROR: '+str(e),file=sys.stderr);sys.exit(1)

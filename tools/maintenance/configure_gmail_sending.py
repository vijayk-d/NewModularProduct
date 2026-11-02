"""Explicitly change send flags in .env; this utility never sends email."""
import argparse
from datetime import datetime,timezone
from pathlib import Path
import re
import sys

def main():
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('--root',type=Path,default=Path(__file__).resolve().parents[2]);g=p.add_mutually_exclusive_group(required=True);g.add_argument('--enable',action='store_true');g.add_argument('--disable',action='store_true');a=p.parse_args();root=a.root.resolve();target=root/'.env'
 if not (root/'src').is_dir() or not target.is_file() or target.is_symlink():raise RuntimeError('An existing project .env is required; symlinks refused.')
 if a.enable and not (root/'src/application/gmail-send-service.js').is_file():raise RuntimeError('Install the sending package first.')
 phrase='ENABLE SENDING' if a.enable else 'DISABLE SENDING'
 print('Only ENABLE_GMAIL and ENABLE_GMAIL_SENDING will change. This utility sends nothing.')
 if input('Type '+phrase+' to continue: ').strip()!=phrase:print('Cancelled; no changes.');return
 raw=target.read_bytes();text=raw.decode('utf-8-sig').replace('\r\n','\n');value='true' if a.enable else 'false'
 for key in ('ENABLE_GMAIL','ENABLE_GMAIL_SENDING'):
  pattern=r'^[ \t]*(?:export[ \t]+)?'+key+r'[ \t]*=.*$'
  if re.search(pattern,text,re.M):text=re.sub(pattern,lambda _:key+'='+value,text,flags=re.M)
  else:text+=('' if text.endswith('\n') else '\n')+key+'='+value+'\n'
 data=text.encode('utf-8')
 if b'\r\n' in raw:data=data.replace(b'\n',b'\r\n')
 if raw.startswith(b'\xef\xbb\xbf'):data=b'\xef\xbb\xbf'+data
 if data==raw:print('Flags already match.');return
 base=Path.home()/'.newmodularproduct'/'private-env-backups'
 if base.is_symlink() or base.parent.is_symlink():raise RuntimeError('Unsafe private backup directory.')
 folder=base/datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ');folder.mkdir(parents=True,exist_ok=False);backup=folder/'.env.private-backup';backup.write_bytes(raw)
 target.write_bytes(data);print('Flags updated. Restart the server. Private backup: '+str(backup));print('Never upload that backup. Shell/startup overrides can still affect effective flags; check /api/outreach-queue/send-status.')
if __name__=='__main__':
 try:main()
 except Exception as e:raise SystemExit('ERROR: '+str(e))

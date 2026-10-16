"""Read-only signature capability probe. Never creates/updates drafts, sends, or writes settings."""
import argparse,json,os,re,sys

def inspect_signature(service,expected):
    profile=service.users().getProfile(userId='me').execute()
    if str(profile.get('emailAddress','')).lower()!=expected.lower():return {'ok':False,'code':'SIGNATURE_MAILBOX_MISMATCH','draftCreated':False,'sent':False}
    item=service.users().settings().sendAs().get(userId='me',sendAsEmail=expected).execute()
    html=item.get('signature') or ''
    return {'ok':True,'mailboxMatch':True,'signaturePresent':bool(html.strip()),'signatureCharacters':len(html),'hasRemoteImages':bool(re.search(r'<img\b',html,re.I)),'draftCreated':False,'sent':False,'settingsChanged':False}

def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--confirmed',action='store_true');a=p.parse_args()
    if not a.confirmed:raise RuntimeError('Use --confirmed only for an explicit read-only mailbox/signature check.')
    expected=os.getenv('GMAIL_FROM_ADDRESS','').strip()
    if not re.fullmatch(r'[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+',expected):raise RuntimeError('Configured sender missing/invalid.')
    keys=['GMAIL_OAUTH_CLIENT_ID','GMAIL_OAUTH_CLIENT_SECRET','GMAIL_OAUTH_REFRESH_TOKEN']
    if not all(os.getenv(k,'').strip() for k in keys):raise RuntimeError('Working OAuth settings are required; do not paste credentials into chat.')
    try:
        from google.oauth2.credentials import Credentials
        from googleapiclient.discovery import build
        credentials=Credentials(token=None,refresh_token=os.environ[keys[2]],token_uri='https://oauth2.googleapis.com/token',client_id=os.environ[keys[0]],client_secret=os.environ[keys[1]])
        service=build('gmail','v1',credentials=credentials,cache_discovery=False)
        result=inspect_signature(service,expected)
    except ImportError:result={'ok':False,'code':'SIGNATURE_DEPENDENCIES_MISSING','draftCreated':False,'sent':False}
    except Exception as e:
        status=getattr(getattr(e,'resp',None),'status',None)
        result={'ok':False,'code':'SIGNATURE_PERMISSION_OR_AUTH' if status in [401,403] else 'SIGNATURE_READ_FAILED','httpStatus':status,'draftCreated':False,'sent':False,'settingsChanged':False}
    print(json.dumps(result))
    return 0 if result.get('ok') else 1
if __name__=='__main__':
    try:sys.exit(main())
    except Exception:print(json.dumps({'ok':False,'code':'SIGNATURE_CONFIGURATION','draftCreated':False,'sent':False,'settingsChanged':False}));sys.exit(1)

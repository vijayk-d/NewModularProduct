"""Read-only Gmail send-as signature reader. No draft, message, or settings writes."""
import json,os,re,sys
from html import escape
from html.parser import HTMLParser
from urllib.parse import urlsplit

BLOCKS={'p','div','li','tr','table','ul','ol'}
ALLOWED={'p','div','span','br','b','strong','i','em','u','s','a','img','table','tbody','thead','tfoot','tr','td','th','ul','ol','li','font'}
VOID={'br','img'}
DROP={'script','style','iframe','object','embed','svg','math','form','input','button','textarea','select','video','audio','link','meta'}
STYLES={'color','background-color','font-family','font-size','font-weight','font-style','text-decoration','text-align','vertical-align','width','height','max-width','border','border-top','border-bottom','border-left','border-right','border-collapse','border-spacing','padding','padding-top','padding-bottom','padding-left','padding-right','margin','margin-top','margin-bottom','margin-left','margin-right','line-height','display'}
def url(value):
    try:
        p=urlsplit(value)
        if p.scheme.lower() not in ('http','https') or not p.hostname or p.username or p.password or re.search(r'[\x00-\x20\x7f]',value):return None
        return value
    except (ValueError,TypeError):return None
class SignatureParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True);self.out=[];self.text=[];self.stack=[];self.drop=0;self.images=False
    def handle_starttag(self,tag,attrs):
        tag=tag.lower()
        if self.drop:
            if tag in DROP and tag not in {'input','embed','link','meta'}:self.drop+=1
            return
        if tag in DROP:
            if tag not in {'input','embed','link','meta'}:self.drop=1
            return
        if tag not in ALLOWED:return
        attrs=dict(attrs);kept={}
        if tag=='img':
            src=url(attrs.get('src',''))
            if not src:return
            kept['src']=src;kept['alt']=attrs.get('alt','');self.images=True
            if kept['alt']:self.text.append(' '+kept['alt']+' ')
        if tag=='a':
            href=attrs.get('href','')
            if url(href):kept.update(href=href,rel='noopener noreferrer',target='_blank')
            elif re.fullmatch(r'mailto:[^\s<>?]+@[^\s<>?]+',href):kept['href']=href
            elif re.fullmatch(r'tel:[+0-9(). -]+',href):kept['href']=href
        for k in ('width','height','colspan','rowspan'):
            if re.fullmatch(r'[0-9]{1,4}',attrs.get(k,'') or ''):kept[k]=attrs[k]
        if tag=='font':
            if re.fullmatch(r'[A-Za-z0-9 ,_-]{1,100}',attrs.get('face','') or ''):kept['face']=attrs['face']
            if re.fullmatch(r'#[0-9a-fA-F]{3,8}|[a-zA-Z]{1,20}',attrs.get('color','') or ''):kept['color']=attrs['color']
        safe=[]
        for entry in (attrs.get('style','') or '').split(';'):
            key,sep,value=entry.partition(':');key=key.strip().lower();value=value.strip()
            if sep and key in STYLES and len(value)<=150 and not re.search(r'url|expression|javascript|@|[\\<>\x00-\x1f]',value,re.I) and re.fullmatch(r"[\w\s#.,()%+'\"/-]+",value):safe.append(key+':'+value)
        if safe:kept['style']=';'.join(safe)
        self.out.append('<'+tag+''.join(' '+k+'="'+escape(str(v),quote=True)+'"' for k,v in kept.items())+'>')
        if tag in BLOCKS or tag=='br':self.text.append('\n')
        if tag in ('td','th'):self.text.append(' ')
        if tag not in VOID:self.stack.append(tag)
    def handle_startendtag(self,tag,attrs):
        self.handle_starttag(tag,attrs)
        if tag not in VOID:self.handle_endtag(tag)
    def handle_endtag(self,tag):
        tag=tag.lower()
        if self.drop:
            if tag in DROP:self.drop-=1
            return
        if tag in self.stack:
            while self.stack:
                last=self.stack.pop();self.out.append('</'+last+'>')
                if last in BLOCKS:self.text.append('\n')
                if last==tag:break
    def handle_data(self,data):
        if not self.drop:self.out.append(escape(data));self.text.append(data)
    def result(self):
        while self.stack:self.out.append('</'+self.stack.pop()+'>')
        plain='\n'.join(re.sub(r'[ \t]+',' ',line).strip() for line in ''.join(self.text).splitlines())
        plain=re.sub(r'\n{3,}','\n\n',plain).strip()
        return {'html':''.join(self.out).strip(),'plainText':plain,'containsImages':self.images}
def read_signature(service,expected):
    mailbox=str(service.users().getProfile(userId='me').execute(num_retries=0).get('emailAddress','')).strip()
    if mailbox.lower()!=expected.lower():raise ValueError('Mailbox mismatch')
    alias=service.users().settings().sendAs().get(userId='me',sendAsEmail=expected).execute(num_retries=0)
    if str(alias.get('sendAsEmail','')).lower()!=expected.lower():raise ValueError('Send-as identity mismatch')
    html=alias.get('signature') or ''
    if not isinstance(html,str) or not html.strip() or len(html)>100000:raise ValueError('Missing or oversized signature')
    parser=SignatureParser();parser.feed(html);parser.close();value=parser.result()
    if not value['html'] or not value['plainText']:raise ValueError('Signature must contain readable text')
    return {'ok':True,'mailbox':mailbox,**value}
def main():
    request=json.loads(sys.stdin.read(4097));expected=str(request.get('expectedAddress','')).strip()
    if not re.fullmatch(r'[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+',expected) or expected.lower()!=os.getenv('GMAIL_FROM_ADDRESS','').strip().lower():raise ValueError('Expected configured sender required')
    if os.getenv('ENABLE_GMAIL_SIGNATURE','').strip().lower()!='true':raise ValueError('Signature feature disabled')
    from google.oauth2.credentials import Credentials
    from googleapiclient.discovery import build
    keys=['GMAIL_OAUTH_CLIENT_ID','GMAIL_OAUTH_CLIENT_SECRET','GMAIL_OAUTH_REFRESH_TOKEN']
    if not all(os.getenv(k,'').strip() for k in keys):raise ValueError('OAuth configuration missing')
    credentials=Credentials(token=None,refresh_token=os.environ[keys[2]],token_uri='https://oauth2.googleapis.com/token',client_id=os.environ[keys[0]],client_secret=os.environ[keys[1]])
    service=build('gmail','v1',credentials=credentials,cache_discovery=False)
    print(json.dumps(read_signature(service,expected),ensure_ascii=True))
if __name__=='__main__':
    try:main()
    except Exception:print(json.dumps({'ok':False,'code':'GMAIL_SIGNATURE_READ_FAILED'}));sys.exit(1)

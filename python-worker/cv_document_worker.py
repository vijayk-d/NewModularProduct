import sys,json,base64
from cv_docx import read_document,write_word,DocumentError
try:
 raw=sys.stdin.buffer.read(1048577)
 if len(raw)>1048576:raise DocumentError('DOCUMENT_INPUT_LIMIT')
 p=json.loads(raw.decode('utf-8'));action=p.get('action')
 if action=='read' and set(p)=={'action','root','relativePath','expectedHash','includeBytes'}:result={'ok':True,**read_document(p['root'],p['relativePath'],p['expectedHash'],p['includeBytes'])}
 elif action=='word' and set(p)=={'action','text'}:result={'ok':True,'data':base64.b64encode(write_word(p['text'])).decode('ascii')}
 else:raise DocumentError('DOCUMENT_INPUT_INVALID')
except DocumentError as e:result={'ok':False,'code':str(e)}
except Exception:result={'ok':False,'code':'DOCUMENT_UNAVAILABLE'}
sys.stdout.buffer.write(json.dumps(result,ensure_ascii=True).encode('utf-8'))

import sys,json,base64
from cv_docx import read_document,write_word,DocumentError,need
from cv_tailor import describe,tailor
try:
 raw=sys.stdin.buffer.read(1048577)
 if len(raw)>1048576:raise DocumentError('DOCUMENT_INPUT_LIMIT')
 p=json.loads(raw.decode('utf-8'));action=p.get('action')
 if action=='read' and set(p)=={'action','root','relativePath','expectedHash','includeBytes'}:result={'ok':True,**read_document(p['root'],p['relativePath'],p['expectedHash'],p['includeBytes'])}
 elif action in ['sections','tailor'] and {'action','root','relativePath','expectedHash'}|({'profile','achievements'} if action=='tailor' else set())<=set(p)<={'action','root','relativePath','expectedHash','profileHeading','achievementsHeading'}|({'profile','achievements'} if action=='tailor' else set()):
  need(str(p['relativePath']).lower().endswith('.docx'),'CV_DOCX_REQUIRED');doc=read_document(p['root'],p['relativePath'],p['expectedHash'],True);data=base64.b64decode(doc['data']);chosen=(p.get('profileHeading',''),p.get('achievementsHeading',''))
  result={'ok':True,'name':doc['name'],'sha256':doc['sha256'],'sections':describe(data,*chosen)} if action=='sections' else {'ok':True,'name':doc['name'],'sha256':doc['sha256'],'data':base64.b64encode(tailor(data,p['profile'],p['achievements'],*chosen)).decode('ascii')}
 elif action=='word' and set(p)=={'action','text'}:result={'ok':True,'data':base64.b64encode(write_word(p['text'])).decode('ascii')}
 else:raise DocumentError('DOCUMENT_INPUT_INVALID')
except DocumentError as e:result={'ok':False,'code':str(e)}
except Exception:result={'ok':False,'code':'DOCUMENT_UNAVAILABLE'}
sys.stdout.buffer.write(json.dumps(result,ensure_ascii=True).encode('utf-8'))

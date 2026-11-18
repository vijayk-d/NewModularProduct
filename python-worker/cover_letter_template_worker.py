"""Render sanitised editor HTML into a private DOCX template; no network/Office calls."""
import base64,copy,hashlib,io,json,re,sys
from pathlib import Path
from html.parser import HTMLParser
from urllib.parse import urlsplit
from xml.etree import ElementTree as E
from zipfile import ZipFile,ZipInfo,ZIP_DEFLATED
W='http://schemas.openxmlformats.org/wordprocessingml/2006/main';R='http://schemas.openxmlformats.org/officeDocument/2006/relationships';P='http://schemas.openxmlformats.org/package/2006/relationships';C='http://schemas.openxmlformats.org/package/2006/content-types'
E.register_namespace('w',W);E.register_namespace('r',R)
def fail(code):raise ValueError(code)
def tag(t,a=None):return E.Element('{'+W+'}'+t,{'{'+W+'}'+k:str(v) for k,v in (a or {}).items()})
def add(p,t,a=None):x=tag(t,a);p.append(x);return x
class Node:
 def __init__(self,t,a=()):self.t=t;self.a=dict(a);self.children=[]
class Parser(HTMLParser):
 def __init__(self):super().__init__(convert_charrefs=True);self.root=Node('root');self.stack=[self.root];self.count=0
 def handle_starttag(self,t,a):
  if t not in {'p','div','br','b','strong','i','em','u','s','span','mark','a','ul','ol','li'}:fail('LETTER_HTML_UNSUPPORTED')
  if any(k.startswith('on') or k in {'src','srcdoc'} for k,v in a):fail('LETTER_HTML_UNSAFE')
  self.count+=1
  if len(self.stack)>40 or self.count>20000:fail('LETTER_HTML_COMPLEX')
  n=Node(t,a);self.stack[-1].children.append(n)
  if t!='br':self.stack.append(n)
 def handle_startendtag(self,t,a):
  if t!='br':fail('LETTER_HTML_UNSUPPORTED')
  self.handle_starttag(t,a)
 def handle_endtag(self,t):
  if len(self.stack)<2 or self.stack[-1].t!=t:fail('LETTER_HTML_MISMATCH')
  self.stack.pop()
 def handle_data(self,s):self.stack[-1].children.append(s)
 def handle_comment(self,s):fail('LETTER_HTML_UNSUPPORTED')
 def handle_decl(self,s):fail('LETTER_HTML_UNSUPPORTED')
 def close(self):
  super().close()
  if len(self.stack)!=1:fail('LETTER_HTML_MISMATCH')
def colour(v):
 v=v.strip().lower();names={'black':'000000','white':'FFFFFF','yellow':'FFFF00','red':'FF0000','blue':'0000FF','green':'008000','navy':'000080','gray':'808080','grey':'808080','maroon':'800000','purple':'800080'}
 if v in names:return names[v]
 if re.fullmatch('#[a-f0-9]{3}',v):return ''.join(x*2 for x in v[1:]).upper()
 if re.fullmatch('#[a-f0-9]{6}',v):return v[1:].upper()
 m=re.fullmatch(r'rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)',v)
 if m and all(int(x)<=255 for x in m.groups()):return ''.join('%02X'%int(x) for x in m.groups())
 fail('LETTER_COLOUR_UNSUPPORTED')
def style(n,parent):
 s=dict(parent)
 for t,k in [('b','bold'),('strong','bold'),('i','italic'),('em','italic'),('u','underline'),('s','strike')]:
  if n.t==t:s[k]=True
 if n.t=='mark':s['background']='FFF2A8'
 for item in n.a.get('style','').split(';'):
  if not item.strip():continue
  if ':' not in item:fail('LETTER_STYLE_UNSUPPORTED')
  k,v=[x.strip().lower() for x in item.split(':',1)]
  if k=='font-weight':
   if not re.fullmatch('normal|bold|bolder|[1-9]00',v):fail('LETTER_STYLE_UNSUPPORTED')
   s['bold']=v in {'bold','bolder'} or (v.isdigit() and int(v)>=600)
  elif k=='font-style':
   if v not in {'normal','italic','oblique'}:fail('LETTER_STYLE_UNSUPPORTED')
   s['italic']=v!='normal'
  elif k in {'text-decoration','text-decoration-line'}:
   if not re.fullmatch('none|underline|line-through|underline line-through|line-through underline',v):fail('LETTER_STYLE_UNSUPPORTED')
   s['underline']='underline' in v;s['strike']='line-through' in v
  elif k in {'color','background-color'}:s['colour' if k=='color' else 'background']=colour(v)
  elif k=='text-align':
   if v not in {'left','right','center','justify','start','end'}:fail('LETTER_STYLE_UNSUPPORTED')
   s['align']={'start':'left','end':'right','justify':'both'}.get(v,v)
  elif k=='white-space':
   if v not in {'normal','pre-wrap'}:fail('LETTER_STYLE_UNSUPPORTED')
   s['pre']=v=='pre-wrap'
  else:fail('LETTER_STYLE_UNSUPPORTED')
 if n.t=='a':
  href=n.a.get('href','');u=urlsplit(href)
  if u.scheme not in {'http','https'} or not u.hostname or u.username or u.password or any(c in href for c in '\r\n\t'):fail('LETTER_LINK_UNSAFE')
  s['href']=href
 return s
def render(template,html,digest):
 raw=Path(template).read_bytes()
 if len(raw)>5*1024*1024 or not re.fullmatch('[a-f0-9]{64}',digest or '') or hashlib.sha256(raw).hexdigest()!=digest:fail('LETTER_TEMPLATE_CHANGED')
 if not isinstance(html,str) or not html.strip() or len(html)>300000 or re.search(r'[\x00-\x08\x0b\x0c\x0e-\x1f]',html):fail('LETTER_HTML_INVALID')
 parser=Parser();parser.feed(html);parser.close()
 with ZipFile(io.BytesIO(raw)) as z:
  if len(z.namelist())>300 or sum(f.file_size for f in z.infolist())>30*1024*1024:fail('LETTER_TEMPLATE_TOO_LARGE')
  parts={n:z.read(n) for n in z.namelist()}
 document=parts['word/document.xml'].decode('utf-8');body=re.search(r'<w:body>(.*?)</w:body>',document,re.S)
 if not body:fail('LETTER_TEMPLATE_STRUCTURE')
 ps=re.findall(r'<w:p(?:\s[^>]*)?>.*?</w:p>',body[1],re.S);section=re.search(r'<w:sectPr\b.*?</w:sectPr>',body[1],re.S)
 namespaces=' '.join(re.findall(r'xmlns(?::\w+)?="[^"]*"',re.search(r'<w:document\b([^>]*)>',document)[1]))
 if len(ps)<3 or not section or 'word/numbering.xml' in parts:fail('LETTER_TEMPLATE_STRUCTURE')
 for p in ps[2:]:
  if ''.join(E.fromstring(p.replace('<w:p','<w:p '+namespaces,1)).itertext()).strip():fail('LETTER_TEMPLATE_NOT_EMPTY')
 rels=E.fromstring(parts['word/_rels/document.xml.rels']);types=E.fromstring(parts['[Content_Types].xml']);numbers=tag('numbering');paragraphs=[];links={};list_count=[0]
 def relation(href):
  if href in links:return links[href]
  used={x.get('Id') for x in rels};i=1
  while 'rIdLetter'+str(i) in used:i+=1
  rid='rIdLetter'+str(i);E.SubElement(rels,'{'+P+'}Relationship',{'Id':rid,'Type':R+'/hyperlink','Target':href,'TargetMode':'External'});links[href]=rid;return rid
 def numbering(kind):
  list_count[0]+=1;num=list_count[0];a=add(numbers,'abstractNum',{'abstractNumId':num-1});add(a,'multiLevelType',{'val':'multilevel'})
  for level in range(9):
   l=add(a,'lvl',{'ilvl':level});add(l,'start',{'val':1});add(l,'numFmt',{'val':'decimal' if kind=='ol' else 'bullet'});add(l,'suff',{'val':'tab'});add(l,'lvlText',{'val':'%'+str(level+1)+'.' if kind=='ol' else '•'});add(l,'lvlJc',{'val':'right' if kind=='ol' else 'left'});pp=add(l,'pPr');tabs=add(pp,'tabs');add(tabs,'tab',{'val':'num','pos':720*(level+1)});add(pp,'ind',{'left':720*(level+1),'hanging':360});rp=add(l,'rPr');add(rp,'rFonts',{'ascii':'Arial','hAnsi':'Arial'});add(rp,'sz',{'val':20})
  add(add(numbers,'num',{'numId':num}),'abstractNumId',{'val':num-1});return num
 def paragraph(s,ctx=None):
  p=tag('p');pp=add(p,'pPr');first=ctx is not None and not ctx['used']
  if first:np=add(pp,'numPr');add(np,'ilvl',{'val':ctx['depth']});add(np,'numId',{'val':ctx['num']});ctx['used']=True
  if ctx:
   tabs=add(pp,'tabs');add(tabs,'tab',{'val':'num','pos':720*(ctx['depth']+1)})
  add(pp,'spacing',{'after':0,'line':360,'lineRule':'auto'})
  if ctx:add(pp,'ind',{'left':720*(ctx['depth']+1),**({'hanging':360} if first else {})})
  if s.get('align'):add(pp,'jc',{'val':s['align']})
  paragraphs.append(p);return p
 def text(p,value,s):
  parent=E.SubElement(p,'{'+W+'}hyperlink',{'{'+R+'}id':relation(s['href'])}) if s.get('href') else p
  r=add(parent,'r');rp=add(r,'rPr');add(rp,'rFonts',{'ascii':'Arial','hAnsi':'Arial','cs':'Arial'})
  for k,t in [('bold','b'),('italic','i'),('strike','strike')]:
   if k in s:add(rp,t,{'val':1 if s[k] else 0})
  if s.get('colour') or s.get('href'):add(rp,'color',{'val':s.get('colour','1155CC')})
  add(rp,'sz',{'val':20});add(rp,'szCs',{'val':20})
  if s.get('underline') or s.get('href'):add(rp,'u',{'val':'single'})
  elif 'underline' in s:add(rp,'u',{'val':'none'})
  if s.get('background'):add(rp,'shd',{'val':'clear','color':'auto','fill':s['background']})
  for token in re.split('(\n|\t)',value.replace('\r\n','\n').replace('\r','\n')):
   if token in {'\n','\t'}:add(r,'br' if token=='\n' else 'tab')
   elif token:x=add(r,'t');x.set('{http://www.w3.org/XML/1998/namespace}space','preserve');x.text=token
 def has_block(n):return any(not isinstance(x,str) and (x.t in {'p','div','ul','ol','li'} or has_block(x)) for x in n.children)
 def inline(nodes,s,p):
  for n in nodes:
   if isinstance(n,str):text(p,n if s.get('pre') else re.sub('[\r\n\t ]+',' ',n),s)
   elif n.t=='br':add(add(p,'r'),'br')
   elif n.t in {'p','div','ul','ol','li'}:fail('LETTER_INLINE_STRUCTURE')
   else:inline(n.children,style(n,s),p)
 def flow(nodes,s,ctx=None,depth=0,force=False):
  p=None
  for n in nodes:
   if isinstance(n,str):
    if p is None and not n.strip():continue
    p=p if p is not None else paragraph(s,ctx);text(p,n if s.get('pre') else re.sub('[\r\n\t ]+',' ',n),s);continue
   t=style(n,s)
   if n.t in {'p','div'} or (n.t not in {'ul','ol','li'} and has_block(n)):
    p=None;flow(n.children,t,ctx,depth,True);continue
   if n.t in {'ul','ol'}:
    if depth>=9:fail('LETTER_LIST_TOO_DEEP')
    if ctx and not ctx['used']:paragraph(s,ctx)
    top=ctx is None
    if top and paragraphs and not blank(paragraphs[-1]):paragraph({})
    num=numbering(n.t)
    for li in n.children:
     if isinstance(li,str):
      if li.strip():fail('LETTER_LIST_INVALID')
      continue
     if li.t!='li':fail('LETTER_LIST_INVALID')
     flow(li.children,style(li,t),{'num':num,'depth':depth,'used':False},depth+1,True)
    if top:spacers_after.append(paragraph({}))
    p=None;continue
   if n.t=='li':fail('LETTER_LIST_INVALID')
   p=p if p is not None else paragraph(t,ctx)
   if n.t=='br':add(add(p,'r'),'br')
   else:inline(n.children,t,p)
  if force and p is None and (not nodes or (ctx and not ctx['used'])):paragraph(s,ctx)
 # A top-level list gets one empty line before and after it, unless the letter already has one there.
 def blank(p):return p.find('.//{'+W+'}numPr') is None and not ''.join(x.text or '' for x in p.iter('{'+W+'}t')).strip()
 spacers_after=[]
 paragraph({});flow(parser.root.children,{'pre':True})
 for spacer in spacers_after:
  i=next(k for k,x in enumerate(paragraphs) if x is spacer)
  if i==len(paragraphs)-1 or blank(paragraphs[i+1]):paragraphs.pop(i)
 def visible(nodes):return ''.join(n if isinstance(n,str) else ' ' if n.t=='br' else (' '+visible(n.children)+' ' if n.t in {'p','div','ul','ol','li'} else visible(n.children)) for n in nodes)
 expected=' '.join(visible(parser.root.children).split());actual=' '.join(' '.join(''.join((x.text or '') if x.tag=='{'+W+'}t' else ' ' if x.tag in {'{'+W+'}br','{'+W+'}tab'} else '' for x in p.iter()) for p in paragraphs).split())
 if expected!=actual:fail('LETTER_CONTENT_CHANGED')
 content=''.join(ps[:2])+''.join(E.tostring(x,encoding='unicode') for x in paragraphs)+section[0]
 parts['word/document.xml']=(document[:body.start(1)]+content+document[body.end(1):]).encode('utf-8')
 if list_count[0]:
  numbers[:]=sorted(list(numbers),key=lambda x:x.tag=='{'+W+'}num');parts['word/numbering.xml']=E.tostring(numbers,encoding='utf-8',xml_declaration=True);E.SubElement(rels,'{'+P+'}Relationship',{'Id':'rIdLetterNumbering','Type':R+'/numbering','Target':'numbering.xml'});E.SubElement(types,'{'+C+'}Override',{'PartName':'/word/numbering.xml','ContentType':'application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml'})
 parts['word/_rels/document.xml.rels']=E.tostring(rels,encoding='utf-8',xml_declaration=True);parts['[Content_Types].xml']=E.tostring(types,encoding='utf-8',xml_declaration=True)
 out=io.BytesIO()
 with ZipFile(out,'w',ZIP_DEFLATED) as z:
  # Fixed entry date: the same letter always gives the same bytes, so Save to folder can recognise an identical file.
  for n,b in parts.items():z.writestr(ZipInfo(n,(1980,1,1,0,0,0)),b,compress_type=ZIP_DEFLATED)
 return out.getvalue()
def main():
 try:
  raw=sys.stdin.buffer.read(1048577)
  if len(raw)>1048576:fail('LETTER_INPUT_TOO_LARGE')
  v=json.loads(raw.decode('utf-8'));data=render(v['template'],v['html'],v['templateSha256']);print(json.dumps({'ok':True,'data':base64.b64encode(data).decode('ascii')},separators=(',',':')))
 except Exception as e:
  code=str(e) if isinstance(e,ValueError) and re.fullmatch('LETTER_[A-Z_]+',str(e)) else 'LETTER_RENDER_FAILED';print(json.dumps({'ok':False,'code':code}));sys.exit(1)
if __name__=='__main__':main()

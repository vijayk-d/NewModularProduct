"""Convert the application's generated cover-letter DOCX subset to local print HTML."""
import base64,html,io,json,re,sys
from zipfile import ZipFile
from xml.etree import ElementTree as E
W='http://schemas.openxmlformats.org/wordprocessingml/2006/main';R='http://schemas.openxmlformats.org/officeDocument/2006/relationships';P='http://schemas.openxmlformats.org/package/2006/relationships';ns={'w':W}
def fail(code):raise ValueError(code)
def attr(x,name,default=None):return x.get('{'+W+'}'+name,default) if x is not None else default
def num(value,default=0):
 try:n=float(value)
 except (ValueError,TypeError):return default
 if not -50000<n<50000:fail('PDF_LAYOUT_RANGE')
 return n
def val(parent,path,default=None):return attr(parent.find(path,ns),'val',default)
def font_name(value):
 if not re.fullmatch(r'[A-Za-z0-9 _-]{1,80}',value or ''):fail('PDF_FONT_UNSUPPORTED')
 return value

def convert(data):
 if len(data)>10*1024*1024:fail('PDF_DOCX_TOO_LARGE')
 with ZipFile(io.BytesIO(data)) as z:
  if len(z.namelist())>300 or sum(x.file_size for x in z.infolist())>30*1024*1024:fail('PDF_DOCX_TOO_LARGE')
  parts={n:z.read(n) for n in z.namelist()}
 document=E.fromstring(parts['word/document.xml']);body=document.find('w:body',ns)
 if body is None:fail('PDF_DOCX_INVALID')
 if document.find('.//w:drawing',ns) is not None or document.find('.//w:tbl',ns) is not None or document.find('.//w:instrText',ns) is not None or document.find('.//w:sectPr/w:headerReference',ns) is not None or document.find('.//w:sectPr/w:footerReference',ns) is not None:fail('PDF_DOCX_UNSUPPORTED')
 sections=body.findall('w:sectPr',ns)
 if len(sections)!=1 or document.find('.//w:pPr/w:sectPr',ns) is not None:fail('PDF_SECTIONS_UNSUPPORTED')
 sect=sections[0];size=sect.find('w:pgSz',ns);marg=sect.find('w:pgMar',ns)
 width=num(attr(size,'w',12240))/20;height=num(attr(size,'h',15840))/20
 margins=[num(attr(marg,k,1440))/20 for k in ('top','right','bottom','left')]
 if width<=0 or height<=0 or min(margins)<0 or margins[1]+margins[3]>=width or margins[0]+margins[2]>=height:fail('PDF_PAGE_INVALID')
 styles=E.fromstring(parts['word/styles.xml']);default_size=num(val(styles,'w:docDefaults/w:rPrDefault/w:rPr/w:sz',22))/2
 default_fonts=styles.find('w:docDefaults/w:rPrDefault/w:rPr/w:rFonts',ns);default_font=font_name(attr(default_fonts,'ascii','Arial'))
 rels={x.get('Id'):x.get('Target','') for x in E.fromstring(parts['word/_rels/document.xml.rels']) if x.get('Type','').endswith('/hyperlink')}
 numbering={};counters={}
 if 'word/numbering.xml' in parts:
  n=E.fromstring(parts['word/numbering.xml']);abstract={x.get('{'+W+'}abstractNumId'):x for x in n.findall('w:abstractNum',ns)}
  for item in n.findall('w:num',ns):
   aid=val(item,'w:abstractNumId');node=abstract.get(aid)
   if node is not None:numbering[item.get('{'+W+'}numId')]={int(attr(l,'ilvl',0)):l for l in node.findall('w:lvl',ns)}
 def run(r):
  pr=r.find('w:rPr',ns);sty=[]
  if pr is not None:
   fonts=pr.find('w:rFonts',ns)
   if fonts is not None:sty.append("font-family:'"+font_name(attr(fonts,'ascii',default_font))+"'")
   size=val(pr,'w:sz')
   if size is not None:sty.append('font-size:'+str(num(size)/2)+'pt')
   for tag,css in [('b','font-weight'),('i','font-style')]:
    q=pr.find('w:'+tag,ns)
    if q is not None:sty.append(css+':'+(('normal') if attr(q,'val','1') in {'0','false','off'} else 'bold' if tag=='b' else 'italic'))
   decorations=[]
   if val(pr,'w:u','none') not in {'none','0','false'}:decorations.append('underline')
   if pr.find('w:strike',ns) is not None and val(pr,'w:strike','1') not in {'0','false'}:decorations.append('line-through')
   if decorations:sty.append('text-decoration:'+' '.join(decorations))
   for path,key in [('w:color','color'),('w:shd','background-color')]:
    q=pr.find(path,ns);v=attr(q,'fill' if path=='w:shd' else 'val','auto')
    if re.fullmatch('[a-fA-F0-9]{6}',v):sty.append(key+':#'+v)
  text=[]
  for x in r:
   t=x.tag.rsplit('}',1)[-1]
   if t=='t':text.append(html.escape(x.text or ''))
   elif t=='br':
    if attr(x,'type','textWrapping')!='textWrapping':fail('PDF_BREAK_UNSUPPORTED')
    text.append('<br>')
   elif t=='tab':text.append('&#9;')
   elif t in {'rPr','lastRenderedPageBreak'}:pass
   else:fail('PDF_RUN_UNSUPPORTED')
  return '<span style="'+html.escape(';'.join(sty),quote=True)+'">'+''.join(text)+'</span>'
 def inline(p):
  out=[]
  for x in p:
   t=x.tag.rsplit('}',1)[-1]
   if t=='r':out.append(run(x))
   elif t=='hyperlink':
    from urllib.parse import urlsplit
    url=rels.get(x.get('{'+R+'}id'),'');u=urlsplit(url)
    if u.scheme not in {'http','https'} or not u.hostname or u.username or u.password:fail('PDF_LINK_UNSAFE')
    if any(c.tag!='{'+W+'}r' for c in x):fail('PDF_LINK_UNSUPPORTED')
    out.append('<a href="'+html.escape(url,quote=True)+'">'+''.join(run(r) for r in x)+'</a>')
   elif t in {'pPr','proofErr','bookmarkStart','bookmarkEnd'}:pass
   else:fail('PDF_PARAGRAPH_UNSUPPORTED')
  return ''.join(out)
 out=[];stack=[];list_count=0
 def close_to(depth):
  while len(stack)>depth:out.append('</li></'+stack.pop()['kind']+'>')
 for p in body:
  if p.tag=='{'+W+'}sectPr':continue
  if p.tag!='{'+W+'}p':fail('PDF_BODY_UNSUPPORTED')
  pp=p.find('w:pPr',ns);pp=pp if pp is not None else E.Element('{'+W+'}pPr');sp=pp.find('w:spacing',ns);ind=pp.find('w:ind',ns)
  before=num(attr(sp,'before',0))/20;after=num(attr(sp,'after',0))/20;line=num(attr(sp,'line',240))/240
  if attr(sp,'lineRule','auto')!='auto' or line<=0:fail('PDF_LINE_SPACING_UNSUPPORTED')
  rp=p.find('w:r/w:rPr',ns)
  if rp is None:rp=p.find('w:hyperlink/w:r/w:rPr',ns)
  if rp is None:rp=pp.find('w:rPr',ns)
  psize=num(val(rp,'w:sz',default_size*2))/2 if rp is not None else default_size
  rf=rp.find('w:rFonts',ns) if rp is not None else None;pfont=font_name(attr(rf,'ascii',default_font))
  common=f"font-family:'{pfont}';font-size:{psize}pt;line-height:{line};margin-top:{before}pt;margin-bottom:{after}pt"
  align=val(pp,'w:jc','left')
  if align not in {'left','right','center','both','justify','start','end'}:fail('PDF_ALIGNMENT_UNSUPPORTED')
  common+=';text-align:'+{'both':'justify','start':'left','end':'right'}.get(align,align)
  border=pp.find('w:pBdr/w:bottom',ns)
  if border is not None:common+=';border-bottom:'+str(num(attr(border,'sz',4))/8)+'pt solid #000;padding-bottom:'+str(num(attr(border,'space',0)))+'pt'
  content=inline(p) or '<br>';nid=val(pp,'w:numPr/w:numId');depth=int(num(val(pp,'w:numPr/w:ilvl',0)))
  if nid is not None:
   lvl=numbering.get(nid,{}).get(depth)
   if lvl is None:fail('PDF_NUMBERING_UNSUPPORTED')
   kindval=val(lvl,'w:numFmt');kind='ul' if kindval=='bullet' else 'ol' if kindval=='decimal' else None
   if kind is None or depth>8:fail('PDF_NUMBERING_UNSUPPORTED')
   if depth>len(stack):fail('PDF_LIST_STRUCTURE')
   if len(stack)>depth+1:close_to(depth+1)
   if len(stack)==depth+1:
    if stack[-1]['nid']==nid and stack[-1]['kind']==kind:out.append('</li>')
    else:close_to(depth)
   if len(stack)==depth:out.append('<'+kind+' role="list">');stack.append({'kind':kind,'nid':nid,'left':num(attr(ind,'left',720*(depth+1)))/20})
   left=num(attr(ind,'left',720*(depth+1)))/20;hang=num(attr(ind,'hanging',360))/20;relative=left-(stack[-2]['left'] if depth else 0)
   counters[(nid,depth)]=counters.get((nid,depth),int(num(val(lvl,'w:start',1)))-1)+1
   for key in list(counters):
    if key[0]==nid and key[1]>depth:del counters[key]
   marker='•' if kind=='ul' else str(counters[(nid,depth)])+'.';offset=-hang if kind=='ul' else -2*hang
   out.append('<li style="'+html.escape(common+f';margin-left:{relative}pt',quote=True)+'"><span aria-hidden="true" class="marker" style="left:'+str(offset)+'pt;width:'+str(hang)+'pt;text-align:'+('left' if kind=='ul' else 'right')+'">'+html.escape(marker)+'</span><div class="item-content">'+content+'</div>');list_count+=1
  else:
   left=num(attr(ind,'left',0))/20
   if stack and left>=stack[-1]['left']:
    out.append('<div style="'+html.escape(common+f';margin-left:{left-stack[-1]["left"]}pt',quote=True)+'">'+content+'</div>');continue
   close_to(0)
   right=num(attr(ind,'right',0))/20;first=num(attr(ind,'firstLine',0))/20-num(attr(ind,'hanging',0))/20
   out.append('<p style="'+html.escape(common+f';margin-left:{left}pt;margin-right:{right}pt;text-indent:{first}pt',quote=True)+'">'+content+'</p>')
 close_to(0)
 css='@page{size:'+str(width)+'pt '+str(height)+'pt;margin:'+' '.join(str(x)+'pt' for x in margins)+'}html,body{margin:0;padding:0}body{font-family:Arial,sans-serif;white-space:pre-wrap;tab-size:4}p{margin:0}ul,ol{list-style:none;margin:0;padding:0}li{position:relative;padding:0}li>.marker{position:absolute;top:0;white-space:nowrap}a{color:inherit;text-decoration:inherit}.item-content{margin:0;padding:0}'
 result='<!doctype html><html lang="en"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'; connect-src \'none\'"><title>Cover letter</title><style>'+css+'</style></head><body>'+''.join(out)+'</body></html>'
 return {'html':result,'layout':{'pageWidthPt':width,'pageHeightPt':height,'marginsPt':margins,'listItems':list_count,'paragraphs':len(body.findall('w:p',ns))}}
def main():
 try:
  raw=sys.stdin.buffer.read(16*1024*1024+1)
  if len(raw)>16*1024*1024:fail('PDF_INPUT_LIMIT')
  v=json.loads(raw.decode('utf-8'));data=base64.b64decode(v['docx'],validate=True);r=convert(data);print(json.dumps({'ok':True,**r},ensure_ascii=True))
 except Exception as e:
  code=str(e) if isinstance(e,ValueError) and re.fullmatch('PDF_[A-Z_]+',str(e)) else 'PDF_LAYOUT_FAILED';print(json.dumps({'ok':False,'code':code}));sys.exit(1)
if __name__=='__main__':main()

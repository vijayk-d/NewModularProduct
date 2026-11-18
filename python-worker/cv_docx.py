"""Offline, bounded local CV inspection and plain-text Word export. No network or Office automation."""
import io,os,re,stat,zipfile,hashlib,base64,json,sys,posixpath,xml.etree.ElementTree as ET
from pathlib import Path
from urllib.parse import urlsplit
MIME='application/vnd.openxmlformats-officedocument.wordprocessingml.document';W='http://schemas.openxmlformats.org/wordprocessingml/2006/main';CT='http://schemas.openxmlformats.org/package/2006/content-types';REL='http://schemas.openxmlformats.org/package/2006/relationships';MAIN='application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml';MAX=20*1024*1024
class DocumentError(ValueError):pass
def need(ok,code):
 if not ok:raise DocumentError(code)
def xml(raw):
 need(len(raw)<=8*1024*1024 and b'\0' not in raw,'DOCX_XML_LIMIT_OR_ENCODING');s=raw.decode('utf-8-sig');need(not re.search(r'<!\s*(?:DOCTYPE|ENTITY)\b',s,re.I),'DOCX_DTD');return ET.fromstring(s)
def package(data):
 need(0<len(data)<=MAX,'CV_SIZE');z=zipfile.ZipFile(io.BytesIO(data))
 try:
  entries=z.infolist();need(0<len(entries)<=2000,'DOCX_ENTRY_LIMIT');seen=set();total=0
  for item in entries:
   n=item.filename;need(n and not n.startswith('/') and chr(92) not in n and ':' not in n and '..' not in n.split('/') and not re.search(r'[\x00-\x1f\x7f]',n),'DOCX_PART_PATH');need(n.lower() not in seen,'DOCX_DUPLICATE_PART');seen.add(n.lower());total+=item.file_size;need(not item.flag_bits&1 and not stat.S_ISLNK(item.external_attr>>16),'DOCX_ENCRYPTED_OR_LINK');need(item.file_size<=MAX and total<=64*1024*1024 and item.compress_type in [0,8],'DOCX_PACKAGE_LIMIT');need(item.file_size<=1048576 or item.file_size<=max(1,item.compress_size)*200,'DOCX_COMPRESSION_LIMIT');need('vbaproject' not in n.lower() and not n.lower().startswith(('word/embeddings/','word/activex/')),'DOCX_ACTIVE_CONTENT')
  need({'[Content_Types].xml','_rels/.rels','word/document.xml'}<=set(z.namelist()),'DOCX_REQUIRED_PART');types=xml(z.read('[Content_Types].xml'));main=[e for e in types if e.attrib.get('PartName')=='/word/document.xml'];need(len(main)==1 and main[0].attrib.get('ContentType')==MAIN,'DOCX_MAIN_TYPE');need(not any(any(t in e.attrib.get('ContentType','').lower() for t in ['macroenabled','vbaproject','oleobject','activex']) for e in types),'DOCX_ACTIVE_TYPE');rels=xml(z.read('_rels/.rels'));targets=[r for r in rels if r.attrib.get('Type','').endswith('/officeDocument')];need(len(targets)==1 and targets[0].attrib.get('Target') in ['word/document.xml','/word/document.xml'] and targets[0].attrib.get('TargetMode')!='External','DOCX_MAIN_RELATIONSHIP')
  for name in z.namelist():
   if name.endswith('.rels'):
    for r in xml(z.read(name)):
     if r.attrib.get('TargetMode')=='External':
      u=urlsplit(r.attrib.get('Target',''));need(r.attrib.get('Type','').endswith('/hyperlink') and u.scheme in ['http','https','mailto','tel'] and not u.username and not u.password,'DOCX_EXTERNAL_CONTENT')
   if name.startswith('word/') and name.endswith('.xml'):
    part=xml(z.read(name));need(not any(e.tag.rsplit('}',1)[-1] in ['altChunk','object'] for e in part.iter()),'DOCX_UNSUPPORTED_OBJECT');instr=''.join(e.text or '' for e in part.iter() if e.tag.rsplit('}',1)[-1]=='instrText')+' '.join(v for e in part.iter() for k,v in e.attrib.items() if k.rsplit('}',1)[-1]=='instr');need(not any(t in instr.upper() for t in ['DDE','INCLUDETEXT','INCLUDEPICTURE']),'DOCX_ACTIVE_FIELD')
  root=xml(z.read('word/document.xml'));need(root.tag in ['{'+W+'}document','{http://purl.oclc.org/ooxml/wordprocessingml/main}document'],'DOCX_ROOT');return z,root
 except Exception:z.close();raise
def validate_docx(data):
 z,_=package(data);z.close();return True
def extract(data):
 z,root=package(data);chunks=[]
 with z:
  def walk(e):
   tag=e.tag.rsplit('}',1)[-1];ns=e.tag[1:].split('}',1)[0] if e.tag.startswith('{') else ''
   if tag in ['del','moveFrom','instrText','delText']:return
   if tag=='AlternateContent':
    chosen=next((x for x in e if x.tag.rsplit('}',1)[-1]=='Choice'),None)
    if chosen is None:chosen=next((x for x in e if x.tag.rsplit('}',1)[-1]=='Fallback'),None)
    if chosen is not None:walk(chosen)
    return
   if tag=='t' and ('wordprocessingml' in ns or 'drawingml' in ns):chunks.append(e.text or '');return
   if tag in ['br','cr','tab']:chunks.append('\t' if tag=='tab' else '\n');return
   if tag in ['p','tr']:chunks.append('\n')
   for child in e:walk(child)
   if tag in ['p','tr']:chunks.append('\n')
  walk(root);rels={}
  if 'word/_rels/document.xml.rels' in z.namelist():rels={r.attrib.get('Id'):r.attrib for r in xml(z.read('word/_rels/document.xml.rels'))}
  used=set()
  for e in root.iter():
   kind=e.tag.rsplit('}',1)[-1]
   if kind in ['headerReference','footerReference']:
    rid=next((v for k,v in e.attrib.items() if k.rsplit('}',1)[-1]=='id'),'');r=rels.get(rid,{});target=posixpath.normpath('word/'+r.get('Target',''));need(r.get('Type','').endswith('/'+kind.replace('Reference','')) and target.startswith('word/') and target in z.namelist(),'DOCX_STORY_REFERENCE')
    if target not in used:walk(xml(z.read(target)));used.add(target)
  text=re.sub(r'\n{3,}','\n\n','\n'.join(s.strip() for s in ''.join(chunks).split('\n'))).strip();need(text and len(text)<=120000,'DOCX_TEXT_UNAVAILABLE');return text

def read_document(root,relative,expected=None,include_bytes=False):
 need(isinstance(relative,str) and relative and not re.search(r'[\x00-\x1f\x7f:]',relative) and not relative.startswith(('/',chr(92))),'CV_PATH_INVALID');parts=relative.replace(chr(92),'/').split('/');need(not any(p in ['','.','..'] for p in parts),'CV_PATH_INVALID');folder=Path(root).resolve(strict=True);need((folder/Path(*parts)).is_file(),'CV_FILE_NOT_FOUND');file=(folder/Path(*parts)).resolve(strict=True);need(file.is_relative_to(folder) and file.suffix.lower() in ['.pdf','.docx'],'CV_PATH_OUTSIDE_OR_FORMAT')
 with file.open('rb') as f:
  before=os.fstat(f.fileno());need(stat.S_ISREG(before.st_mode) and before.st_size<=MAX,'CV_FILE_LIMIT');data=f.read(MAX+1);after=os.fstat(f.fileno());need(len(data)<=MAX and (before.st_size,before.st_mtime_ns,before.st_ino)==(after.st_size,after.st_mtime_ns,after.st_ino) and (folder/Path(*parts)).resolve(strict=True)==file,'CV_CHANGED_DURING_READ')
 digest=hashlib.sha256(data).hexdigest();need(expected is None or (isinstance(expected,str) and re.fullmatch(r'[a-f0-9]{64}',expected) and digest==expected),'CV_VERSION_CHANGED')
 if file.suffix.lower()=='.docx':validate_docx(data)
 else:need(data.startswith(b'%PDF-'),'CV_PDF_HEADER')
 result={'relativePath':'/'.join(parts),'name':parts[-1],'sizeBytes':len(data),'sha256':digest,'contentType':MIME if file.suffix.lower()=='.docx' else 'application/pdf'}
 if file.suffix.lower()=='.docx':
  try:result.update(text=extract(data),textAvailable=True,warnings=['Structural text, not visual Word layout or OCR.'])
  except DocumentError as e:
   if str(e)!='DOCX_TEXT_UNAVAILABLE':raise
   result.update(text='',textAvailable=False,warnings=['No usable text. No inventory-tag substitute will be used.'])
 if include_bytes:result['data']=base64.b64encode(data).decode('ascii')
 return result

def write_word(text):
 need(isinstance(text,str) and text.strip() and len(text)<=100000 and not re.search(r'[\x00-\x08\x0b\x0c\x0e-\x1f\ud800-\udfff]',text),'WORD_TEXT_INVALID');ET.register_namespace('w',W);document=ET.Element('{'+W+'}document');body=ET.SubElement(document,'{'+W+'}body')
 for block in text.replace('\r\n','\n').split('\n\n'):
  p=ET.SubElement(body,'{'+W+'}p');r=ET.SubElement(p,'{'+W+'}r')
  for i,line in enumerate(block.split('\n')):
   if i:ET.SubElement(r,'{'+W+'}br')
   ET.SubElement(r,'{'+W+'}t',{'{http://www.w3.org/XML/1998/namespace}space':'preserve'}).text=line
 types=ET.Element('{'+CT+'}Types');ET.SubElement(types,'{'+CT+'}Default',Extension='rels',ContentType='application/vnd.openxmlformats-package.relationships+xml');ET.SubElement(types,'{'+CT+'}Default',Extension='xml',ContentType='application/xml');ET.SubElement(types,'{'+CT+'}Override',PartName='/word/document.xml',ContentType=MAIN);rels=ET.Element('{'+REL+'}Relationships');ET.SubElement(rels,'{'+REL+'}Relationship',Id='rId1',Type='http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument',Target='word/document.xml');out=io.BytesIO()
 with zipfile.ZipFile(out,'w',zipfile.ZIP_DEFLATED) as z:
  # Fixed entry date: the same text always gives the same bytes, so Save to folder can recognise an identical file.
  for name,e in [('[Content_Types].xml',types),('_rels/.rels',rels),('word/document.xml',document)]:z.writestr(zipfile.ZipInfo(name,(1980,1,1,0,0,0)),ET.tostring(e,encoding='utf-8',xml_declaration=True),compress_type=zipfile.ZIP_DEFLATED)
 return out.getvalue()

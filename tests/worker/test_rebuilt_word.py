import unittest,sys,tempfile,io,zipfile,hashlib,base64,os
from pathlib import Path
from unittest.mock import patch
ROOT=Path(__file__).resolve().parents[2];sys.path.insert(0,str(ROOT/'python-worker'));import cv_docx as d
from gmail_draft_worker import _build_message
class WordTests(unittest.TestCase):
 def setUp(self):self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup);self.root=Path(self.tmp.name);(self.root/'DM').mkdir();self.data=d.write_word('Example Candidate\n\nVerified £2M outcome — fixture.');(self.root/'DM/cv.docx').write_bytes(self.data)
 def altered(self,replacements=None,extras=None):
  out=io.BytesIO()
  with zipfile.ZipFile(io.BytesIO(self.data)) as src,zipfile.ZipFile(out,'w',zipfile.ZIP_DEFLATED) as dst:
   for n in src.namelist():dst.writestr(n,(replacements or {}).get(n,src.read(n)))
   for n,b in (extras or {}).items():dst.writestr(n,b)
  return out.getvalue()
 def test_windows_path_actual_reader(self):
  p=chr(92).join(['DM','cv.docx']);self.assertEqual(ord(p[2]),92);self.assertIn('£2M',d.read_document(str(self.root),p)['text'])
 def test_hash_and_original(self):
  r=d.read_document(str(self.root),'DM/cv.docx',include_bytes=True);self.assertEqual(base64.b64decode(r['data']),self.data);self.assertEqual(r['sha256'],hashlib.sha256(self.data).hexdigest())
 def test_changed_hash(self):
  with self.assertRaises(d.DocumentError):d.read_document(str(self.root),'DM/cv.docx','0'*64)
 def test_path_boundaries(self):
  for p in ['../cv.docx','/tmp/cv.docx','C:'+chr(92)+'cv.docx','DM/cv.doc','DM/../cv.docx']:
   with self.assertRaises((ValueError,OSError)):d.read_document(str(self.root),p)
 def test_table_text_once(self):
  raw=('<w:document xmlns:w="'+d.W+'"><w:body><w:tbl><w:tr><w:tc><w:p><w:r><w:t>Table evidence</w:t></w:r></w:p></w:tc></w:tr></w:tbl></w:body></w:document>').encode();self.assertEqual(d.extract(self.altered({'word/document.xml':raw})).count('Table evidence'),1)
 def test_active_parts(self):
  for p in ['word/vbaProject.bin','word/embeddings/object.bin','../outside.xml']:
   with self.assertRaises(d.DocumentError):d.validate_docx(self.altered(extras={p:b'fake'}))
 def test_dtd_and_encoding(self):
  for raw in [b'<!DOCTYPE x [<!ENTITY a "expanded">]><x/>','<x/>'.encode('utf-16')]:
   with self.assertRaises(d.DocumentError):d.validate_docx(self.altered({'word/document.xml':raw}))
 def test_external_template(self):
  r=('<Relationships xmlns="'+d.REL+'"><Relationship Id="remote" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/attachedTemplate" TargetMode="External" Target="https://example.test/template"/></Relationships>').encode()
  with self.assertRaises(d.DocumentError):d.validate_docx(self.altered(extras={'word/_rels/document.xml.rels':r}))
 def test_unused_header_ignored(self):
  part=('<w:hdr xmlns:w="'+d.W+'"><w:p><w:r><w:t>Unused invented claim</w:t></w:r></w:p></w:hdr>').encode();self.assertNotIn('Unused',d.extract(self.altered(extras={'word/header1.xml':part})))
 def test_deleted_text_ignored(self):
  raw=('<w:document xmlns:w="'+d.W+'"><w:body><w:p><w:r><w:t>Current</w:t></w:r><w:del><w:r><w:delText>Deleted</w:delText></w:r></w:del></w:p></w:body></w:document>').encode();self.assertEqual(d.extract(self.altered({'word/document.xml':raw})),'Current')
 def test_no_text_no_substitution(self):
  raw=('<w:document xmlns:w="'+d.W+'"><w:body/></w:document>').encode();(self.root/'DM/cv.docx').write_bytes(self.altered({'word/document.xml':raw}));self.assertFalse(d.read_document(str(self.root),'DM/cv.docx')['textAvailable'])
 def test_attachment_bytes_and_mime(self):
  draft={'recipient':{'email':'recipient@example.test'},'subject':'Reviewed','bodyPlainText':'Reviewed','bodyHtml':'Reviewed','attachment':{'relativePath':'DM/cv.docx','name':'CV.docx','sha256':hashlib.sha256(self.data).hexdigest()}}
  with patch.dict(os.environ,{'CV_FOLDER':str(self.root)}):m=_build_message(draft,'sender@example.test')
  p=list(m.iter_attachments())[0];self.assertEqual(p.get_content_type(),d.MIME);self.assertEqual(p.get_payload(decode=True),self.data)
 def test_attachment_wrong_name(self):
  draft={'recipient':{'email':'recipient@example.test'},'subject':'Reviewed','bodyPlainText':'Reviewed','bodyHtml':'Reviewed','attachment':{'relativePath':'DM/cv.docx','name':'CV.pdf'}}
  with patch.dict(os.environ,{'CV_FOLDER':str(self.root)}):
   with self.assertRaises(ValueError):_build_message(draft,'sender@example.test')
 def test_word_unicode_and_controls(self):
  self.assertIn('£2M',d.extract(self.data))
  with self.assertRaises(d.DocumentError):d.write_word('bad'+chr(0))
 def test_same_text_gives_identical_bytes(self):
  import time;first=d.write_word('Same letter text.');time.sleep(2.1);self.assertEqual(first,d.write_word('Same letter text.'))
if __name__=='__main__':unittest.main()

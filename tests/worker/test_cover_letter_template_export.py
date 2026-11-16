import importlib.util,io,hashlib,tempfile,unittest
from pathlib import Path
from zipfile import ZipFile
from xml.etree import ElementTree as E
root=Path(__file__).resolve().parents[2]
spec=importlib.util.spec_from_file_location('letter_worker',root/'python-worker/cover_letter_template_worker.py');w=importlib.util.module_from_spec(spec);spec.loader.exec_module(w)
ns={'w':w.W}
class TemplateTests(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup);self.file=Path(self.tmp.name)/'template.docx';self.header='<w:p><w:r><w:t>TEST CANDIDATE</w:t></w:r></w:p><w:p><w:r><w:t>Test contact</w:t></w:r></w:p>'
  xml='<w:document xmlns:w="'+w.W+'" xmlns:r="'+w.R+'"><w:body>'+self.header+'<w:p><w:pPr/></w:p><w:p><w:pPr/></w:p><w:sectPr><w:pgSz w:w="12240" w:h="15840"/></w:sectPr></w:body></w:document>'
  with ZipFile(self.file,'w') as z:
   z.writestr('word/document.xml',xml);z.writestr('word/styles.xml','<w:styles xmlns:w="'+w.W+'"/>');z.writestr('word/_rels/document.xml.rels','<Relationships xmlns="'+w.P+'"/>');z.writestr('[Content_Types].xml','<Types xmlns="'+w.C+'"/>')
  self.digest=hashlib.sha256(self.file.read_bytes()).hexdigest()
 def render(self,html):return w.render(self.file,html,self.digest)
 def test_header_and_wording_preserved(self):
  with ZipFile(io.BytesIO(self.render('<p>Dear {{firstname}},</p><p>Manual wording unchanged.</p>'))) as z:
   s=z.read('word/document.xml').decode();self.assertIn(self.header,s);self.assertIn('Manual wording unchanged.',s);self.assertIsNone(z.testzip())
 def test_rich_styles_links_and_colours(self):
  html='<p><b>Bold</b> <i>Italic</i> <u>Underlined</u> <mark>Marked</mark> <a href="https://example.invalid/job">Role</a> <span style="color:navy">Colour</span></p>'
  with ZipFile(io.BytesIO(self.render(html))) as z:
   x=E.fromstring(z.read('word/document.xml'))
   for t in ['b','i','u','shd','hyperlink']:self.assertTrue(x.findall('.//w:'+t,ns),t)
   self.assertIn('https://example.invalid/job',z.read('word/_rels/document.xml.rels').decode())
 def test_native_lists_and_nested_numbering(self):
  with ZipFile(io.BytesIO(self.render('<ul><li>First item</li><li>Second item<ol><li>Nested number</li></ol></li></ul>'))) as z:
   x=E.fromstring(z.read('word/document.xml'));n=E.fromstring(z.read('word/numbering.xml'));self.assertEqual(len(x.findall('.//w:numPr',ns)),3);self.assertEqual(len(n.findall('.//w:suff[@w:val="tab"]',ns)),18);self.assertTrue(n.findall('.//w:ind[@w:hanging="360"]',ns));self.assertEqual([v.tag.rsplit('}',1)[1] for v in n],['abstractNum','abstractNum','num','num'])
 def test_soft_breaks_and_inline_block_nesting(self):
  with ZipFile(io.BytesIO(self.render('<p>One<br>Two</p><b><p>Three</p></b>'))) as z:self.assertIn('<w:br',z.read('word/document.xml').decode())
 def test_unbulleted_text_remains_unbulleted(self):
  with ZipFile(io.BytesIO(self.render('<p>At EXAMPLE, I coached teams.</p>'))) as z:self.assertNotIn('word/numbering.xml',z.namelist())
 def test_changed_template_blocked(self):
  self.file.write_bytes(self.file.read_bytes()+b'changed')
  with self.assertRaisesRegex(ValueError,'LETTER_TEMPLATE_CHANGED'):self.render('<p>Body</p>')
 def test_unsafe_or_unsupported_input_blocked(self):
  for html in ['<script>x</script>','<a href="javascript:alert(1)">Bad</a>','<p onclick="x">Body</p>','<p style="margin-left:20px">Body</p>','<p>Unclosed','<p>\x00</p>']:
   with self.subTest(html=html),self.assertRaises(ValueError):self.render(html)
 def body(self,html):
  with ZipFile(io.BytesIO(self.render(html))) as z:x=E.fromstring(z.read('word/document.xml'))
  # Skip the two template header paragraphs and the leading empty paragraph the worker always adds.
  ps=x.findall('.//w:body/w:p',ns)[3:]
  return ['•' if p.find('.//w:numPr',ns) is not None else ''.join(t.text or '' for t in p.iter('{'+w.W+'}t')) for p in ps]
 def test_top_level_list_has_one_empty_line_before_and_after(self):
  self.assertEqual(self.body('<p>Intro</p><ul><li>One</li><li>Two</li></ul><p>After</p>'),['Intro','','•','•','','After'])
 def test_existing_empty_lines_around_list_are_not_doubled(self):
  self.assertEqual(self.body('<p>Intro</p><p><br></p><ul><li>One</li></ul><p><br></p><p>After</p>'),['Intro','','•','','After'])
 def test_nested_and_consecutive_lists_add_no_extra_lines(self):
  self.assertEqual(self.body('<p>Intro</p><ul><li>One<ul><li>Inner</li></ul></li></ul><ol><li>Two</li></ol>'),['Intro','','•','•','','•'])
 def test_list_spacing_reaches_pdf_layout(self):
  spec=importlib.util.spec_from_file_location('layout',root/'python-worker/cover_letter_pdf_layout.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
  out=m.convert(self.render('<p>Intro</p><ul><li>One</li></ul><p>After</p>'))['html']
  self.assertRegex(out,r'Intro</span></p><p [^>]*><br></p><ul role="list">')
  self.assertRegex(out,r'</ul><p [^>]*><br></p><p [^>]*><span[^>]*>After')
if __name__=='__main__':unittest.main()

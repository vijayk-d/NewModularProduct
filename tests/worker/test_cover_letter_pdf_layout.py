import importlib.util,io,tempfile,unittest
from pathlib import Path
from zipfile import ZipFile
ROOT=Path(__file__).resolve().parents[2]
spec=importlib.util.spec_from_file_location('layout',ROOT/'python-worker/cover_letter_pdf_layout.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class Tests(unittest.TestCase):
 def fixture(self,body,rels=''):
  out=io.BytesIO()
  with ZipFile(out,'w') as z:
   z.writestr('word/document.xml','<w:document xmlns:w="'+m.W+'" xmlns:r="'+m.R+'"><w:body>'+body+'<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr></w:body></w:document>');z.writestr('word/styles.xml','<w:styles xmlns:w="'+m.W+'"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Arial"/><w:sz w:val="20"/></w:rPr></w:rPrDefault></w:docDefaults></w:styles>');z.writestr('word/_rels/document.xml.rels','<Relationships xmlns="'+m.P+'">'+rels+'</Relationships>')
  return out.getvalue()
 def test_text_and_template_page_geometry(self):
  r=m.convert(self.fixture('<w:p><w:r><w:t>Dear {{firstname}}, £600K</w:t></w:r></w:p>'));self.assertIn('Dear {{firstname}}, £600K',r['html']);self.assertEqual(r['layout']['marginsPt'],[72,72,72,72]);self.assertEqual(r['layout']['pageWidthPt'],612)
 def test_inline_styles_are_retained(self):
  r=m.convert(self.fixture('<w:p><w:r><w:rPr><w:b/><w:i/><w:u w:val="single"/><w:shd w:fill="FFF2A8"/></w:rPr><w:t>Styled</w:t></w:r></w:p>'));self.assertIn('font-weight:bold',r['html']);self.assertIn('font-style:italic',r['html']);self.assertIn('text-decoration:underline',r['html']);self.assertIn('background-color:#FFF2A8',r['html'])
 def test_clickable_safe_link(self):
  rel='<Relationship Id="x" Type="'+m.R+'/hyperlink" Target="https://example.invalid/job"/>';r=m.convert(self.fixture('<w:p><w:hyperlink r:id="x"><w:r><w:t>Role</w:t></w:r></w:hyperlink></w:p>',rel));self.assertIn('href="https://example.invalid/job"',r['html'])
 def test_unsafe_link_is_rejected(self):
  rel='<Relationship Id="x" Type="'+m.R+'/hyperlink" Target="file:///private"/>'
  with self.assertRaisesRegex(ValueError,'PDF_LINK_UNSAFE'):m.convert(self.fixture('<w:p><w:hyperlink r:id="x"><w:r><w:t>Role</w:t></w:r></w:hyperlink></w:p>',rel))
 def test_no_script_or_remote_asset_injection(self):
  r=m.convert(self.fixture('<w:p><w:r><w:t>&lt;script&gt;unsafe&lt;/script&gt;</w:t></w:r></w:p>'));self.assertNotIn('<script>',r['html']);self.assertIn('&lt;script&gt;',r['html']);self.assertIn("connect-src 'none'",r['html'])
 def test_tables_fail_instead_of_silent_loss(self):
  with self.assertRaisesRegex(ValueError,'PDF_DOCX_UNSUPPORTED'):m.convert(self.fixture('<w:tbl/>'))
if __name__=='__main__':unittest.main()

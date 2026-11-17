import unittest, re, sys, io, zipfile, json, base64, hashlib, subprocess, tempfile
from pathlib import Path
ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'python-worker'))
import cv_docx as d
import cv_tailor as t

NS = ('xmlns:w="' + d.W + '" xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" '
      'xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml" '
      'xmlns:w15="http://schemas.microsoft.com/office/word/2012/wordml" mc:Ignorable="w14 w15"')


def para(text, style=None, bullet=False, bold=False):
    ppr = ''
    if style or bullet:
        ppr = '<w:pPr>' + (f'<w:pStyle w:val="{style}"/>' if style else '') + \
              ('<w:numPr><w:ilvl w:val="0"/><w:numId w:val="3"/></w:numPr>' if bullet else '') + '</w:pPr>'
    rpr = '<w:rPr><w:b/><w:color w:val="1F4E79"/></w:rPr>' if bold else '<w:rPr><w:sz w:val="21"/></w:rPr>'
    return f'<w:p w14:paraId="1A2B3C4D">{ppr}<w:r>{rpr}<w:t xml:space="preserve">{text}</w:t></w:r></w:p>'


def docx(body):
    document = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ' + NS + '><w:body>' + body +
                '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/></w:sectPr></w:body></w:document>').encode()
    base = d.write_word('placeholder')
    out = io.BytesIO()
    with zipfile.ZipFile(io.BytesIO(base)) as src, zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as dst:
        for n in src.namelist():
            dst.writestr(n, document if n == 'word/document.xml' else src.read(n))
    return out.getvalue()


LINEAR = ''.join([
    para('EXAMPLE CANDIDATE', style='Title'),
    para('Profile', style='Heading1', bold=True),
    para('Delivery leader with programme experience.'),
    para('Works across public and private sectors.'),
    para('Key Achievements', style='Heading1', bold=True),
    para('Cut costs by 10% through vendor consolidation.', bullet=True),
    para(''),
    para('Led a 40-person programme.', bullet=True),
    para('Professional Experience', style='Heading1', bold=True),
    para('Example Employer — Delivery Manager'),
])

TABLE = ('<w:tbl><w:tr><w:tc>' + para('PROFILE', bold=True) + '</w:tc><w:tc>' + para('Table profile line.') +
         '</w:tc></w:tr><w:tr><w:tc>' + para('ACHIEVEMENTS', bold=True) + '</w:tc><w:tc>' +
         para('Table achievement one.', bullet=True) + '</w:tc></w:tr></w:tbl>' + para('Skills', style='Heading1'))


class TailorTests(unittest.TestCase):
    def test_describe_finds_both_sections(self):
        s = t.describe(docx(LINEAR))
        self.assertEqual(s['profile']['paragraphs'], ['Delivery leader with programme experience.', 'Works across public and private sectors.'])
        self.assertEqual(s['achievements']['paragraphs'], ['Cut costs by 10% through vendor consolidation.', 'Led a 40-person programme.'])
        self.assertEqual(s['achievements']['bullets'], 2)
        self.assertTrue(s['profile']['supported'] and s['achievements']['supported'])

    def test_tailor_replaces_only_the_two_sections_and_keeps_formatting(self):
        src = docx(LINEAR)
        out = t.tailor(src, ['New profile first line.', 'Second line.'], ['Bullet A.', 'Bullet B.', 'Bullet C.'])
        text = d.extract(out)
        self.assertIn('EXAMPLE CANDIDATE', text)
        self.assertIn('Example Employer — Delivery Manager', text)
        self.assertNotIn('Works across public and private sectors.', text)
        for line in ['New profile first line.', 'Bullet A.', 'Bullet C.']:
            self.assertIn(line, text)
        with zipfile.ZipFile(io.BytesIO(out)) as z, zipfile.ZipFile(io.BytesIO(src)) as z0:
            xml = z.read('word/document.xml').decode()
            self.assertIn('xmlns:w14=', xml)
            self.assertIn('xmlns:w15=', xml)
            self.assertIn('mc:Ignorable="w14 w15"', xml)
            self.assertEqual(len(re.findall(r'<w:numId w:val="3"\s*/>', xml)), 3, 'bullets keep the list numbering')
            self.assertRegex(xml, r'<w:sz w:val="21"\s*/>')
            self.assertIn('<w:sectPr>', xml)
            for n in z0.namelist():
                if n != 'word/document.xml':
                    self.assertEqual(z.read(n), z0.read(n), n)
        s = t.describe(out)
        self.assertEqual(s['achievements']['bullets'], 3)

    def test_table_layout_uses_the_next_cell(self):
        s = t.describe(docx(TABLE))
        self.assertEqual(s['profile']['paragraphs'], ['Table profile line.'])
        out = t.tailor(docx(TABLE), ['Tailored table profile.'], ['Tailored one.', 'Tailored two.'])
        self.assertIn('Tailored two.', d.extract(out))

    def test_owner_chosen_headings_and_detected_heading_list(self):
        custom = (para('Vijay Example', bold=True) + para('About My Work', bold=True) + para('Custom profile text.') +
                  para('Impact Delivered:', bold=True) + para('Custom bullet.', bullet=True) + para('Experience', style='Heading1'))
        s = t.describe(docx(custom))
        self.assertIsNone(s['profile'])
        self.assertEqual(s['headings'], ['Vijay Example', 'About My Work', 'Impact Delivered:', 'Experience'])
        chosen = t.describe(docx(custom), 'About My Work', 'impact delivered')
        self.assertEqual(chosen['profile']['paragraphs'], ['Custom profile text.'])
        self.assertEqual(chosen['achievements']['paragraphs'], ['Custom bullet.'])
        out = t.tailor(docx(custom), ['New profile.'], ['New bullet.'], 'About My Work', 'Impact Delivered')
        self.assertIn('New bullet.', d.extract(out))
        with self.assertRaises(d.DocumentError):
            t.describe(docx(custom), 'Same', 'same')

    def test_ampersand_and_single_column_table_rows(self):
        rows = ('<w:tbl><w:tr><w:tc>' + para('PROFESSIONAL PROFILE') + '</w:tc></w:tr><w:tr><w:tc>' + para('Row profile.') +
                '</w:tc></w:tr><w:tr><w:tc>' + para('Key Achievements &amp; Impact') + '</w:tc></w:tr><w:tr><w:tc>' +
                para('Row bullet.', bullet=True) + '</w:tc></w:tr></w:tbl>')
        s = t.describe(docx(rows))
        self.assertEqual(s['profile']['paragraphs'], ['Row profile.'])
        self.assertEqual(s['achievements']['paragraphs'], ['Row bullet.'])

    def test_missing_section_is_reported_and_refused(self):
        src = docx(para('Profile', style='Heading1') + para('Only a profile.'))
        self.assertIsNone(t.describe(src)['achievements'])
        with self.assertRaises(d.DocumentError):
            t.tailor(src, ['x'], ['y'])

    def test_invalid_lines_are_refused(self):
        for profile, bullets in [([], ['a']), (['a'], []), (['a'], ['b'] * 13), (['a' * 1201], ['b']), (['a'], ['b' * 601]), ([3], ['b'])]:
            with self.assertRaises(d.DocumentError):
                t.tailor(docx(LINEAR), profile, bullets)
        self.assertIn('a' * 900, d.extract(t.tailor(docx(LINEAR), ['a' * 900], ['b'])))

    def test_experience_roles_are_found_and_reordered_within_each_employer(self):
        tab = '<w:r><w:tab/></w:r>'
        lead = ('<w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="5"/></w:numPr></w:pPr>'
                '<w:r><w:rPr><w:b/></w:rPr><w:t>Cost:</w:t></w:r><w:r><w:rPr><w:sz w:val="20"/></w:rPr>'
                '<w:t xml:space="preserve"> cut spend by 12% across vendors.</w:t></w:r></w:p>')
        employer = lambda name: f'<w:p><w:r><w:rPr><w:b/></w:rPr><w:t>{name}</w:t></w:r>{tab}<w:r><w:t>Leeds, UK</w:t></w:r></w:p>'
        body = (para('SUMMARY', bold=True) + para('Summary one.') + para('SKILLS', bold=True) + para('Skill line.') +
                para('EXPERIENCE', bold=True) + employer('ACME BANK') + para('Delivery Lead | 2021 – 2022') + lead +
                para('Ran PI planning.', bullet=True) + para('Built a CoE.', bullet=True) +
                employer('OTHER CO') + para('Scrum Master') + para('Coached teams.', bullet=True) +
                para('EDUCATION', bold=True) + para('MBA'))
        src = docx(body)
        s = t.describe(src)
        self.assertIsNone(s['achievements'])
        roles = s['experience']['roles']
        self.assertEqual([r['title'] for r in roles], ['ACME BANK | Leeds, UK — Delivery Lead | 2021 – 2022', 'OTHER CO | Leeds, UK — Scrum Master'])
        self.assertEqual(roles[0]['bullets'], ['Cost: cut spend by 12% across vendors.', 'Ran PI planning.', 'Built a CoE.'])
        new = [['Built a CoE.', 'Cost: cut spend by 12% across vendors.', 'Ran PI planning (edited).'], ['Coached teams.']]
        out = t.tailor(src, ['New summary.'], None, roles=new)
        s2 = t.describe(out)
        self.assertEqual([r['bullets'] for r in s2['experience']['roles']], new)
        self.assertEqual(s2['headings'], s['headings'])
        xml = zipfile.ZipFile(io.BytesIO(out)).read('word/document.xml').decode()
        self.assertRegex(xml, r'<w:b\s*/>\s*</w:rPr>\s*<w:t>Cost:</w:t>', 'unchanged bullet keeps its bold lead-in')
        self.assertIn('Skill line.', d.extract(out))
        with self.assertRaises(d.DocumentError):
            t.tailor(src, ['S.'], None, roles=[['only one employer']])
        with self.assertRaises(d.DocumentError):
            t.tailor(src, ['S.'], None, roles=[['a'], []])

    def test_worker_reads_by_hash_and_never_writes_the_source(self):
        with tempfile.TemporaryDirectory() as tmp:
            folder = Path(tmp) / 'DM'
            folder.mkdir()
            src = docx(LINEAR)
            (folder / 'cv.docx').write_bytes(src)
            digest = hashlib.sha256(src).hexdigest()

            def run(payload):
                r = subprocess.run([sys.executable, '-B', str(ROOT / 'python-worker' / 'cv_document_worker.py')],
                                   input=json.dumps(payload).encode(), capture_output=True, timeout=60)
                return json.loads(r.stdout)

            sections = run({'action': 'sections', 'root': tmp, 'relativePath': 'DM/cv.docx', 'expectedHash': digest})
            self.assertTrue(sections['ok'])
            self.assertEqual(sections['sha256'], digest)
            built = run({'action': 'tailor', 'root': tmp, 'relativePath': 'DM/cv.docx', 'expectedHash': digest,
                         'profile': ['P.'], 'achievements': ['A.']})
            self.assertTrue(built['ok'])
            self.assertIn('A.', d.extract(base64.b64decode(built['data'])))
            self.assertEqual((folder / 'cv.docx').read_bytes(), src)
            stale = run({'action': 'sections', 'root': tmp, 'relativePath': 'DM/cv.docx', 'expectedHash': '0' * 64})
            self.assertEqual(stale, {'ok': False, 'code': 'CV_VERSION_CHANGED'})
            pdf = run({'action': 'sections', 'root': tmp, 'relativePath': 'DM/cv.pdf', 'expectedHash': None})
            self.assertEqual(pdf['code'], 'CV_DOCX_REQUIRED')


if __name__ == '__main__':
    unittest.main()

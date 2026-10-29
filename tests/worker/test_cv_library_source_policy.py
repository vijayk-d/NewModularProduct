import ast
import re
import unittest
from pathlib import Path, PurePosixPath
ROOT=Path(__file__).resolve().parents[2]

def policy():
    tree=ast.parse((ROOT/'tools/deploy/local_delivery.py').read_text(encoding='utf-8-sig'))
    node=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='safe_source')
    namespace={'PurePosixPath':PurePosixPath,'re':re}
    exec(compile(ast.Module(body=[node],type_ignores=[]),'<safe_source>','exec'),namespace)
    return namespace['safe_source']

class CvLibrarySourcePolicyTests(unittest.TestCase):
    def test_exact_catalogue_is_included(self):
        self.assertTrue(policy()('config/cv-library.json'))
    def test_config_folder_is_not_generally_opened(self):
        for name in ['config/other.json','config/cv-library.json.bak','config/production.env','config/private.pdf']:
            with self.subTest(name=name):self.assertFalse(policy()(name))
    def test_private_and_generated_paths_stay_excluded(self):
        for name in ['.env','data/cv-library.json','output/cv-library-v1/index.json','output/application.db','var/maintenance/report.json','config/../cv-library.json']:
            with self.subTest(name=name):self.assertFalse(policy()(name))
    def test_source_tests_and_documentation_remain_included(self):
        for name in ['src/interfaces/http/cv-library-v1.js','tests/cv-library-v1.test.js','docs/cv-library-recovery.md','tools/maintenance/preserve-cv-library.py']:
            with self.subTest(name=name):self.assertTrue(policy()(name))
if __name__=='__main__':unittest.main()

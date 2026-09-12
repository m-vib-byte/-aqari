"""Exercise the read-only CLI guard against missing and stale acceptance files."""
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest


class CompletionCheckTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        source = Path(__file__).resolve().parent
        self.root = Path(self.temporary.name) / 'staging-database'
        self.target = self.root / 'hosted-test'
        shutil.copytree(source, self.target, ignore=shutil.ignore_patterns('__pycache__'))
        shutil.copytree(source.parent / 'tests', self.root / 'tests')
        self.script = self.target / 'generate-completion.py'

    def snapshot(self):
        return {str(p.relative_to(self.root)): (p.read_bytes(), p.stat().st_mtime_ns)
                for p in self.root.rglob('*') if p.is_file()}

    def check(self, expected_status):
        before = self.snapshot()
        result = subprocess.run([sys.executable, str(self.script), '--check'], capture_output=True, text=True)
        self.assertEqual(result.returncode, expected_status, result.stdout + result.stderr)
        self.assertEqual(self.snapshot(), before, 'The check modified or recreated a file')
        return result

    def test_current_copies_pass_without_writing(self):
        self.assertIn('PASS:', self.check(0).stdout)

    def test_modified_sql_fails_without_repairing_it(self):
        sql = self.target / 'completion' / '02-maintenance_attachments.sql'
        sql.write_text(sql.read_text() + '-- stale generated content\n')
        self.assertIn('Out of date: hosted-test/completion/02-maintenance_attachments.sql', self.check(1).stderr)

    def test_missing_sql_fails_without_recreating_it(self):
        (self.target / 'completion' / '03-tenant_rating_quarters.sql').unlink()
        self.assertIn('Missing: hosted-test/completion/03-tenant_rating_quarters.sql', self.check(1).stderr)

    def test_source_change_fails_even_if_copies_were_not_edited(self):
        source = self.root / 'tests' / 'maintenance_attachments.sql'
        source.write_text(source.read_text() + '-- changed acceptance source\n')
        result = self.check(1)
        self.assertIn('02-maintenance_attachments.sql', result.stderr)
        self.assertIn('manifest.json', result.stderr)

    def test_modified_manifest_fails_without_repairing_it(self):
        (self.target / 'completion' / 'manifest.json').write_text('{}\n')
        self.assertIn('Out of date: hosted-test/completion/manifest.json', self.check(1).stderr)

    def test_missing_output_directory_fails_without_recreating_it(self):
        shutil.rmtree(self.target / 'completion')
        self.assertIn('Missing: hosted-test/completion/manifest.json', self.check(1).stderr)
        self.assertFalse((self.target / 'completion').exists())


if __name__ == '__main__':
    unittest.main()

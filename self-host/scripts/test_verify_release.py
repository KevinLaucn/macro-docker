from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest


class StandaloneReleaseTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.release = Path(temporary.name) / "releases" / "example"
        (self.release / "scripts").mkdir(parents=True)
        source = Path(__file__).parents[1]
        for name in [".env.example", "Caddyfile", "docker-compose.yml", "scripts/verify-release.py", "scripts/web_assets.py"]:
            shutil.copy2(source / name, self.release / name)

    def verify(self):
        return subprocess.run(
            [sys.executable, str(self.release / "scripts/verify-release.py")],
            cwd=self.release,
            capture_output=True,
            text=True,
        )

    def test_release_verifies_without_repository_checkout(self):
        result = self.verify()
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_release_checks_its_own_environment_template(self):
        path = self.release / ".env.example"
        path.write_text(path.read_text().replace("DEV_DANGEROUS_LOCAL_CONTAINERS=false", "DEV_DANGEROUS_LOCAL_CONTAINERS=true"))
        result = self.verify()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("must keep DEV_DANGEROUS_LOCAL_CONTAINERS=false", result.stderr)


if __name__ == "__main__":
    unittest.main()

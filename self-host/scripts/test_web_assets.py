from pathlib import Path
import os
import shutil
import subprocess
import sys
import tempfile
import unittest

from web_assets import verify_web_assets


class WebAssetsTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.write("index.html", '<script type="module" src="/app/app-main.js"></script>')
        self.write("app-main.js", 'import("./PropertyEditor.js");')
        self.write("PropertyEditor.js", 'import {client} from "./app-main.js";')

    def write(self, name, content):
        (self.root / name).write_text(content)

    def test_shared_context_and_unreachable_old_assets(self):
        self.write("app-old.js", 'import "./missing.js";')
        self.assertEqual(verify_web_assets(self.root), [])

    def test_renamed_entry_reproduces_production_failure(self):
        self.write("index.html", '<script type="module" src="/app/app-main-img.js"></script>')
        self.write("app-main-img.js", 'import("./PropertyEditor.js");')
        self.assertTrue(any("Duplicate app context" in error for error in verify_web_assets(self.root)))

    def test_multiple_html_entries(self):
        self.write("index.html", '<script type="module" src="/app/app-main.js"></script>' * 2)
        self.assertTrue(verify_web_assets(self.root))

    def test_missing_chunk(self):
        self.write("app-main.js", 'import "./Missing.js";')
        self.assertTrue(any("module missing" in error for error in verify_web_assets(self.root)))

    def test_doctor_does_not_execute_legacy_patcher(self):
        script = Path(__file__).with_name("doctor.py").read_text()
        self.assertNotIn("patch_frontend.py", script)
        ctl = Path(__file__).parents[1].joinpath("macroctl").read_text()
        self.assertNotIn("patch_frontend.py", ctl)

    def run_restart(self):
        deployment = self.root / "deployment"
        (deployment / "scripts").mkdir(parents=True)
        shutil.copy2(Path(__file__).parents[1] / "macroctl", deployment / "macroctl")
        shutil.copy2(Path(__file__).with_name("web_assets.py"), deployment / "scripts/web_assets.py")
        (deployment / ".env").touch()
        tools = deployment / "bin"
        tools.mkdir()
        docker = tools / "docker"
        docker.write_text(
            f"#!{sys.executable}\nimport os, shutil, sys\n"
            "if 'cp' in sys.argv:\n"
            "    shutil.copytree(os.environ['MACRO_TEST_ASSETS'], sys.argv[-1], dirs_exist_ok=True, ignore=shutil.ignore_patterns('deployment'))\n"
        )
        docker.chmod(0o755)
        return subprocess.run(
            ["bash", str(deployment / "macroctl"), "restart"],
            env={**os.environ, "PATH": str(tools) + os.pathsep + os.environ["PATH"], "MACRO_TEST_ASSETS": str(self.root), "MACRO_SHARED_ENV_FILE": str(deployment / ".env")},
            capture_output=True, text=True,
        )

    def test_restart_validates_shared_context(self):
        result = self.run_restart()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("Frontend module graph PASSED", result.stdout)

    def test_restart_rejects_mixed_contexts(self):
        self.write("index.html", '<script type="module" src="/app/app-main-img.js"></script>')
        self.write("app-main-img.js", 'import("./PropertyEditor.js");')
        result = self.run_restart()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("Duplicate app context", result.stderr)


if __name__ == "__main__":
    unittest.main()

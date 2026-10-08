"""Check that reachable frontend chunks share one application entry module."""
from html.parser import HTMLParser
from pathlib import Path
import argparse
import re
import sys


class ModuleScripts(HTMLParser):
    def __init__(self):
        super().__init__()
        self.sources = []

    def handle_starttag(self, tag, attrs):
        values = dict(attrs)
        if tag == "script" and values.get("type") == "module":
            self.sources.append(values.get("src", ""))


def verify_web_assets(root: Path) -> list[str]:
    root = root.resolve()
    index = root / "index.html"
    if not index.is_file():
        return [f"Frontend index missing: {index}"]
    parser = ModuleScripts()
    parser.feed(index.read_text())
    entries = [src for src in parser.sources if re.search(r"/app-[\w-]+\.js$", src)]
    if len(entries) != 1:
        return ["Frontend HTML must load exactly one app entry module"]
    entry = Path(entries[0]).name
    pending = [root / entry]
    visited = set()
    errors = []
    imports = re.compile(r'''(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s*)["']([^"']+\.js)["']''')
    while pending:
        file = pending.pop().resolve()
        if file in visited:
            continue
        visited.add(file)
        if not file.is_relative_to(root):
            errors.append(f"Frontend import escapes asset directory: {file.name}")
            continue
        if not file.is_file():
            errors.append(f"Frontend module missing: {file.name}")
            continue
        for specifier in imports.findall(file.read_text()):
            if specifier.startswith("."):
                target = file.parent / specifier
            elif specifier.startswith("/app/"):
                target = root / specifier.removeprefix("/app/")
            else:
                continue
            if re.fullmatch(r"app-[\w-]+\.js", target.name) and target.name != entry:
                errors.append(f"Duplicate app context: HTML loads {entry}, {file.name} imports {target.name}")
            pending.append(target)
    return errors


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("asset_directory", type=Path)
    errors = verify_web_assets(parser.parse_args().asset_directory)
    for error in errors:
        print(error, file=sys.stderr)
    if not errors:
        print("Frontend module graph PASSED")
    sys.exit(bool(errors))

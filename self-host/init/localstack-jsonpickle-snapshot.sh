#!/bin/bash
set -euo pipefail

# localstack-persist releases request locks for long polls before serialization.
# Snapshot dictionary entries so background queue mutations cannot abort a save.
# Remove with the LocalStack image upgrade that fixes concurrent serialization.
/opt/code/localstack/.venv/bin/python - <<'PY'
from pathlib import Path
import jsonpickle.util

path = Path(jsonpickle.util.__file__)
source = path.read_text()
original = "    for k, v in obj.items():\n"
replacement = "    for k, v in obj.copy().items():\n"
if source.count(original) == 1:
    path.write_text(source.replace(original, replacement, 1))
elif source.count(replacement) != 1:
    raise RuntimeError("Unsupported jsonpickle dictionary iterator; review persistence hotfix")
print("LocalStack persistence dictionary snapshot enabled")

import localstack_persist.serialization.jsonpickle.serializer as serializer

path = Path(serializer.__file__)
source = path.read_text()
original = '''        with open(self.file_path, "w") as file:
            for chunk in self._json_encoder.iterencode(envelope):
                file.write(chunk)
'''
replacement = '''        temporary_path = self.file_path + ".tmp"
        with open(temporary_path, "w") as file:
            for chunk in self._json_encoder.iterencode(envelope):
                file.write(chunk)
            file.flush()
            os.fsync(file.fileno())
        os.replace(temporary_path, self.file_path)
'''
if source.count(original) == 1:
    source = source.replace("import json\n", "import json\nimport os\n", 1)
    path.write_text(source.replace(original, replacement, 1))
elif source.count(replacement) != 1:
    raise RuntimeError("Unsupported LocalStack serializer; review persistence hotfix")
print("LocalStack persistence atomic snapshot replacement enabled")
PY

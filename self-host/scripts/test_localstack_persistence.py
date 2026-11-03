"""Run with the LocalStack image's virtualenv after its persistence boot hook."""

import unittest
from pathlib import Path
import tempfile

import jsonpickle
from jsonpickle import util
from localstack_persist.serialization.jsonpickle.serializer import JsonPickleDeserializer, JsonPickleSerializer


class LocalstackPersistenceTests(unittest.TestCase):
    def test_failed_write_preserves_last_complete_snapshot(self):
        class FailingEncoder:
            def iterencode(self, envelope):
                yield '{"partial":'
                raise OSError("interrupted snapshot")

        with tempfile.TemporaryDirectory() as directory:
            path = str(Path(directory) / "store.json")
            serializer = JsonPickleSerializer("sqs", path)
            serializer.serialize({"message": "saved"})
            serializer._json_encoder = FailingEncoder()
            with self.assertRaises(OSError):
                serializer.serialize({"message": "incomplete"})
            self.assertEqual(JsonPickleDeserializer("sqs", path).deserialize(), {"message": "saved"})

    def test_dictionary_mutation_during_iteration(self):
        state = {"first": 1, "second": 2}
        entries = util.items(state)
        self.assertEqual(next(entries), ("first", 1))
        del state["second"]
        state["third"] = 3
        state["fourth"] = 4
        self.assertEqual(list(entries), [("second", 2)])

    def test_excluded_entries_stay_excluded(self):
        self.assertEqual(list(util.items({"keep": 1, "skip": 2}, exclude=("skip",))), [("keep", 1)])

    def test_snapshot_preserves_serialized_reference_identity(self):
        shared = {"payload": "pending"}
        state = {"visible": {"message": shared}, "inflight": shared}
        encoded = jsonpickle.Pickler(keys=True, warn=True).flatten(state)
        restored = jsonpickle.Unpickler(keys=True, safe=True, on_missing="error").restore(encoded)
        self.assertEqual(restored, state)
        self.assertIs(restored["visible"]["message"], restored["inflight"])


if __name__ == "__main__":
    unittest.main()

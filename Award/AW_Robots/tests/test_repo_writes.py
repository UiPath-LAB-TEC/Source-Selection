"""repo.upsert writes only the entity's own fields. Rows read back from Data Fabric carry Children and system fields;
since 2026-11-12 a write that sends Children fails, so a row read with rows() must be writable as it is."""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))

import repo  # noqa: E402

LOADED = {
    "Id": "row-1", "AlertId": "A-1", "SolicitationId": "S-1", "Status": "Open", "Children": {},
    "CreatedBy": "u-1", "CreateTime": "2026-11-12T10:00:00Z", "UpdatedBy": "u-1", "UpdateTime": "2026-11-12T10:00:00Z", "RecordOwner": "u-1",
}


class FakeEntities:
    def __init__(self):
        self.calls = []

    def insert_records(self, key, chunk):
        self.calls.append(("insert", chunk))

    def update_records(self, key, chunk):
        self.calls.append(("update", chunk))


def setup(monkeypatch, existing):
    ents = FakeEntities()
    monkeypatch.setattr(repo, "entity_key", lambda name: "entity-key")
    monkeypatch.setattr(repo, "rows", lambda entity, sol=None: existing)
    monkeypatch.setattr(repo, "sdk", lambda: type("Sdk", (), {"entities": ents})())
    return ents


def test_writable_drops_system_fields_in_any_case():
    out = repo.writable({**LOADED, "children": {}, "createTime": "x"})
    assert out == {"AlertId": "A-1", "SolicitationId": "S-1", "Status": "Open"}


def test_update_of_a_loaded_row_sends_only_its_own_fields_and_the_id(monkeypatch):
    ents = setup(monkeypatch, [LOADED])
    assert repo.upsert("SSAlert", "AlertId", [{**LOADED, "Status": "Acknowledged"}]) == (0, 1)
    (verb, chunk), = ents.calls
    assert verb == "update"
    assert chunk == [{"AlertId": "A-1", "SolicitationId": "S-1", "Status": "Acknowledged", "Id": "row-1"}]


def test_insert_never_sends_system_fields(monkeypatch):
    ents = setup(monkeypatch, [])
    repo.upsert("SSAlert", "AlertId", [{**LOADED, "AlertId": "A-2"}])
    (verb, chunk), = ents.calls
    assert verb == "insert" and "Children" not in chunk[0] and "Id" not in chunk[0] and chunk[0]["AlertId"] == "A-2"

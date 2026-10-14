"""Data Fabric, bucket and job I/O for the SS_Robots entry points."""
from __future__ import annotations

import json
import os
import time
from datetime import datetime, timezone
from typing import Any, Callable

from uipath.platform import UiPath

# Buckets live in the SourceSelection folder; the agents are deployed with the solution, into the folder
# this job runs in. Function jobs get UIPATH_FOLDER_KEY but not UIPATH_FOLDER_PATH, so prefer the key and
# fall back to the solution folder — never the bucket folder, where no agents are deployed.
FOLDER = os.environ.get("SS_FOLDER", "SourceSelection")
RUN_FOLDER_KEY = os.environ.get("UIPATH_FOLDER_KEY")
RUN_FOLDER = os.environ.get("UIPATH_FOLDER_PATH") or os.environ.get("SS_AGENT_FOLDER", "SourceSelection/Solution")


def run_folder() -> dict[str, str]:
    """Folder arguments for starting and polling agent jobs alongside this one."""
    return {"folder_key": RUN_FOLDER_KEY} if RUN_FOLDER_KEY else {"folder_path": RUN_FOLDER}
PROPOSALS_BUCKET = "SS-Proposals"
RECORDS_BUCKET = "SS-Records"
ACTOR = "SS_Robots"

_sdk: UiPath | None = None
_keys: dict[str, str] = {}


def sdk() -> UiPath:
    global _sdk
    if _sdk is None:
        _sdk = UiPath()
    return _sdk


def retry(fn: Callable[[], Any], attempts: int = 3) -> Any:
    """SE-01: Data Fabric and Orchestrator transients — retry with backoff."""
    for i in range(attempts):
        try:
            return fn()
        except Exception:
            if i == attempts - 1:
                raise
            time.sleep(2 ** i)


def now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


# ── Data Fabric ─────────────────────────────────────────────────────────────

def entity_key(name: str) -> str:
    """Entity ids are resolved by name, so the package works in any tenant with the SS* entities."""
    if not _keys:
        for e in retry(lambda: sdk().entities.list_entities()):
            _keys[e.name] = e.id
    if name not in _keys:
        raise LookupError(f"Data Fabric entity {name} not found")
    return _keys[name]


def _plain(rec: Any) -> dict:
    d = rec.model_dump() if hasattr(rec, "model_dump") else dict(rec)
    d["Id"] = d.pop("id", d.get("Id"))
    return d


def rows(entity: str, solicitation_id: str | None = None) -> list[dict]:
    key = entity_key(entity)
    out: list[dict] = []
    start = 0
    while True:
        page = retry(lambda: sdk().entities.list_records(key, start=start, limit=1000))
        out += [_plain(r) for r in page]
        if not getattr(page, "has_next_page", False) or not len(page):
            break
        start += len(page)
    return [r for r in out if solicitation_id is None or r.get("SolicitationId") == solicitation_id]


def upsert(entity: str, key_field: str, records: list[dict]) -> tuple[int, int]:
    """BR-06: insert rows whose business key is new, update the rest. Returns (inserted, updated)."""
    if not records:
        return 0, 0
    key = entity_key(entity)
    have = {r[key_field]: r["Id"] for r in rows(entity) if r.get(key_field)}
    new = [r for r in records if r[key_field] not in have]
    upd = [{**r, "Id": have[r[key_field]]} for r in records if r[key_field] in have]
    for verb, batch in (("insert_records", new), ("update_records", upd)):
        for i in range(0, len(batch), 50):
            chunk = batch[i:i + 50]
            res = retry(lambda: getattr(sdk().entities, verb)(key, chunk))
            failed = getattr(res, "failure_records", None) or []
            if failed:
                raise RuntimeError(f"{entity} {verb} failed for {len(failed)} record(s): {failed[0]}")
    return len(new), len(upd)


def solicitation(solicitation_id: str) -> dict:
    found = [r for r in rows("SSSolicitation") if r.get("SolicitationId") == solicitation_id]
    if not found:
        raise LookupError(f"Solicitation {solicitation_id} not found in SSSolicitation")
    return found[0]


def plan(solicitation_id: str) -> dict:
    return json.loads(solicitation(solicitation_id)["PlanJson"])


def set_solicitation(solicitation_id: str, **fields: Any) -> None:
    upsert("SSSolicitation", "SolicitationId", [{"SolicitationId": solicitation_id, **fields}])


def audit_row(sol: str, ref: str, action: str, detail: str, actor: str = ACTOR) -> dict:
    return {"EventId": f"{sol}-{ref}-{action}", "SolicitationId": sol, "EntityRef": ref, "Action": action,
            "Actor": actor, "OccurredAt": now(), "Detail": detail[:4000]}


def audit(sol: str, ref: str, action: str, detail: str, actor: str = ACTOR) -> None:
    upsert("SSAuditEvent", "EventId", [audit_row(sol, ref, action, detail, actor)])


# ── Buckets ─────────────────────────────────────────────────────────────────

def list_files(bucket: str, prefix: str) -> list[str]:
    paths: list[str] = []
    token = None
    while True:
        page = retry(lambda: sdk().buckets.list_files(name=bucket, prefix=prefix, continuation_token=token, folder_path=FOLDER))
        items = getattr(page, "items", page)
        paths += [getattr(f, "full_path", None) or getattr(f, "path", None) or f.get("FullPath") for f in items]
        token = getattr(page, "continuation_token", None)
        if not token:
            return [p for p in paths if p]


def download(bucket: str, path: str, dest: str) -> None:
    retry(lambda: sdk().buckets.download(name=bucket, blob_file_path=path, destination_path=dest, folder_path=FOLDER))


def upload(bucket: str, path: str, content: bytes, content_type: str = "application/pdf") -> None:
    retry(lambda: sdk().buckets.upload(name=bucket, blob_file_path=path, content=content, content_type=content_type, folder_path=FOLDER))


# ── Agents ──────────────────────────────────────────────────────────────────

TERMINAL = {"Successful", "Faulted", "Stopped"}


def start_agent(name: str, inputs: dict) -> str:
    job = retry(lambda: sdk().processes.invoke(name, inputs, **run_folder()))
    return job.key


def wait_jobs(keys: list[str], timeout_s: int = 900) -> dict[str, tuple[str, dict | None]]:
    """Poll until every job is terminal. Returns key -> (state, parsed output or None)."""
    done: dict[str, tuple[str, dict | None]] = {}
    deadline = time.time() + timeout_s
    while len(done) < len(keys) and time.time() < deadline:
        for k in keys:
            if k in done:
                continue
            job = retry(lambda: sdk().jobs.retrieve(k, **run_folder()))
            state = str(getattr(job, "state", ""))
            if state in TERMINAL:
                raw = sdk().jobs.extract_output(job) if state == "Successful" else None
                done[k] = (state, json.loads(raw) if raw else None)
        if len(done) < len(keys):
            time.sleep(10)
    for k in keys:
        done.setdefault(k, ("Timeout", None))
    return done

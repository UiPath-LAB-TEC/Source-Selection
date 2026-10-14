"""Run entry points against the live tenant with every write captured instead of applied.

Reads (Data Fabric, buckets) are real; upserts, uploads and agent jobs are intercepted.
Usage: python tests/dryrun.py <step> <solicitationId> [extra-json]   (runs the case entry point `run`)
"""
import json
import sys
from collections import Counter
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
import main  # noqa: E402
import repo  # noqa: E402

writes: Counter = Counter()
sample: dict = {}
uploads: dict = {}


def fake_upsert(entity, key, recs):
    writes[entity] += len(recs)
    sample.setdefault(entity, recs[:2])
    return len(recs), 0


repo.upsert = fake_upsert
repo.upload = lambda bucket, path, content, content_type="application/pdf": uploads.__setitem__(f"{bucket}/{path}", len(content))

# Agent runs return the recorded smoke-test output for every offeror × factor.
smoke = json.loads((HERE.parents[2] / "agents-test" / "northstar-f1.out.json").read_text())["Data"]["Output"]
inputs = []
repo.start_agent = lambda name, i: inputs.append(i) or f"job{len(inputs)}"
repo.wait_jobs = lambda keys, timeout_s=900: {k: ("Successful", smoke) for k in keys}

ep, sol = sys.argv[1], sys.argv[2]
extra = json.loads(sys.argv[3]) if len(sys.argv) > 3 else {}
out = main.run(main.RobotInput(step=ep, solicitationId=sol, **extra))
print(json.dumps({k: (v if len(str(v)) < 400 else f"{str(v)[:400]}… ({len(str(v))} chars)") for k, v in out.model_dump().items()}, indent=1))
print("writes:", dict(writes))
print("uploads:", uploads)
if inputs:
    print("agent runs:", len(inputs), "max input chars:", max(len(json.dumps(i)) for i in inputs))
for e, rs in sample.items():
    print(e, json.dumps(rs[0])[:300])

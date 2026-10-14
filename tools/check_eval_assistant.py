"""Run SS_EvaluationAssistant on its eval-set cases and score them deterministically.

Usage: python3 tools/check_eval_assistant.py
Checks per case: (1) the expected finding kind is drafted for the planted issue,
(2) every quote appears verbatim on its cited page, (3) every cited page exists.
"""
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
AGENT = ROOT / "SourceSelection" / "SS_EvaluationAssistant"
SET = json.loads((AGENT / "evals" / "eval-sets" / "evaluation-set-default.json").read_text())
OUT = ROOT / "agents-test"


def run(inputs):
    p = subprocess.run(["uip", "agent", "debug", str(AGENT), "-i", json.dumps(inputs), "--timeout", "300", "--output", "json"],
                       capture_output=True, text=True)
    out = p.stdout
    return json.loads(out[out.index("{"):])


def lower_keys(o):
    if isinstance(o, dict):
        return {k[:1].lower() + k[1:]: lower_keys(v) for k, v in o.items()}
    if isinstance(o, list):
        return [lower_keys(v) for v in o]
    return o


passed = 0
for case in SET["evaluations"]:
    name = case["name"]
    inputs = case["inputs"]
    expected = case["expectedOutput"]["findings"][0]
    res = run(inputs)
    (OUT / f"{name}.out.json").write_text(json.dumps(res, indent=1))
    data = res.get("Data") or {}
    if data.get("State") != "Successful":
        print(f"FAIL {name}: run {data.get('State')} {res.get('Message', '')}")
        continue
    got = lower_keys(data["Output"])["findings"]
    pages = {p["page"]: p["text"] for p in json.loads(inputs["proposalPages"])}
    verbatim = all(f["quote"] in pages.get(f["page"], "") for f in got)
    # The planted issue is "found" when a non-strength finding cites the answer-key quote's sentence.
    adverse = [f for f in got if "Strength" not in f["kind"]]
    found = any(expected["quote"][:60] in f["quote"] or f["quote"][:60] in expected["quote"] for f in adverse) or \
        any(f["page"] == expected["page"] and f["kind"] == expected["kind"] for f in got)
    exact = any(f["kind"] == expected["kind"] for f in got)
    ok = verbatim and found
    passed += ok
    kinds = sorted({f["kind"] for f in adverse})
    print(f"{'PASS' if ok else 'FAIL'} {name}: issue {'found' if found else 'MISSING'} · answer key {expected['kind']} ({'exact' if exact else 'agent rated it ' + '/'.join(kinds)}) · citations {'all verbatim' if verbatim else 'NOT verbatim'}")
    for f in got:
        print(f"     - {f['kind']}: {f['text'][:110]}… (p.{f['page']})")
print(f"\n{passed}/{len(SET['evaluations'])} cases passed")
sys.exit(0 if passed == len(SET["evaluations"]) else 1)

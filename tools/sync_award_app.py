"""Give the Award solution's action app resource its action schema and OAuth client, from award-task-forms.

`uip solution projects add` registers Award/AwardTaskForms but leaves spec.actionSchema and spec.externalClientId empty;
Action Center needs both to hand a task's inputs to the form and take its outputs back. This builds the platform's
parsed schema from award-task-forms/action-schema.json (keys derived from the names, so re-runs don't churn) and patches
it in with `uip solution resources edit`. Run after `npm run build:solution` whenever action-schema.json changes.

Usage: python3 tools/sync_award_app.py [--dry-run]
"""
import json
import subprocess
import sys
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
APP = ROOT / "award-task-forms"
SOLUTION = ROOT / "Award"
NS = uuid.UUID("6f1c2a3e-4b5d-4e6f-8a7b-9c0d1e2f3a4b")
TYPES = {"string": "System.String", "integer": "System.Int64", "number": "System.Decimal", "boolean": "System.Boolean", "object": "System.Object"}


def key(*parts: str) -> str:
    return str(uuid.uuid5(NS, "/".join(parts)))


def field(section: str, name: str, d: dict) -> dict:
    is_list = d.get("type") == "array"
    item = d.get("items", {}) if is_list else d
    fmt = item.get("format")
    net = "System.Guid" if fmt == "uuid" else "System.DateOnly" if fmt == "date" else TYPES.get(item.get("type", "string"), "System.String")
    return {"name": name, "key": key(section, name), "required": bool(d.get("required", False)), "version": 0, "typeNamespace": "system",
            "isList": is_list, "collectionDataType": "Array" if is_list else None, "type": net, "properties": []}


def parsed(schema: dict) -> dict:
    sections = {s: [field(s, n, d) for n, d in (schema.get(s) or {}).get("properties", {}).items()] for s in ("inputs", "outputs", "inOuts")}
    outcomes = [{"name": n, "key": key("outcomes", n), "required": False, "type": "System.String", "typeNamespace": "system", "isList": False,
                 "collectionDataType": None, "properties": [], "version": 0} for n in (schema.get("outcomes") or {}).get("properties", {})]
    return {"key": key("schema"), "version": 0, "description": "Action Schema", "id": "ID" + key("schema").replace("-", ""), "name": "ActionSchema",
            **sections, "outcomes": outcomes}


def main(dry: bool):
    resource = json.loads(next((SOLUTION / "resources" / "solution_folder" / "app" / "codedAction").glob("*.json")).read_text())["resource"]
    patch = {"externalClientId": json.loads((APP / "uipath.json").read_text())["clientId"],
             "actionSchema": json.dumps(parsed(json.loads((APP / "action-schema.json").read_text())))}
    print(f"{resource['name']} ({resource['key']}): {len(json.loads(patch['actionSchema'])['inputs'])} inputs")
    if dry:
        print(json.dumps(patch, indent=1)[:1200])
        return
    out = subprocess.run(["uip", "solution", "resources", "edit", resource["key"], "--patch", "-", "--solution-folder", str(SOLUTION), "--output", "json"],
                         input=json.dumps(patch), capture_output=True, text=True)
    print(out.stdout[out.stdout.find("{"):][:600] or out.stderr[:600])


if __name__ == "__main__":
    main("--dry-run" in sys.argv)

"""Seed Data Fabric with the demo solicitations and synthetic vendor reference data.

Usage: python3 tools/seed.py
Idempotent: rows whose business key already exists are skipped.
Requires `uip login` to the target tenant.
"""
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "tools"))
from proposal_content import OFFERORS  # noqa: E402

IDS = json.loads((ROOT / "tools" / "schema" / "entity-ids.json").read_text())


def uip(*args, body=None):
    cmd = ["uip", *args, "--output", "json"]
    if body is not None:
        cmd += ["--body", json.dumps(body)]
    out = subprocess.run(cmd, capture_output=True, text=True).stdout
    return json.loads(out[out.index("{"):])


def existing(entity, key_field):
    r = uip("df", "records", "list", IDS[entity], "--limit", "1000")
    # The CLI envelope PascalCases keys (UEI -> Uei), so match the key case-insensitively.
    return {v for row in r["Data"]["Items"] for k, v in row.items() if k.lower() == key_field.lower()}


def insert(entity, key_field, records):
    have = existing(entity, key_field)
    new = [r for r in records if r[key_field] not in have]
    if not new:
        print(f"{entity}: up to date ({len(records)} rows)")
        return
    r = uip("df", "records", "insert", IDS[entity], body=new if len(new) > 1 else new[0])
    data = r.get("Data") or {}
    failed = data.get("FailureCount", 0) if r.get("Result") == "Success" else len(new)
    print(f"{entity}: inserted {len(new) - failed}, failed {failed}")
    if failed:
        print("  ", r.get("Instructions") or data.get("FailureRecords"))
        sys.exit(1)


VENDOR_REF = {
    "APEX": dict(SamStatus="Active", RegistrationExpiry="2027-08-31", Exclusion=False, FapiisRecords="None",
                 cpars=[("FA8730-22-F-0141", "Exceptional", 2025), ("FA8807-21-C-0077", "Exceptional", 2025), ("HT0011-20-F-0310", "Very Good", 2023)]),
    "NORTHSTAR": dict(SamStatus="Active", RegistrationExpiry="2027-03-15", Exclusion=False, FapiisRecords="None",
                      cpars=[("N00039-22-F-0218", "Very Good", 2025), ("12314423F0042", "Satisfactory", 2025)]),
    "CIVICWORKS": dict(SamStatus="Active", RegistrationExpiry="2027-01-20", Exclusion=False,
                       FapiisRecords="2023-06-14 Termination for Default — State of Ohio Department of Administrative Services, contract OH-DAS-2021-117 (missed migration milestones). Contractor disputes.",
                       cpars=[("FA8650-22-C-1009", "Satisfactory", 2025)]),
    "HELIX": dict(SamStatus="Active", RegistrationExpiry="2027-11-02", Exclusion=False, FapiisRecords="None",
                  cpars=[("75N91019F00133", "Exceptional", 2024), ("75D30122C14012", "Very Good", 2025)]),
    "LUMINA": dict(SamStatus="Active", RegistrationExpiry="2027-05-09", Exclusion=False, FapiisRecords="None",
                   cpars=[("36C10B22F0291", "Very Good", 2025), ("75F40123P00412", "Satisfactory", 2024)]),
    "NORTHBRIDGE": dict(SamStatus="Expired", RegistrationExpiry="2026-08-30", Exclusion=False, FapiisRecords="None",
                        cpars=[]),
    "KEYSTONE": dict(SamStatus="Active", RegistrationExpiry="2027-09-30", Exclusion=False, FapiisRecords="None",
                     cpars=[("W15QKN-22-F-0187", "Exceptional", 2025), ("W56HZV-24-P-0091", "Very Good", 2025)]),
    "IRONWOOD": dict(SamStatus="Active", RegistrationExpiry="2027-04-18", Exclusion=False, FapiisRecords="None",
                     cpars=[("SP4701-21-F-0332", "Very Good", 2025), ("N00104-23-C-0418", "Satisfactory", 2025)]),
    "BLUESTEM": dict(SamStatus="Active", RegistrationExpiry="2027-02-11", Exclusion=False, FapiisRecords="None",
                     cpars=[]),
    "HARBORVIEW": dict(SamStatus="Active", RegistrationExpiry="2027-10-14", Exclusion=False, FapiisRecords="None",
                       cpars=[("CHUSD-RFP-21-007", "Excellent", 2026), ("PCPS-2022-118", "Excellent", 2026),
                              ("LVSD-C-2023-04", "Excellent", 2025), ("MBISD-RFP-22-031", "Excellent", 2026)]),
    "IRONLEAF": dict(SamStatus="Active", RegistrationExpiry="2027-06-03", Exclusion=False, FapiisRecords="None",
                     cpars=[("FRASD-2023-012", "Very Good", 2026), ("SCS-RFP-22-044", "Very Good", 2025)]),
    "KESTREL": dict(SamStatus="Active", RegistrationExpiry="2027-01-27", Exclusion=False, FapiisRecords="None",
                    cpars=[("BHESD-2024-03", "Satisfactory", 2026)]),
    "QUILLMARK": dict(SamStatus="Active", RegistrationExpiry="2027-12-09", Exclusion=False, FapiisRecords="None",
                      cpars=[("RHUSD-RFP-22-019", "Excellent", 2026), ("ACS-2021-207", "Excellent", 2025),
                             ("SLPS-C-2023-09", "Very Good", 2026)]),
    "BRIGHTFIELD": dict(SamStatus="Active", RegistrationExpiry="2027-07-22", Exclusion=False, FapiisRecords="None",
                        cpars=[("HVSD-2023-027", "Very Good", 2026), ("ECUSD-RFP-22-015", "Satisfactory", 2025)]),
    "TALLPINE": dict(SamStatus="Active", RegistrationExpiry="2027-03-30", Exclusion=False, FapiisRecords="None",
                     cpars=[("NCCD-2022-0410", "Very Good", 2026), ("ESU-P-23-118", "Very Good", 2025)]),
}


def main():
    plans = sorted((ROOT / "evaluation-plans").glob("*.json"))
    sols = []
    for p in plans:
        plan = json.loads(p.read_text())
        sols.append({
            "SolicitationId": plan["solicitationId"], "Title": plan["title"], "Agency": plan["agency"],
            "PlanJson": json.dumps(plan, separators=(",", ":")), "Status": "Proposals Received", "Stage": "Not started",
        })
    insert("SSSolicitation", "SolicitationId", sols)

    vendors = []
    for code, o in OFFERORS.items():
        ref = VENDOR_REF[code]
        vendors.append({
            "UEI": o["uei"], "LegalName": o["name"], "SamStatus": ref["SamStatus"],
            "RegistrationExpiry": ref["RegistrationExpiry"], "Exclusion": ref["Exclusion"],
            "FapiisRecords": ref["FapiisRecords"],
            "CparsSummaryJson": json.dumps([{"contract": c, "rating": r, "year": y} for c, r, y in ref["cpars"]]),
        })
    insert("SSRefVendor", "UEI", vendors)


if __name__ == "__main__":
    main()

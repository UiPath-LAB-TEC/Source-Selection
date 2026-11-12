"""Seed the Requirements app's demo record (requirements-phase-scope.md §13).

Two requirements, both synthetic (fictional offices and people):
- RQ-26-0041, Enterprise IT Modernization Services: the accepted requirement behind FA8771-27-R-0031, the Air Force
  evaluation in Source Selection. Its package is final: PWS, QASP, market research, IGCE (the same CLINs and total as
  the solicitation's), acquisition strategy, Section 508 determination, small business coordination and funds.
- RQ-27-0001, Portable ground power units: a product requirement left at Clarify, with two of the agent's questions
  open, so the list isn't empty before the live demo builds a new one.

Usage (from the repo root, signed in with `uip login`):
  .venv/bin/python tools/seed_requirements.py             # write the rows to Data Fabric (insert or update by key)
  .venv/bin/python tools/seed_requirements.py --snapshot  # write requirements-workspace/src/dev/snapshot.json instead
  .venv/bin/python tools/seed_requirements.py --reset     # delete the two requirements' rows (permanent: the user runs it)
  .venv/bin/python tools/seed_requirements.py --profiles  # write only the requester profiles (leaves the requirements as they are)

Requester profiles (SSRequesterProfile): the program office people who build requirements, across agencies, all fictional.
Their agency, office, location and contracting office fill in a new requirement; the app's Settings page edits them.
Grace Lindqvist keeps ProfileId 'pm', so requirements saved before profiles existed (RequestedBy empty) stay hers.
"""
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
IDS = json.loads((ROOT / "tools" / "schema" / "entity-ids.json").read_text())
SNAPSHOT = ROOT / "requirements-workspace" / "src" / "dev" / "snapshot.json"
KEYS = {"SSRequirement": "RequirementId", "SSRequirementDoc": "DocId", "SSAuditEvent": "EventId", "SSRequesterProfile": "ProfileId"}
SNAP_KEYS = {"SSRequirement": "requirements", "SSRequirementDoc": "docs", "SSAuditEvent": "audit", "SSRequesterProfile": "profiles"}

AF = "Department of the Air Force"
CLINS = [
    ("0001", "Application migration (140 applications)", 9_200_000),
    ("0002", "Platform engineering and DevSecOps", 6_100_000),
    ("0003", "Cybersecurity and continuous ATO support", 4_300_000),
    ("0004", "Program management", 2_600_000),
    ("0005", "Transition-in and hypercare", 1_600_000),
]
TOTAL = sum(c[2] for c in CLINS)


def sections(*parts: tuple[str, str]) -> str:
    return "\n\n".join(f"## {h}\n{t.strip()}" for h, t in parts)


def bullets(*xs: str) -> str:
    return "\n".join(f"- {x}" for x in xs)


# ── RQ-26-0041: accepted, now FA8771-27-R-0031 ───────────────────────────────

IT = "RQ-26-0041"
IT_SPEC = {
    "items": [], "standards": [], "deliveryPlace": "", "deliveryDate": "", "warranty": "", "packaging": "", "inspection": "", "support": "",
    "objective": "Move 140 mission applications from on-premises data centers to the Air Force cloud environment, keep each one authorized to operate throughout, and retire the applications that are no longer needed.",
    "background": "The applications run in two government data centers scheduled to close in FY28. Their hosting contract ends with the move. About a third have had no significant change in five years.",
    "scope": "Rationalization, migration, platform engineering, cybersecurity and continuous ATO support, and program management, for a base year and four option years, with a 60-day transition-in.",
    "tasks": [
        "Rationalize the portfolio: recommend retire, rehost, replatform or refactor for each application, with the evidence",
        "Migrate each application approved for migration, in waves the government approves",
        "Build and run the landing zone and DevSecOps pipelines the migrated applications use",
        "Keep every application authorized to operate: RMF packages, continuous monitoring, and POA&M closure",
        "Run a 60-day transition-in from the incumbent without a gap in hosting",
        "Manage the program: schedule, risks, monthly status and an integrated master schedule",
    ],
    "deliverables": [
        {"name": "Rationalization report", "due": "90 days after award", "format": "Report and portfolio workbook"},
        {"name": "Wave migration plan", "due": "30 days before each wave", "format": "Plan"},
        {"name": "Monthly status report", "due": "10th of each month", "format": "Report"},
        {"name": "Transition-in plan", "due": "10 days after award", "format": "Plan"},
    ],
    "performanceStandards": [
        {"standard": "Migrated applications available during mission hours", "aql": "99.9% each month", "method": "Monitoring data, monthly"},
        {"standard": "Applications keep their ATO through the move", "aql": "No lapse", "method": "100% inspection of each wave"},
        {"standard": "Critical vulnerabilities fixed", "aql": "Within 15 days, 95% of the time", "method": "Scan data, monthly"},
        {"standard": "Deliverables on time and accepted on first submission", "aql": "90%", "method": "COR review of each deliverable"},
    ],
    "placeOfPerformance": "Contractor site, with on-site support at Maxwell AFB-Gunter Annex as needed",
    "periodOfPerformance": "Base year and four 12-month options",
    "security": "Secret facility clearance; CUI throughout; DFARS 252.204-7012 and CMMC Level 2",
    "gfp": "Government cloud environment accounts and tooling licenses",
    "keyPersonnel": "Program manager, cloud architect, cybersecurity lead",
}
IT_ANALYSIS = {
    "kind": "Service", "title": "Enterprise IT Modernization Services",
    "summary": "Cloud migration of 140 mission applications with continuous ATO support over five years. Commercial services sold widely; several small businesses perform this work.",
    "psc": {"code": "DA01", "name": "IT and telecom, business application and application development support"},
    "naics": {"code": "541512", "name": "Computer systems design services", "sizeStandard": "$34.0M"},
    "commercial": {"likely": True, "reason": "Cloud migration services are sold commercially in the form required."},
    "value": {"low": 21_000_000, "high": 26_000_000, "basis": "Comparable Air Force migrations, per application and per year of operations."},
    "flags": [
        {"id": "cui", "label": "Controlled information", "reason": "The applications hold CUI, so the contract needs the DoD safeguarding clauses and CMMC."},
        {"id": "ict", "label": "Information technology", "reason": "The services deliver ICT, so Section 508 applies."},
    ],
    "questions": [],
    "answered": [
        {"id": "q1-0", "question": "How many applications, and how many are likely to be retired?", "why": "Volume drives the estimate and the waves.", "options": [], "answer": "140 today; we expect 30 to 40 to be retired."},
        {"id": "q1-1", "question": "Must the applications keep their ATO during the move?", "why": "Continuous ATO support is its own line item and a performance standard.", "options": [], "answer": "Yes, no lapse is acceptable."},
        {"id": "q1-2", "question": "What happens if the move isn't done when the data centers close?", "why": "Sets the schedule risk the strategy has to cover.", "options": [], "answer": "Hosting lapses in FY28; the move has to finish by then."},
    ],
    "round": 2, "at": "2026-06-18T15:10:00Z",
}

IT_DOCS = [
    ("pws", "Performance work statement: Enterprise IT Modernization Services", sections(
        ("1. Background", IT_SPEC["background"]),
        ("2. Objective", IT_SPEC["objective"]),
        ("3. Scope", IT_SPEC["scope"]),
        ("4. Tasks", bullets(*IT_SPEC["tasks"])),
        ("5. Performance standards", bullets(*[f"{p['standard']}: {p['aql']}" for p in IT_SPEC["performanceStandards"]])),
        ("6. Deliverables", bullets(*[f"{d['name']}, {d['due']}" for d in IT_SPEC["deliverables"]])),
        ("7. Place and period of performance", f"{IT_SPEC['placeOfPerformance']}. {IT_SPEC['periodOfPerformance']}."),
        ("8. Security", IT_SPEC["security"] + "."),
    )),
    ("qasp", "Quality assurance surveillance plan", sections(
        ("1. Purpose", "How the COR checks each performance standard in the PWS, and what happens when one isn't met."),
        ("2. Surveillance", bullets(*[f"{p['standard']}: {p['method']}, acceptable quality level {p['aql']}" for p in IT_SPEC["performanceStandards"]])),
        ("3. When a standard isn't met", "The COR records it, the contractor gives a corrective action plan within 10 days, and repeated misses go into the CPARS evaluation."),
    )),
    ("marketResearch", "Market research report", sections(
        ("1. Sources checked", bullets("SAM.gov contract opportunities and entity registrations", "Prior Air Force and DoD awards for cloud migration (FPDS)", "GSA Multiple Award Schedule and the OASIS+ and Alliant 2 vehicles", "Industry day with 14 attendees, and a sources-sought notice with 11 responses")),
        ("2. Commercial availability", "Cloud migration and continuous ATO support are commercial services, sold in the form the Air Force needs."),
        ("3. Small business capability", "Five of the 11 responses came from small businesses with relevant past performance of similar size; two had done migrations of more than 100 applications."),
        ("4. Conclusion", "Full and open competition, with a recommendation to the Small Business Professional that the five capable small businesses be considered for a set-aside."),
    )),
    ("igce", "Independent government cost estimate", sections(
        ("1. Lines", bullets(*[f"CLIN {c}: {d}, ${v:,}" for c, d, v in CLINS]) + f"\n\nTotal: ${TOTAL:,} (base year and four options)."),
        ("2. Basis", "Labor hours by task from two comparable Air Force migrations, priced at GSA schedule rates for the labor categories, with 2% escalation each option year."),
    )),
    ("acquisitionStrategy", "Acquisition strategy", sections(
        ("1. Contract type", "Firm-fixed-price task order on a 5-year IDIQ: the work is defined by application and wave."),
        ("2. Competition", "Full and open, best-value tradeoff. Technical is more important than management, then past performance; non-price factors together are significantly more important than price."),
        ("3. Set-aside", "Unrestricted, after the Small Business Professional's review: the five capable small businesses could not show capacity for 140 applications in the schedule."),
        ("4. Schedule", "Solicitation in October 2026; award in January 2027; transition-in complete in March 2027."),
    )),
    ("section508", "Section 508 accessibility determination", sections(
        ("1. Determination", "The services deliver information and communication technology. The Revised 508 Standards apply to the applications as migrated and to every deliverable."),
    )),
    ("smallBusiness", "Small business coordination", sections(
        ("1. Review", "Reviewed the market research and the five small business responses. Concur with the unrestricted strategy; a small business subcontracting plan with a 30% goal is required."),
    )),
    ("funds", "Funds certification", sections(
        ("1. Certification", "Funds certified for the base year on purchase request F2KJ7A6101A001, $4,960,000. Option years are subject to the availability of funds."),
    )),
]
IT_DOC_PEOPLE = {
    "pws": ("RQ_Drafter", "Grace Lindqvist"), "qasp": ("RQ_Drafter", "Owen Mercer"), "marketResearch": ("Grace Lindqvist", "Grace Lindqvist"),
    "igce": ("Grace Lindqvist", "Grace Lindqvist"), "acquisitionStrategy": ("Dana Whitfield", "Dana Whitfield"), "section508": ("RQ_Drafter", "Grace Lindqvist"),
    "smallBusiness": ("Hector Alvarez", "Hector Alvarez"), "funds": ("Nadia Sorensen", "Nadia Sorensen"),
}

IT_TRAIL = [
    ("2026-06-16T14:02:00Z", "RequirementStarted", "Grace Lindqvist", "Move 140 mission applications to the Air Force cloud before the data centers close."),
    ("2026-06-16T14:03:10Z", "NeedAnalyzed", "RQ_RequirementsAnalyst", "Service: Enterprise IT Modernization Services. 3 questions."),
    ("2026-06-18T15:09:00Z", "QuestionsAnswered", "Grace Lindqvist", "3 answered or skipped"),
    ("2026-06-18T15:10:00Z", "NeedAnalyzed", "RQ_RequirementsAnalyst", "Service: Enterprise IT Modernization Services. 0 questions."),
    ("2026-06-22T13:30:00Z", "DocumentDrafted", "RQ_Drafter", "Performance work statement"),
    ("2026-06-24T17:45:00Z", "DocumentEdited", "Grace Lindqvist", "Performance work statement"),
    ("2026-06-25T13:00:00Z", "DocumentDrafted", "RQ_Drafter", "Quality assurance surveillance plan"),
    ("2026-06-26T16:20:00Z", "DocumentEdited", "Owen Mercer", "Quality assurance surveillance plan"),
    ("2026-07-14T19:00:00Z", "DocumentMarkedFinal", "Grace Lindqvist", "Market research report"),
    ("2026-07-21T18:30:00Z", "DocumentMarkedFinal", "Grace Lindqvist", "Independent government cost estimate"),
    ("2026-07-28T15:00:00Z", "PackageSubmitted", "Grace Lindqvist", "Submitted to contracting"),
    ("2026-07-30T14:15:00Z", "FundsCertified", "Nadia Sorensen", "Base year, $4,960,000"),
    ("2026-08-04T16:40:00Z", "SmallBusinessReviewed", "Hector Alvarez", "Concur: unrestricted, 30% subcontracting goal"),
    ("2026-08-06T13:05:00Z", "PackageAccepted", "Dana Whitfield", "Accepted. Solicitation FA8771-27-R-0031 to follow."),
]


# ── RQ-27-0001: at Clarify ───────────────────────────────────────────────────

GPU = "RQ-27-0001"
GPU_NEED = ("We need 12 portable ground power units to start and service aircraft on the flight line and at the alert pad. "
            "Ours are past their service life and two are down for parts. They have to be towable by our tugs and run on JP-8.")
GPU_SPEC = {
    "items": [{"name": "Portable ground power unit", "quantity": 12, "unit": "each", "characteristics": [
        "400 Hz AC and 28 V DC output for the aircraft served", "Towable by the squadron's existing tugs", "Runs on JP-8",
    ]}],
    "standards": ["MIL-STD-704F power quality"], "deliveryPlace": "Aircraft maintenance squadron, [installation]", "deliveryDate": "", "warranty": "",
    "packaging": "", "inspection": "At destination", "support": "",
    "objective": "", "background": "", "scope": "", "tasks": [], "deliverables": [], "performanceStandards": [], "placeOfPerformance": "",
    "periodOfPerformance": "", "security": "", "gfp": "", "keyPersonnel": "",
}
GPU_ANALYSIS = {
    "kind": "Product", "title": "Portable ground power units",
    "summary": "Twelve towable ground power units that run on JP-8 for flight line and alert pad use. Commercial items with several makers.",
    "psc": {"code": "4920", "name": "Aircraft maintenance and repair shop specialized equipment"},
    "naics": {"code": "335312", "name": "Motor and generator manufacturing", "sizeStandard": "1,250 employees"},
    "commercial": {"likely": True, "reason": "Ground power units are sold commercially in these configurations."},
    "value": {"low": 540_000, "high": 780_000, "basis": "12 units at $45,000 to $65,000 each."},
    "flags": [],
    "questions": [
        {"id": "q1-2", "question": "Which aircraft must each unit power, and at what load?", "why": "The output rating is the main salient characteristic and decides which makers can compete.", "options": ["Fighters only", "Fighters and tankers", "Not sure: list the aircraft"]},
        {"id": "q1-3", "question": "Do you need training, spares or a service plan with the units?", "why": "Each becomes a line item and changes the estimate.", "options": ["Operator training only", "Training and a 2-year parts kit", "None"]},
    ],
    "answered": [
        {"id": "q1-0", "question": "What fuel and towing limits must they meet?", "why": "Fuel and tow compatibility are salient characteristics.", "options": [], "answer": "JP-8 only; towable by our existing tugs."},
        {"id": "q1-1", "question": "How many do you need, and where?", "why": "Quantity drives the estimate.", "options": [], "answer": "Twelve: eight on the flight line, four at the alert pad."},
    ],
    "round": 1, "at": "2026-11-06T16:20:00Z",
}


def profile(pid, name, title, agency, department, office, location, contracting):
    return {"ProfileId": pid, "Name": name, "Title": title, "Agency": agency, "Department": department, "Office": office, "Location": location,
            "ContractingOffice": contracting, "Framework": "federal", "Active": True, "UpdatedAt": "2026-11-12T18:00:00Z"}


PROFILES = [
    profile("pm", "Grace Lindqvist", "Program Manager", AF, "Department of Defense", "42nd Aircraft Maintenance Squadron",
            "Building 1420, flight line, Moody Air Force Base, GA", "23rd Contracting Squadron"),
    profile("rq-leah-okonkwo", "Leah Okonkwo", "Training Support Officer", "Department of the Army", "Department of Defense", "Training Support Center",
            "Building 33018, Fort Cavazos, TX", "Mission and Installation Contracting Command, Fort Cavazos"),
    profile("rq-samuel-brandt", "Samuel Brandt", "Chief, Biomedical Engineering", "Department of Veterans Affairs", "", "Biomedical Engineering, Lakeshore VA Medical Center",
            "Lakeshore VA Medical Center, Building 2, Cleveland, OH", "Network Contracting Office 10"),
    profile("rq-teresa-vu", "Teresa Vu", "Mission Support Specialist", "U.S. Customs and Border Protection", "Department of Homeland Security", "Laredo Field Office, Mission Support",
            "Laredo Field Office, Laredo, TX", "CBP Office of Acquisition"),
    profile("rq-ruth-halvorsen", "Ruth Halvorsen", "Facility Manager", "National Park Service", "Department of the Interior", "Facility Management Division, Glacier National Park",
            "Park Headquarters, West Glacier, MT", "NPS Intermountain Contracting Office"),
]


def rows() -> dict[str, list[dict]]:
    it = {
        "RequirementId": IT, "Title": "Enterprise IT Modernization Services", "Kind": "Service", "Framework": "federal", "Status": "Accepted", "Stage": "Accepted",
        "Agency": AF, "Office": "Air Force Life Cycle Management Center, Enterprise IT", "ContractingOffice": "AFLCMC/PZI",
        "Need": "We have to move 140 mission applications out of two data centers that close in FY28 into the Air Force cloud, keep every one of them authorized to operate during the move, and retire the ones we don't need anymore. We need a contractor for the migration and five years of operations.",
        "NeedBy": "2027-03-31", "Budget": 25_000_000, "EstimatedValue": TOTAL, "Psc": "DA01", "Naics": "541512",
        "RequirementJson": json.dumps(IT_SPEC), "AnalysisJson": json.dumps(IT_ANALYSIS), "StrategyJson": "",
        "SolicitationId": "FA8771-27-R-0031", "OwnerPersona": "pm", "RequestedBy": "pm", "CreatedAt": IT_TRAIL[0][0], "UpdatedAt": IT_TRAIL[-1][0],
    }
    gpu = {
        "RequirementId": GPU, "Title": "Portable ground power units", "Kind": "Product", "Framework": "federal", "Status": "Draft", "Stage": "Clarify",
        "Agency": AF, "Office": "42nd Aircraft Maintenance Squadron", "ContractingOffice": "", "Need": GPU_NEED, "NeedBy": "2027-03-01",
        "Budget": 700_000, "EstimatedValue": 660_000, "Psc": "4920", "Naics": "335312",
        "RequirementJson": json.dumps(GPU_SPEC), "AnalysisJson": json.dumps(GPU_ANALYSIS), "StrategyJson": "",
        "SolicitationId": "", "OwnerPersona": "pm", "RequestedBy": "pm", "CreatedAt": "2026-11-06T16:18:00Z", "UpdatedAt": "2026-11-06T16:20:00Z",
    }
    docs = []
    for kind, title, text in IT_DOCS:
        drafted, edited = IT_DOC_PEOPLE[kind]
        docs.append({"DocId": f"{IT}-{kind}", "RequirementId": IT, "Kind": kind, "Title": title, "Status": "Final", "Text": text,
                     "DataJson": json.dumps({"openQuestions": []} if kind != "igce" else {"lines": [{"clin": c, "description": d, "amount": v} for c, d, v in CLINS], "total": TOTAL}),
                     "DraftedBy": drafted, "EditedBy": edited, "UpdatedAt": "2026-07-28T15:00:00Z"})
    audit = [{"EventId": f"{IT}-{a}-{i:02d}", "SolicitationId": IT, "EntityRef": IT, "Action": a, "Actor": who, "OccurredAt": at, "Detail": d}
             for i, (at, a, who, d) in enumerate(IT_TRAIL)]
    audit += [
        {"EventId": f"{GPU}-RequirementStarted-00", "SolicitationId": GPU, "EntityRef": GPU, "Action": "RequirementStarted", "Actor": "Grace Lindqvist", "OccurredAt": "2026-11-06T16:18:00Z", "Detail": GPU_NEED[:300]},
        {"EventId": f"{GPU}-NeedAnalyzed-01", "SolicitationId": GPU, "EntityRef": GPU, "Action": "NeedAnalyzed", "Actor": "RQ_RequirementsAnalyst", "OccurredAt": "2026-11-06T16:20:00Z", "Detail": "Product: Portable ground power units. 4 questions."},
    ]
    return {"SSRequirement": [it, gpu], "SSRequirementDoc": docs, "SSAuditEvent": audit, "SSRequesterProfile": PROFILES}


# ── Data Fabric through the uip CLI, as tools/generate_incumbent.py does ─────

def uip(*args, body=None):
    cmd = ["uip", *args, "--output", "json"] + (["--body", json.dumps(body)] if body is not None else [])
    res = subprocess.run(cmd, capture_output=True, text=True)
    out = res.stdout
    if "{" not in out:
        raise RuntimeError(f"uip {' '.join(args[:3])} failed: {res.stderr[:400]}")
    return json.loads(out[out.index("{"):])


def live_rows(entity: str) -> list[dict]:
    fields = {f["Name"].lower(): f["Name"] for f in uip("df", "entities", "get", IDS[entity])["Data"]["Fields"]}
    items = uip("df", "records", "list", IDS[entity], "--limit", "1000")["Data"]["Items"]
    return [{fields.get(k.lower(), k): v for k, v in r.items()} for r in items]


def write(data: dict[str, list[dict]]) -> None:
    for entity, recs in data.items():
        key = KEYS[entity]
        have = {r.get(key): r["Id"] for r in live_rows(entity) if r.get(key)}
        new = [r for r in recs if r[key] not in have]
        for i in range(0, len(new), 50):
            chunk = new[i:i + 50]
            res = uip("df", "records", "insert", IDS[entity], body=chunk if len(chunk) > 1 else chunk[0])
            if res.get("Result") != "Success":
                raise RuntimeError(f"{entity} insert failed: {json.dumps(res)[:400]}")
        for r in (r for r in recs if r[key] in have):
            res = uip("df", "records", "update", IDS[entity], body={**r, "Id": have[r[key]]})
            if res.get("Result") != "Success":
                raise RuntimeError(f"{entity} update failed: {json.dumps(res)[:400]}")
        print(f"{entity}: {len(new)} inserted, {len(recs) - len(new)} updated")


def reset() -> None:
    """Delete both requirements' rows, their documents and their audit trail. Permanent."""
    for entity, field in (("SSRequirementDoc", "RequirementId"), ("SSAuditEvent", "SolicitationId"), ("SSRequirement", "RequirementId")):
        ids = [r["Id"] for r in live_rows(entity) if r.get(field) in (IT, GPU)]
        for i in range(0, len(ids), 50):
            uip("df", "records", "delete", IDS[entity], *ids[i:i + 50], "-y")
        print(f"{entity}: {len(ids)} deleted")


def snapshot(data: dict[str, list[dict]]) -> None:
    """The dev preview's dataset: these rows, plus the solicitations they link to (id, title, status and stage only)."""
    award = json.loads((ROOT / "award-workspace" / "src" / "dev" / "snapshot.json").read_text())
    sols = [{k: s.get(k) for k in ("SolicitationId", "Title", "Status", "Stage")} for s in award["solicitations"]]
    snap = {SNAP_KEYS[e]: [{"Id": f"preview-{r[KEYS[e]]}", **r} for r in recs] for e, recs in data.items()}
    snap["solicitations"] = sols
    SNAPSHOT.write_text(json.dumps(snap, indent=1))
    print(f"{SNAPSHOT.relative_to(ROOT)}: {sum(len(v) for v in snap.values())} rows")


if __name__ == "__main__":
    if "--reset" in sys.argv:
        reset()
    elif "--profiles" in sys.argv:
        write({"SSRequesterProfile": PROFILES})
    elif "--snapshot" in sys.argv:
        snapshot(rows())
    else:
        write(rows())

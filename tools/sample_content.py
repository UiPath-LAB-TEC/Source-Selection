"""A fresh synthetic solicitation for trying "New source selection" end to end in the workspace.

Separate from proposal_content.py on purpose: seed.py and the demo snapshot never see it, so it can be
started from scratch as many times as needed (with a new solicitation number each time, if wanted).
Every offeror, person, contract number and UEI here is fictional.
"""
import os

# A solicitation number can be started only once, so the sample can be printed under a new one
# (generate_sample.py --id 36C10B-27-R-0058 sets this).
SOLICITATION_ID = os.environ.get("SAMPLE_SOLICITATION_ID", "36C10B-27-R-0057")

SOLICITATIONS = {
    SOLICITATION_ID: {
        "title": "Veterans Claims Intake Modernization",
        "agency": "Department of Veterans Affairs",
    },
}

# What the Section M generator reads. The wizard's Section M agent extracts the same factors back out of the PDF.
PLAN = {
    "solicitationId": SOLICITATION_ID,
    "title": "Veterans Claims Intake Modernization",
    "agency": "Department of Veterans Affairs",
    "office": "Technology Acquisition Center (TAC), Eatontown, NJ",
    "contractType": "Firm-fixed-price task order, one base year and four option years",
    "basisForAward": "Best value tradeoff (FAR 15.101-1)",
    "relativeImportance": "Technical Approach is more important than Management Approach, which is more important than Past Performance. "
                          "All non-price factors, when combined, are significantly more important than Price.",
    "factors": [
        {"id": "T1", "name": "Technical Approach", "order": 1, "scale": "technical", "volume": "technical",
         "subfactors": ["Intelligent document intake and classification", "Claims routing and workload management", "Accessibility and Section 508 conformance"],
         "criteria": "The Government will evaluate the offeror's approach to classifying and extracting data from incoming claim evidence, "
                     "routing established claims to the right work queue, and delivering a Section 508 conformant experience for Veterans and VA staff."},
        {"id": "T2", "name": "Management Approach", "order": 2, "scale": "technical", "volume": "management",
         "subfactors": ["Key personnel", "Transition-in plan", "Staffing and retention"],
         "criteria": "The Government will evaluate the qualifications and committed availability of the Program Manager and Solution Architect, "
                     "the offeror's plan to assume full responsibility within 60 days of award, and its approach to staffing and retention."},
        {"id": "T3", "name": "Past Performance", "order": 3, "scale": "confidence", "volume": "pastPerformance",
         "subfactors": ["Recency", "Relevancy", "Quality"],
         "criteria": "The Government will assess confidence based on recent and relevant performance on benefits claims intake, document processing or case management efforts."},
        {"id": "PRICE", "name": "Price", "order": 4, "evaluatedNotRated": True, "volume": "price",
         "criteria": "Price will be evaluated for reasonableness. Total evaluated price is the sum of all fixed-price CLINs for the base and option periods."},
    ],
    "submission": {"volumes": ["technical", "management", "pastPerformance", "price"],
                   "pageLimits": {"technical": 25, "management": 15, "pastPerformance": 10}},
}

# IGCE by CLIN across all periods; the wizard's first step reads these from IGCE.pdf.
IGCE = {"0001": 6200000, "0002": 3800000, "0003": 2600000, "0004": 1400000}
# The same estimate by period (base year, option years 1-4), as the IGCE document presents it.
IGCE_PERIODS = {
    "0001": [1400000, 1200000, 1200000, 1200000, 1200000],
    "0002": [800000, 750000, 750000, 750000, 750000],
    "0003": [600000, 500000, 500000, 500000, 500000],
    "0004": [300000, 275000, 275000, 275000, 275000],
}
assert all(sum(v) == IGCE[k] for k, v in IGCE_PERIODS.items())

CLIN_LABELS = {
    SOLICITATION_ID: {
        "0001": "Claims intake platform build and operations",
        "0002": "Document classification and data extraction",
        "0003": "Contact center and workload integration",
        "0004": "Program management",
    },
}

# Answer key: what an evaluator (and the agent) should find.
PLANTED = {
    "TALLGRASS": [
        ("technical", "Significant Strength", "94 percent straight-through classification measured on 1.2 million VBA claim documents"),
        ("technical", "Strength", "DHS Trusted Tester certified accessibility testing every sprint, with a VPAT per release"),
        ("management", "Strength", "Both key personnel are current employees committed full time from award"),
        ("management", "Strength", "Transition-in completed in 45 days, ahead of the required 60"),
        ("pastPerformance", "Strength", "Exceptional CPARS on the VBA document intake pilot"),
        ("price", "Risk", "Total price about 6.1% above the IGCE"),
    ],
    "ORINOCO": [
        ("technical", "Weakness", "Templates cover 12 of the 43 claim form types; the rest are indexed by hand"),
        ("technical", "Weakness", "Static routing rules with no workload balancing across regional offices"),
        ("management", "Strength", "Transition-in completed in 30 days"),
        ("management", "Risk", "Solution Architect and half of the staff to be hired after award"),
        ("price", "Risk", "Total price about 10.7% below the IGCE (price realism concern)"),
    ],
    "BRIGHTWATER": [
        ("technical", "Strength", "Skills-based dynamic routing that rebalances work queues every 15 minutes"),
        ("technical", "Significant Weakness", "No Section 508 testing approach; conformance deferred to user acceptance testing"),
        ("technical", "Weakness", "Classification accuracy measured only on a commercial insurance benchmark, not on VA documents"),
        ("pastPerformance", "Weakness", "Marginal CPARS schedule rating on the one relevant reference"),
    ],
}

OFFERORS = {
    "TALLGRASS": {
        "solicitation": SOLICITATION_ID,
        "name": "Tallgrass Federal Group LLC",
        "uei": "TG4K9W2M7RX3", "cage": "9TFG1",
        "address": "2300 Clarendon Blvd, Suite 1100, Arlington, VA 22201",
        "signatory": "Renata Okafor, Chief Executive Officer",
        "technical": [
            ("1. Intelligent Document Intake and Classification", [
                "Tallgrass will classify and extract data from every piece of incoming claim evidence — VA Form 21-526EZ, supporting medical records, service treatment records and Veteran statements — through a single intake pipeline that combines layout-aware classification with field-level extraction.",
                "On our current Veterans Benefits Administration document intake pilot, the pipeline processed 1.2 million claim documents across 43 form types with 94 percent straight-through classification. Documents below the confidence threshold are routed to a VA reviewer with the uncertain fields highlighted, and every correction retrains the model the following week.",
                "Extracted data is written to the claim record with a link to the source page, so a claims processor can see exactly where each value came from.",
            ]),
            ("2. Claims Routing and Workload Management", [
                "Once a claim is established, Tallgrass routes it to the national work queue using the claim's contentions, the Veteran's location and each regional office's current workload. Routing rules are maintained by VA business owners in a no-code rules editor and take effect without a software release.",
                "Supervisors see a live workload dashboard by station and lane. On the pilot, the average time from receipt to claim establishment fell from 9 days to 2.",
            ]),
            ("3. Accessibility and Section 508 Conformance", [
                "Every screen used by Veterans and VA staff is built to WCAG 2.1 Level AA. Automated accessibility checks run in the delivery pipeline and block a release on any failure.",
                "In addition, DHS Trusted Tester certified analysts test every new screen manually each sprint, and Tallgrass delivers an updated Voluntary Product Accessibility Template (VPAT) with each release.",
            ]),
        ],
        "management": [
            ("1. Key Personnel", [
                "Program Manager Gabriel Hensley (PMP, 16 years) leads our VBA document intake pilot. Solution Architect Mei-Lin Zhou (13 years) designed the pilot's intake pipeline.",
                "Both key personnel are current Tallgrass employees and are committed full time from contract award.",
            ]),
            ("2. Transition-In Plan", [
                "Tallgrass will complete transition-in within 45 days of award, ahead of the required 60: knowledge transfer in days 1 to 20, parallel operations in days 21 to 40, and full assumption of responsibility by day 45.",
            ]),
            ("3. Staffing and Retention", [
                "Ninety percent of the proposed staff are current Tallgrass employees. Our annual retention rate across federal programs is 92 percent.",
            ]),
        ],
        "pastPerformance": [
            ("Reference 1 — VBA Document Intake Pilot (36C10B23F0412)", [
                "Value $12.8M, period 2023–present. Classification and data extraction for incoming claim evidence. CPARS 2025: Exceptional in quality and schedule.",
            ]),
            ("Reference 2 — SSA Disability Claims Intake (28321322C0019)", [
                "Value $8.1M, period 2022–2025. Intake and routing for disability claims. CPARS final: Very Good.",
            ]),
            ("Reference 3 — IRS Correspondence Digitization (2032H822F00117)", [
                "Value $5.6M, period 2022–2024. Digitization and classification of taxpayer correspondence. CPARS final: Very Good.",
            ]),
        ],
        "price": {"0001": 6600000, "0002": 4050000, "0003": 2700000, "0004": 1500000},
    },
    "ORINOCO": {
        "solicitation": SOLICITATION_ID,
        "name": "Orinoco Digital Inc",
        "uei": "OR8D2P5V1QL7", "cage": "7ORD3",
        "address": "8400 Westpark Dr, Suite 300, McLean, VA 22102",
        "signatory": "Tomas Velez, President",
        "technical": [
            ("1. Intelligent Document Intake and Classification", [
                "Orinoco will capture incoming claim evidence with template-based optical character recognition. Our template library covers 12 of the 43 claim form types VA receives, including VA Form 21-526EZ.",
                "Documents that do not match a template are indexed by hand by Orinoco data entry staff at our Richmond processing center, with a target turnaround of two business days.",
            ]),
            ("2. Claims Routing and Workload Management", [
                "Claims are routed with static rules that map each claim type to a regional office. VA staff can request rule changes through a monthly change board.",
                "Orinoco will provide weekly workload reports by regional office.",
            ]),
            ("3. Accessibility and Section 508 Conformance", [
                "Orinoco commits to WCAG 2.1 Level AA conformance. Automated accessibility scans run against each release candidate, and findings are fixed before production deployment.",
            ]),
        ],
        "management": [
            ("1. Key Personnel", [
                "Program Manager Alicia Brandt (PMP, 9 years) is a current Orinoco employee committed full time. Orinoco will recruit the Solution Architect after award.",
            ]),
            ("2. Transition-In Plan", [
                "Orinoco will complete transition-in within 30 days of award by assigning its existing Richmond processing team to the effort on day one.",
            ]),
            ("3. Staffing and Retention", [
                "Half of the proposed staff are current employees; Orinoco will hire the remaining 50 percent after award through its partner staffing agencies.",
            ]),
        ],
        "pastPerformance": [
            ("Reference 1 — SSA Field Office Scanning (28321320F00522)", [
                "Value $6.4M, period 2020–2024. Document scanning and indexing for Social Security field offices. CPARS final: Very Good.",
            ]),
            ("Reference 2 — State of Maryland Unemployment Claims Intake (MD-DOL-2022-17)", [
                "Value $3.9M, period 2022–present. Reference reports satisfactory performance.",
            ]),
        ],
        "price": {"0001": 5600000, "0002": 3300000, "0003": 2350000, "0004": 1250000},
    },
    "BRIGHTWATER": {
        "solicitation": SOLICITATION_ID,
        "name": "Brightwater Systems Corp",
        "uei": "BW3S6T9H4NC8", "cage": "5BWS7",
        "address": "1650 Tysons Blvd, Suite 1500, McLean, VA 22102",
        "signatory": "Keisha Lambert, Chief Operating Officer",
        "technical": [
            ("1. Intelligent Document Intake and Classification", [
                "Brightwater's machine learning classifier identifies the document type and extracts key fields from scanned and digital submissions.",
                "On an industry benchmark of commercial insurance claim documents, the classifier achieved 89 percent accuracy. Brightwater will tune the model on VA documents during the first six months of performance.",
            ]),
            ("2. Claims Routing and Workload Management", [
                "Brightwater routes each claim using skills-based assignment: claims are matched to processors by contention type, complexity and certification. The router rebalances the work queues every 15 minutes based on each station's backlog.",
                "Supervisors can override an assignment, and every override is logged for quality review.",
            ]),
            ("3. Accessibility and Section 508 Conformance", [
                "Section 508 conformance will be addressed during user acceptance testing before each major release.",
            ]),
        ],
        "management": [
            ("1. Key Personnel", [
                "Program Manager Owen Pritchard (PMP, 20 years) and Solution Architect Hana Sato (11 years) are current Brightwater employees committed full time from award.",
            ]),
            ("2. Transition-In Plan", [
                "Brightwater will complete transition-in within 60 days of award through a phased handover of each intake lane.",
            ]),
            ("3. Staffing and Retention", [
                "Brightwater will staff the effort from its federal health practice and backfill through its recruiting team. Annual retention across the practice is 85 percent.",
            ]),
        ],
        "pastPerformance": [
            ("Reference 1 — USCIS Form Intake Support (70SBUR22F00000231)", [
                "Value $7.2M, period 2022–present. Intake and data capture for immigration benefit forms. CPARS 2025: Satisfactory in quality, Marginal in schedule.",
            ]),
            ("Reference 2 — Commercial Health Insurer Claims Analytics", [
                "Value $2.1M, period 2023–present. Claims analytics for a commercial health plan. Reference reports satisfactory performance.",
            ]),
        ],
        "price": {"0001": 6100000, "0002": 3650000, "0003": 2500000, "0004": 1350000},
    },
}

# SSRefVendor rows (the compliance robot's SAM, exclusion and FAPIIS reference); all three are clean.
VENDOR_REF = {
    "TALLGRASS": dict(SamStatus="Active", RegistrationExpiry="2027-09-14", Exclusion=False, FapiisRecords="None",
                      cpars=[("36C10B23F0412", "Exceptional", 2025), ("28321322C0019", "Very Good", 2025)]),
    "ORINOCO": dict(SamStatus="Active", RegistrationExpiry="2027-03-21", Exclusion=False, FapiisRecords="None",
                    cpars=[("28321320F00522", "Very Good", 2024)]),
    "BRIGHTWATER": dict(SamStatus="Active", RegistrationExpiry="2027-06-30", Exclusion=False, FapiisRecords="None",
                        cpars=[("70SBUR22F00000231", "Satisfactory", 2025)]),
}

"""A DoD sample solicitation for trying "New source selection" end to end: an Army requirement, so the wizard picks the
DoD best-value tradeoff template (color ratings) and Section M carries the DoD Source Selection Procedures ratings.

The same shape as sample_content.py (the civilian VA package), rendered by generate_sample.py --package army.
Separate from proposal_content.py on purpose: seed.py and the demo snapshot never see it. Every offeror, person,
contract number and UEI here is fictional.
"""
import os

# A solicitation number can be started only once (generate_sample.py --id <number> prints it under another one).
SOLICITATION_ID = os.environ.get("SAMPLE_SOLICITATION_ID", "W56KGU-27-R-0041")

TITLE = "Army Maintenance Records Modernization"
AGENCY = "Department of the Army"
OFFICE = "Army Contracting Command – Aberdeen Proving Ground (ACC-APG)"

SOLICITATIONS = {SOLICITATION_ID: {"title": TITLE, "agency": AGENCY}}

# What the Section M generator reads. The wizard's Section M agent extracts the same factors back out of the PDF.
PLAN = {
    "solicitationId": SOLICITATION_ID,
    "title": TITLE,
    "agency": AGENCY,
    "office": OFFICE,
    "contractType": "Firm-fixed-price contract, one base year and four option years",
    "basisForAward": "Best value tradeoff (FAR 15.101-1)",
    "relativeImportance": "Technical Approach is more important than Management Approach, which is more important than Past Performance. "
                          "All non-price factors, when combined, are significantly more important than Price.",
    "factors": [
        {"id": "T1", "name": "Technical Approach", "order": 1, "scale": "technical", "volume": "technical",
         "subfactors": ["Maintenance record digitization and data extraction", "GCSS-Army integration and readiness reporting",
                        "Cybersecurity and Risk Management Framework compliance"],
         "criteria": "The Government will evaluate the offeror's approach to digitizing and extracting data from equipment maintenance records "
                     "(DA Form 2404, DA Form 5988-E and the DA Form 2408 logbook series), posting that data to GCSS-Army for readiness reporting, "
                     "and operating the solution in a DoD Impact Level 5 environment under the Risk Management Framework and DFARS 252.204-7012."},
        {"id": "T2", "name": "Management Approach", "order": 2, "scale": "technical", "volume": "management",
         "subfactors": ["Key personnel", "Transition-in plan", "Staffing and security clearances"],
         "criteria": "The Government will evaluate the qualifications and committed availability of the Program Manager and Solution Architect, "
                     "the offeror's plan to assume full responsibility within 60 days of award, and its approach to staffing the effort with "
                     "personnel who hold the required Secret clearances."},
        {"id": "T3", "name": "Past Performance", "order": 3, "scale": "confidence", "volume": "pastPerformance",
         "subfactors": ["Recency", "Relevancy", "Quality"],
         "criteria": "The Government will assess confidence based on recent and relevant performance on maintenance data, logistics "
                     "information systems or records digitization efforts for the Department of Defense."},
        {"id": "PRICE", "name": "Price", "order": 4, "evaluatedNotRated": True, "volume": "price",
         "criteria": "Price will be evaluated for reasonableness. Total evaluated price is the sum of all fixed-price CLINs for the base and option periods."},
    ],
    "submission": {"volumes": ["technical", "management", "pastPerformance", "price"],
                   "pageLimits": {"technical": 25, "management": 15, "pastPerformance": 10}},
}

# IGCE by CLIN across all periods; the wizard's first step reads these from IGCE.pdf.
IGCE = {"0001": 7500000, "0002": 4200000, "0003": 2800000, "0004": 1500000}
# The same estimate by period (base year, option years 1-4), as the IGCE document presents it.
IGCE_PERIODS = {
    "0001": [1900000, 1400000, 1400000, 1400000, 1400000],
    "0002": [1000000, 800000, 800000, 800000, 800000],
    "0003": [800000, 500000, 500000, 500000, 500000],
    "0004": [340000, 290000, 290000, 290000, 290000],
}
assert all(sum(v) == IGCE[k] for k, v in IGCE_PERIODS.items())

CLIN_LABELS = {
    SOLICITATION_ID: {
        "0001": "Maintenance records digitization and data extraction",
        "0002": "GCSS-Army integration and readiness reporting",
        "0003": "Cybersecurity, RMF and accreditation support",
        "0004": "Program management",
    },
}

# The solicitation and IGCE text that differs from the civilian package (generate_sample.py reads it).
DOCS = {
    "co": ("Dana Whitfield", "Contracting Officer", "(555) 010-6620", "dana.whitfield@apg.example"),
    "office_code": "W56KGU",
    "office_name": OFFICE,
    "office_address": "6001 Combat Drive, Aberdeen Proving Ground, MD 21005",
    "requisition": "W56KGU-27-0418",
    "description": f"{TITLE}. The contractor shall digitize and extract data from Army equipment maintenance records (DA Form 2404, "
                   "DA Form 5988-E and the DA Form 2408 logbook series), post the extracted data to the Global Combat Support "
                   "System-Army (GCSS-Army) for readiness reporting, and operate the solution in a DoD Impact Level 5 environment that "
                   "meets the Risk Management Framework and DFARS 252.204-7012, in accordance with the Performance Work Statement in Section C.",
    "requiring_activity": "U.S. Army Materiel Command, Maintenance Data Office",
    "estimate_date": "August 26, 2026",
    "basis": "Labor hours are drawn from the Army Materiel Command maintenance records pilot (2024 to 2026) and scaled to roughly "
             "4.5 million maintenance records a year across Army depots and installations. Labor rates use GSA Multiple Award Schedule "
             "ceiling rates for comparable categories with a cleared-personnel premium, escalated 2.5 percent a year. The base year "
             "includes one-time digitization of the records backlog, GCSS-Army interface build and accreditation costs that do not "
             "recur in the option years.",
    "assumptions": [
        "Performance begins within 30 days of award; the base year carries the transition-in, backlog digitization and interface build.",
        "Option years are priced at steady-state operations with 2.5 percent annual escalation already applied.",
        "Hosting is in a Government-approved DoD Impact Level 5 cloud environment; hosting costs are included in CLIN 0001.",
        "All contractor staff with access to the system hold a Secret clearance; no clearance processing costs are included.",
    ],
    "preparer": ("Curtis Albright", "Cost/Price Analyst, Army Materiel Command G-8"),
    "approver_office": "ACC-APG",
}

# Answer key: what an evaluator (and the agent) should find.
PLANTED = {
    "SENTRYLINE": [
        ("technical", "Significant Strength", "96 percent field-level extraction accuracy measured on 2.1 million Army maintenance records"),
        ("technical", "Strength", "Operates today in a DoD Impact Level 5 environment with an existing Authority to Operate it will inherit"),
        ("technical", "Strength", "Real-time posting to GCSS-Army through the approved interface, with every value linked to its source page"),
        ("management", "Strength", "Both key personnel are current employees with Top Secret clearances, committed full time from award"),
        ("management", "Strength", "Transition-in completed in 45 days, ahead of the required 60"),
        ("pastPerformance", "Strength", "Exceptional CPARS on the Army Materiel Command maintenance records pilot"),
        ("price", "Risk", "Total price about 5.6% above the IGCE"),
    ],
    "CORVANE": [
        ("technical", "Weakness", "OCR templates cover DA Form 2404 only; DA Form 2408 logbooks are transcribed by hand"),
        ("technical", "Weakness", "Nightly batch file transfer to GCSS-Army instead of real-time posting; readiness data a day behind"),
        ("management", "Strength", "Transition-in completed in 30 days"),
        ("management", "Risk", "Solution Architect and 40 percent of staff hired after award, with Secret clearances still to be granted"),
        ("price", "Risk", "Total price about 12.5% below the IGCE (price realism concern)"),
    ],
    "ASHGROVE": [
        ("technical", "Strength", "Predictive maintenance model flags likely part failures 30 days ahead from the extracted records"),
        ("technical", "Significant Weakness", "Proposes Impact Level 2 hosting with Impact Level 5 deferred 12 months, and no RMF or ATO approach"),
        ("technical", "Weakness", "Extraction accuracy measured only on commercial airline maintenance logs, not Army records"),
        ("pastPerformance", "Weakness", "Marginal CPARS schedule rating on the one relevant reference"),
    ],
}

OFFERORS = {
    "SENTRYLINE": {
        "solicitation": SOLICITATION_ID,
        "name": "Sentryline Defense Group LLC",
        "uei": "SL7D3K9Q2WV5", "cage": "8SDG2",
        "address": "4600 Fairfax Dr, Suite 900, Arlington, VA 22203",
        "signatory": "Marcus Delacroix, Chief Executive Officer",
        "technical": [
            ("1. Maintenance Record Digitization and Data Extraction", [
                "Sentryline will digitize and extract every Army equipment maintenance record — DA Form 2404 inspection worksheets, DA Form 5988-E maintenance requests and the DA Form 2408 logbook series — through a single intake pipeline that combines layout-aware classification with field-level extraction.",
                "On our current Army Materiel Command maintenance records pilot, the pipeline processed 2.1 million records from four depots with 96 percent field-level extraction accuracy. Records below the confidence threshold go to an Army maintenance clerk with the uncertain fields highlighted, and every correction retrains the model the following week.",
                "Each extracted value keeps a link to the page it came from, so a maintenance supervisor can see exactly where a fault, part number or hour reading was recorded.",
            ]),
            ("2. GCSS-Army Integration and Readiness Reporting", [
                "Extracted records post to GCSS-Army in real time through the approved interface, so equipment status and open faults reach unit readiness reports the same day they are recorded.",
                "Maintenance officers see a live dashboard of open faults, parts on order and deadlined equipment by unit and installation. On the pilot, the time from a recorded fault to its appearance in readiness reporting fell from 6 days to under 1.",
            ]),
            ("3. Cybersecurity and Risk Management Framework Compliance", [
                "The solution runs today in a DoD Impact Level 5 environment with an existing Authority to Operate under the Risk Management Framework, which this effort will inherit, and meets DFARS 252.204-7012 for safeguarding covered defense information.",
                "Sentryline holds CMMC Level 2 certification. Continuous monitoring feeds the Army's cybersecurity service provider, and every release passes automated security scanning before deployment.",
            ]),
        ],
        "management": [
            ("1. Key Personnel", [
                "Program Manager Danielle Rourke (PMP, 18 years, retired Army maintenance officer) leads our Army Materiel Command pilot. Solution Architect Priyanka Desai (14 years) designed the pilot's extraction pipeline.",
                "Both key personnel are current Sentryline employees, hold active Top Secret clearances and are committed full time from contract award.",
            ]),
            ("2. Transition-In Plan", [
                "Sentryline will complete transition-in within 45 days of award, ahead of the required 60: knowledge transfer in days 1 to 20, parallel operations in days 21 to 40, and full assumption of responsibility by day 45.",
            ]),
            ("3. Staffing and Security Clearances", [
                "Ninety-two percent of the proposed staff are current Sentryline employees, and all of them hold active Secret clearances. Our annual retention rate across defense programs is 91 percent.",
            ]),
        ],
        "pastPerformance": [
            ("Reference 1 — AMC Maintenance Records Pilot (W911QX24C0087)", [
                "Value $13.6M, period 2024–present. Digitization and data extraction for depot maintenance records. CPARS 2025: Exceptional in quality and schedule.",
            ]),
            ("Reference 2 — Marine Corps Logistics Data Integration (M67854-22-C-0311)", [
                "Value $9.4M, period 2022–2025. Logistics data integration with the Marine Corps supply system. CPARS final: Very Good.",
            ]),
            ("Reference 3 — Air Force Aircraft Records Digitization (FA8732-22-F-0146)", [
                "Value $6.2M, period 2022–2024. Digitization of aircraft maintenance forms. CPARS final: Very Good.",
            ]),
        ],
        "price": {"0001": 7900000, "0002": 4450000, "0003": 2950000, "0004": 1600000},
    },
    "CORVANE": {
        "solicitation": SOLICITATION_ID,
        "name": "Corvane Digital Inc",
        "uei": "CV2N8R4T6JH1", "cage": "6CVD4",
        "address": "1200 Technology Dr, Suite 210, Huntsville, AL 35805",
        "signatory": "Elena Brandt, President",
        "technical": [
            ("1. Maintenance Record Digitization and Data Extraction", [
                "Corvane will capture maintenance records with template-based optical character recognition. Our template library covers DA Form 2404 inspection worksheets.",
                "DA Form 5988-E printouts and DA Form 2408 logbooks will be transcribed by hand by Corvane data entry staff at our Huntsville processing center, with a target turnaround of three business days.",
            ]),
            ("2. GCSS-Army Integration and Readiness Reporting", [
                "Extracted records are delivered to GCSS-Army in a nightly batch file transfer. Readiness reports reflect the previous day's records.",
                "Corvane will provide weekly summary reports of open faults by installation.",
            ]),
            ("3. Cybersecurity and Risk Management Framework Compliance", [
                "Corvane will host the solution in a DoD Impact Level 5 environment and support the Government through the Risk Management Framework assessment, targeting an Authority to Operate within nine months of award. Corvane meets DFARS 252.204-7012.",
            ]),
        ],
        "management": [
            ("1. Key Personnel", [
                "Program Manager Russell Kane (PMP, 10 years) is a current Corvane employee with an active Secret clearance, committed full time. Corvane will recruit the Solution Architect after award.",
            ]),
            ("2. Transition-In Plan", [
                "Corvane will complete transition-in within 30 days of award by assigning its existing Huntsville processing team to the effort on day one.",
            ]),
            ("3. Staffing and Security Clearances", [
                "Sixty percent of the proposed staff are current employees with Secret clearances; Corvane will hire the remaining 40 percent after award and sponsor their clearances.",
            ]),
        ],
        "pastPerformance": [
            ("Reference 1 — Army Aviation Logbook Scanning (W58RGZ-20-F-0219)", [
                "Value $5.8M, period 2020–2024. Scanning and indexing of aviation maintenance logbooks. CPARS final: Very Good.",
            ]),
            ("Reference 2 — State of Alabama DMV Records Conversion (AL-DMV-2022-08)", [
                "Value $3.1M, period 2022–present. Reference reports satisfactory performance.",
            ]),
        ],
        "price": {"0001": 6500000, "0002": 3600000, "0003": 2500000, "0004": 1400000},
    },
    "ASHGROVE": {
        "solicitation": SOLICITATION_ID,
        "name": "Ashgrove Mission Systems Corp",
        "uei": "AG5M1S8X3PZ6", "cage": "4AMS9",
        "address": "7900 Westpark Dr, Suite 600, McLean, VA 22102",
        "signatory": "Victor Han, Chief Operating Officer",
        "technical": [
            ("1. Maintenance Record Digitization and Data Extraction", [
                "Ashgrove's machine learning extractor identifies the form type and extracts fault, part and hour data from scanned and digital maintenance records.",
                "On a benchmark of commercial airline maintenance logs, the extractor achieved 90 percent field-level accuracy. Ashgrove will tune the model on Army records during the first six months of performance.",
            ]),
            ("2. GCSS-Army Integration and Readiness Reporting", [
                "Ashgrove posts extracted records to GCSS-Army through the approved interface. Its predictive maintenance model reads the extracted history and flags likely part failures 30 days ahead, so units can order parts before equipment is deadlined.",
                "Maintenance officers can review each prediction with the records behind it, and every override is logged.",
            ]),
            ("3. Cybersecurity and Risk Management Framework Compliance", [
                "Ashgrove will host the solution in its commercial cloud at Impact Level 2 and plans to move to an Impact Level 5 environment within 12 months of award. Accreditation will be addressed with the Government after the move.",
            ]),
        ],
        "management": [
            ("1. Key Personnel", [
                "Program Manager Lauren Whitaker (PMP, 21 years) and Solution Architect Daniel Osei (12 years) are current Ashgrove employees with active Secret clearances, committed full time from award.",
            ]),
            ("2. Transition-In Plan", [
                "Ashgrove will complete transition-in within 60 days of award through a phased handover of each depot.",
            ]),
            ("3. Staffing and Security Clearances", [
                "Ashgrove will staff the effort from its defense logistics practice, where all staff hold Secret clearances, and backfill through its recruiting team. Annual retention across the practice is 86 percent.",
            ]),
        ],
        "pastPerformance": [
            ("Reference 1 — Navy Ship Maintenance Data Support (N00024-22-F-4473)", [
                "Value $7.9M, period 2022–present. Maintenance data analytics for surface ships. CPARS 2025: Satisfactory in quality, Marginal in schedule.",
            ]),
            ("Reference 2 — Commercial Airline Predictive Maintenance", [
                "Value $2.6M, period 2023–present. Predictive maintenance analytics for a commercial airline fleet. Reference reports satisfactory performance.",
            ]),
        ],
        "price": {"0001": 7250000, "0002": 4100000, "0003": 2650000, "0004": 1500000},
    },
}

# SSRefVendor rows (the compliance robot's SAM, exclusion and FAPIIS reference); all three are clean.
VENDOR_REF = {
    "SENTRYLINE": dict(SamStatus="Active", RegistrationExpiry="2027-08-31", Exclusion=False, FapiisRecords="None",
                       cpars=[("W911QX24C0087", "Exceptional", 2025), ("M67854-22-C-0311", "Very Good", 2025)]),
    "CORVANE": dict(SamStatus="Active", RegistrationExpiry="2027-04-12", Exclusion=False, FapiisRecords="None",
                    cpars=[("W58RGZ-20-F-0219", "Very Good", 2024)]),
    "ASHGROVE": dict(SamStatus="Active", RegistrationExpiry="2027-07-19", Exclusion=False, FapiisRecords="None",
                     cpars=[("N00024-22-F-4473", "Satisfactory", 2025)]),
}

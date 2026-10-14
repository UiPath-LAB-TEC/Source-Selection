"""Synthetic proposal content for the two demo solicitations.

Every offeror, person, contract number and UEI here is fictional. Each offeror has
planted discriminators (noted in PLANTED) so agent drafts and tests have a known
answer key.
"""

SOLICITATIONS = {
    "FA8771-27-R-0012": {
        "title": "Enterprise IT Modernization Services",
        "agency": "Department of the Air Force",
    },
    "75N910-27-R-0044": {
        "title": "Research Data Platform and Analytics Support",
        "agency": "Department of Health and Human Services — National Institutes of Health",
    },
}

# Answer key: what an evaluator (and the agent) should find, with the volume it lives in.
PLANTED = {
    "APEX": [
        ("management", "Strength", "Transition-in completed in 45 days, ahead of the required 60"),
        ("management", "Strength", "Key personnel are current employees committed full time from award"),
        ("technical", "Significant Strength", "Automated migration factory with measured 4-day mean migration time per application"),
        ("technical", "Strength", "Continuous ATO via automated control evidence feeding eMASS"),
        ("pastPerformance", "Strength", "Two Exceptional CPARS on similar Air Force cloud migrations"),
        ("price", "Risk", "Total price about 4.6% above the IGCE"),
    ],
    "NORTHSTAR": [
        ("technical", "Strength", "Rehearsed cutover runbook for every move group"),
        ("management", "Risk", "60 percent of staff to be recruited after award"),
        ("pastPerformance", "Strength", "Very Good CPARS quality rating on a comparable Navy cloud hosting effort"),
        ("technical", "Weakness", "Silent on continuous ATO monitoring after initial authorization"),
        ("management", "Weakness", "Transition-in plan takes 90 days against the required 60"),
        ("price", "Risk", "CLIN 0005 priced far below the IGCE line (potentially unbalanced)"),
    ],
    "CIVICWORKS": [
        ("technical", "Weakness", "Continuous monitoring limited to quarterly vulnerability scans"),
        ("management", "Strength", "Transition-in plan meets the required 60 days"),
        ("technical", "Weakness", "Manual lift-and-shift with no legacy application rationalization approach"),
        ("pastPerformance", "Significant Weakness", "FAPIIS termination for default on a 2023 state IT contract"),
    ],
    "HELIX": [
        ("technical", "Strength", "Compute scales to zero between analyses to control cost"),
        ("pastPerformance", "Strength", "Exceptional CPARS on National Cancer Institute data commons operations"),
        ("technical", "Significant Strength", "Controlled-access data enclave with dbGaP-aligned access workflow"),
        ("management", "Strength", "Chief Data Architect with 14 years of NIH research platform experience, committed full time"),
    ],
    "LUMINA": [
        ("technical", "Risk", "Platform authorized at FedRAMP Moderate; FedRAMP High pending within 12 months"),
        ("pastPerformance", "Strength", "Very Good CPARS on VA Million Veteran Program analytics"),
        ("management", "Risk", "Chief Data Architect is a contingent hire with no signed letter of commitment"),
        ("technical", "Strength", "Notebook-based self-service analytics with governed cohort builder"),
    ],
    "NORTHBRIDGE": [
        ("technical", "Weakness", "Researcher analytics limited to nightly dashboards requested through a ticket queue"),
        ("management", "Strength", "Both key personnel are current employees with signed letters of commitment"),
        ("pastPerformance", "Weakness", "Single reference of limited size and relevance"),
        ("technical", "Significant Weakness", "No approach for controlled-access human-subjects data"),
        ("compliance", "Responsibility concern", "SAM registration expired before proposal due date"),
    ],
}

OFFERORS = {
    # ------------------------------------------------------------------ DoD
    "APEX": {
        "solicitation": "FA8771-27-R-0012",
        "name": "Apex Mission Systems LLC",
        "uei": "QX7F3K8L9MP2", "cage": "8AXM4",
        "address": "4100 Fairfax Ridge Pkwy, Suite 600, Fairfax, VA 22033",
        "signatory": "Dana Whitcomb, Chief Executive Officer",
        "technical": [
            ("1. Cloud Migration Methodology", [
                "Apex will migrate the 140 mission applications in the Air Force cloud environment through our Migration Factory, a repeatable pipeline that discovers, assesses, refactors and cuts over each application in waves of 12 to 15 applications.",
                "The factory begins with automated discovery: dependency mapping agents run for 14 days against each application enclave and produce a migration blueprint covering data flows, ports, identities and integration points. Blueprints are peer reviewed by the Government product owner before a wave is scheduled.",
                "On our current Air Force Materiel Command migration task order, the factory has moved 61 applications with a measured mean migration time of 4 days per application from cutover rehearsal to production, and zero unplanned Sev-1 outages in the last 9 months.",
                "Each wave ends with a hypercare period of 10 business days in which the original application team and Apex site reliability engineers share an on-call rotation.",
            ]),
            ("2. Cybersecurity and Continuous ATO", [
                "Apex designs every migrated application to inherit controls from the Air Force cloud platform authorization and documents the remaining application-level controls in eMASS before cutover.",
                "After initial authorization, Apex maintains a continuous ATO. Automated control evidence collectors run daily, push results to eMASS, and open findings in the program's risk register within 24 hours of detection. The authorizing official receives a monthly control health summary.",
                "Container images are rebuilt weekly from hardened Iron Bank bases, scanned in the pipeline, and blocked from promotion on any critical vulnerability.",
            ]),
            ("3. Legacy Application Rationalization", [
                "Before migration, Apex scores every application on mission value, technical health and cost to run using the TIME model (tolerate, invest, migrate, eliminate). The rationalization board, chaired by the Government, decides the disposition of each application.",
                "On comparable programs this step retired or consolidated 18 to 22 percent of the portfolio before migration, avoiding the cost of moving applications with no remaining mission owner.",
            ]),
        ],
        "management": [
            ("1. Staffing and Key Personnel", [
                "Program Manager Marisol Ortega (PMP, 17 years) currently leads Apex's Air Force Materiel Command migration program of 85 staff. Cloud Architect Devin Park (AWS and Azure professional certifications, 12 years) is the technical authority for the factory.",
                "Both key personnel are current Apex employees and are committed full time from contract award.",
            ]),
            ("2. Transition-In Plan", [
                "Apex will complete transition-in within 45 days of award: knowledge transfer and shadowing in days 1 to 20, joint operations in days 21 to 40, and full assumption of responsibility by day 45, ahead of the required 60 days.",
            ]),
            ("3. Risk Management", [
                "Apex maintains a weekly risk review with the Government program office. Risks are scored on likelihood and impact, assigned an owner, and tracked to closure in a shared register.",
            ]),
        ],
        "pastPerformance": [
            ("Reference 1 — Air Force Materiel Command Application Migration (FA8730-22-F-0141)", [
                "Value $31.2M, period 2022–present. Migration of 61 applications to Air Force cloud environments. CPARS 2024 and 2025: Exceptional in quality, schedule and management.",
            ]),
            ("Reference 2 — Space Systems Command DevSecOps Platform (FA8807-21-C-0077)", [
                "Value $18.4M, period 2021–2025. Platform engineering and continuous ATO for 22 mission applications. CPARS 2025: Exceptional in quality, Very Good in cost control.",
            ]),
            ("Reference 3 — Defense Health Agency Hosting Consolidation (HT0011-20-F-0310)", [
                "Value $9.7M, period 2020–2023. Consolidation of three data centers. CPARS final: Very Good.",
            ]),
        ],
        "price": {"0001": 9450000, "0002": 6380000, "0003": 4520000, "0004": 2690000, "0005": 1860000},
    },
    "NORTHSTAR": {
        "solicitation": "FA8771-27-R-0012",
        "name": "Northstar Digital Partners Inc",
        "uei": "J7R4N2KB8YZ1", "cage": "6NDP2",
        "address": "1200 Wilson Blvd, Suite 900, Arlington, VA 22209",
        "signatory": "Lee Hargrove, President",
        "technical": [
            ("1. Cloud Migration Methodology", [
                "Northstar applies a six-phase migration lifecycle — assess, plan, build, test, cut over and optimize — tailored to each application's architecture.",
                "Assessment uses interviews with application owners and automated inventory scans. Applications are grouped into move groups by shared dependencies, and each move group follows a rehearsed cutover runbook.",
                "Northstar has migrated more than 200 workloads across federal civilian and defense customers, with an average move-group duration of six weeks.",
            ]),
            ("2. Cybersecurity and Authorization", [
                "Northstar's security engineers prepare the application security package, map inherited controls from the platform authorization, and support the authorizing official through the assessment and authorization process for each application.",
                "Our team includes Certified Information Systems Security Professionals who have supported more than 40 Air Force authorization packages to an initial ATO decision.",
            ]),
            ("3. Legacy Application Rationalization", [
                "Northstar will conduct a portfolio review in the first 90 days that recommends a disposition for each application: rehost, replatform, refactor, replace or retire.",
            ]),
        ],
        "management": [
            ("1. Staffing and Key Personnel", [
                "Program Manager Ray Castellanos (PMP, 11 years) and Lead Architect Priya Raman (14 years) are committed to this effort. Northstar will recruit the remaining 60 percent of staff after award.",
            ]),
            ("2. Transition-In Plan", [
                "Northstar proposes a phased transition-in completed within 90 days of award, which allows time to recruit and clear the remaining staff before assuming full responsibility.",
            ]),
            ("3. Risk Management", [
                "Northstar tracks risks in a monthly report to the contracting officer's representative.",
            ]),
        ],
        "pastPerformance": [
            ("Reference 1 — Department of the Navy Cloud Hosting (N00039-22-F-0218)", [
                "Value $14.1M, period 2022–present. Hosting and migration for 48 Navy business applications. CPARS 2025: Very Good in quality, Satisfactory in schedule.",
            ]),
            ("Reference 2 — Department of Agriculture Data Center Exit (12314423F0042)", [
                "Value $8.8M, period 2023–2025. CPARS final: Satisfactory.",
            ]),
        ],
        "price": {"0001": 8990000, "0002": 6020000, "0003": 4210000, "0004": 2880000, "0005": 300000},
    },
    "CIVICWORKS": {
        "solicitation": "FA8771-27-R-0012",
        "name": "CivicWorks Technologies Corp",
        "uei": "W9T2P6HC4LM8", "cage": "3CWT7",
        "address": "88 Commerce Square, Dayton, OH 45402",
        "signatory": "Morgan Ellery, Chief Operating Officer",
        "technical": [
            ("1. Cloud Migration Methodology", [
                "CivicWorks will rehost each application to the Air Force cloud environment using a lift-and-shift approach that preserves the current architecture and minimizes change to the application teams.",
                "Our engineers manually rebuild each server in the target environment, copy application data during a scheduled maintenance window, and validate with the application owner before decommissioning the source.",
                "CivicWorks expects to complete migrations at a pace of six to eight applications per month.",
            ]),
            ("2. Cybersecurity and Continuous ATO", [
                "CivicWorks will maintain each application's existing security controls in the new environment and support continuous monitoring through quarterly vulnerability scans reported to the information system security manager.",
            ]),
            ("3. Legacy Application Rationalization", [
                "CivicWorks will migrate all 140 applications as currently configured so the Government can make rationalization decisions after the migration is complete.",
            ]),
        ],
        "management": [
            ("1. Staffing and Key Personnel", [
                "Program Manager Alex Brennan (9 years) leads a team drawn from CivicWorks' Dayton delivery center. Key personnel are current employees.",
            ]),
            ("2. Transition-In Plan", [
                "CivicWorks will complete transition-in within 60 days through an orientation period followed by joint operations.",
            ]),
            ("3. Risk Management", [
                "CivicWorks uses a risk log reviewed at monthly program management reviews.",
            ]),
        ],
        "pastPerformance": [
            ("Reference 1 — State of Ohio Agency Hosting Modernization (OH-DAS-2021-117)", [
                "Value $6.2M, period 2021–2023. Contract terminated for default in 2023 following missed migration milestones (recorded in FAPIIS). CivicWorks disputes the termination and states that delays were caused by state-furnished equipment.",
            ]),
            ("Reference 2 — Air Force Research Laboratory Help Desk (FA8650-22-C-1009)", [
                "Value $3.1M, period 2022–present. Tier 1 and Tier 2 help desk support. CPARS 2025: Satisfactory.",
            ]),
        ],
        "price": {"0001": 8100000, "0002": 5400000, "0003": 3800000, "0004": 2250000, "0005": 1350000},
    },
    # ------------------------------------------------------------------ HHS
    "HELIX": {
        "solicitation": "75N910-27-R-0044",
        "name": "Helix Research Technology LLC",
        "uei": "HR4T8V2NQ6KD", "cage": "9HRT1",
        "address": "6550 Rock Spring Dr, Suite 300, Bethesda, MD 20817",
        "signatory": "Dr. Simone Achebe, Chief Executive Officer",
        "technical": [
            ("1. Data Platform Architecture", [
                "Helix proposes a FedRAMP High research data platform built on a lakehouse architecture with separate zones for raw, curated and analysis-ready data, and with compute that scales to zero between analyses to control cost.",
                "All datasets are registered in a searchable catalog with lineage from source instrument or study to every derived table.",
            ]),
            ("2. Privacy and Controlled-Access Data Protection", [
                "Controlled-access human-subjects data is held in a separate enclave. Access follows a dbGaP-aligned workflow: a researcher requests a dataset, the data access committee approves the request, and the platform issues time-bound, purpose-limited access that expires automatically.",
                "No controlled-access data can be exported from the enclave; results leave only after automated disclosure review and, where required, a human privacy officer check.",
            ]),
            ("3. Researcher Self-Service Analytics", [
                "Researchers use managed notebooks and a no-code cohort builder against analysis-ready data, with shared, versioned environments so analyses are reproducible.",
            ]),
        ],
        "management": [
            ("1. Program Manager", [
                "Program Manager Jonah Feld (PMP, 15 years) led a 60-person NIH research IT program from 2019 to 2025.",
            ]),
            ("2. Chief Data Architect", [
                "Chief Data Architect Dr. Wen Liu has 14 years of NIH research platform experience, including the architecture of an institute-wide genomic data commons. Dr. Liu is a current Helix employee committed full time to this effort.",
            ]),
            ("3. Commitment and Availability", [
                "Both key personnel have signed letters of commitment, attached in Appendix A.",
            ]),
        ],
        "pastPerformance": [
            ("Reference 1 — National Cancer Institute Data Commons Operations (75N91019F00133)", [
                "Value $11.8M, period 2019–2024. CPARS final: Exceptional in quality, Very Good in schedule.",
            ]),
            ("Reference 2 — CDC Surveillance Data Platform (75D30122C14012)", [
                "Value $7.4M, period 2022–present. CPARS 2025: Very Good.",
            ]),
        ],
        "price": {"0001": 6400000, "0002": 3980000, "0003": 3020000, "0004": 2400000},
    },
    "LUMINA": {
        "solicitation": "75N910-27-R-0044",
        "name": "Lumina Health Data Inc",
        "uei": "LH9M3C7RT2WE", "cage": "7LHD4",
        "address": "300 Main St, Suite 1100, Cambridge, MA 02142",
        "signatory": "Rafael Okoro, Chief Executive Officer",
        "technical": [
            ("1. Data Platform Architecture", [
                "Lumina will deploy its research data platform, already authorized at FedRAMP Moderate, and will pursue FedRAMP High authorization within 12 months of award.",
                "The platform separates storage and compute and provides a governed data catalog with dataset-level access policies.",
            ]),
            ("2. Privacy and Controlled-Access Data Protection", [
                "Controlled-access data is protected by role-based access controls and encryption at rest and in transit. Access requests are approved by the data steward in the platform's workflow.",
            ]),
            ("3. Researcher Self-Service Analytics", [
                "Researchers build cohorts with a governed, point-and-click cohort builder and analyze them in notebook workspaces that capture code, data versions and results for reproducibility.",
            ]),
        ],
        "management": [
            ("1. Program Manager", [
                "Program Manager Erin Vasquez (12 years) currently manages Lumina's federal health portfolio.",
            ]),
            ("2. Chief Data Architect", [
                "Lumina has identified Dr. Kamal Iyer as Chief Data Architect. Dr. Iyer is not currently a Lumina employee; Lumina expects to extend an offer of employment upon contract award.",
            ]),
            ("3. Commitment and Availability", [
                "A signed letter of commitment from the Program Manager is attached. A letter of intent from Dr. Iyer will be provided after award.",
            ]),
        ],
        "pastPerformance": [
            ("Reference 1 — VA Million Veteran Program Analytics (36C10B22F0291)", [
                "Value $9.1M, period 2022–present. CPARS 2025: Very Good.",
            ]),
            ("Reference 2 — FDA Real-World Evidence Pilot (75F40123P00412)", [
                "Value $2.3M, period 2023–2024. CPARS final: Satisfactory.",
            ]),
        ],
        "price": {"0001": 5600000, "0002": 3500000, "0003": 2700000, "0004": 2100000},
    },
    "NORTHBRIDGE": {
        "solicitation": "75N910-27-R-0044",
        "name": "NorthBridge Clinical Analytics LLC",
        "uei": "NB2K6X9PQ4TA", "cage": "5NBC8",
        "address": "2 Penn Center, Suite 400, Philadelphia, PA 19102",
        "signatory": "Hannah Reyes, Managing Partner",
        "technical": [
            ("1. Data Platform Architecture", [
                "NorthBridge will provide a centralized data warehouse hosted in a commercial cloud region, loaded nightly from institute source systems.",
            ]),
            ("2. Privacy and Data Protection", [
                "All platform users authenticate with agency single sign-on and data is encrypted at rest. NorthBridge will follow NIH policies as directed by the contracting officer's representative.",
            ]),
            ("3. Researcher Self-Service Analytics", [
                "Researchers will receive standard dashboards for each program, refreshed nightly, and can request new dashboards through a ticket queue.",
            ]),
        ],
        "management": [
            ("1. Program Manager", [
                "Program Manager Chris Abbott (10 years) leads NorthBridge's clinical analytics practice.",
            ]),
            ("2. Chief Data Architect", [
                "Chief Data Architect Sam Patel (11 years) is a current employee committed full time.",
            ]),
            ("3. Commitment and Availability", [
                "Signed letters of commitment for both key personnel are attached.",
            ]),
        ],
        "pastPerformance": [
            ("Reference 1 — Commonwealth Health Department Analytics (PA-DOH-2022-31)", [
                "Value $4.4M, period 2022–present. Reference reports satisfactory performance.",
            ]),
        ],
        "price": {"0001": 5100000, "0002": 3200000, "0003": 2500000, "0004": 1900000},
    },
}

CLIN_LABELS = {
    "FA8771-27-R-0012": {
        "0001": "Application migration (140 applications)",
        "0002": "Platform engineering and DevSecOps",
        "0003": "Cybersecurity and continuous ATO support",
        "0004": "Program management",
        "0005": "Transition-in and hypercare",
    },
    "75N910-27-R-0044": {
        "0001": "Platform build and operations",
        "0002": "Data engineering and curation",
        "0003": "Researcher analytics support",
        "0004": "Program management",
    },
}


# ---------------------------------------------------------------------------------------------------- Army (awarded demo)
# A fourth package so the workspace can hold a completed, awarded evaluation that differs from the others. Keystone has
# the strongest technical and past performance at a modest premium; Ironwood is cheaper but weaker on disconnected
# operations; Bluestem is cheapest with a manual approach and an unbalanced transition CLIN.
SOLICITATIONS["W52P1J-27-R-0023"] = {
    "title": "Army Logistics Data Analytics Platform",
    "agency": "Department of the Army",
}

PLANTED.update({
    "KEYSTONE": [
        ("technical", "Significant Strength", "Predictive maintenance models validated on 3 years of Army ground-fleet data, cutting unscheduled maintenance 18 percent"),
        ("technical", "Strength", "Bidirectional GCSS-Army integration already authorized under an Army RMF package"),
        ("management", "Strength", "Key personnel are current employees committed full time from award"),
        ("pastPerformance", "Strength", "Exceptional CPARS on an Army Materiel Command readiness analytics effort"),
        ("price", "Risk", "Total price about 6 percent above the IGCE"),
    ],
    "IRONWOOD": [
        ("technical", "Strength", "Standard data model that maps GCSS-Army and legacy STAMIS feeds"),
        ("technical", "Weakness", "No approach for units operating disconnected or with intermittent network access"),
        ("management", "Strength", "Transition-in completed in 45 days against the required 60"),
        ("pastPerformance", "Strength", "Very Good CPARS on a Defense Logistics Agency analytics effort"),
    ],
    "BLUESTEM": [
        ("technical", "Significant Weakness", "Readiness reports built from manual monthly data pulls rather than automated feeds"),
        ("technical", "Weakness", "RMF approach defers control implementation to after award"),
        ("management", "Weakness", "Program manager is a contingent hire"),
        ("pastPerformance", "Weakness", "References are commercial and of limited relevance to Army logistics"),
        ("price", "Risk", "CLIN 0005 transition-in priced 70 percent above the IGCE (potentially unbalanced)"),
    ],
})

OFFERORS.update({
    "KEYSTONE": {
        "solicitation": "W52P1J-27-R-0023",
        "name": "Keystone Ridge Analytics LLC",
        "uei": "KR7D2M9QX4LB", "cage": "7KRA2",
        "address": "1200 Arsenal Way, Suite 410, Moline, IL 61265",
        "signatory": "Theresa Valdivia, President",
        "technical": [
            ("1. Predictive Maintenance Analytics", [
                "Keystone will deliver predictive maintenance models for ground vehicles and generators that forecast component failures 30 to 90 days ahead. The models were trained and validated on three years of Army ground-fleet maintenance history, and in a 2025 pilot with an Army sustainment brigade they cut unscheduled maintenance by 18 percent.",
                "Every model publishes its accuracy, drift and the data it was trained on to a model registry, so maintainers can see why a part was flagged before acting on it.",
            ]),
            ("2. Data Integration with GCSS-Army", [
                "The platform exchanges data with GCSS-Army in both directions through the Army's approved interface, and this integration is already authorized under an Army RMF package from our current task order. Legacy STAMIS feeds are mapped into the same data model during transition.",
                "Units that operate disconnected keep a local analytics node that synchronizes when the network returns, so forecasts remain available in the field.",
            ]),
            ("3. Cybersecurity and RMF", [
                "Keystone will inherit controls from the Army cloud environment and implement the remaining controls before the platform carries production data, with continuous monitoring evidence fed to eMASS.",
            ]),
        ],
        "management": [
            ("1. Staffing and Key Personnel", [
                "Program Manager Daniel Okonjo (PMP, 16 years) and Lead Data Scientist Dr. Hana Petrov are current Keystone employees committed full time from the date of award.",
            ]),
            ("2. Transition-In", [
                "Transition-in completes in 55 days, within the required 60, with the incumbent's open work orders migrated in the first two weeks.",
            ]),
            ("3. Quality Control", [
                "A monthly quality review with the COR covers forecast accuracy, data latency and open defects, with corrective actions tracked to closure.",
            ]),
        ],
        "pastPerformance": [
            ("Reference 1 — AMC Readiness Analytics (W15QKN-22-F-0187)", [
                "Value $14.2M, period 2022–present. CPARS 2024 and 2025: Exceptional in quality and schedule.",
            ]),
            ("Reference 2 — Army Sustainment Brigade Predictive Maintenance Pilot (W56HZV-24-P-0091)", [
                "Value $2.9M, period 2024–2025. CPARS final: Very Good.",
            ]),
        ],
        "price": {"0001": 7900000, "0002": 4850000, "0003": 3450000, "0004": 2000000, "0005": 1100000},
    },
    "IRONWOOD": {
        "solicitation": "W52P1J-27-R-0023",
        "name": "Ironwood Federal Solutions Inc",
        "uei": "IW3T8F6NV2PC", "cage": "4IWF8",
        "address": "8300 Boone Blvd, Suite 500, Vienna, VA 22182",
        "signatory": "Marcus Lindqvist, Chief Executive Officer",
        "technical": [
            ("1. Predictive Maintenance Analytics", [
                "Ironwood will build failure-prediction models from GCSS-Army maintenance records using commercial machine learning services, retrained each quarter.",
            ]),
            ("2. Data Integration with GCSS-Army", [
                "A standard data model maps GCSS-Army and legacy STAMIS feeds into a single logistics view, refreshed every four hours.",
                "The platform runs in the Army cloud environment and assumes continuous network access for every unit that uses it.",
            ]),
            ("3. Cybersecurity and RMF", [
                "Ironwood will complete the RMF package within the first 120 days and maintain continuous monitoring through quarterly assessments.",
            ]),
        ],
        "management": [
            ("1. Staffing and Key Personnel", [
                "Program Manager Alicia Moreno (PMP, 12 years) is a current Ironwood employee. The Lead Data Scientist will be named within 30 days of award from our existing analytics practice.",
            ]),
            ("2. Transition-In", [
                "Transition-in completes in 45 days, ahead of the required 60, using a phased cutover by installation.",
            ]),
            ("3. Quality Control", [
                "Quality control follows Ironwood's ISO 9001 process, with monthly reports to the COR.",
            ]),
        ],
        "pastPerformance": [
            ("Reference 1 — DLA Supply Chain Analytics (SP4701-21-F-0332)", [
                "Value $9.6M, period 2021–2025. CPARS final: Very Good in quality and schedule.",
            ]),
            ("Reference 2 — Navy Maintenance Data Warehouse (N00104-23-C-0418)", [
                "Value $4.1M, period 2023–present. CPARS 2025: Satisfactory.",
            ]),
        ],
        "price": {"0001": 6700000, "0002": 4200000, "0003": 3000000, "0004": 1750000, "0005": 900000},
    },
    "BLUESTEM": {
        "solicitation": "W52P1J-27-R-0023",
        "name": "Bluestem Data Systems Corp",
        "uei": "BS5H1K7WR9ZE", "cage": "9BDS3",
        "address": "4700 W 135th St, Suite 210, Overland Park, KS 66224",
        "signatory": "Gordon Ashby, Managing Director",
        "technical": [
            ("1. Predictive Maintenance Analytics", [
                "Bluestem will produce monthly readiness and maintenance reports from data exported by unit logistics staff, with trend charts showing which vehicles had the most work orders in the previous month.",
            ]),
            ("2. Data Integration with GCSS-Army", [
                "Data will be pulled from GCSS-Army through monthly manual extracts and loaded into a reporting database.",
            ]),
            ("3. Cybersecurity and RMF", [
                "Bluestem will begin implementing RMF controls after award, once the Government provides the system categorization.",
            ]),
        ],
        "management": [
            ("1. Staffing and Key Personnel", [
                "The Program Manager will be hired after award; a contingent offer has been extended to a candidate with 8 years of experience.",
            ]),
            ("2. Transition-In", [
                "Transition-in completes in 60 days.",
            ]),
            ("3. Quality Control", [
                "A quarterly customer satisfaction survey will measure quality.",
            ]),
        ],
        "pastPerformance": [
            ("Reference 1 — Regional Trucking Fleet Reporting (commercial)", [
                "Value $1.2M, period 2023–present. Customer reference letter attached; no CPARS.",
            ]),
        ],
        "price": {"0001": 5900000, "0002": 3700000, "0003": 2600000, "0004": 1600000, "0005": 1700000},
    },
})

CLIN_LABELS["W52P1J-27-R-0023"] = {
    "0001": "Platform build and analytics operations",
    "0002": "Data integration and engineering",
    "0003": "Cybersecurity and RMF support",
    "0004": "Program management",
    "0005": "Transition-in",
}


# ---------------------------------------------------------------------------------------------------- K-12 (state & local demo)
# Two district RFPs scored with points out of 100, where the lowest total cost receives full cost points. On the SIS,
# Harborview is strongest (Ed-Fi certified reporting, summer cutover with a parallel run, four Excellent references) at a
# premium; Ironleaf is cheaper with a strong parent portal but a January go-live and thin migration detail; Kestrel is
# cheapest but relies on an unnamed add-on for special education, has one small reference and a front-loaded
# implementation item. On the LMS, Quillmark is strongest (audited WCAG 2.1 AA, LTI 1.3, OneRoster, offline app) at a
# premium; Brightfield is cheaper with good teacher tools but partial WCAG conformance; Tallpine is cheapest with no
# OneRoster support and higher-education references only.
SOLICITATIONS["WUSD-RFP-27-014"] = {
    "title": "Student Information System",
    "agency": "Willowmere Unified School District",
    "framework": "sled",
}
SOLICITATIONS["WUSD-RFP-27-009"] = {
    "title": "Learning Management System",
    "agency": "Willowmere Unified School District",
    "framework": "sled",
}

PLANTED.update({
    # ------------------------------------------------------------------ SIS (WUSD-RFP-27-014)
    "HARBORVIEW": [
        ("technical", "Significant Strength", "Ed-Fi certified state reporting with automated validation; every state submission at reference districts accepted on first filing"),
        ("technical", "Strength", "Special education, IEP and Section 504 management built into the core product"),
        ("management", "Significant Strength", "Summer cutover with a three-week parallel run before the first day of school"),
        ("management", "Strength", "Field-level data migration mapping with three trial conversions reconciled by the District"),
        ("pastPerformance", "Strength", "Four K-12 district references, all rated Excellent (5 of 5)"),
        ("price", "Risk", "Total price about 8 percent above the District's cost estimate"),
    ],
    "IRONLEAF": [
        ("technical", "Strength", "Parent and student portal with mobile app in 12 languages and real-time grade and attendance alerts"),
        ("technical", "Strength", "Gradebook supports both standards-based and traditional grading"),
        ("management", "Weakness", "January mid-year go-live; teachers and families change systems in the middle of the school year"),
        ("management", "Weakness", "Data migration approach gives no field mapping, trial conversions or validation steps"),
        ("pastPerformance", "Strength", "Two district references rated Very Good (4 of 5), both citing parent portal adoption"),
    ],
    "KESTREL": [
        ("technical", "Significant Weakness", "Special education and IEP management only through an unnamed third-party add-on, not part of the core product"),
        ("technical", "Strength", "Master scheduling engine with automated conflict resolution and section balancing"),
        ("management", "Weakness", "Training limited to train-the-trainer sessions for 20 District staff"),
        ("pastPerformance", "Weakness", "Single small reference (one 2,100-student district) of limited relevance"),
        ("price", "Risk", "Item 0002 implementation priced about 58 percent above the District's estimate (potentially unbalanced, front-loaded)"),
    ],
    # ------------------------------------------------------------------ LMS (WUSD-RFP-27-009)
    "QUILLMARK": [
        ("technical", "Significant Strength", "Independently audited WCAG 2.1 AA conformance report with no open Level A or AA issues"),
        ("technical", "Strength", "LTI 1.3 certified tool integration and automated OneRoster rostering from the District SIS"),
        ("technical", "Strength", "Offline mobile app lets students download coursework and submit work when reconnected"),
        ("management", "Strength", "99.9 percent uptime commitment during instructional hours backed by service credits"),
        ("pastPerformance", "Strength", "Three K-12 district references, two rated Excellent and one Very Good"),
        ("price", "Risk", "Total price about 5 percent above the District's cost estimate"),
    ],
    "BRIGHTFIELD": [
        ("technical", "Strength", "Strong teacher tools: reusable lesson templates, rubric grading and a standards-aligned item bank"),
        ("technical", "Significant Weakness", "Only partial WCAG 2.1 AA conformance; quiz player and discussion boards have known accessibility gaps"),
        ("technical", "Risk", "Accessibility remediation promised in a future release with no committed date"),
        ("management", "Strength", "Instructional coach on site at each school for the first semester"),
        ("pastPerformance", "Weakness", "Second reference rated Satisfactory and noted accessibility workarounds for students"),
    ],
    "TALLPINE": [
        ("technical", "Significant Weakness", "No OneRoster support; rosters loaded by manual CSV upload"),
        ("technical", "Strength", "Assessment engine with question banks, randomized forms and originality checking"),
        ("management", "Weakness", "Support desk staffed 8 a.m. to 5 p.m. Eastern only, with no evening coverage during homework hours"),
        ("pastPerformance", "Weakness", "References are from higher education only; no K-12 district experience"),
    ],
})

OFFERORS.update({
    # ------------------------------------------------------------------ SIS (WUSD-RFP-27-014)
    "HARBORVIEW": {
        "solicitation": "WUSD-RFP-27-014",
        "name": "Harborview Student Systems Inc",
        "uei": "HV6S2Q9TM4RB", "cage": "3HVS7",
        "address": "2250 Marina Crest Blvd, Suite 400, Tacoma, WA 98402",
        "signatory": "Celeste Navarro-Whitley, Chief Executive Officer",
        "technical": [
            ("1. State Reporting, Enrollment and Attendance", [
                "Harborview's state reporting is Ed-Fi certified and exchanges enrollment, attendance, discipline, course and staff data with the State's Ed-Fi ODS/API nightly. Automated validation checks every record against the state's business rules before submission, so errors are corrected at the school before a deadline rather than after. At our reference districts every state submission over the last three years was accepted on first filing.",
                "Attendance is taken by period or by day from the teacher's class list on any device. Unexcused absences trigger parent notifications within 15 minutes, and chronic absence dashboards flag students who have missed 10 percent or more of enrolled days.",
            ]),
            ("2. Scheduling, Gradebook and Special Education", [
                "The master scheduler builds secondary schedules from course requests, balances sections and resolves conflicts automatically, and counselors can run what-if scenarios before publishing. The gradebook supports standards-based and traditional grading and posts report cards and transcripts directly from teacher grades.",
                "Special education, IEP and Section 504 management are built into the core product, not a separate add-on. Case managers draft IEPs, schedule meetings, track service minutes and progress monitoring, and produce state special education child count reports from the same student record.",
            ]),
            ("3. Parent and Student Portal, Security and Privacy", [
                "Families use a single portal and mobile app, available in 14 languages, to view grades, attendance, schedules and fees and to complete annual registration online. Students see assignments and grades with the same sign-in, and the District's SSO/SAML identity provider is supported for staff and students.",
                "Student data is encrypted in transit and at rest, access is role-based down to the field level, and every change to a student record is logged. Harborview complies with FERPA and COPPA and will sign the District's student data privacy agreement without exceptions.",
            ]),
        ],
        "management": [
            ("1. Implementation and Data Migration", [
                "Harborview will cut over during the summer: data conversion and configuration run from March through June, the new system goes live on July 15, and the legacy system runs in parallel for three weeks so attendance, schedules and enrollment can be compared before the first day of school. No teacher or family changes systems during the school year.",
                "Data migration starts with a field-level mapping of the legacy system that District staff approve. We perform three trial conversions covering seven years of historical grades, attendance, transcripts and special education records, and each trial is reconciled with the District by record counts and sampled student files before the final load.",
            ]),
            ("2. Training and Change Management", [
                "Training is role-based: office staff, counselors, teachers and administrators receive hands-on sessions in June and August, supported by short videos and quick-reference guides. Each school names a site champion who receives an additional 12 hours of training and serves as first-line help through the first semester.",
            ]),
            ("3. Support and Service Levels", [
                "Support is available 6 a.m. to 8 p.m. Pacific on school days by phone, chat and web, with priority 1 issues answered within 30 minutes. Harborview commits to 99.9 percent uptime, backed by service credits, and hosts the system in U.S. data centers with nightly backups and a four-hour recovery time objective.",
            ]),
        ],
        "pastPerformance": [
            ("Reference 1 — Cedar Hollow Unified School District, CA (CHUSD-RFP-21-007)", [
                "Student information system for 24,500 students. Value $2.3M, period 2021–present. Summer 2021 cutover with a three-week parallel run; all state submissions accepted on first filing. Reference rating: Excellent (5 of 5).",
            ]),
            ("Reference 2 — Pinecrest County Public Schools, NC (PCPS-2022-118)", [
                "Student information system and special education module for 31,000 students. Value $2.9M, period 2022–present. Reference rating: Excellent (5 of 5).",
            ]),
            ("Reference 3 — Larkspur Valley School District, OR (LVSD-C-2023-04)", [
                "Student information system and Ed-Fi state reporting for 12,800 students. Value $1.4M, period 2023–present. Reference rating: Excellent (5 of 5).",
            ]),
            ("Reference 4 — Maple Bend Independent School District, TX (MBISD-RFP-22-031)", [
                "Student information system, parent portal and online registration for 18,200 students. Value $1.9M, period 2022–present. Reference rating: Excellent (5 of 5).",
            ]),
        ],
        "price": {"0001": 1510000, "0002": 265000, "0003": 175000, "0004": 642000},
    },
    "IRONLEAF": {
        "solicitation": "WUSD-RFP-27-014",
        "name": "Ironleaf EdSoft LLC",
        "uei": "IL8E4W2KD7NF", "cage": "6ILE4",
        "address": "815 Foundry Row, Suite 220, Columbus, OH 43215",
        "signatory": "Raymond Oduya, President",
        "technical": [
            ("1. State Reporting, Enrollment and Attendance", [
                "Ironleaf produces the State's required enrollment, attendance and discipline extracts from built-in report templates, which District staff run and upload to the state portal each reporting window. Attendance is taken by period or by day, and absence letters are generated automatically.",
            ]),
            ("2. Scheduling, Gradebook and Special Education", [
                "The scheduler builds secondary schedules from course requests with conflict checking. The gradebook supports both standards-based and traditional grading, with teacher-defined categories, weighting and rubrics that roll up to report cards.",
                "Special education case management covers IEP drafting, meeting scheduling and service tracking, with state child count extracts.",
            ]),
            ("3. Parent and Student Portal, Security and Privacy", [
                "Ironleaf's parent and student portal is our strongest feature. Families use a mobile app in 12 languages that shows real-time grades, assignments and attendance, sends alerts the moment an absence or low grade is posted, and lets parents message teachers, update contacts and pay fees. Students sign in with the District's SSO/SAML provider.",
                "Ironleaf complies with FERPA and COPPA, encrypts student data at rest and in transit, and will sign the District's student data privacy agreement.",
            ]),
        ],
        "management": [
            ("1. Implementation and Data Migration", [
                "Ironleaf proposes a January go-live at the start of the second semester. Configuration begins in September, and schools switch to the new system when students return from winter break, so teachers and families will move to the new system in the middle of the school year.",
                "Current-year student data will be migrated from the legacy system before go-live using Ironleaf's standard import tools. Historical data will be migrated as needed.",
            ]),
            ("2. Training and Change Management", [
                "Each school receives two days of on-site training in December, and recorded webinars are available on demand. A parent portal launch kit with flyers and videos in 12 languages helps schools drive family sign-ups.",
            ]),
            ("3. Support and Service Levels", [
                "Support is available 7 a.m. to 6 p.m. Eastern on weekdays, with priority 1 issues answered within one hour. Ironleaf commits to 99.5 percent uptime and hosts the system in U.S. data centers with daily backups.",
            ]),
        ],
        "pastPerformance": [
            ("Reference 1 — Fox Run Area School District, PA (FRASD-2023-012)", [
                "Student information system and parent portal for 9,600 students. Value $1.1M, period 2023–present. More than 85 percent of families activated portal accounts in the first year. Reference rating: Very Good (4 of 5).",
            ]),
            ("Reference 2 — Stonebrook Community Schools, MI (SCS-RFP-22-044)", [
                "Student information system for 14,300 students. Value $1.6M, period 2022–present. The reference praised parent portal adoption and noted that teachers needed extra support after the mid-year switch. Reference rating: Very Good (4 of 5).",
            ]),
        ],
        "price": {"0001": 1330000, "0002": 205000, "0003": 151000, "0004": 570000},
    },
    "KESTREL": {
        "solicitation": "WUSD-RFP-27-014",
        "name": "Kestrel Campus Data Corp",
        "uei": "KC3D9P5XH2VJ", "cage": "2KCD9",
        "address": "3900 Prairie Commons Dr, Suite 110, Lincoln, NE 68516",
        "signatory": "Philip Strand, Managing Director",
        "technical": [
            ("1. State Reporting, Enrollment and Attendance", [
                "Kestrel provides enrollment, daily and period attendance, and standard state reporting extracts that District staff export and submit through the state portal.",
            ]),
            ("2. Scheduling, Gradebook and Special Education", [
                "Kestrel's master scheduling engine resolves conflicts automatically and balances sections by size and gender, and counselors can compare several draft schedules side by side. The gradebook supports traditional grading with weighted categories.",
                "Special education and IEP management are not part of the core product. These functions are provided through a third-party special education add-on licensed separately; the partner will be identified after award.",
            ]),
            ("3. Parent and Student Portal, Security and Privacy", [
                "A web portal shows families grades and attendance in English and Spanish. Kestrel complies with FERPA and encrypts student data at rest.",
            ]),
        ],
        "management": [
            ("1. Implementation and Data Migration", [
                "Implementation runs over eight months with a summer go-live. Kestrel will migrate current-year and two prior years of student data from the legacy system.",
            ]),
            ("2. Training and Change Management", [
                "Training is limited to train-the-trainer sessions for 20 District staff, who will then train teachers and office staff at each school.",
            ]),
            ("3. Support and Service Levels", [
                "Support is available by email and web ticket on weekdays, with responses within one business day. Kestrel targets 99.5 percent uptime.",
            ]),
        ],
        "pastPerformance": [
            ("Reference 1 — Birch Hollow Elementary School District, MN (BHESD-2024-03)", [
                "Student information system for one 2,100-student elementary district. Value $240K, period 2024–present. Reference rating: Satisfactory (3 of 5).",
            ]),
        ],
        "price": {"0001": 1070000, "0002": 380000, "0003": 125000, "0004": 465000},
    },
    # ------------------------------------------------------------------ LMS (WUSD-RFP-27-009)
    "QUILLMARK": {
        "solicitation": "WUSD-RFP-27-009",
        "name": "Quillmark Learning Systems",
        "uei": "QM5L7R3NB8WT", "cage": "5QLS1",
        "address": "1440 Scholar Lane, Suite 500, Raleigh, NC 27601",
        "signatory": "Annika Sorensen-Hale, President",
        "technical": [
            ("1. Course Delivery and Assessment", [
                "Teachers build courses from units, lessons and assignments, share them across a grade level or department, and publish to multiple sections at once. Students see a single to-do list across classes, and families receive a weekly summary of upcoming and missing work.",
                "The assessment engine supports standards-aligned item banks, rubrics, auto-graded quizzes and teacher-scored work, and passes final grades back to the District SIS gradebook automatically.",
            ]),
            ("2. Accessibility and Mobile Access", [
                "Quillmark provides an independently audited WCAG 2.1 AA conformance report (VPAT) for the student and teacher experience, with no open Level A or AA issues. Screen readers, keyboard-only navigation, captioning and text-to-speech work throughout, including in quizzes and discussions.",
                "The offline mobile app lets students download coursework at school, complete it at home without internet, and submit work automatically when the device reconnects, which supports students without reliable home broadband.",
            ]),
            ("3. Interoperability and Rostering", [
                "Quillmark is LTI 1.3 certified, so the District's existing digital curriculum tools launch inside courses with single sign-on and grade return. Classes, enrollments and teachers are rostered automatically from the SIS through OneRoster 1.2 every night, and staff and students sign in through the District's SSO/SAML provider.",
                "Quillmark complies with FERPA and COPPA and will sign the District's student data privacy agreement.",
            ]),
        ],
        "management": [
            ("1. Implementation and Course Migration", [
                "Implementation runs from March to July so courses are ready before the school year starts. Quillmark will migrate existing course content, configure OneRoster rostering and LTI tools, and pilot with two schools in May.",
            ]),
            ("2. Training and Professional Development", [
                "A teacher-leader cohort of two staff per school receives 16 hours of training and then supports colleagues, backed by August workshops, on-demand courses and monthly office hours in the first year.",
            ]),
            ("3. Support and Service Levels", [
                "Support is available 6 a.m. to 10 p.m. Eastern on school days, covering homework hours, with priority 1 issues answered within 30 minutes. Quillmark commits to 99.9 percent uptime during instructional hours, backed by service credits.",
            ]),
        ],
        "pastPerformance": [
            ("Reference 1 — Riverton Heights Unified School District, AZ (RHUSD-RFP-22-019)", [
                "Learning management system for 27,000 students. Value $1.2M, period 2022–present. Reference rating: Excellent (5 of 5).",
            ]),
            ("Reference 2 — Ashgrove County Schools, GA (ACS-2021-207)", [
                "Learning management system with offline mobile app for 35,500 students. Value $1.6M, period 2021–present. Reference rating: Excellent (5 of 5).",
            ]),
            ("Reference 3 — Silver Lake Public Schools, WI (SLPS-C-2023-09)", [
                "Learning management system and OneRoster rostering for 11,400 students. Value $560K, period 2023–present. Reference rating: Very Good (4 of 5).",
            ]),
        ],
        "price": {"0001": 650000, "0002": 170000, "0003": 125000, "0004": 210000},
    },
    "BRIGHTFIELD": {
        "solicitation": "WUSD-RFP-27-009",
        "name": "Brightfield EdTech LLC",
        "uei": "BF2E8K6TC9QH", "cage": "8BFE6",
        "address": "620 Larkfield Ave, Suite 300, Boise, ID 83702",
        "signatory": "Jerome Castellanos, Chief Executive Officer",
        "technical": [
            ("1. Course Delivery and Assessment", [
                "Brightfield's teacher tools are designed to save planning time. Teachers start from reusable lesson templates, grade with rubrics on a single screen, and build quizzes from a standards-aligned item bank, and mastery reports show which students need reteaching.",
            ]),
            ("2. Accessibility and Mobile Access", [
                "Brightfield's current conformance report shows partial WCAG 2.1 AA conformance. The course pages and gradebook conform, but the quiz player and discussion boards have known gaps for screen reader and keyboard-only users.",
                "Brightfield will remediate these gaps in a future release, but we cannot commit to a date at this time. Until then, teachers can provide alternate formats for affected students on request. The mobile app requires an internet connection.",
            ]),
            ("3. Interoperability and Rostering", [
                "Brightfield supports LTI 1.3 tool launches and OneRoster rostering from the District SIS, and staff and students sign in through the District's SSO/SAML provider. Brightfield complies with FERPA and COPPA.",
            ]),
        ],
        "management": [
            ("1. Implementation and Course Migration", [
                "Implementation runs from April to August, with course content migrated by Brightfield and reviewed by department leads before the school year.",
            ]),
            ("2. Training and Professional Development", [
                "An instructional coach is on site at each school for the first semester, modeling lessons and coaching teachers in their own classrooms, in addition to August workshops.",
            ]),
            ("3. Support and Service Levels", [
                "Support is available 7 a.m. to 7 p.m. Mountain on weekdays, with priority 1 issues answered within one hour. Brightfield commits to 99.5 percent uptime.",
            ]),
        ],
        "pastPerformance": [
            ("Reference 1 — Hawthorne Valley School District, CO (HVSD-2023-027)", [
                "Learning management system for 16,000 students. Value $780K, period 2023–present. Reference rating: Very Good (4 of 5).",
            ]),
            ("Reference 2 — Elm Crossing Unified School District, NV (ECUSD-RFP-22-015)", [
                "Learning management system for 9,800 students. Value $510K, period 2022–2025. The reference noted that teachers relied on accessibility workarounds for students using screen readers. Reference rating: Satisfactory (3 of 5).",
            ]),
        ],
        "price": {"0001": 575000, "0002": 150000, "0003": 110000, "0004": 188000},
    },
    "TALLPINE": {
        "solicitation": "WUSD-RFP-27-009",
        "name": "Tallpine Academic Software Inc",
        "uei": "TP9A4S6MZ3GD", "cage": "1TAS5",
        "address": "77 Summit Ridge Rd, Suite 150, Burlington, VT 05401",
        "signatory": "Wendell Marsh, President",
        "technical": [
            ("1. Course Delivery and Assessment", [
                "Instructors build courses from modules and pages and publish them to sections. Tallpine's assessment engine supports large question banks, randomized test forms, timed exams and originality checking on written submissions.",
            ]),
            ("2. Accessibility and Mobile Access", [
                "Tallpine provides a WCAG 2.1 AA conformance report for its web interface. A mobile app is available for viewing course content and grades.",
            ]),
            ("3. Interoperability and Rostering", [
                "Tallpine supports LTI 1.3 tool launches and SSO/SAML sign-in. Tallpine does not support OneRoster; classes and enrollments are loaded by manual CSV upload, which District staff would prepare from the SIS and upload whenever schedules change.",
            ]),
        ],
        "management": [
            ("1. Implementation and Course Migration", [
                "Implementation takes 16 weeks, including site configuration, CSV roster templates and import of existing course files.",
            ]),
            ("2. Training and Professional Development", [
                "Administrator training is delivered online, and teachers have access to Tallpine's on-demand video library.",
            ]),
            ("3. Support and Service Levels", [
                "The support desk is staffed 8 a.m. to 5 p.m. Eastern on weekdays, with no evening coverage during homework hours. Tallpine commits to 99.5 percent uptime.",
            ]),
        ],
        "pastPerformance": [
            ("Reference 1 — Northgate Community College District, IL (NCCD-2022-0410)", [
                "Learning management system for 21,000 college students. Value $690K, period 2022–present. Reference rating: Very Good (4 of 5).",
            ]),
            ("Reference 2 — Eastbrook State University, KY (ESU-P-23-118)", [
                "Learning management system for continuing education programs. Value $420K, period 2023–present. Reference rating: Very Good (4 of 5). Tallpine has no current K-12 district customers.",
            ]),
        ],
        "price": {"0001": 535000, "0002": 130000, "0003": 105000, "0004": 176000},
    },
})

CLIN_LABELS["WUSD-RFP-27-014"] = {
    "0001": "Software subscription (5 years)",
    "0002": "Implementation and data migration",
    "0003": "Training and change management",
    "0004": "Support and hosting",
}
CLIN_LABELS["WUSD-RFP-27-009"] = {
    "0001": "Platform subscription (5 years)",
    "0002": "Implementation and course migration",
    "0003": "Training and professional development",
    "0004": "Support and hosting",
}

"""A fresh synthetic State & Local (K-12 school district) RFP for trying "New source selection" end to end in the workspace.

Separate from proposal_content.py and sample_content.py on purpose: seed.py and the demo snapshot never see it, so it can
be started from scratch as many times as needed (with a new RFP number each time, if wanted).
Every district, proposer, person, contract number and vendor ID here is fictional.
"""
import os

# An RFP number can be started only once, so the sample can be printed under a new one
# (a generator's --id option can set this, e.g. WUSD-RFP-27-022).
SOLICITATION_ID = os.environ.get("SLED_SAMPLE_SOLICITATION_ID", "WUSD-RFP-27-021")

SOLICITATIONS = {
    SOLICITATION_ID: {
        "title": "Student Transportation Routing and Fleet Management",
        "agency": "Willowmere Unified School District",
        "framework": "sled",
    },
}

# What the RFP cover page and instructions need (all fictional).
DISTRICT = {
    "name": "Willowmere Unified School District",
    "department": "Purchasing Department",
    "street": "410 Orchard Avenue",
    "city": "Willowmere, OR 97000",
    "contact": ("Dana Whitfield", "Procurement Officer", "(555) 010-2390", "dana.whitfield@willowmere-usd.example"),
    "issued": "September 22, 2026",
    "due": "2:00 PM Pacific, October 27, 2026",
    "preproposal": "10:00 AM Pacific, Thursday, October 1, 2026, Willowmere USD Transportation Center, 2150 Depot Road, Willowmere, OR 97000 (attendance optional)",
    "questions_due": "October 9, 2026",
    "board_meeting": "December 10, 2026",
    "first_day": "August 25, 2027",
    "students": 11800,
    "buses": 88,
    "routes": 64,
    "schools": 18,
}

# The RFP's Scope of Work section.
SCOPE = [
    f"Willowmere Unified School District serves about {DISTRICT['students']:,} students in {DISTRICT['schools']} schools across a "
    f"suburban and rural service area of about 240 square miles. The District's Transportation Department operates {DISTRICT['buses']} "
    f"buses on {DISTRICT['routes']} daily routes, 12 of which serve students whose individualized education programs (IEPs) require "
    "specialized transportation, and carries about 6,900 students each school day.",
    "Routes are planned today by hand in spreadsheets and paper maps, and rebuilding the routes each summer takes the District's routing "
    "coordinator about six weeks. Special education routes are planned by hand, one student at a time, to meet the door-to-door pickup, "
    "wheelchair lift, bus aide and maximum ride time requirements in students' IEPs. Buses have no real-time location tracking, so parents "
    "and schools phone dispatch when a bus is late, and the District has no reliable record of which students boarded or exited which bus.",
    f"The District seeks a hosted routing and fleet management system, with GPS and RFID hardware installed on all {DISTRICT['buses']} buses, "
    "that will: plan and optimize general education and special education routes, including transportation required under the Individuals "
    "with Disabilities Education Act (IDEA); show dispatchers each bus's location in real time and alert them to late or off-route buses; "
    "record each student's boarding and exiting with an RFID student card; and give parents and students a mobile app with live bus "
    "locations and stop arrival notifications in families' home languages.",
    "Student data must be protected in compliance with FERPA and COPPA, and the selected proposer, together with any subcontractor or "
    "third-party product that handles student data, must sign the District's student data privacy agreement. Student enrollment, addresses, "
    "schools and transportation eligibility must be imported from the District SIS through OneRoster or a nightly secure file, staff must "
    "sign in through the District's SSO/SAML identity provider, and parent and staff screens must conform to WCAG 2.1 AA.",
    f"The District plans to award at its {DISTRICT['board_meeting']} Board meeting. The system must be live, with routes converted, SIS "
    f"integration complete and hardware installed on every bus, before the first day of school on {DISTRICT['first_day']}, so implementation "
    "and go-live are expected during summer 2027. The contract has a three-year initial term with two optional one-year renewals.",
]

# The District's cost estimate by price item across the full five-year term; the wizard's first step reads these from the estimate PDF.
ESTIMATE = {"0001": 700000, "0002": 180000, "0003": 320000, "0004": 300000}
# The same estimate by year (Year 1 to Year 5: the 3-year initial term and both renewals). Year 1 carries the one-time
# implementation, route conversion and hardware costs; later years carry SIS integration upkeep and spare hardware.
ESTIMATE_PERIODS = {
    "0001": [132000, 136000, 140000, 144000, 148000],
    "0002": [150000, 7500, 7500, 7500, 7500],
    "0003": [288000, 8000, 8000, 8000, 8000],
    "0004": [80000, 55000, 55000, 55000, 55000],
}
assert all(sum(v) == ESTIMATE[k] for k, v in ESTIMATE_PERIODS.items())

# The State & Local evaluation plan (same shape as evaluation-plans/WUSD-RFP-27-014.json). "weight" is the factor's maximum points.
PLAN = {
    "solicitationId": SOLICITATION_ID,
    "title": "Student Transportation Routing and Fleet Management",
    "agency": "Willowmere Unified School District",
    "framework": "sled",
    "office": "Willowmere USD Purchasing Department",
    "contractType": "Firm fixed price, 3-year initial term with two optional 1-year renewals",
    "basisForAward": "Most advantageous proposal — highest total score out of 100 points",
    "ratingMethod": "points",
    "relativeImportance": "Proposals are scored out of 100 points: Routing, Tracking and Parent Communication 40, Implementation, Training "
                          "and Support 15, Experience and References 15, and Cost 30. Cost points are awarded by formula: the lowest total "
                          "five-year cost receives 30 points and each other proposal receives (lowest cost ÷ its cost) × 30.",
    "factors": [
        {"id": "T1", "name": "Routing, Tracking and Parent Communication", "order": 1, "scale": "technical", "volume": "technical", "weight": 40,
         "subfactors": ["Route planning and optimization, including special education and IDEA transportation",
                        "Real-time GPS fleet tracking and RFID student ridership",
                        "Parent and student app, stop arrival notifications and FERPA/COPPA privacy"],
         "criteria": "The District will evaluate how well the proposed system plans and optimizes general education and special education "
                     "routes, including the door-to-door, wheelchair lift, bus aide and ride time requirements of students whose IEPs require "
                     "transportation under IDEA; how often it reports each bus's real-time GPS location and whether it records student "
                     "boarding and exiting by RFID card; and how its parent and student app delivers stop arrival notifications in families' "
                     "home languages while protecting student data under FERPA and COPPA."},
        {"id": "T2", "name": "Implementation, Training and Support", "order": 3, "scale": "technical", "volume": "management", "weight": 15,
         "subfactors": ["Implementation schedule and route conversion", "Training for dispatchers, drivers and families",
                        "Support, service levels and uptime"],
         "criteria": "The District will evaluate the realism of the implementation schedule and its timing relative to the first day of "
                     "school, the plan for converting the District's current routes, stops and student assignments and integrating with the "
                     "District SIS through OneRoster or a nightly file, the training approach for dispatchers, drivers, bus aides and families, "
                     "and the proposed support hours, response times and uptime commitment."},
        {"id": "T3", "name": "Experience and References", "order": 3, "scale": "technical", "volume": "pastPerformance", "weight": 15,
         "subfactors": ["Recency", "Relevance to K-12 districts of similar size", "Reference ratings"],
         "criteria": "The District will evaluate the proposer's experience implementing student transportation routing and fleet tracking "
                     "systems in K-12 districts of similar size and complexity within the last five years, based on the references provided "
                     "and the ratings those districts give."},
        {"id": "PRICE", "name": "Cost", "order": 2, "evaluatedNotRated": True, "volume": "price", "weight": 30,
         "criteria": "The District will award cost points by formula on the total five-year cost, which is the sum of all four price items. "
                     "The lowest total five-year cost receives 30 points and each other proposal receives (lowest cost ÷ its cost) × 30. "
                     "The District will also review individual price items for balance against its cost estimate."},
    ],
    "scales": {
        "technical": ["Excellent", "Good", "Satisfactory", "Poor", "Unacceptable"],
        "confidence": ["Excellent", "Good", "Satisfactory", "Poor", "Unacceptable"],
    },
    "findingKinds": ["Strength", "Significant Strength", "Weakness", "Significant Weakness", "Deficiency", "Risk"],
    "panel": {
        "evaluators": [
            {"slot": 1, "title": "Evaluation Committee Member", "factors": ["T1", "T2"]},
            {"slot": 2, "title": "Evaluation Committee Member", "factors": ["T1", "T2"]},
            {"slot": 3, "title": "Evaluation Committee Member", "factors": ["T1", "T3"]},
        ],
    },
    "igce": {"total": sum(ESTIMATE.values()), "lines": dict(ESTIMATE)},
    "submission": {"volumes": ["technical", "management", "pastPerformance", "price"],
                   "pageLimits": {"technical": 30, "management": 15, "pastPerformance": 8}},
    "offerors": ["BRAMBLEWOOD", "COPPERLINE", "FAIRHAVEN"],
}

CLIN_LABELS = {
    SOLICITATION_ID: {
        "0001": "Routing and fleet software subscription (5 years)",
        "0002": "Implementation, route conversion and SIS integration",
        "0003": "GPS and RFID hardware and installation (88 buses)",
        "0004": "Training and support",
    },
}

# Answer key: what an evaluator (and the agent) should find. Copperline is strongest (IDEA route planner, 10-second GPS,
# RFID ridership, its own 9-language app, summer go-live after a July dry run, three Excellent references) at about 4 percent
# above the estimate; Fairhaven has good routing and dispatch tools but a third-party white-label parent app under its own
# privacy policy and 60-second GPS, at about 8 percent below; Bramblewood is cheapest at about 13 percent below, with no
# RFID ridership, special education routes still planned in a spreadsheet, an October go-live, two small rural references
# and a hardware item priced far below the estimate.
PLANTED = {
    "COPPERLINE": [
        ("technical", "Significant Strength", "Dedicated special education route planner enforces IEP transportation requirements under IDEA (door-to-door pickup, wheelchair lift, required bus aide, maximum ride time) as hard constraints"),
        ("technical", "Strength", "GPS bus locations update every 10 seconds, and RFID cards record every student boarding and exiting with time, stop and location"),
        ("technical", "Strength", "Copperline-built and operated parent app with stop arrival alerts in 9 languages, covered by the District's student data privacy agreement without exceptions"),
        ("management", "Significant Strength", "Summer go-live on August 2, 2027 after a full July dry run of every route, more than three weeks before the first day of school"),
        ("pastPerformance", "Strength", "Three K-12 district references of similar size, all rated Excellent (5 of 5)"),
        ("price", "Risk", "Total price about 4 percent above the District's cost estimate"),
    ],
    "FAIRHAVEN": [
        ("technical", "Strength", "Routing workstation compares alternative route sets by miles, ride time and bus count, with a dispatch console for daily changes"),
        ("technical", "Weakness", "GPS locations update only every 60 seconds, so the live bus map and stop arrival alerts lag the bus"),
        ("technical", "Risk", "Parent app is a third-party white-label product under the provider's own privacy policy; the provider is not a party to the District's student data privacy agreement (FERPA/COPPA risk)"),
        ("technical", "Weakness", "Parent app alerts in English and Spanish only"),
        ("management", "Strength", "Fairhaven implementation specialist on site in the District dispatch office for the first two weeks of school"),
        ("pastPerformance", "Strength", "Three K-12 district references of similar size, all rated Very Good (4 of 5)"),
    ],
    "BRAMBLEWOOD": [
        ("technical", "Strength", "Automatic stop placement applies the District's maximum walk distance and hazardous-crossing rules"),
        ("technical", "Significant Weakness", "Special education routes are still planned manually in a spreadsheet export, outside the routing module"),
        ("technical", "Significant Weakness", "No RFID or other student ridership tracking; the system shows bus location only"),
        ("management", "Significant Weakness", "Go-live on October 18, 2027, about eight weeks after the first day of school; fall routes are still planned in spreadsheets"),
        ("management", "Weakness", "Support desk opens at 7 a.m., after morning routes start, with a four-hour priority 1 response"),
        ("pastPerformance", "Weakness", "Two small rural district references (1,450 and 1,820 students), both rated Satisfactory (3 of 5)"),
        ("price", "Risk", "Item 0003 hardware priced about 36 percent below the District's estimate while item 0002 implementation is about 14 percent above it (potentially unbalanced)"),
    ],
}

OFFERORS = {
    "COPPERLINE": {
        "solicitation": SOLICITATION_ID,
        "name": "Copperline Transit Software Inc",
        "uei": "CT7L4R9W2KXM", "cage": "4CTL8",
        "address": "1180 Foundry Wharf Way, Suite 300, Portland, OR 97209",
        "signatory": "Marguerite Ellison-Park, Chief Executive Officer",
        "technical": [
            ("1. Route Planning and Optimization", [
                "Copperline's routing engine builds and optimizes every District route from student addresses, bell times, stop safety rules and bus capacity. Dynamic routing re-optimizes only the affected routes when a student enrolls, moves or changes schools, and the routing coordinator approves each change before it is published to drivers and families. At our reference districts, a summer route rebuild that took six weeks by hand now takes four days, and total route miles fell 11 percent in the first year.",
                "Special education transportation is planned in the same engine with a dedicated IDEA route planner, not a spreadsheet. Each student's IEP transportation requirements — door-to-door pickup, wheelchair lift, car seat or safety vest, a required bus aide, maximum ride time and approved alternate addresses — are imported from the District's special education records and enforced as hard constraints, so the optimizer will never assign a student who uses a wheelchair to a bus without a lift, or a student who requires an aide to a route without one.",
                "Case managers see each student's assigned route, pickup time and ride time, and the planner produces the special education transportation reports the District needs for IEP meetings and state reporting.",
            ]),
            ("2. Real-Time GPS Fleet Tracking and RFID Student Ridership", [
                "Each of the District's 88 buses receives a Copperline vehicle gateway with GPS, cellular connectivity, a driver tablet and an RFID card reader at the door. Bus locations update every 10 seconds on the dispatcher map, and dispatch is alerted automatically when a bus runs more than five minutes late, leaves its route or stops longer than expected.",
                "Students tap a District-issued RFID card when boarding and exiting. Every scan is recorded with the time, stop and GPS location, so dispatch and school staff can confirm within seconds whether a student boarded, got off at the right stop or is still on board. The driver tablet sounds an alert if a student scans onto the wrong bus or exits at a stop other than their assigned one, and a post-trip child check must be completed before the route can be closed.",
            ]),
            ("3. Parent and Student App, Notifications and Privacy", [
                "Copperline's parent and student app is built and operated by Copperline, not licensed from a third party. It shows the live location of the student's bus, sends a stop arrival alert when the bus is a family-chosen number of minutes from the stop, and sends alerts for delays, substitute buses and the student's RFID boarding and exiting scans. The app and all notifications are available in 9 languages — English, Spanish, Russian, Ukrainian, Vietnamese, Chinese, Arabic, Somali and Marshallese — and families without smartphones can receive the same alerts by text message or voice call.",
                "Copperline complies with FERPA and COPPA. Student data is encrypted in transit and at rest, hosted in U.S. data centers and never sold or used for advertising, and the app collects no information from children under 13 beyond what the District authorizes. Copperline will sign the District's student data privacy agreement without exceptions, staff sign in through the District's SSO/SAML identity provider, and parent and staff screens conform to WCAG 2.1 AA.",
            ]),
        ],
        "management": [
            ("1. Implementation Schedule and Route Conversion", [
                "Copperline will go live during the summer, before the first day of school. After award in December, SIS integration through OneRoster 1.2 is configured in January and February; the District's current routes, stops and student assignments are converted from its spreadsheets in March and April and reviewed by the routing coordinator route by route; and gateways and RFID readers are installed on all 88 buses in June, after the last day of school, with no more than 15 buses out of service at a time.",
                "A full July dry run operates every route with drivers, RFID cards and the parent app in test mode, and the District approves the results before go-live on August 2, 2027, more than three weeks before the first day of school on August 25.",
            ]),
            ("2. Training for Dispatchers, Drivers and Families", [
                "Dispatchers and the routing coordinator receive 24 hours of hands-on training in May and June. Every driver and bus aide completes a 90-minute in-cab session on the tablet, RFID scanning and the post-trip child check during the August in-service days. Copperline provides family launch materials — flyers, short videos and school newsletter text in all 9 app languages — and staffs two evening family help sessions at the District office.",
            ]),
            ("3. Support, Service Levels and Uptime", [
                "Support is available from 5 a.m. to 7 p.m. Pacific on school days, covering morning and afternoon routes, by phone, chat and web, with priority 1 issues answered within 15 minutes. Copperline commits to 99.9 percent uptime during route hours, backed by service credits, and replaces failed bus hardware within two school days from spares kept in Oregon.",
            ]),
        ],
        "pastPerformance": [
            ("Reference 1 — Juniper Falls School District, WA (JFSD-RFP-23-011)", [
                "Routing, GPS fleet tracking, RFID student ridership and parent app for 14,200 students and 104 buses. Value $1.48M, period 2023–present. Summer 2023 go-live after a July dry run. Reference rating: Excellent (5 of 5).",
            ]),
            ("Reference 2 — Sagebrush Unified School District, ID (SUSD-2022-036)", [
                "Routing and special education transportation planning for 9,700 students and 71 buses, including 11 special education routes. Value $1.12M, period 2022–present. Reference rating: Excellent (5 of 5).",
            ]),
            ("Reference 3 — Alderbrook Public Schools, OR (APS-C-2024-07)", [
                "Routing, fleet tracking and parent app in 9 languages for 12,600 students and 82 buses. Value $1.31M, period 2024–present. Reference rating: Excellent (5 of 5).",
            ]),
        ],
        "price": {"0001": 728000, "0002": 192000, "0003": 330000, "0004": 310000},
    },
    "FAIRHAVEN": {
        "solicitation": SOLICITATION_ID,
        "name": "Fairhaven Fleet Technologies LLC",
        "uei": "FH3V8N6Q1TZD", "cage": "7FHV2",
        "address": "2870 Willamette Commerce Dr, Suite 140, Eugene, OR 97401",
        "signatory": "Desmond Achterberg, President",
        "technical": [
            ("1. Route Planning and Optimization", [
                "Fairhaven's routing workstation optimizes general education routes from student addresses, bell times and bus capacity, and lets the routing coordinator compare alternative route sets side by side by total miles, average ride time and number of buses before publishing. The dispatch console handles daily changes — substitute drivers, bus swaps, field trips and road closures — and pushes turn-by-turn directions to driver tablets.",
                "Special education routes are built in the same workstation. Planners record each student's IEP transportation needs, including door-to-door pickup, wheelchair lift and aide requirements, as student attributes, and the optimizer flags any assignment that conflicts with them for the planner to resolve.",
            ]),
            ("2. Real-Time GPS Fleet Tracking and RFID Student Ridership", [
                "Fairhaven installs a GPS unit on each bus that reports the bus location every 60 seconds to the dispatch console and the parent app. Dispatch receives late-bus and off-route alerts.",
                "An RFID card reader on each bus records student boarding and exiting, and scan history is available to dispatch and school offices by student, bus and date.",
            ]),
            ("3. Parent and Student App, Notifications and Privacy", [
                "Families use the Fairhaven parent app to see their bus on a map and receive stop arrival alerts in English and Spanish. The app is a white-label product licensed from a third-party mobile app provider and branded for the District.",
                "The app is operated by the third-party provider under its own privacy policy and terms of use, which parents accept when they create an account. Fairhaven complies with FERPA and will sign the District's student data privacy agreement for the data Fairhaven holds; the app provider is not a party to that agreement, and its handling of information from children under 13 is governed by its own policy. Staff sign in through the District's SSO/SAML identity provider.",
            ]),
        ],
        "management": [
            ("1. Implementation Schedule and Route Conversion", [
                "Fairhaven will go live on August 11, 2027, two weeks before the first day of school. SIS integration uses a nightly secure file export from the District SIS, configured in March; the District's routes, stops and student assignments are converted from its spreadsheets in April and May; and GPS units and RFID readers are installed on all 88 buses in July.",
            ]),
            ("2. Training for Dispatchers, Drivers and Families", [
                "Dispatchers and the routing coordinator receive 16 hours of training in July, and drivers receive a one-hour session on the tablet and RFID reader during the August in-service days. A Fairhaven implementation specialist works on site in the District dispatch office for the first two weeks of school to resolve route and hardware issues as they arise. Families receive a launch flyer and video in English and Spanish.",
            ]),
            ("3. Support, Service Levels and Uptime", [
                "Support is available from 6 a.m. to 6 p.m. Pacific on weekdays by phone and web, with priority 1 issues answered within 30 minutes. Fairhaven commits to 99.5 percent uptime.",
            ]),
        ],
        "pastPerformance": [
            ("Reference 1 — Coldwater Creek School District, WA (CCSD-RFP-22-042)", [
                "Routing, dispatch and GPS fleet tracking for 10,900 students and 76 buses. Value $940K, period 2022–present. The reference praised the routing workstation and dispatch console. Reference rating: Very Good (4 of 5).",
            ]),
            ("Reference 2 — Quarry Ridge Unified School District, CA (QRUSD-2023-019)", [
                "Routing, GPS tracking, RFID ridership and parent app for 15,300 students and 112 buses. Value $1.36M, period 2023–present. The reference noted that its privacy office required a separate review of the third-party parent app before launch. Reference rating: Very Good (4 of 5).",
            ]),
            ("Reference 3 — Redfern County School District, NV (RCSD-C-2021-088)", [
                "Routing and fleet tracking for 13,400 students and 95 buses. Value $1.05M, period 2021–2025. Reference rating: Very Good (4 of 5).",
            ]),
        ],
        "price": {"0001": 640000, "0002": 165000, "0003": 300000, "0004": 275000},
    },
    "BRAMBLEWOOD": {
        "solicitation": SOLICITATION_ID,
        "name": "Bramblewood Mobility Corp",
        "uei": "BM9R2K5X7WPC", "cage": "3BMC6",
        "address": "925 Riverbend Industrial Pkwy, Unit B, Spokane Valley, WA 99216",
        "signatory": "Corinne Haldane, Managing Director",
        "technical": [
            ("1. Route Planning and Optimization", [
                "Bramblewood's routing module builds general education routes from student addresses and bell times, with a route optimizer that minimizes total miles. Stop placement is automatic: the optimizer places stops using the District's maximum walk distance and its map of hazardous crossings, so no assigned stop requires a student to cross a hazardous road.",
                "Special education routes are not planned in the routing module. Bramblewood provides a spreadsheet export of special education students, addresses and transportation notes, and District transportation staff will continue to plan those routes manually in the spreadsheet and then enter the finished routes into the system.",
            ]),
            ("2. Real-Time GPS Fleet Tracking and RFID Student Ridership", [
                "Each bus receives a Bramblewood GPS tracker that reports the bus location every 30 seconds to the dispatch map, with late-bus alerts sent to dispatch by email.",
                "Bramblewood's solution tracks bus location only. It does not include RFID card readers or any other student ridership tracking, so the system cannot show whether a particular student boarded or exited a bus; drivers can continue to use the District's paper rosters.",
            ]),
            ("3. Parent and Student App, Notifications and Privacy", [
                "Bramblewood's parent app shows the bus location on a map and sends a stop arrival alert when the bus is within a set distance of the stop, in English, Spanish and Russian. Bramblewood complies with FERPA and COPPA and will sign the District's student data privacy agreement.",
            ]),
        ],
        "management": [
            ("1. Implementation Schedule and Route Conversion", [
                "Bramblewood proposes go-live on October 18, 2027, about eight weeks after the first day of school. Routes for the start of the school year will be planned by the District in its current spreadsheets; Bramblewood will convert the District's routes after the fall schedule settles in September.",
                "GPS trackers will be installed in September and early October, in the evenings after afternoon routes. Student data is loaded from a nightly SIS file export.",
            ]),
            ("2. Training for Dispatchers, Drivers and Families", [
                "Dispatchers receive two four-hour remote training sessions in September. Drivers receive a one-page quick-start guide, and the District receives an English family announcement template.",
            ]),
            ("3. Support, Service Levels and Uptime", [
                "Support is available from 7 a.m. to 4 p.m. Pacific on weekdays by email and web ticket, with priority 1 issues answered within four hours. Bramblewood targets 99.5 percent uptime.",
            ]),
        ],
        "pastPerformance": [
            ("Reference 1 — Tamarack Flats School District, OR (TFSD-2024-02)", [
                "Routing and GPS bus tracking for one 1,450-student rural district with 14 buses. Value $96K, period 2024–present. Reference rating: Satisfactory (3 of 5).",
            ]),
            ("Reference 2 — Lone Cedar Consolidated Schools, WA (LCCS-2023-05)", [
                "GPS bus tracking and parent app for one 1,820-student rural district with 19 buses. Value $128K, period 2023–present. The reference noted that go-live slipped by one month. Reference rating: Satisfactory (3 of 5).",
            ]),
        ],
        "price": {"0001": 615000, "0002": 205000, "0003": 205000, "0004": 280000},
    },
}

# SSRefVendor rows (the compliance robot's vendor registration, exclusion and reference record); all three are clean.
VENDOR_REF = {
    "COPPERLINE": dict(SamStatus="Active", RegistrationExpiry="2027-08-19", Exclusion=False, FapiisRecords="None",
                       cpars=[("JFSD-RFP-23-011", "Excellent", 2026), ("SUSD-2022-036", "Excellent", 2026), ("APS-C-2024-07", "Excellent", 2025)]),
    "FAIRHAVEN": dict(SamStatus="Active", RegistrationExpiry="2027-04-06", Exclusion=False, FapiisRecords="None",
                      cpars=[("CCSD-RFP-22-042", "Very Good", 2026), ("QRUSD-2023-019", "Very Good", 2025), ("RCSD-C-2021-088", "Very Good", 2025)]),
    "BRAMBLEWOOD": dict(SamStatus="Active", RegistrationExpiry="2027-02-23", Exclusion=False, FapiisRecords="None",
                        cpars=[("TFSD-2024-02", "Satisfactory", 2026), ("LCCS-2023-05", "Satisfactory", 2025)]),
}

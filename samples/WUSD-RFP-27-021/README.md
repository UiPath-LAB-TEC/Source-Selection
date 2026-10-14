# Sample: Student Transportation Routing and Fleet Management (WUSD-RFP-27-021)

A fresh, fully synthetic K-12 district RFP for trying **New RFP evaluation** end to end in the State & Local workspace. Every proposer, person, contract number and vendor ID is fictional. Regenerate with `.venv/bin/python tools/generate_sled_sample.py --id WUSD-RFP-27-021`.

On the sign-in screen pick **State & Local**, sign in as **Dana Whitfield (Procurement Officer)** and open **New RFP evaluation**.

## 1 · RFP

In the **Request for Proposals** card, select **Upload RFP** and choose **`RFP.pdf`** (this folder), the District's RFP cover page and scope. The UiPath Agent should fill these values; you can type any of them yourself.

| Field | Expected |
|---|---|
| RFP number | `WUSD-RFP-27-021` |
| Title | `Student Transportation Routing and Fleet Management` |
| District | `Willowmere Unified School District` |
| Purchasing office | `Purchasing Department` |
| Contract type | `Firm fixed price, 3-year initial term with two optional 1-year renewals` |
| Basis for award | Most advantageous proposal — highest total score out of 100 points |

In the **District cost estimate** card, select **Upload cost estimate** and choose **`Cost-Estimate.pdf`**. The agent adds each item's five years. It should fill these four lines, totalling $1,500,000:

| Item | Description | Amount |
|---|---|---|
| 0001 | Routing and fleet software subscription (5 years) | 700000 |
| 0002 | Implementation, route conversion and SIS integration | 180000 |
| 0003 | GPS and RFID hardware and installation (88 buses) | 320000 |
| 0004 | Training and support | 300000 |

## 2 · Scoring criteria

Upload **`Evaluation-Criteria.pdf`** (Section 6 of the RFP) and the criteria analyst agent drafts each criterion with its points, or choose **Use default criteria** to start from the K-12 template. The agent should come back with:

1. **Routing, Tracking and Parent Communication**: 40 points, Section 1 — Functional and Technical Response. Sub-criteria: route planning and optimization, including special education and IDEA transportation; real-time GPS fleet tracking and RFID student ridership; parent and student app, stop arrival notifications and FERPA/COPPA privacy.
2. **Implementation, Training and Support**: 15 points, Section 2 — Implementation and Support. Sub-criteria: implementation schedule and route conversion; training for dispatchers, drivers and families; support, service levels and uptime.
3. **Experience and References**: 15 points, Section 3 — Experience and References. Sub-criteria: recency; relevance to K-12 districts of similar size; reference ratings.
4. **Cost**: 30 points, Section 4 — Cost Proposal.

Points total 100, and cost points come from the formula (lowest total five-year cost earns all 30). Page limits: Section 1 — Functional and Technical Response 30, Section 2 — Implementation and Support 15, Section 3 — Experience and References 8.

## 3 · Evaluation committee

Keep **Three evaluators**, or pick **Two evaluators** to try a smaller committee.

## 4 · Proposals

Add each proposer with its code, then drag all five PDFs from its folder onto the drop zone. The section is detected from each file name.

| Proposer code | Folder | Proposer |
|---|---|---|
| `BRAMBLEWOOD` | `BRAMBLEWOOD/` | Bramblewood Mobility Corp |
| `COPPERLINE` | `COPPERLINE/` | Copperline Transit Software Inc |
| `FAIRHAVEN` | `FAIRHAVEN/` | Fairhaven Fleet Technologies LLC |

## 5 · Review and start

Choose **Create and start RFP evaluation**. Maestro then runs:

1. Robots ingest the PDFs and check required sections, page limits, state vendor registration and the debarment list. All three proposers screen Compliant.
2. Dana releases the proposals to the evaluation committee.
3. The evaluation agent drafts cited findings.
4. Each committee member scores their criteria.
5. The Committee Chair sets the consensus scores.
6. Dana confirms the cost evaluation and cost points.
7. The agent drafts the Recommendation of Award.
8. James Thornton (Award Authority) signs the recommendation for the Board.

## What the agents should find (answer key)

| Proposer | Planted findings | Total cost vs estimate |
|---|---|---|
| Bramblewood Mobility Corp | **Strength**: Automatic stop placement applies the District's maximum walk distance and hazardous-crossing rules; **Significant Weakness**: Special education routes are still planned manually in a spreadsheet export, outside the routing module; **Significant Weakness**: No RFID or other student ridership tracking; the system shows bus location only; **Significant Weakness**: Go-live on October 18, 2027, about eight weeks after the first day of school; fall routes are still planned in spreadsheets; **Weakness**: Support desk opens at 7 a.m., after morning routes start, with a four-hour priority 1 response; **Weakness**: Two small rural district references (1,450 and 1,820 students), both rated Satisfactory (3 of 5); **Risk**: Item 0003 hardware priced about 36 percent below the District's estimate while item 0002 implementation is about 14 percent above it (potentially unbalanced) | -13.0% ($1,305,000) |
| Copperline Transit Software Inc | **Significant Strength**: Dedicated special education route planner enforces IEP transportation requirements under IDEA (door-to-door pickup, wheelchair lift, required bus aide, maximum ride time) as hard constraints; **Strength**: GPS bus locations update every 10 seconds, and RFID cards record every student boarding and exiting with time, stop and location; **Strength**: Copperline-built and operated parent app with stop arrival alerts in 9 languages, covered by the District's student data privacy agreement without exceptions; **Significant Strength**: Summer go-live on August 2, 2027 after a full July dry run of every route, more than three weeks before the first day of school; **Strength**: Three K-12 district references of similar size, all rated Excellent (5 of 5); **Risk**: Total price about 4 percent above the District's cost estimate | +4.0% ($1,560,000) |
| Fairhaven Fleet Technologies LLC | **Strength**: Routing workstation compares alternative route sets by miles, ride time and bus count, with a dispatch console for daily changes; **Weakness**: GPS locations update only every 60 seconds, so the live bus map and stop arrival alerts lag the bus; **Risk**: Parent app is a third-party white-label product under the provider's own privacy policy; the provider is not a party to the District's student data privacy agreement (FERPA/COPPA risk); **Weakness**: Parent app alerts in English and Spanish only; **Strength**: Fairhaven implementation specialist on site in the District dispatch office for the first two weeks of school; **Strength**: Three K-12 district references of similar size, all rated Very Good (4 of 5) | -8.0% ($1,380,000) |

## Running it again

An RFP number can only be started once. To print this package under a new number, run `.venv/bin/python tools/generate_sled_sample.py --id <new number>` from the repo root, for example `--id WUSD-RFP-27-022`, or delete the evaluation as System Admin and reuse this one.

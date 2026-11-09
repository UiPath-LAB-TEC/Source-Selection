# Sample: Army Maintenance Records Modernization (W56KGU-27-R-0041)

A DoD package for trying **New source selection** end to end, the DoD counterpart of the civilian VA package
(`samples/36C10B-27-R-0060`). Every offeror, person, contract number and UEI is fictional. Regenerate with
`.venv/bin/python tools/generate_sample.py --package army` (content in `tools/dod_sample_content.py`).

Sign in as **Federal**, switch to **Dana Whitfield (Contracting Officer)** and open **New source selection**.

## 1 · Solicitation

In the **Solicitation** card, select **Upload solicitation** and choose **`Solicitation.pdf`** (this folder). It's a synthetic SF 33 cover page with Section B. The solicitation agent fills in the details and selects the **DoD best-value tradeoff** template (color ratings), because the issuing agency is the Department of the Army. It should fill these values (the office comes back without its street address):

| Field | Expected |
|---|---|
| Template | DoD best-value tradeoff |
| Solicitation number | `W56KGU-27-R-0041` |
| Title | `Army Maintenance Records Modernization` |
| Agency | `Department of the Army` |
| Contracting office | `Army Contracting Command – Aberdeen Proving Ground (ACC-APG)` |
| Contract type | `Firm-fixed-price contract, one 12-month base year and four 12-month option years` |
| Basis for award | Best value tradeoff (FAR 15.101-1) |

For the cost estimate, select **Upload IGCE** and choose **`IGCE.pdf`** (this folder). The IGCE agent reads the estimate by CLIN and period and fills in these four lines, totalling $16,000,000:

| CLIN | Description | Amount |
|---|---|---|
| 0001 | Maintenance records digitization and data extraction | 7500000 |
| 0002 | GCSS-Army integration and readiness reporting | 4200000 |
| 0003 | Cybersecurity, RMF and accreditation support | 2800000 |
| 0004 | Program management | 1500000 |

## 2 · Evaluation criteria

Upload **`Section-M.pdf`** (this folder) and the Section M analyst agent fills in the factors (or choose **Use default factors** to start from the DoD template). It should come back with the **color** rating method (Blue / Purple / Green / Yellow / Red, per the DoD Source Selection Procedures) and:

1. **Technical Approach**: combined technical/risk rating, Volume I. Subfactors: maintenance record digitization and data extraction; GCSS-Army integration and readiness reporting; cybersecurity and Risk Management Framework compliance.
2. **Management Approach**: combined technical/risk rating, Volume II. Subfactors: key personnel; transition-in plan; staffing and security clearances.
3. **Past Performance**: performance confidence assessment, Volume III.
4. **Price**: evaluated, not rated, Volume IV.

Technical > Management > Past Performance, and the non-price factors combined are significantly more important than price. Page limits are Technical 25, Management 15 and Past Performance 10.

## 3 · Evaluation board

Keep **Three evaluators**, or pick **Two evaluators** to try the smaller panel.

## 4 · Proposals

Add each offeror with its code, then drag all five PDFs from its folder onto the drop zone. The volume is detected from each file name. Each volume opens with a title page and the FAR 52.215-1(e) restrictive legend.

| Offeror code | Folder | Offeror |
|---|---|---|
| `SENTRYLINE` | `SENTRYLINE/` | Sentryline Defense Group LLC |
| `CORVANE` | `CORVANE/` | Corvane Digital Inc |
| `ASHGROVE` | `ASHGROVE/` | Ashgrove Mission Systems Corp |

All three are registered in the workspace's SAM reference data, so they screen **Compliant**.

## 5 · Review and start

Choose **Start source selection**. Maestro then runs the same process as the civilian package: robots ingest and screen the proposals, Dana releases them, the evaluation agent drafts cited findings, each evaluator rates, the SSEB Chair runs consensus, Dana determines price reasonableness, the agent drafts the SSDD, and James Thornton (SSA) signs the award.

## What the agents should find (answer key)

| Offeror | Planted findings | Price vs IGCE |
|---|---|---|
| Sentryline | **Significant strength**: 96% field-level extraction accuracy on 2.1M Army maintenance records. **Strengths**: existing Impact Level 5 ATO it will inherit; real-time GCSS-Army posting with every value linked to its source page; key personnel with Top Secret clearances committed from award; 45-day transition; Exceptional CPARS. | +5.6% ($16.9M) |
| Corvane | **Weaknesses**: OCR templates cover DA Form 2404 only, logbooks transcribed by hand; nightly batch transfer to GCSS-Army, so readiness data is a day behind. **Strength**: 30-day transition. **Risk**: Solution Architect and 40% of staff hired after award, clearances still to be granted. | −12.5% ($14.0M), a price realism risk |
| Ashgrove | **Strength**: predictive maintenance model flags part failures 30 days ahead. **Significant weakness**: Impact Level 2 hosting with Impact Level 5 deferred 12 months and no RMF or ATO approach. **Weakness**: accuracy measured only on commercial airline logs; Marginal CPARS schedule rating. | −3.1% ($15.5M) |

The expected outcome is a tradeoff: Sentryline is technically strongest but the most expensive, Corvane is cheapest but carries price realism and staffing risk, and Ashgrove's hosting plan is the cyber risk the SSA has to weigh.

## Running it again

A solicitation number can only be started once. Delete the evaluation as Jordan Ellis (System Admin) to reuse this
number, or print the package under a new one with `.venv/bin/python tools/generate_sample.py --package army --id <new number>`
from the repo root. Add `--seed-vendors` when standing it up in another tenant, so the offerors screen Compliant.

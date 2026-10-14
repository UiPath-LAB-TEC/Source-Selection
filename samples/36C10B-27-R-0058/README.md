# Sample: Veterans Claims Intake Modernization (36C10B-27-R-0058)

A fresh, fully synthetic solicitation for trying **New source selection** end to end. Every offeror, person,
contract number and UEI is fictional. Regenerate with `.venv/bin/python tools/generate_sample.py --id 36C10B-27-R-0058`.

Sign in as **Dana Whitfield (Contracting Officer)** and open **New source selection**.

## 1 · Solicitation

In the **Solicitation** card, select **Upload solicitation** and choose **`Solicitation.pdf`** (this folder). It's a synthetic SF 33 cover page. The solicitation agent fills in the details and selects the civilian template, since the issuing agency is the VA. It should fill these values (the office comes back without its street address). You can still type any field yourself.

| Field | Expected |
|---|---|
| Template | Civilian best-value tradeoff |
| Solicitation number | `36C10B-27-R-0058` |
| Title | `Veterans Claims Intake Modernization` |
| Agency | `Department of Veterans Affairs` |
| Contracting office | `Technology Acquisition Center (TAC), Eatontown, NJ` |
| Contract type | `Firm-fixed-price task order, one base year and four option years` |

For the cost estimate, select **Upload IGCE** and choose **`IGCE.pdf`** (this folder) instead of typing the CLINs. The IGCE agent reads the CLIN summary and adds each CLIN's base year and four option years. It should fill in these four lines, totalling $14,000,000:

| CLIN | Description | Amount |
|---|---|---|
| 0001 | Claims intake platform build and operations | 6200000 |
| 0002 | Document classification and data extraction | 3800000 |
| 0003 | Contact center and workload integration | 2600000 |
| 0004 | Program management | 1400000 |

## 2 · Evaluation criteria

The factors start empty. Upload **`Section-M.pdf`** (this folder) and the Section M analyst agent fills them in (or choose **Use default factors** to start from the template instead). The agent should come back with:

1. **Technical Approach**: merit rating, Volume I. Subfactors: intelligent document intake and classification; claims routing and workload management; accessibility and Section 508 conformance.
2. **Management Approach**: merit rating, Volume II. Subfactors: key personnel; transition-in plan; staffing and retention.
3. **Past Performance**: confidence assessment, Volume III.
4. **Price**: evaluated, not rated, Volume IV.

The relative importance is Technical > Management > Past Performance, and non-price factors combined are significantly more important than price. Keep the adjectival rating method. Page limits are Technical 25, Management 15 and Past Performance 10.

## 3 · Evaluation board

Either keep **Three evaluators**, or pick **Two evaluators** to try the 1–3 evaluator panel. Maestro then opens only two individual reviews.

## 4 · Proposals

Add each offeror with its code, then drag all five PDFs from its folder onto the drop zone (or click it to browse). The volume is detected from each file name. Each proposal volume opens with a title page and the FAR 52.215-1(e) restrictive legend, like a real submission.

| Offeror code | Folder | Offeror |
|---|---|---|
| `TALLGRASS` | `TALLGRASS/` | Tallgrass Federal Group LLC |
| `ORINOCO` | `ORINOCO/` | Orinoco Digital Inc |
| `BRIGHTWATER` | `BRIGHTWATER/` | Brightwater Systems Corp |

## 5 · Review and start

Choose **Start source selection**. Maestro then runs:

1. Robots ingest the PDFs and screen SAM, exclusions, FAPIIS and page limits. All three offerors are clean, so they should screen Compliant.
2. Dana releases the proposals to the SSEB.
3. The evaluation agent drafts cited findings.
4. Each evaluator reviews and rates.
5. The SSEB Chair runs consensus.
6. Dana determines price reasonableness.
7. The agent drafts the SSDD.
8. James Thornton (SSA) signs the award.

## What the agents should find (answer key)

| Offeror | Planted findings | Price vs IGCE |
|---|---|---|
| Tallgrass | **Significant strength**: 94% straight-through classification on 1.2M VBA documents. **Strengths**: Trusted Tester 508 testing every sprint; key personnel committed; 45-day transition; Exceptional CPARS. | +6.1% ($14.85M) |
| Orinoco | **Weaknesses**: templates cover 12 of 43 form types; static routing with no workload balancing. **Strength**: 30-day transition. **Risk**: architect and half the staff hired after award. | −10.7% ($12.5M), a price realism risk |
| Brightwater | **Strength**: skills-based routing rebalanced every 15 minutes. **Significant weakness**: no Section 508 testing approach. **Weaknesses**: accuracy measured only on a commercial insurance benchmark; Marginal CPARS schedule rating. | −2.9% ($13.6M) |

The expected outcome is a tradeoff: Tallgrass is technically strongest but the most expensive, so the SSA weighs whether its strengths are worth the 6% premium.

## Running it again

A solicitation number can only be started once. To print this package under a new number, run
`.venv/bin/python tools/generate_sample.py --id <new number>` from the repo root, for example `--id 36C10B-27-R-0059`.
That writes a full set (solicitation, IGCE, Section M and all proposals) to `samples/<new number>/`.

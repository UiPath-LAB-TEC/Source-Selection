# Collateral

| File | What it is |
|---|---|
| [`source-selection-whitepaper.pdf`](source-selection-whitepaper.pdf) | Three-page industry brief: the before and after, how agents, robots and Maestro run a source selection end to end, and the value |
| [`source-selection-handoff-1-pager.pdf`](source-selection-handoff-1-pager.pdf) | SE handoff 1-pager: use case, target persona, value metrics, components used, setup and reset |
| [`source-selection-solution-kit.pdf`](source-selection-solution-kit.pdf) | Solution kit: how to stage, run and reset the demo, the expected agent output, links to every test document, and setup in another tenant |
| [`source-selection-solution-kit.html`](source-selection-solution-kit.html) | The same solution kit as a page with working links, hosted at https://uipathlabs.uipath.host/source-selection-solution-kit |

The test documents the solution kit links to are in [`samples/36C10B-27-R-0060`](../../samples/36C10B-27-R-0060) (federal,
VA) and [`samples/WUSD-RFP-27-021`](../../samples/WUSD-RFP-27-021) (State & Local, K-12).

## Hosting the solution kit

The hosted kit is a coded web app (`ss-solution-kit`) in the `AMER Presales/Public Sector/Procurement` folder. It's a
static page, so anyone with the link can open it without signing in. To publish a change, copy the HTML in as
`dist/index.html`, bump the version and run:

```bash
uip codedapp pack dist -n ss-solution-kit --display-name "Source Selection Solution Kit" -v <version>
uip codedapp publish -n ss-solution-kit -v <version> -t Web --tenant-feed
uip codedapp deploy -n ss-solution-kit --path-name source-selection-solution-kit --folder-key 08605f4c-2b90-4971-81b7-2f4310a2b81a
```

The 255-day baseline is from GAO-24-106528. The 5 min 48 s is the robot and agent time in one demonstration run, taken
from its Maestro execution trail; it doesn't include human review time.

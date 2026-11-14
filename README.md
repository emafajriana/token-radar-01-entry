# Token Radar — build the best token launch radar

A program (Node 22, standard library only) that reads a sealed snapshot of every protocol
DefiLlama tracks and writes a web dashboard ranking the protocols with no token yet by what
their launch would be worth, each with the steps to farm it.

## How it runs

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json|directory>
```

`main.ts` reads `/input/snapshot.json` (or `--input`), writes `/output/board.json`
(the ranked board), `/output/data.js` (the dashboard's dataset), copies `dashboard/` and
`screenshots/` to `/output`, and writes `/output/dossier.json` with `buildDossier` from
`vendor/makefun-board.ts`. The program runs twice with byte-identical output.

## The model (radar-2)

`implied = round(tvl_usd x categoryMultiple x growthMult x maturityMult)`

- **categoryMultiple** is earned from the snapshot itself: the median market-cap-per-TVL
  of the live-token protocols in the same category (at least 3 of them, else the median
  across all live protocols), clamped to 0.05x–1.25x. A lending protocol's token trades
  near 0.13x its TVL while a bridge's trades near 0.56x, so a pre-token launch is worth
  what its category's market says a token of its size is worth.
- **growthMult** = `1 + clamp(change_7d, -60, 120) / 100 x 0.5`.
- **maturityMult** = `0.6 + min(age_days, 1095) / 1095 x 0.4`, where age is the time since
  the protocol was first listed (365 days when unlisted).

No protocol name is special-cased: the same function scores every row.

## The board

198 rows: the whole 40-protocol watchlist (every protocol with at least $50M of TVL and
no token on record) plus every other rankable pre-token protocol below the floor — the
complete pre-token universe the snapshot can rank, not a sample. A protocol is rankable
only under the watchlist's own definition, applied to the whole snapshot: pre-token, not
an exchange, not a versioned pool, not a wrapped, staked or bridged product, and not
named for an exchange. Each row carries a 7-step farm plan derived from the protocol's
own category, chains, TVL and age, with the cost and time of every step. The 24 largest
live-token protocols are set aside with their market caps, and their market-cap-per-TVL
is what prices the board.

## The dashboard

`dashboard/` is a static page with no network: a sortable, filterable board (search,
category, chain, watchlist-only, seven-day growth), a detail view for every protocol
with its model breakdown and farm plan, a live-token view, the ten strongest launches at
a glance, and the full table of category multiples the model measured.

## Layout

- `main.ts` — the entrypoint: snapshot in, board + dashboard + screenshots + dossier out
- `lib/model.ts` — the radar-2 model, the farm plans, and the snapshot parser
- `vendor/makefun-board.ts` — make.fun's dashboard-dossier library, as the kit ships it
- `dashboard/` — `index.html`, `app.css`, `app.js` (the static page, no network)
- `screenshots/` — the board, a protocol's detail view, and a filtered view

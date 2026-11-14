# Token Radar

A token-launch radar: a program that reads a sealed snapshot of the
DefiLlama protocol index and writes a dashboard ranking the protocols
whose record carries no token yet by what their launch would be worth,
each with a concrete plan to farm it.

## How it runs

From the repository root, with Node 22:

```
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json>
```

The program reads the snapshot (by default `/input/snapshot.json`, or
the file or directory given with `--input`), scores the board, and
writes into the output directory (`/output` in the grader,
`$MAKEFUN_OUTPUT_DIR` outside it):

- `board.json` — `{"rows": [...]}` with the ranked board
- `data.js` — the dashboard dataset as `window.RADAR`, no fetch
- `dashboard/` — the static page
- `screenshots/` — the three screenshots of the page
- `dossier.json` — written last, from `buildDossier` in
  `vendor/makefun-board.ts`

The run refuses to write a board unless every check passes: all 40
watchlist slugs covered, ranks exactly 1..N, implied values
non-increasing with rank, and every farm plan 3–12 steps of 20–600
characters each. Running it twice writes byte-identical output.

## The radar-2 model

A protocol is pre-token when its record carries no token at all:
market cap, CoinGecko id and symbol are all null. The board ranks
every rankable pre-token protocol: not a bridge, liquid-staking,
liquid-restaking, restaked-BTC or CEX product; not a versioned release
(a name ending in a V-number or dotted version); not named for an
exchange; and not carrying a whole word wrapped, staked or staking.
The watchlist is the floor — every watchlist slug is on the board —
and the early radar adds every other rankable pre-token protocol below
the $50M floor.

Implied value, from the snapshot's own figures only:

```
implied = max(1, round(TVL × category multiple × growth multiplier × maturity multiplier))
```

- **Category multiple**: the median market-cap-per-TVL of the
  live-token protocols in the same category (live = has a token, not a
  CEX, market cap > 0, TVL > 0). A category with fewer than 3 live
  protocols falls back to the global median across all live protocols.
  The multiple is clamped to 0.05×–1.25×.
- **Growth multiplier**: `1 + (clamped 7-day change ÷ 100) × 0.5`,
  with the 7-day change clamped to −60%…+120% (unknown counts as 0).
- **Maturity multiplier**: `0.6 + (min(age in days, 1095) ÷ 1095) × 0.4`,
  where age is whole days from `listed_at` to the snapshot date
  (0 when listed after it, 365 days when unknown).

Rows sort by implied value descending, then TVL descending, then slug
ascending. Each row stores the exact category multiple, the live count
that measured it, whether it came from the category or the global
fallback, the clamped growth, both multipliers rounded to 4 decimals,
and the age in days, so the dashboard can recompute the value and show
its working.

## The board

198 rows: 40 watchlist + 158 early. Rank 1 is Steakhouse Financial at
$534,911,168 of implied value; the board's total implied value is
$4,003,543,706. The 24 largest live-token protocols by market cap
(excluding CEX) are set aside on a separate tab: they already trade,
so their market cap is a fact, not a model, and their
market-cap-per-TVL is what prices the board.

## The dashboard

A static page with no network calls. It shows a top-10 bar chart, four
fact boxes, a search box, category and chain filters, a 7-day growth
filter, a watchlist-only toggle, pre-token and live-token tabs, a
sortable table, and a detail dialog for every protocol with the full
implied-value equation, the recomputed check against board.json, and
its 7-step farm plan. The model panel lists every category multiple
with its live count and source. The page state lives in the URL hash.

Each farm plan has 7 steps with a cost and a time: a fresh wallet, the
category's main action with capital sized by TVL tier ($250 / $150 /
$100 / $50), a repeat action on a weekly or monthly cadence, a hold
period set by the protocol's age, a check of the protocol's own
points page, a weekly check of its own announcements, and a farm log
with an unwind in reverse order.

## File layout

```
main.ts                  the harness: reads the snapshot, writes /output
lib/model.ts             the radar-2 model and farm plans
vendor/makefun-board.ts  the dossier library, copied from the kit
dashboard/
  index.html             the page shell
  app.css                dark navy/gold styling
  app.js                 rendering, filters, sorting, detail dialog
screenshots/            board, detail and filtered views
```

## Honesty note

"Pre-token" means the protocol's record carries no token; it may still
hold one its record does not carry. Implied value is this entry's own
estimate from the snapshot's figures, not a price, and no farm plan
predicts a token, a date, or a reward.

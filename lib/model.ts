// radar-2: rank pre-token protocols by an implied launch value built only
// from the snapshot's own figures, and write a concrete farm plan per row.
//
// A protocol counts as pre-token when its DefiLlama record carries no token
// at all: market cap, CoinGecko id and symbol are all null. That is a fact
// about the record, not a claim the protocol has no token anywhere.

export const MODEL_VERSION = 'radar-2';
export const AS_OF = '2026-11-14';

export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

export interface BoardRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  age_days: number | null;
  rank: number;
  implied_value_usd: number;
  category_multiple: number;
  category_multiple_live_n: number;
  category_multiple_source: 'category' | 'global';
  growth_pct: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  watchlist: boolean;
  farm_steps: string[];
}

export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number;
  symbol: string | null;
}

export interface CategoryMultiple {
  category: string;
  live_n: number;
  multiple: number;
  source: 'category' | 'global';
}

export interface Board {
  model_version: string;
  as_of: string;
  source: string;
  floor_usd: number;
  watchlist_size: number;
  early_count: number;
  live_count: number;
  total_implied_usd: number;
  rows: BoardRow[];
  live: LiveRow[];
  multiples: CategoryMultiple[];
}

// Categories whose products are not launch candidates for this board:
// bridges move value between chains, liquid staking/restaking wrappers
// track a token that already trades, and CEX rows are exchanges.
const EXCLUDED_CATEGORIES = new Set([
  'Bridge',
  'Canonical Bridge',
  'Liquid Staking',
  'Liquid Restaking',
  'Restaked BTC',
  'CEX',
]);

const EXCHANGE_PREFIXES = [
  'Binance',
  'Coinbase',
  'Bybit',
  'Kraken',
  'Bitget',
  'OKX',
  'Bitfinex',
  'Gemini',
];

// A release marker at the end of a name: a space, then either a V-prefixed
// number (V2, v2, V12) or a dotted version (2.0, V1.5). A bare trailing
// number on its own is a name, not a release marker.
const VERSION_SUFFIX = /\s(?:[vV]\d+(?:\.\d+)*|\d+\.\d+(?:\.\d+)*)$/;
// A whole word that marks a wrapped, staked or staking product.
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;

function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

function isVersionedName(name: string): boolean {
  return VERSION_SUFFIX.test(name);
}

function isNamedForExchange(name: string): boolean {
  const lower = name.toLowerCase();
  return EXCHANGE_PREFIXES.some((x) => lower.startsWith(x.toLowerCase()));
}

function isWrappedProduct(name: string): boolean {
  return WRAPPED_WORD.test(name);
}

// A protocol is rankable when it records no token and none of the
// exclusion rules fires: not a bridge / liquid-staking / CEX product,
// not a versioned release, not named for an exchange, and not a
// wrapped, staked or staking product. The watchlist slugs all pass
// this test, which the harness verifies by checking coverage, so the
// watchlist is the floor of the board rather than a separate list.
export function isRankable(p: SnapshotProtocol): boolean {
  if (!isPreToken(p)) return false;
  if (p.category !== null && EXCLUDED_CATEGORIES.has(p.category)) return false;
  if (isVersionedName(p.name)) return false;
  if (isNamedForExchange(p.name)) return false;
  if (isWrappedProduct(p.name)) return false;
  return true;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid]!;
  return (sorted[mid - 1]! + sorted[mid]!) / 2;
}

function round4(x: number): number {
  return Math.round(x * 10000) / 10000;
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}

// Whole days from listed_at to as_of; 0 when listed after as_of,
// null when the date is missing or unparseable.
export function ageDays(listedAt: string | null, asOf: string): number | null {
  if (listedAt === null) return null;
  const listed = Date.parse(`${listedAt}T00:00:00Z`);
  const ref = Date.parse(`${asOf}T00:00:00Z`);
  if (!Number.isFinite(listed) || !Number.isFinite(ref)) return null;
  const days = Math.floor((ref - listed) / 86400000);
  return days < 0 ? 0 : days;
}

// Capital is sized by TVL tier so the farm fits the protocol: the
// biggest protocols get the biggest position, the smallest get a
// $50 starter that still registers activity.
const CAPITAL_TIERS: Array<[number, number]> = [
  [5_000_000_000, 250],
  [1_000_000_000, 150],
  [100_000_000, 100],
  [0, 50],
];

function capitalFor(tvl: number): number {
  for (const [floor, amount] of CAPITAL_TIERS) {
    if (tvl >= floor) return amount;
  }
  return 50;
}

function gasLine(firstChain: string | null): string {
  if (firstChain === 'Ethereum') return 'about $4 to $12 of gas on Ethereum mainnet';
  return 'about $0.10 to $1 of gas on its chains';
}

function money(n: number): string {
  return `$${n}`;
}

// One farm step, kept inside the 20-600 character gate: the action text
// is trimmed to fit before the cost/time tail is attached, and a step
// that would come out too short is padded with a plain record-keeping line.
function step(action: string, cost: string, time: string): string {
  const tail = `Cost: ${cost}. Time: ${time}.`;
  let body = action.trim();
  const maxBody = 600 - tail.length - 1;
  if (body.length > maxBody) body = body.slice(0, maxBody).trimEnd();
  let out = `${body} ${tail}`;
  if (out.length < 20) out += ' Keep a note of the date and the transaction hash.';
  if (out.length > 600) out = out.slice(0, 600);
  return out;
}

type FarmKind =
  | 'lending'
  | 'dex'
  | 'bridge'
  | 'staking'
  | 'perps'
  | 'prediction'
  | 'curator'
  | 'stable'
  | 'rwa'
  | 'insurance'
  | 'liquid'
  | 'launchpad'
  | 'other';

function farmKind(category: string | null): FarmKind {
  switch (category) {
    case 'Lending':
    case 'CDP':
    case 'CDP Manager':
    case 'Collateral Management':
    case 'Collateral Markets':
    case 'Uncollateralized Lending':
      return 'lending';
    case 'Dexs':
    case 'Yield':
    case 'Yield Aggregator':
    case 'Leveraged Farming':
    case 'Farm':
    case 'Liquidity Manager':
      return 'dex';
    case 'Bridge':
    case 'Canonical Bridge':
    case 'Cross Chain Bridge':
      return 'bridge';
    case 'Staking Pool':
    case 'Restaking':
      return 'staking';
    case 'Derivatives':
    case 'Synthetics':
    case 'Options':
    case 'Options Vault':
    case 'Interest Rate Derivatives':
    case 'Basis Trading':
      return 'perps';
    case 'Prediction Market':
      return 'prediction';
    case 'Onchain Capital Allocator':
    case 'Risk Curators':
      return 'curator';
    case 'Stablecoin Issuer':
    case 'Stablecoin Wrapper':
    case 'Algo-Stables':
    case 'Dual-Token Stablecoin':
      return 'stable';
    case 'RWA':
      return 'rwa';
    case 'Insurance':
      return 'insurance';
    case 'Liquid Staking':
    case 'Liquid Restaking':
    case 'Restaked BTC':
      return 'liquid';
    case 'Launchpad':
    case 'Token Locker':
      return 'launchpad';
    default:
      return 'other';
  }
}

function mainAction(kind: FarmKind, name: string, capital: number, firstChain: string | null): string {
  const c = money(capital);
  switch (kind) {
    case 'lending':
      return `Supply ${c} in USDC to ${name} as collateral and keep the supply open so the position stays live.`;
    case 'dex':
      return `Provide ${c} as liquidity in ${name}'s main pool and leave it in place through a full fee cycle.`;
    case 'bridge':
      return `Bridge ${c} in USDC through ${name} to ${firstChain ?? 'the destination chain'} and put the bridged funds to work inside the app.`;
    case 'staking':
      return `Stake ${c} of ${firstChain ?? 'the chain'}'s staking asset with ${name} and keep the receipt token in the wallet.`;
    case 'perps':
      return `Deposit ${c} as margin on ${name}, open one small hedge, and close it after a day.`;
    case 'prediction':
      return `Fund ${c} on ${name} and place one position on a market, then settle it when the market resolves.`;
    case 'curator':
      return `Deposit ${c} into ${name}'s vault and hold the vault shares it issues.`;
    case 'stable':
      return `Mint or deposit ${c} of ${name}'s stable asset and hold it in the wallet.`;
    case 'rwa':
      return `Mint ${c} of ${name}'s yield-bearing asset and hold it visibly on-chain.`;
    case 'insurance':
      return `Buy ${c} of cover from ${name} and keep the policy active.`;
    case 'liquid':
      return `Deposit ${c} of the liquid staking asset with ${name} and keep the receipt token it issues.`;
    case 'launchpad':
      return `Lock ${c} with ${name} for the shortest term it offers.`;
    default:
      return `Deposit ${c} in USDC with ${name} and keep the position open.`;
  }
}

function repeatAction(kind: FarmKind, capital: number): { text: string; time: string } {
  const fifth = money(Math.round(capital / 5));
  const tenth = money(Math.round(capital / 10));
  switch (kind) {
    case 'dex':
      return { text: `Swap ${fifth} through the pool each week so the position keeps earning and stays active.`, time: '10 minutes a week' };
    case 'lending':
      return { text: `Borrow ${tenth} once against the supply, repay it the following week, and leave the supply untouched.`, time: '10 minutes a week' };
    case 'perps':
      return { text: `Place one small trade a month, keeping margin near ${money(capital)} so the account stays funded.`, time: '10 minutes a month' };
    case 'bridge':
      return { text: `Bridge a small amount back once, completing one round trip through the bridge.`, time: '10 minutes, once' };
    case 'staking':
    case 'liquid':
      return { text: `Restake or compound the rewards once a month so the staked balance keeps growing.`, time: '10 minutes a month' };
    case 'prediction':
      return { text: `Place one more small position each month on a fresh market.`, time: '10 minutes a month' };
    case 'curator':
      return { text: `Top the vault up by ${fifth} each month so the share balance keeps growing.`, time: '10 minutes a month' };
    case 'stable':
      return { text: `Move ${fifth} in and out each month so the position stays active without changing its size.`, time: '10 minutes a month' };
    case 'rwa':
      return { text: `Check the accrual once a month and leave the balance untouched while it compounds.`, time: '10 minutes a month' };
    case 'insurance':
      return { text: `Renew the cover before it lapses so protection never drops.`, time: '10 minutes a month' };
    default:
      return { text: `Do one qualifying action each week so the position stays active.`, time: '10 minutes a week' };
  }
}

function holdDays(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

export function farmSteps(p: SnapshotProtocol): string[] {
  const capital = capitalFor(p.tvl_usd);
  const kind = farmKind(p.category);
  const firstChain = p.chains.length > 0 ? p.chains[0]! : null;
  const gas = gasLine(firstChain);
  const days = holdDays(ageDays(p.listed_at, AS_OF));
  const repeat = repeatAction(kind, capital);
  return [
    step(
      'Open a fresh wallet that holds only the farm funds, and keep its seed phrase offline on paper, never in a screenshot or a chat.',
      'under $3 of gas for the first transaction',
      '5 minutes',
    ),
    step(
      mainAction(kind, p.name, capital, firstChain),
      `${money(capital)} capital plus ${gas}`,
      '15 minutes to set up',
    ),
    step(repeat.text, gas, repeat.time),
    step(
      `Hold the position for ${days} days and let it season before thinking about an exit.`,
      `${money(capital)} stays in the position`,
      `${days} days`,
    ),
    step(
      `Before withdrawing, open ${p.name}'s own points or rewards page from the link the protocol itself publishes and claim only there.`,
      'no fee to check, never pay to claim',
      '10 minutes',
    ),
    step(
      `Check ${p.name}'s own announcements each week for a token or points update, and never trust a link from a reply or a DM.`,
      'nothing but the check',
      '5 minutes a week',
    ),
    step(
      'Write the wallet, the dates and every transaction in a farm log, then unwind in reverse order when exiting so nothing stays locked.',
      'nothing but the log',
      '5 minutes',
    ),
  ];
}

export function buildBoard(snapshot: Snapshot): Board {
  const asOf = snapshot.as_of;
  const watchlist = new Set(snapshot.watchlist);

  // Live-token protocols price the board: they have a token, are not an
  // exchange, and carry a positive market cap on positive TVL.
  const live = snapshot.protocols.filter(
    (p) =>
      p.mcap_usd !== null &&
      p.mcap_usd > 0 &&
      p.tvl_usd > 0 &&
      p.category !== 'CEX',
  );
  const liveRatios = live.map((p) => p.mcap_usd! / p.tvl_usd);
  const globalMultiple = median(liveRatios);

  const byCategory = new Map<string, number[]>();
  for (const p of live) {
    const key = p.category ?? '';
    const arr = byCategory.get(key) ?? [];
    arr.push(p.mcap_usd! / p.tvl_usd);
    byCategory.set(key, arr);
  }

  // Every category's multiple, measured from the snapshot itself.
  const multiples: CategoryMultiple[] = [];
  const seenCategories = new Set<string>();
  for (const p of snapshot.protocols) {
    const cat = p.category ?? '(no category)';
    if (seenCategories.has(cat)) continue;
    seenCategories.add(cat);
    const ratios = byCategory.get(p.category ?? '') ?? [];
    if (ratios.length >= 3) {
      multiples.push({ category: cat, live_n: ratios.length, multiple: median(ratios), source: 'category' });
    } else {
      multiples.push({ category: cat, live_n: ratios.length, multiple: globalMultiple, source: 'global' });
    }
  }
  multiples.sort((a, b) => (a.category < b.category ? -1 : a.category > b.category ? 1 : 0));

  const multipleFor = (category: string | null): { multiple: number; live_n: number; source: 'category' | 'global' } => {
    const ratios = byCategory.get(category ?? '') ?? [];
    if (ratios.length >= 3) {
      return { multiple: clamp(median(ratios), 0.05, 1.25), live_n: ratios.length, source: 'category' };
    }
    return { multiple: clamp(globalMultiple, 0.05, 1.25), live_n: ratios.length, source: 'global' };
  };

  const ranked: BoardRow[] = [];
  for (const p of snapshot.protocols) {
    if (!isRankable(p)) continue;
    const m = multipleFor(p.category);
    const age = ageDays(p.listed_at, asOf);
    const growth = clamp(p.change_7d ?? 0, -60, 120);
    const growthMult = 1 + (growth / 100) * 0.5;
    const maturityAge = age === null ? 365 : age;
    const maturityMult = 0.6 + (Math.min(maturityAge, 1095) / 1095) * 0.4;
    const implied = Math.max(1, Math.round(p.tvl_usd * m.multiple * growthMult * maturityMult));
    ranked.push({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      change_7d: p.change_7d,
      age_days: age,
      rank: 0,
      implied_value_usd: implied,
      category_multiple: m.multiple,
      category_multiple_live_n: m.live_n,
      category_multiple_source: m.source,
      growth_pct: growth,
      growth_multiplier: round4(growthMult),
      maturity_multiplier: round4(maturityMult),
      watchlist: watchlist.has(p.slug),
      farm_steps: farmSteps(p),
    });
  }

  ranked.sort((a, b) => {
    if (b.implied_value_usd !== a.implied_value_usd) return b.implied_value_usd - a.implied_value_usd;
    if (b.tvl_usd !== a.tvl_usd) return b.tvl_usd - a.tvl_usd;
    return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
  });
  ranked.forEach((row, i) => {
    row.rank = i + 1;
  });

  // The 24 largest live-token protocols by market cap, exchanges aside:
  // they already trade, so their market cap is a fact, not a model.
  const liveRows: LiveRow[] = [...live]
    .sort((a, b) => b.mcap_usd! - a.mcap_usd!)
    .slice(0, 24)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      change_7d: p.change_7d,
      mcap_usd: p.mcap_usd!,
      symbol: p.symbol,
    }));

  const total = ranked.reduce((n, r) => n + r.implied_value_usd, 0);
  const early = ranked.filter((r) => !r.watchlist).length;

  return {
    model_version: MODEL_VERSION,
    as_of: asOf,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    watchlist_size: snapshot.watchlist.length,
    early_count: early,
    live_count: liveRows.length,
    total_implied_usd: total,
    rows: ranked,
    live: liveRows,
    multiples,
  };
}

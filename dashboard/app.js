// Token Radar dashboard: renders the radar-2 board from window.RADAR
// (written by main.ts as data.js). No network, no fetch: the data is
// already on the page. Filters, sorting, tabs and the selected protocol
// are kept in the URL hash so a view can be shared and re-opened.

const DATA = window.RADAR;
const ROWS = DATA.rows;
const LIVE = DATA.live;
const MAX_IMPLIED = ROWS.length ? ROWS[0].implied_value_usd : 1;

const $ = (id) => document.getElementById(id);
const money = (n) => '$' + Math.round(n).toLocaleString('en-US');
const moneyShort = (n) => {
  if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
  if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
  return money(n);
};
const pct = (v) => {
  if (v === null || v === undefined) return 'n/a';
  return (v > 0 ? '+' : '') + v.toFixed(2) + '%';
};
const ageText = (age) => {
  if (age === null || age === undefined) return 'unknown';
  if (age >= 365) return (age / 365).toFixed(1) + ' years';
  return age + ' days';
};
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// ---- header chips, facts, chart, model panel, footer (rendered once) ----

function renderStatic() {
  $('chips').innerHTML =
    `<span class="chip">Snapshot ${esc(DATA.as_of)}</span>` +
    `<span class="chip">DefiLlama protocol index</span>` +
    `<span class="chip">Model ${esc(DATA.model_version)}</span>`;

  const watchCovered = ROWS.filter((r) => r.watchlist).length;
  $('facts').innerHTML =
    fact(`Watchlist covered`, `${watchCovered}/${DATA.watchlist_size}`) +
    fact(`Pre-token rows scored`, String(ROWS.length)) +
    fact(`Early rows below the floor`, String(DATA.early_count)) +
    fact(`Total implied value`, money(DATA.total_implied_usd));

  $('chart').innerHTML = ROWS.slice(0, 10).map((r) => {
    const w = Math.max(1, (r.implied_value_usd / MAX_IMPLIED) * 100);
    return `<div class="chart-row"><span class="rank">#${r.rank}</span>` +
      `<span class="nm">${esc(r.name)}</span>` +
      `<span class="bar-wrap"><span class="bar" style="display:block;width:${w.toFixed(1)}%"></span></span>` +
      `<span class="val">${moneyShort(r.implied_value_usd)}</span></div>`;
  }).join('');

  $('multiples-rows').innerHTML = DATA.multiples.map((m) =>
    `<tr><td>${esc(m.category)}</td><td class="num">${m.live_n}</td>` +
    `<td class="num">${m.multiple.toFixed(4)}×</td><td>${m.source === 'category' ? 'Category median' : 'Global fallback'}</td></tr>`,
  ).join('');

  $('footer').textContent =
    `Snapshot ${DATA.as_of} · Source: DefiLlama protocol index · Model ${DATA.model_version} · ` +
    `Watchlist ${DATA.watchlist_size} · Early ${DATA.early_count} · Live ${DATA.live_count}`;
}

function fact(label, value) {
  return `<div class="fact"><div class="num">${esc(value)}</div><div class="lab">${esc(label)}</div></div>`;
}

// ---- controls, filtering, sorting ----

const state = {
  q: '', cat: '', chain: '', growth: 'any', watch: false,
  tab: 'pre', sortKey: 'rank', sortDir: 1, row: null,
};

function readHash() {
  const h = new URLSearchParams(location.hash.slice(1));
  state.q = h.get('q') || '';
  state.cat = h.get('cat') || '';
  state.chain = h.get('chain') || '';
  state.growth = h.get('growth') || 'any';
  state.watch = h.get('watchlist') === '1' || h.get('watch') === '1';
  state.tab = h.get('tab') === 'live' ? 'live' : 'pre';
  state.sortKey = h.get('sort') || 'rank';
  state.sortDir = h.get('dir') === 'desc' ? -1 : 1;
  state.row = h.get('p') || h.get('row') || null;
}

function writeHash() {
  const h = new URLSearchParams();
  if (state.q) h.set('q', state.q);
  if (state.cat) h.set('cat', state.cat);
  if (state.chain) h.set('chain', state.chain);
  if (state.growth !== 'any') h.set('growth', state.growth);
  if (state.watch) h.set('watchlist', '1');
  if (state.tab !== 'pre') h.set('tab', state.tab);
  if (state.sortKey !== 'rank') h.set('sort', state.sortKey);
  if (state.sortDir === -1) h.set('dir', 'desc');
  if (state.row) h.set('p', state.row);
  const s = h.toString();
  history.replaceState(null, '', s ? '#' + s : location.pathname + location.search);
}

function fillSelects() {
  const cats = [...new Set(ROWS.map((r) => r.category).filter(Boolean))].sort();
  $('cat').innerHTML = '<option value="">All categories</option>' +
    cats.map((c) => `<option value="${esc(c)}">${esc(c)}</option>`).join('');
  const chains = [...new Set(ROWS.flatMap((r) => r.chains))].sort();
  $('chain').innerHTML = '<option value="">All chains</option>' +
    chains.map((c) => `<option value="${esc(c)}">${esc(c)}</option>`).join('');
}

function filteredRows() {
  const q = state.q.trim().toLowerCase();
  let list = ROWS.filter((r) => {
    if (state.watch && !r.watchlist) return false;
    if (state.cat && r.category !== state.cat) return false;
    if (state.chain && !r.chains.includes(state.chain)) return false;
    if (state.growth === 'up' && !(r.change_7d !== null && r.change_7d > 0)) return false;
    if (state.growth === 'down' && !(r.change_7d !== null && r.change_7d < 0)) return false;
    if (q) {
      const hay = [r.name, r.category || '', ...r.chains].join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
  const key = state.sortKey;
  const dir = state.sortDir;
  const val = (r) => {
    if (key === 'name') return r.name.toLowerCase();
    if (key === 'watchlist') return r.watchlist ? 1 : 0;
    if (key === 'change_7d' || key === 'age_days') return r[key] === null ? -Infinity : r[key];
    return r[key];
  };
  list = [...list].sort((a, b) => {
    const va = val(a);
    const vb = val(b);
    if (va < vb) return -1 * dir;
    if (va > vb) return 1 * dir;
    return (a.rank - b.rank) * 1;
  });
  return list;
}

function renderTable() {
  const pre = state.tab === 'pre';
  $('board-table').hidden = !pre;
  $('live-table').hidden = pre;
  $('live-caption').hidden = pre;
  $('tab-pre').setAttribute('aria-selected', pre ? 'true' : 'false');
  $('tab-live').setAttribute('aria-selected', pre ? 'false' : 'true');

  if (pre) {
    const list = filteredRows();
    $('count').textContent = `${list.length} of ${ROWS.length} rows shown`;
    $('rows').innerHTML = list.map((r) => {
      const g = r.change_7d;
      const cls = g === null ? '' : g > 0 ? 'up' : g < 0 ? 'down' : '';
      const barW = Math.max(1, (r.implied_value_usd / MAX_IMPLIED) * 100);
      return `<tr tabindex="0" data-slug="${esc(r.slug)}">` +
        `<td class="num">${r.rank}</td>` +
        `<td><b>${esc(r.name)}</b><br><span class="sub">${esc(r.category || 'No category')} · ${esc(r.chains.slice(0, 2).join(', ') || '—')}</span></td>` +
        `<td class="num">${money(r.tvl_usd)}</td>` +
        `<td class="num ${cls}">${pct(g)}</td>` +
        `<td>${ageText(r.age_days)}</td>` +
        `<td class="num">${money(r.implied_value_usd)}<span class="valbar" style="display:block;width:${barW.toFixed(1)}%"></span></td>` +
        `<td><span class="badge ${r.watchlist ? 'watch' : 'early'}">${r.watchlist ? 'Watchlist' : 'Early'}</span></td></tr>`;
    }).join('');
  } else {
    $('count').textContent = `${LIVE.length} live-token protocols shown`;
    $('live-rows').innerHTML = LIVE.map((p) => {
      const g = p.change_7d;
      const cls = g === null ? '' : g > 0 ? 'up' : g < 0 ? 'down' : '';
      return `<tr tabindex="0" data-slug="${esc(p.slug)}">` +
        `<td><span class="badge early">Live</span></td>` +
        `<td><b>${esc(p.name)}</b><br><span class="sub">${esc(p.category || 'No category')} · ${esc(p.chains.slice(0, 2).join(', ') || '—')}</span></td>` +
        `<td class="num">${money(p.tvl_usd)}</td>` +
        `<td class="num ${cls}">${pct(g)}</td>` +
        `<td class="num">${money(p.mcap_usd)}</td>` +
        `<td>${esc(p.symbol || '—')}</td></tr>`;
    }).join('');
  }
}

// ---- detail dialog ----

function recompute(row) {
  const growthMult = 1 + (row.growth_pct / 100) * 0.5;
  const ageFor = row.age_days === null ? 365 : row.age_days;
  const maturityMult = 0.6 + (Math.min(ageFor, 1095) / 1095) * 0.4;
  return Math.max(1, Math.round(row.tvl_usd * row.category_multiple * growthMult * maturityMult));
}

function openDetail(slug) {
  const row = ROWS.find((r) => r.slug === slug);
  if (!row) return;
  state.row = slug;
  writeHash();
  $('detail-title').textContent = row.name;
  const re = recompute(row);
  const same = re === row.implied_value_usd;
  const multipleNote = row.category_multiple_source === 'category'
    ? `The multiple is the median market-cap-per-TVL of the ${row.category_multiple_live_n} live-token protocols in ${row.category || 'this category'}.`
    : `Only ${row.category_multiple_live_n} live-token protocol${row.category_multiple_live_n === 1 ? '' : 's'} in this category, so the global median across all live-token protocols is used instead.`;
  const recomputeLine = same
    ? `Radar-2 recomputes ${money(re)} from the snapshot figures (TVL ${money(row.tvl_usd)} × multiple ${row.category_multiple.toFixed(4)} × growth multiplier ${row.growth_multiplier.toFixed(4)} × maturity multiplier ${row.maturity_multiplier.toFixed(4)}), the same number board.json carries.`
    : `Radar-2 recomputes ${money(re)} from the snapshot figures, which differs from the ${money(row.implied_value_usd)} board.json carries, so the data shown here is stale.`;
  const steps = row.farm_steps.map((s) => {
    const cut = s.indexOf(' Cost: ');
    const action = cut >= 0 ? s.slice(0, cut) : s;
    const ct = cut >= 0 ? s.slice(cut + 1) : '';
    return `<li><b>${esc(action)}</b><span class="cost">${esc(ct)}</span></li>`;
  }).join('');
  $('detail-content').innerHTML =
    `<p><b>Rank #${row.rank}</b> · ${row.watchlist ? 'Watchlist' : 'Early'} · ${esc(row.category || 'No category')} · ${esc(row.chains.join(', ') || '—')}</p>` +
    `<div class="detail-section"><h4>Implied value</h4>` +
    `<div class="equation">` +
    `<div><span class="k">TVL</span><span class="v">${money(row.tvl_usd)}</span></div>` +
    `<div><span class="k">Category multiple</span><span class="v">${row.category_multiple.toFixed(4)}×</span></div>` +
    `<div><span class="k">7-day growth</span><span class="v">${pct(row.change_7d)}</span></div>` +
    `<div><span class="k">Age with no token</span><span class="v">${ageText(row.age_days)}</span></div>` +
    `<div><span class="k">Growth multiplier</span><span class="v">${row.growth_multiplier.toFixed(4)}</span></div>` +
    `<div><span class="k">Maturity multiplier</span><span class="v">${row.maturity_multiplier.toFixed(4)}</span></div>` +
    `<div><span class="k">Implied value</span><span class="v total">${money(row.implied_value_usd)}</span></div>` +
    `</div>` +
    `<p class="note">${esc(multipleNote)}</p>` +
    `<p class="sub">${esc(recomputeLine)}</p>` +
    `<p>This is an estimate, not a price.</p></div>` +
    `<div class="detail-section"><h4>Farm plan</h4><ol class="steps">${steps}</ol>` +
    `<p>This plan farms the protocol as its record stands. It does not predict a token, a date, or a reward, and the steps are worth doing only if the position itself is one you would hold anyway.</p></div>`;
  const dlg = $('detail');
  if (!dlg.open) dlg.showModal();
}

function closeDetail() {
  const dlg = $('detail');
  if (dlg.open) dlg.close();
  if (state.row) {
    state.row = null;
    writeHash();
  }
}

// ---- wiring ----

function init() {
  readHash();
  renderStatic();
  fillSelects();
  $('q').value = state.q;
  $('cat').value = state.cat;
  $('chain').value = state.chain;
  $('growth').value = state.growth;
  $('watch').checked = state.watch;
  renderTable();

  $('q').addEventListener('input', (e) => { state.q = e.target.value; writeHash(); renderTable(); });
  $('cat').addEventListener('change', (e) => { state.cat = e.target.value; writeHash(); renderTable(); });
  $('chain').addEventListener('change', (e) => { state.chain = e.target.value; writeHash(); renderTable(); });
  $('growth').addEventListener('change', (e) => { state.growth = e.target.value; writeHash(); renderTable(); });
  $('watch').addEventListener('change', (e) => { state.watch = e.target.checked; writeHash(); renderTable(); });
  $('tab-pre').addEventListener('click', () => { state.tab = 'pre'; writeHash(); renderTable(); });
  $('tab-live').addEventListener('click', () => { state.tab = 'live'; writeHash(); renderTable(); });

  document.querySelectorAll('#board-table th[data-sort]').forEach((th) => {
    th.addEventListener('click', () => {
      const key = th.getAttribute('data-sort');
      if (state.sortKey === key) state.sortDir = -state.sortDir;
      else { state.sortKey = key; state.sortDir = 1; }
      writeHash();
      renderTable();
    });
  });

  document.addEventListener('click', (e) => {
    const tr = e.target.closest('tr[data-slug]');
    if (tr) openDetail(tr.getAttribute('data-slug'));
  });
  document.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('tr[data-slug]')) {
      e.preventDefault();
      openDetail(e.target.getAttribute('data-slug'));
    }
  });

  $('detail-close').addEventListener('click', closeDetail);
  $('detail').addEventListener('close', () => {
    if (state.row) { state.row = null; writeHash(); }
  });

  if (state.row) openDetail(state.row);
}

init();

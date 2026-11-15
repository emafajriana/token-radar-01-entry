// Token Radar harness: read the sealed snapshot, score the radar-2 board,
// and write board.json, data.js, the dashboard, the screenshots and the
// dossier into the output directory. Node 22, standard library only.
//
// Usage (from the repository root):
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json>
// In the grader the input is /input/snapshot.json and the output is /output.

import { buildDossier } from './vendor/makefun-board.ts';
import { buildBoard } from './lib/model.ts';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));

function fail(message: string): never {
  throw new Error(`token-radar: ${message}`);
}

function parseArgs(argv: string[]): { input: string; output: string } {
  let input = '/input/snapshot.json';
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--input' && i + 1 < argv.length) {
      input = argv[++i]!;
    }
  }
  const output = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
  return { input, output };
}

function loadSnapshot(inputPath: string) {
  let path = resolve(inputPath);
  if (existsSync(path) && statSync(path).isDirectory()) {
    path = join(path, 'snapshot.json');
  }
  if (!existsSync(path)) fail(`snapshot not found at ${path}`);
  return JSON.parse(readFileSync(path, 'utf8'));
}

function copyTree(src: string, dest: string): void {
  mkdirSync(dest, { recursive: true });
  for (const entry of readdirSync(src, { withFileTypes: true })) {
    const from = join(src, entry.name);
    const to = join(dest, entry.name);
    if (entry.isDirectory()) {
      copyTree(from, to);
    } else if (entry.isFile()) {
      copyFileSync(from, to);
    } else {
      fail(`cannot copy ${from}: not a regular file`);
    }
  }
}

function checkBoard(board: ReturnType<typeof buildBoard>, snapshot: { watchlist: string[] }): void {
  const rows = board.rows;
  if (rows.length < 100) fail(`board holds ${rows.length} rows, fewer than 100`);
  const seen = new Set<string>();
  for (const row of rows) {
    if (seen.has(row.slug)) fail(`duplicate slug ${row.slug}`);
    seen.add(row.slug);
    if (!Number.isSafeInteger(row.implied_value_usd) || row.implied_value_usd <= 0) {
      fail(`row ${row.slug} has a bad implied value ${row.implied_value_usd}`);
    }
    if (row.farm_steps.length < 3 || row.farm_steps.length > 12) {
      fail(`row ${row.slug} holds ${row.farm_steps.length} farm steps`);
    }
    for (const step of row.farm_steps) {
      const len = step.trim().length;
      if (len < 20 || len > 600) fail(`row ${row.slug} has a farm step of ${len} characters`);
    }
  }
  for (let i = 0; i < rows.length; i++) {
    if (rows[i]!.rank !== i + 1) fail(`rank ${rows[i]!.rank} is not ${i + 1} at position ${i}`);
    if (i > 0 && rows[i]!.implied_value_usd > rows[i - 1]!.implied_value_usd) {
      fail(`implied value rises from rank ${i} to rank ${i + 1}`);
    }
  }
  for (const slug of snapshot.watchlist) {
    if (!seen.has(slug)) fail(`watchlist slug ${slug} is missing from the board`);
  }
}

function main(): void {
  const { input, output } = parseArgs(process.argv.slice(2));
  const snapshot = loadSnapshot(input);
  const board = buildBoard(snapshot);
  checkBoard(board, snapshot);

  const shotsDir = join(ROOT, 'screenshots');
  const shots = existsSync(shotsDir)
    ? readdirSync(shotsDir, { withFileTypes: true }).filter((e) => e.isFile() && !e.name.startsWith('.'))
    : [];
  if (shots.length < 3) fail(`screenshots/ holds ${shots.length} images, fewer than 3`);

  // The grader mounts /output: the directory itself cannot be removed
  // (rmdir of a mount point is EBUSY). Create it, then empty its contents.
  mkdirSync(output, { recursive: true });
  for (const entry of readdirSync(output, { withFileTypes: true })) {
    rmSync(join(output, entry.name), { recursive: true, force: true });
  }

  writeFileSync(join(output, 'board.json'), `${JSON.stringify({ rows: board.rows }, null, 2)}\n`, 'utf8');
  writeFileSync(
    join(output, 'data.js'),
    `window.RADAR = ${JSON.stringify(board)};\n`,
    'utf8',
  );

  copyTree(join(ROOT, 'dashboard'), join(output, 'dashboard'));
  copyTree(shotsDir, join(output, 'screenshots'));

  // The dossier is written last, from exactly what the output holds.
  const dossier = buildDossier(output, {
    text_max_bytes: 65536,
    screenshots: { max: 4, max_bytes: 524288 },
    dashboard: { max_files: 400, max_bytes: 4 * 1024 * 1024 },
  });
  writeFileSync(join(output, 'dossier.json'), dossier);

  console.log(
    `token-radar: ${board.rows.length} rows (${board.watchlist_size} watchlist + ${board.early_count} early), ` +
      `${board.live_count} live set aside, total implied $${board.total_implied_usd.toLocaleString('en-US')}`,
  );
}

main();

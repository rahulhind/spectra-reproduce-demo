// The Spectra Reproduce CLI (ARCHITECTURE.md §7): what a developer or a CI job runs.
//
//   node service/cli.mjs check   --server URL --site SITE --token TOKEN --base URL|DIR --candidate URL|DIR
//                                [--k 3] [--label TEXT] [--commit SHA] [--timeout-min 30]
//   node service/cli.mjs library --server URL --site SITE --token TOKEN        (rebuild the journey library)
//
// TOKEN is a site token made in the dashboard (CI or agent), or a dashboard session. A build given as a folder (a
// static frontend's output: dist/, build/) is uploaded to Spectra and served by the worker for the check: no preview
// deployment needed. A build given as a URL is replayed where it is (a preview deployment; public addresses only).
// Exit code: 1 when the check fails (a journey is BROKEN), 0 otherwise; the report goes to stdout and, in
// GitHub Actions, to the job summary.
import { existsSync, statSync, appendFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { packBuild } from './build-archive.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const [cmd] = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const SERVER = arg('server', process.env.SPECTRA_SERVER || 'http://127.0.0.1:8080');
const SITE = arg('site', process.env.SPECTRA_SITE);
const TOKEN = arg('token', process.env.SPECTRA_TOKEN);
if (!SITE || !TOKEN || !['check', 'library'].includes(cmd)) {
  console.error('usage: cli.mjs check|library --server URL --site SITE --token TOKEN [--base URL|DIR --candidate URL|DIR]');
  process.exit(2);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const q = (o) => new URLSearchParams(o).toString();

async function api(method, path, body) {
  const res = await fetch(`${SERVER}${path}`, {
    method,
    headers: { Authorization: `Bearer ${TOKEN}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

// A URL as it is; a folder uploaded (a .tar.gz), named by what the server answers ("build:<id>").
async function buildUrl(value) {
  if (/^https?:\/\//.test(value)) return value;
  const dir = resolve(value);
  if (!existsSync(dir) || !statSync(dir).isDirectory()) throw new Error(`${value} is neither a URL nor a folder`);
  const archive = packBuild(dir);
  const res = await fetch(`${SERVER}/v1/reproduce/builds?${q({ site: SITE })}`, { method: 'POST', headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/gzip' }, body: archive });
  if (!res.ok) throw new Error(`uploading ${value}: ${res.status} ${(await res.text()).slice(0, 300)}`);
  const { build } = await res.json();
  console.error(`spectra: ${value} uploaded as ${build} (${Math.round(archive.length / 1024)} KB)`);
  return build;
}

async function wait(run, minutes) {
  const until = Date.now() + minutes * 60 * 1000;
  let last = '';
  while (Date.now() < until) {
    run = await api('GET', `/v1/reproduce/run?${q({ site: SITE, id: run.id })}`);
    if (run.status !== last) {
      console.error(`spectra: ${run.id} ${run.status}`);
      last = run.status;
    }
    if (run.status === 'done' || run.status === 'failed') return run;
    await sleep(3000);
  }
  throw new Error(`the check did not finish within ${minutes} minutes`);
}

let code = 0;
try {
  if (cmd === 'library') {
    const run = await wait(await api('POST', `/v1/reproduce/runs?${q({ site: SITE })}`, { kind: 'library' }), 30);
    const lib = await api('GET', `/v1/reproduce/library?${q({ site: SITE })}`);
    console.log(`${lib.sessions} visits → ${lib.journeys.length} journeys`);
    for (const j of lib.journeys) console.log(`  ${j.eligible ? 'eligible ' : 'not used '} ${String(j.visits).padStart(3)} visits  ${j.name}${j.cause ? `  (${j.cause})` : ''}`);
    if (run.status === 'failed') throw new Error(run.error);
  } else {
    const base = await buildUrl(arg('base'));
    const candidate = await buildUrl(arg('candidate'));
    const created = await api('POST', `/v1/reproduce/runs?${q({ site: SITE })}`, {
      kind: 'check',
      base,
      candidate,
      k: Number(arg('k', '3')),
      label: arg('label', ''),
      commit: arg('commit', process.env.GITHUB_SHA || ''),
    });
    console.error(`spectra: check ${created.id} queued (base ${base}, candidate ${candidate})`);
    const run = await wait(created, Number(arg('timeout-min', '30')));
    if (run.status === 'failed') throw new Error(`the check could not run: ${run.error}`);
    const report = run.result.report || `# Spectra check: ${run.result.status}`;
    console.log(report);
    if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, report + '\n');
    if (run.result.status === 'failure') code = 1;
  }
} catch (e) {
  console.error(`spectra: ${e.message}`);
  code = 2;
}
process.exit(code);

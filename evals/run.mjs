#!/usr/bin/env node
/**
 * Deterministic behavioral evals for the use-spark skill.
 *
 * Each case gives the model the skill text plus a scenario, asks for the exact
 * command(s) or user-facing message it would produce, and grades the output
 * with regex assertions (an objective oracle - no LLM judge).
 *
 * Providers:
 *   claude[:model]   - local Claude Code CLI (`claude -p`), uses your subscription
 *   codex[:model]    - local Codex CLI (`codex exec`, isolated profile, read-only sandbox)
 *   grok[:model]     - local Grok CLI (`grok -p`)
 *   opencode[:model] - local OpenCode CLI (`opencode run`)
 *   agy              - local Antigravity CLI (`agy --print`)
 *   <anything else>  - treated as a model id on an OpenAI-compatible endpoint
 *                      (EVAL_BASE_URL, default http://localhost:8317/v1;
 *                       EVAL_API_KEY, default "local")
 *
 * The harness CLIs are agentic and take no separate system prompt, so the
 * skill text is prepended to the user prompt with a dry-run guard. Codex runs
 * in a read-only sandbox; all providers are instructed never to execute
 * commands - cases are graded on emitted text only.
 *
 * Cases live in the skill's evals/evals.json (BenchFlow / agentskills.io
 * `bench skills eval` schema). Each case's `question` is the agent-facing
 * scenario; the deterministic checks live in a namespaced `oracle` object
 * ({type, must_match, must_not_match}) that BenchFlow ignores, so the same
 * file also works with BenchFlow's LLM-judge path via `expected_behavior`.
 *
 * Usage:
 *   node run.mjs --label fork --skill ../skills/use-spark/SKILL.md \
 *                --skill ../skills/use-spark/reference.md --provider claude \
 *                --evals ../skills/use-spark/evals/evals.json
 *   node run.mjs --label upstream --skill /tmp/upstream-SKILL.md --provider gpt-5.5
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
};
const optAll = (name) =>
  args.flatMap((a, i) => (a === `--${name}` ? [args[i + 1]] : []));

const label = opt('label', 'run');
const provider = opt('provider', 'claude');
const skillFiles = optAll('skill');
if (!skillFiles.length) skillFiles.push(join(HERE, '../skills/use-spark/SKILL.md'));
const evalsFile = opt('evals', join(HERE, '../skills/use-spark/evals/evals.json'));
const timeoutMs = parseInt(opt('timeout', '180000'), 10);
const concurrency = parseInt(opt('concurrency', '4'), 10);

const skill = skillFiles.map((f) => readFileSync(resolve(f), 'utf8')).join('\n\n');
const evalDoc = JSON.parse(readFileSync(resolve(evalsFile), 'utf8'));
const cases = evalDoc.cases.map((c) => ({
  id: c.id,
  question: c.question,
  ...(c.oracle || {}),
}));

const SYSTEM = `You are an AI email assistant that operates the user's mailbox exclusively through the \`spark\` CLI. The following skill document is your only reference for how to use it. Follow it exactly.\n\n<skill>\n${skill}\n</skill>`;

const FORMAT = {
  command:
    'Respond with ONLY the shell command(s) you would run next, in order, one per line, inside a single ```bash code block. No prose before or after.',
  message:
    'Respond with ONLY the exact message you would show the user. No preamble, no commentary.',
};

async function callClaude(model, system, user) {
  const cliArgs = ['-p', '--output-format', 'json', '--no-session-persistence',
    '--model', model || 'sonnet', '--system-prompt', system];
  const env = { ...process.env };
  delete env.CLAUDECODE;
  delete env.CLAUDE_CODE_ENTRYPOINT;
  delete env.ANTHROPIC_API_KEY;
  return new Promise((res, rej) => {
    const child = spawn('claude', cliArgs, { stdio: ['pipe', 'pipe', 'pipe'], env, cwd: '/tmp' });
    const timer = setTimeout(() => { child.kill(); rej(new Error('claude CLI timeout')); }, timeoutMs);
    let out = '', err = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (err += d));
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) return rej(new Error(`claude exited ${code}: ${err.slice(0, 300)}`));
      try { res(JSON.parse(out).result ?? ''); } catch { res(out); }
    });
    child.stdin.write(user); child.stdin.end();
  });
}

function spawnCapture(bin, cliArgs, { env = process.env, cwd = '/tmp', input = null } = {}) {
  return new Promise((res, rej) => {
    const child = spawn(bin, cliArgs, { stdio: ['pipe', 'pipe', 'pipe'], env, cwd });
    const timer = setTimeout(() => { child.kill(); rej(new Error(`${bin} timeout`)); }, timeoutMs);
    let out = '', err = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (err += d));
    child.on('error', (e) => { clearTimeout(timer); rej(e); });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0 && !out.trim()) return rej(new Error(`${bin} exited ${code}: ${err.slice(0, 300)}`));
      res(out);
    });
    if (input !== null) child.stdin.write(input);
    child.stdin.end();
  });
}

const DRY_RUN_GUARD =
  '\n\n(Dry-run evaluation: do NOT execute any commands or use any tools. Respond with text only.)';

async function callCodex(model, system, user) {
  // Auth lives in CODEX_HOME; --ignore-user-config keeps memories/MCP out.
  // Set EVAL_CODEX_HOME to point at a prepared isolated home with credentials.
  const env = { ...process.env };
  if (process.env.EVAL_CODEX_HOME) {
    mkdirSync(process.env.EVAL_CODEX_HOME, { recursive: true });
    env.CODEX_HOME = process.env.EVAL_CODEX_HOME;
  }
  const out = await spawnCapture('codex', [
    'exec', '--ephemeral', '--ignore-user-config', '-s', 'read-only', '--json',
    '--skip-git-repo-check', '-m', model || 'gpt-5.6-sol', '-C', '/tmp',
    `${system}\n\n---\n\n${user}${DRY_RUN_GUARD}`,
  ], { env });
  const msgs = out.split('\n').filter(Boolean).flatMap((l) => {
    try { const j = JSON.parse(l); return j.item?.type === 'agent_message' ? [j.item.text] : []; }
    catch { return []; }
  });
  if (!msgs.length) throw new Error(`codex: no agent_message in output: ${out.slice(0, 200)}`);
  return msgs[msgs.length - 1];
}

async function callGrok(model, system, user) {
  const out = await spawnCapture('grok', [
    '-p', `${system}\n\n---\n\n${user}${DRY_RUN_GUARD}`,
    '-m', model || 'grok-4.5', '--output-format', 'json', '--disable-web-search',
  ]);
  const j = JSON.parse(out);
  if (j.type === 'error') throw new Error(`grok: ${j.message}`);
  return j.text ?? '';
}

async function callOpencode(model, system, user) {
  const cliArgs = ['run', '--format', 'json', '--auto', '--pure'];
  const m = model || process.env.EVAL_OPENCODE_MODEL;
  if (m) cliArgs.push('-m', m);
  cliArgs.push(`${system}\n\n---\n\n${user}${DRY_RUN_GUARD}`);
  const out = await spawnCapture('opencode', cliArgs);
  const texts = out.split('\n').filter(Boolean).flatMap((l) => {
    try { const j = JSON.parse(l); return j.type === 'text' ? [j.part?.text ?? j.text ?? ''] : []; }
    catch { return []; }
  }).filter((t) => t.length);
  if (!texts.length) throw new Error(`opencode: no text parts in output: ${out.slice(0, 200)}`);
  return texts[texts.length - 1];
}

async function callAgy(model, system, user) {
  const out = await spawnCapture('agy', [
    '--print', `${system}\n\n---\n\n${user}${DRY_RUN_GUARD}`, '--dangerously-skip-permissions',
  ]);
  if (!out.trim()) throw new Error('agy: empty output');
  return out.trim();
}

async function callOpenAI(model, system, user) {
  const base = process.env.EVAL_BASE_URL || 'http://localhost:8317/v1';
  const r = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${process.env.EVAL_API_KEY || 'local'}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!r.ok) throw new Error(`${model}: HTTP ${r.status} ${(await r.text()).slice(0, 300)}`);
  return (await r.json()).choices[0].message.content ?? '';
}

function grade(c, output) {
  const failures = [];
  for (const p of c.must_match || []) {
    if (!new RegExp(p, 'm').test(output)) failures.push({ kind: 'must_match', pattern: p });
  }
  for (const p of c.must_not_match || []) {
    if (new RegExp(p, 'm').test(output)) failures.push({ kind: 'must_not_match', pattern: p });
  }
  return failures;
}

async function runCase(c) {
  const user = `${c.question}\n\n${FORMAT[c.type || 'command']}`;
  const [name, subModel] = provider.split(/:(.*)/s);
  const HARNESSES = { claude: callClaude, codex: callCodex, grok: callGrok, opencode: callOpencode, agy: callAgy };
  const call = HARNESSES[name];
  let output = '', error = null;
  try {
    output = call ? await call(subModel, SYSTEM, user) : await callOpenAI(provider, SYSTEM, user);
  } catch (e) { error = e.message; }
  const failures = error ? [{ kind: 'error', pattern: error }] : grade(c, output);
  return { id: c.id, pass: failures.length === 0, failures, output };
}

// worker pool (--concurrency, default 4; use 1 for CLIs with local state, e.g. opencode's db)
const results = [];
let idx = 0;
await Promise.all(Array.from({ length: concurrency }, async () => {
  while (idx < cases.length) {
    const c = cases[idx++];
    const r = await runCase(c);
    results.push(r);
    console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.id}${r.pass ? '' : '  [' + r.failures.map((f) => `${f.kind}:${f.pattern}`).join('; ') + ']'}`);
  }
}));

results.sort((a, b) => a.id.localeCompare(b.id));
const passed = results.filter((r) => r.pass).length;
const report = {
  label, provider, skillFiles, evalsFile, timestamp: new Date().toISOString(),
  passed, total: results.length, passRate: +(passed / results.length).toFixed(3),
  results,
};
mkdirSync(join(HERE, 'results'), { recursive: true });
const outFile = join(HERE, 'results', `${label}-${provider.replace(/[^a-z0-9.-]/gi, '_')}.json`);
writeFileSync(outFile, JSON.stringify(report, null, 2));
console.log(`\n${label} / ${provider}: ${passed}/${results.length} (${Math.round(report.passRate * 100)}%)  -> ${outFile}`);

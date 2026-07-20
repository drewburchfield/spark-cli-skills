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
 *   <anything else>  - treated as a model id on an OpenAI-compatible endpoint
 *                      (EVAL_BASE_URL, default http://localhost:8317/v1;
 *                       EVAL_API_KEY, default "local")
 *
 * Usage:
 *   node run.mjs --label fork --skill ../skills/use-spark/SKILL.md \
 *                --skill ../skills/use-spark/reference.md --provider claude
 *   node run.mjs --label upstream --skill /tmp/upstream-SKILL.md --provider gpt-5.5
 */
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
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
const casesDir = opt('cases', join(HERE, 'cases'));
const timeoutMs = parseInt(opt('timeout', '180000'), 10);

const skill = skillFiles.map((f) => readFileSync(resolve(f), 'utf8')).join('\n\n');
const cases = readdirSync(casesDir)
  .filter((f) => f.endsWith('.json'))
  .sort()
  .map((f) => ({ file: f, ...JSON.parse(readFileSync(join(casesDir, f), 'utf8')) }));

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
  const user = `${c.context ? `Context:\n${c.context}\n\n` : ''}User request: ${c.user}\n\n${FORMAT[c.type || 'command']}`;
  const isClaude = provider === 'claude' || provider.startsWith('claude:');
  const model = isClaude ? provider.split(':')[1] : provider;
  let output = '', error = null;
  try {
    output = isClaude ? await callClaude(model, SYSTEM, user) : await callOpenAI(model, SYSTEM, user);
  } catch (e) { error = e.message; }
  const failures = error ? [{ kind: 'error', pattern: error }] : grade(c, output);
  return { id: c.id || c.file, pass: failures.length === 0, failures, output };
}

// pool of 4
const results = [];
let idx = 0;
await Promise.all(Array.from({ length: 4 }, async () => {
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
  label, provider, skillFiles, timestamp: new Date().toISOString(),
  passed, total: results.length, passRate: +(passed / results.length).toFixed(3),
  results,
};
mkdirSync(join(HERE, 'results'), { recursive: true });
const outFile = join(HERE, 'results', `${label}-${provider.replace(/[^a-z0-9.-]/gi, '_')}.json`);
writeFileSync(outFile, JSON.stringify(report, null, 2));
console.log(`\n${label} / ${provider}: ${passed}/${results.length} (${Math.round(report.passRate * 100)}%)  -> ${outFile}`);

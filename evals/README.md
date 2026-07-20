# use-spark behavioral evals

Deterministic, oracle-graded evals for the [`use-spark`](../skills/use-spark/SKILL.md) skill. Each case hands the model the skill text plus a realistic scenario, asks for the exact command(s) or user-facing message it would produce, and grades the output with regex assertions. No LLM judge, no flakiness: a run is reproducible and a failure points at a specific missing or ignored instruction.

## Results

Pass rate out of 8 cases, per skill variant and provider. "Upstream" is the vendor skill at v1.3.0 (780 lines, single file). "Fork" is this repo's restructure: a ~100-line core `SKILL.md` with critical rules first, plus `reference.md` for full flag documentation. Providers span four real agent CLI harnesses and three models on an OpenAI-compatible gateway.

| Provider | Upstream v1.3.0 | Fork |
|---|---|---|
| Claude Code CLI (sonnet) | 7/8 | **8/8** |
| Codex CLI (gpt-5.6-sol) | 6/8 | **8/8** |
| Grok CLI (grok-4.5) | 7/8 | **8/8** |
| OpenCode (glm-5.2) | 7/8 | **8/8** |
| Antigravity CLI | 5/8 | **8/8** |
| gpt-5.5 (gateway) | 7/8 | **8/8** |
| gemini-3.5-flash-low (gateway) | 7/8 | **8/8** |
| **Aggregate** | **46/56 (82.1%)** | **56/56 (100%)** |

Normalized gain (SkillsBench convention, `g = Δ / (100 - baseline)`): **g = 1.0** - the fork captures all available headroom on this case set. Core-only ablation (fork `SKILL.md` without `reference.md`): 24/24 across claude/gpt-5.5/gemini, confirming the reference file is look-up material, not load-bearing rules.

Upstream failure pattern:

- **rich-body** failed on **all seven providers**: structured emails composed as a single plain-text line. Upstream mentions markdown-to-HTML once mid-document with only plain one-line examples, so no model uses it.
- **stale-draft-id** failed on two on record (codex, agy): asked to update a draft from a previous session, the agent composed a brand-new email instead of looking the draft up in the Drafts folder. gpt-5.5 failed it on one trial and passed on a retrial - see the single-trial caveat below.
- **follow-up-nudge** failed on one (agy): a bump on an unanswered thread was drafted as a new cold email instead of a reply to the sender's own last outgoing message.

The core-only ablation initially failed one case on two models (`action send --date` written with an undocumented space-separated datetime). The fix was promoting the date format into the core rules - an example of ablation runs identifying which reference details are load-bearing.

Caveats: single trial per cell (agents are stochastic; treat 1-case deltas as directional). OpenCode must run with `--concurrency 1` - parallel instances hit a local database lock, which surfaces as infra errors, not model failures.

Raw per-run output (model responses included) is in [`results/`](results/).

## Cases

Cases live inside the skill at [`../skills/use-spark/evals/evals.json`](../skills/use-spark/evals/evals.json), in the BenchFlow / agentskills.io `bench skills eval` schema, so they travel with the skill and are consumable by BenchFlow's LLM-judge path as well as this repo's deterministic runner.

| Case | Behavior asserted |
|---|---|
| revise-in-place | Revisions use `draft --edit <id>`, never a duplicate new draft |
| rich-body | Structured emails use markdown (bold/lists/links) and real newlines via `$'...'` |
| reply-threading | Replies pass `--reply-to` with the thread's last message ID |
| follow-up-nudge | Nudges reply to your own last outgoing message, not a new cold email |
| no-unsolicited-send | Drafting never escalates to `action send` without an explicit ask |
| deep-link-message | Draft reports include the Spark deep link as a clickable markdown link |
| send-later | Scheduled sends use `action send <id> --date` with a valid CLI date format |
| stale-draft-id | Unknown draft ID → look it up in Drafts, don't compose a new email |

All scenarios are synthetic: `example.com` addresses, fake message IDs, no real mailbox data. Nothing executes against a live Spark install - the model only ever emits text, which the oracle grades. This is by design: `spark` is an IPC client to a live desktop app and cannot run in a CI or container sandbox, so text-oracle grading is the executable option here (BenchFlow's Docker execution grading is the right tool for skills whose tools *can* run sandboxed).

## Running

Requires Node 18+. Provider types:

```bash
# Local Claude Code CLI (uses your subscription, no API key)
node run.mjs --label fork --provider claude \
  --skill ../skills/use-spark/SKILL.md --skill ../skills/use-spark/reference.md

# Other local agent CLI harnesses
node run.mjs --label fork --provider codex ...      # codex exec, read-only sandbox, isolated profile
node run.mjs --label fork --provider grok ...       # grok -p, web search disabled
node run.mjs --label fork --provider opencode --concurrency 1 ...  # local db: no parallel instances
node run.mjs --label fork --provider agy ...

# Any OpenAI-compatible endpoint (model id = provider name)
EVAL_BASE_URL=http://localhost:8317/v1 EVAL_API_KEY=local \
  node run.mjs --label fork --provider gpt-5.5 \
  --skill ../skills/use-spark/SKILL.md --skill ../skills/use-spark/reference.md
```

Flags: repeatable `--skill <file>` (concatenated into the system prompt), `--provider <name[:model]>`, `--evals <evals.json>` (default: the use-spark one), `--label <name>` (names the results file), `--timeout <ms>`, `--concurrency <n>`. Codex auth: set `EVAL_CODEX_HOME` to an authenticated home; user config is always ignored for isolation.

To reproduce the upstream baseline: `git show upstream/main:skills/use-spark/SKILL.md > /tmp/upstream-SKILL.md` and pass that as the only `--skill`.

## Adding a case

Append to `cases` in the skill's `evals/evals.json`:

```json
{
  "id": "my-case",
  "question": "Context:\n<optional prior tool output>\n\nUser request: <the ask>",
  "expected_behavior": ["Natural-language rubric lines for BenchFlow's LLM judge"],
  "expected_skill": "use-spark",
  "oracle": {
    "goal": "One sentence: the behavior this asserts.",
    "type": "command",
    "must_match": ["regex"],
    "must_not_match": ["regex"]
  }
}
```

`question`, `expected_behavior`, and `expected_skill` are standard BenchFlow fields. The `oracle` object is this runner's namespaced extension (BenchFlow ignores it): `type` is `command` (model must reply with only the shell commands it would run) or `message` (model must reply with only the user-facing message); the regexes grade deterministically. Keep scenarios synthetic and provider-neutral.

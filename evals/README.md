# use-spark behavioral evals

Deterministic, oracle-graded evals for the [`use-spark`](../skills/use-spark/SKILL.md) skill. Each case hands the model the skill text plus a realistic scenario, asks for the exact command(s) or user-facing message it would produce, and grades the output with regex assertions. No LLM judge, no flakiness: a run is reproducible and a failure points at a specific missing or ignored instruction.

## Results

Pass rate out of 8 cases, per skill variant and model. "Upstream" is the vendor skill at v1.3.0 (780 lines, single file). "Fork" is this repo's restructure: a ~100-line core `SKILL.md` with critical rules first, plus `reference.md` for full flag documentation.

| Skill variant | Claude Code CLI (sonnet) | gpt-5.5 | gemini-3.5-flash-low | Aggregate |
|---|---|---|---|---|
| upstream v1.3.0 | 7/8 | 6/8 | 7/8 | 20/24 (83%) |
| **fork (core + reference)** | **8/8** | **8/8** | **8/8** | **24/24 (100%)** |
| fork core only (ablation) | 8/8 | 8/8 | 8/8 | 24/24 (100%) |

Upstream failures observed:

- **rich-body** (gpt-5.5, gemini): composed structured emails as a single plain-text line despite the skill noting markdown support - the capability is mentioned once mid-document with no examples, so models don't use it.
- **stale-draft-id** (gpt-5.5): asked to update a draft from a previous session, composed a brand-new email instead of looking the draft up in the Drafts folder.

The core-only ablation initially failed one case on two models (`action send --date` written with an undocumented space-separated datetime). The fix was promoting the date format into the core rules - an example of ablation runs identifying which reference details are load-bearing.

Raw per-run output (model responses included) is in [`results/`](results/).

## Cases

| Case | Behavior asserted |
|---|---|
| [revise-in-place](cases/01-revise-in-place.json) | Revisions use `draft --edit <id>`, never a duplicate new draft |
| [rich-body](cases/02-rich-body.json) | Structured emails use markdown (bold/lists/links) and real newlines via `$'...'` |
| [reply-threading](cases/03-reply-threading.json) | Replies pass `--reply-to` with the thread's last message ID |
| [follow-up-nudge](cases/04-follow-up-nudge.json) | Nudges reply to your own last outgoing message, not a new cold email |
| [no-unsolicited-send](cases/05-no-unsolicited-send.json) | Drafting never escalates to `action send` without an explicit ask |
| [deep-link-message](cases/06-deep-link-message.json) | Draft reports include the Spark deep link as a clickable markdown link |
| [send-later](cases/07-send-later.json) | Scheduled sends use `action send <id> --date` with a valid CLI date format |
| [stale-draft-id](cases/08-stale-draft-id.json) | Unknown draft ID → look it up in Drafts, don't compose a new email |

All scenarios are synthetic: `example.com` addresses, fake message IDs, no real mailbox data. Nothing executes against a live Spark install - the model only ever emits text, which the oracle grades.

## Running

Requires Node 18+. Two provider types:

```bash
# Local Claude Code CLI (uses your subscription, no API key)
node run.mjs --label fork --provider claude \
  --skill ../skills/use-spark/SKILL.md --skill ../skills/use-spark/reference.md

# Any OpenAI-compatible endpoint (model id = provider name)
EVAL_BASE_URL=http://localhost:8317/v1 EVAL_API_KEY=local \
  node run.mjs --label fork --provider gpt-5.5 \
  --skill ../skills/use-spark/SKILL.md --skill ../skills/use-spark/reference.md
```

Flags: repeatable `--skill <file>` (concatenated into the system prompt), `--provider claude[:model]` or any model id, `--cases <dir>`, `--label <name>` (names the results file), `--timeout <ms>`.

To reproduce the upstream baseline: `git show upstream/main:skills/use-spark/SKILL.md > /tmp/upstream-SKILL.md` and pass that as the only `--skill`.

## Adding a case

Drop a JSON file in `cases/`:

```json
{
  "id": "my-case",
  "goal": "One sentence: the behavior this asserts.",
  "type": "command",
  "context": "Optional prior tool output the model can see.",
  "user": "The user request.",
  "must_match": ["regex"],
  "must_not_match": ["regex"]
}
```

`type` is `command` (model must reply with only the shell commands it would run) or `message` (model must reply with only the user-facing message). Keep scenarios synthetic and provider-neutral.

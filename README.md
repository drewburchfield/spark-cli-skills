# Spark CLI Skills

AI agent skills for the [Spark](https://sparkmailapp.com) CLI. Install individual skills or the full set to give your AI agent structured workflows for email, calendar, contacts, teams, and meetings.

> **Fork notice.** This fork restructures the `use-spark` skill and measures the difference with [deterministic behavioral evals](evals/): **upstream 20/24 → fork 24/24 (83% → 100%)** across the Claude Code CLI, gpt-5.5, and gemini-3.5-flash-low.

## What this fork changes (measured)

| | Upstream v1.3.0 | This fork |
|---|---|---|
| Eval pass rate (8 cases × 3 models) | 20/24 (83%) | **24/24 (100%)** |
| `SKILL.md` size | 780 lines, single file | ~100-line core + `reference.md` on demand |
| Critical rules | scattered mid-document | 6 rules, top of file |

Behavioral fixes, each backed by an [eval case](evals/README.md#cases):

1. **Rich text by default.** Upstream mentions markdown-to-HTML once, with only plain one-line example bodies; models composed walls of plain text (failed `rich-body` on 2 of 3 models). The fork makes formatting a top-level rule with a worked example.
2. **Draft revisions edit in place.** Upstream documents `--edit` but never instructs its use for revisions; models mint duplicate drafts, and one model composed a brand-new email when the draft ID was from a prior session (failed `stale-draft-id`). The fork adds a hard rule plus the Drafts-folder lookup fallback.
3. **Progressive disclosure.** Critical behaviors (threading, deep links, no-send-without-ask, access levels, Send Later date formats) moved to the top of a lean core; the full flag reference loads only when needed.

Findings 1-2 and the restructure may be offered upstream as a PR; the eval harness is provider-neutral and reproducible (see [evals/README.md](evals/README.md)).

## Requirements

- macOS or Windows with a recent build of [Spark Desktop](https://sparkmailapp.com), signed in to at least one account.
- Spark CLI enabled: in Spark, go to **Settings → AI Agents → Spark CLI Setup** and follow the prompts.
- Per-account access levels - `read-only` or `triage` (everything in read-only plus drafts, comments, and email/contact actions) - configured in **Settings → AI Agents -> Spark CLI Access**. Recipes and personas declare the level they need; running one against an account with insufficient access returns an error explaining how to upgrade.

## Skills Index

### Base Skill

The foundation. Every recipe and persona below depends on `use-spark` for the actual command reference and filter syntax - install it first.

| Skill | Description |
|-------|-------------|
| [use-spark](skills/use-spark/SKILL.md) | Complete command reference for the Spark CLI - mail, calendar, contacts, teams, meetings |

### Recipes

Step-by-step workflows for a specific task. Composable - one recipe per job, run them on demand.

| Skill | Description |
|-------|-------------|
| [recipe-morning-standup](skills/recipe-morning-standup/SKILL.md) | Today's events + unread by category + team assignments |
| [recipe-end-of-day](skills/recipe-end-of-day/SKILL.md) | Close out the day, review loose ends, preview tomorrow |
| [recipe-weekly-digest](skills/recipe-weekly-digest/SKILL.md) | Weekly summary of events, email, and team status |
| [recipe-inbox-by-category](skills/recipe-inbox-by-category/SKILL.md) | Process inbox in priority order by smart category |
| [recipe-inbox-zero](skills/recipe-inbox-zero/SKILL.md) | Process the inbox to zero with category-first triage |
| [recipe-vacation-catchup](skills/recipe-vacation-catchup/SKILL.md) | Process a large backlog after time away with batch processing |
| [recipe-new-sender-review](skills/recipe-new-sender-review/SKILL.md) | Process GateKeeper's new sender queue - accept or block |
| [recipe-draft-batch](skills/recipe-draft-batch/SKILL.md) | Review and finalize multiple pending drafts in a batch session |
| [recipe-multi-account-review](skills/recipe-multi-account-review/SKILL.md) | Review inbox status across multiple accounts |
| [recipe-meeting-prep](skills/recipe-meeting-prep/SKILL.md) | Gather context for an upcoming meeting |
| [recipe-meeting-followup](skills/recipe-meeting-followup/SKILL.md) | Review a meeting transcript and draft follow-up emails with action items |
| [recipe-schedule-meeting](skills/recipe-schedule-meeting/SKILL.md) | Find mutual availability and suggest times |
| [recipe-invitation-manager](skills/recipe-invitation-manager/SKILL.md) | Process pending invitations with availability checks |
| [recipe-calendar-audit](skills/recipe-calendar-audit/SKILL.md) | Analyze meeting load, back-to-back chains, and free blocks |
| [recipe-shared-inbox-status](skills/recipe-shared-inbox-status/SKILL.md) | Review shared inbox health - open, done, and unassigned items |
| [recipe-shared-inbox-triage](skills/recipe-shared-inbox-triage/SKILL.md) | Process open items in shared inboxes - assign, respond, mark done |
| [recipe-team-workload](skills/recipe-team-workload/SKILL.md) | Audit team assignment distribution and spot imbalances |
| [recipe-delegate-and-track](skills/recipe-delegate-and-track/SKILL.md) | Assign emails to teammates with context and track delegation status |
| [recipe-topic-timeline](skills/recipe-topic-timeline/SKILL.md) | Build a chronological narrative from meetings and emails |
| [recipe-stakeholder-brief](skills/recipe-stakeholder-brief/SKILL.md) | Compile a relationship dossier from all interactions with a person |
| [recipe-priority-tuning](skills/recipe-priority-tuning/SKILL.md) | Fine-tune Spark's priority category by adjusting contact-level settings |
| [recipe-newsletter-cleanup](skills/recipe-newsletter-cleanup/SKILL.md) | Audit newsletter subscriptions - block, unsubscribe, or summarize |
| [recipe-unsubscribe-audit](skills/recipe-unsubscribe-audit/SKILL.md) | Full unsubscribe audit - scan all pools, classify by engagement, flag phishing/duplicates, then unsubscribe |
| [recipe-notification-hygiene](skills/recipe-notification-hygiene/SKILL.md) | Reclassify, group, and bulk-archive noisy notifications |
| [recipe-label-organize](skills/recipe-label-organize/SKILL.md) | Organize emails with labels and folders - attach, detach, or move |

### Personas

Long-running roles that shape how the agent works across a session - tone, defaults, and which recipes to reach for. Install one persona to bias the agent toward a particular workflow style.

| Skill | Description |
|-------|-------------|
| [persona-exec-assistant](skills/persona-exec-assistant/SKILL.md) | Executive assistant - briefings, drafts, scheduling, contact lookup |
| [persona-founder](skills/persona-founder/SKILL.md) | Founder / CEO - high-volume triage, aggressive delegation, oversight |
| [persona-team-lead](skills/persona-team-lead/SKILL.md) | Team lead - workload review, assignment distribution, standup prep |
| [persona-project-manager](skills/persona-project-manager/SKILL.md) | Project manager - thread tracking, stakeholder updates, action items |
| [persona-sales-rep](skills/persona-sales-rep/SKILL.md) | Sales rep / account manager - pipeline review, follow-up cadence |
| [persona-support-agent](skills/persona-support-agent/SKILL.md) | Support agent - shared inbox processing, routing, escalation |
| [persona-meeting-manager](skills/persona-meeting-manager/SKILL.md) | Meeting manager - prep, transcript review, follow-ups, scheduling |
| [persona-freelancer](skills/persona-freelancer/SKILL.md) | Freelancer - multi-client management, invoice follow-ups, availability |

## Installation

A typical setup is `use-spark` plus a handful of recipes you actually run, optionally with one persona.

```bash
# Install everything in this repo
npx skills add https://github.com/readdle/spark-cli-skills

# Or pick only what you need - the base skill plus one or more recipes/personas
npx skills add https://github.com/readdle/spark-cli-skills/tree/main/skills/use-spark
npx skills add https://github.com/readdle/spark-cli-skills/tree/main/skills/recipe-inbox-zero
npx skills add https://github.com/readdle/spark-cli-skills/tree/main/skills/persona-exec-assistant
```

## License

[MIT](LICENSE) © Spark Mail Limited

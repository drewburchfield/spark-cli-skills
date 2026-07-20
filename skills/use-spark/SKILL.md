---
name: use-spark
description: >-
  Use the spark CLI to access the user's Spark email data - list emails,
  search by topic, read threads, check calendar events, find availability,
  look up contacts, and view team info. Use when the user asks about their
  emails, calendar, contacts, meetings, or scheduling.
metadata:
  version: 1.3.0
  fork: drewburchfield/spark-cli-skills (woven local improvements on top of readdle/spark-cli-skills)
  requires:
    bins:
      - spark
---

# Using spark

`spark` is a CLI for the Spark email client. Use it to query the user's mailbox, calendar, contacts, meetings, and team data.

```bash
spark <command> [options]
```

**Environment:** `spark` is a thin client that talks over IPC to the user's running Spark Desktop app - it has no mailbox, network stack, or credentials of its own. Run it directly on the user's computer against the live Spark Desktop process, never inside a sandbox, container, or CI runner. If Spark Desktop is not running, ask the user to launch it instead of retrying.

## Critical rules

1. **Nothing sends without `action send`.** `draft` only creates or edits drafts. Compose, let the user review via the deep link, and only send when asked: `spark action send <draft-id>` (add `--date <future>` for Send Later).
2. **Revising a draft: always edit in place.** When the user asks for changes to a draft you already created ("make it shorter", "change the tone", "add Bob"), update it with `spark draft --edit <draft-id> ...` - never run a fresh `draft --to` / `--reply-to`, which mints a duplicate draft. The ID is the `ID:` printed at creation; if it's no longer in context, find it with `spark emails <account>:Drafts`. Only compose a new draft when the user actually wants a new, separate email.
3. **Format bodies like real email, not text messages.** `--body` is markdown rendered to HTML: **bold** for key points and deadlines, lists for multiple items or steps, `[text](url)` for links, short paragraphs. A quick one-liner can stay plain; anything with structure (options, action items, schedules) should be formatted. In bash use `$'...'` quoting so `\n` becomes a real newline.
4. **Threading is critical.** A message that belongs to an existing conversation must be created with `--reply-to <last-message-id-in-thread>`; otherwise it starts a new thread. This includes follow-ups/nudges where the last message is your own outgoing one - reply to it.
5. **Always give the user the deep link.** Every `draft` output includes a `Link:` URL - share it as a clickable markdown link (`[Open draft in Spark](https://sparkmailapp.com/dpl/bl?token=...)`) so the user can review in one click. Never tell them to hunt for the draft in Spark.
6. **Respect access levels.** Each account/shared inbox is configured as **read-only** (list/search/read), **triage** (+ drafts, comments, email/contact actions), or **send** (+ `action send` and the entire `event` command, which can emit invitation mail). Run `spark accounts` first to discover accounts, calendars, teams, and their levels. If a command is refused, the error explains how the user can change the level (Spark Desktop → Settings → AI Agents); don't retry around it.

## Commands

Full flags, semantics, and edge cases for every command are in [reference.md](reference.md). Read the relevant section there before using a command whose flags you're not sure of - especially `draft` (sharing/templates/attachments), `event` (iTIP invitation mail semantics), and `action` (send/schedule/labels).

| Command | Description |
|---------|-------------|
| `accounts` | List accounts, calendars, teams, shared inboxes, and access levels |
| `folders` | List folders/labels with message counts (identifiers for `emails`/`search`) |
| `emails` | List emails with Gmail-style `--filter`, pagination |
| `search` | Topic mode: hybrid keyword+semantic with full bodies. No topic: filter across all folders |
| `thread` | Read a full thread - headers, bodies, attachments (accepts ID or Spark deep link) |
| `attachment` | Read one attachment by ID; `--stream` pipes raw bytes to stdout |
| `draft` | Create or edit a draft (new, `--reply-to`, `--forward`, `--edit`, `--template`) |
| `templates` / `template` | List saved templates / inspect one and its placeholders |
| `comment` | Post or edit a team comment on a thread (auto-shares if needed) |
| `events` | List calendar events for a range (`--tomorrow`, `--week`, `--start/--end`) |
| `event` | Create/update/delete/RSVP events, manage attendees (**send** level - emits iTIP mail) |
| `availability` | Free slots, optionally mutual with `--attendees` |
| `contacts` | Search contacts by name or email |
| `team` | Team info, members, shared inboxes, assignments |
| `meetings` / `meeting` | List / read meeting transcripts |
| `action` | Email actions: archive, pin, snooze, move, label, assign, share, **send** |
| `contact-action` | Contact actions: block, accept, categorize, prioritize |

Quick orientation:

- **Finding mail:** `emails` browses the Inbox or one folder; `search "topic"` answers content questions (returns bodies); `search --filter "from:alice@example.com"` (no topic) filters across *all* folders. Filters are Gmail-style: `from:` `to:` `subject:` `is:unread` `newer_than:7d` `has:attachment` `category:priority` `assigned_to:me` etc.
- **Reading:** `thread <id>` prints the whole conversation. IDs come from the `ID:` column of `emails`/`search`.
- **Smart categories:** Spark auto-classifies mail (`category:priority|personal|notification|newsletter|invitation|invitation_response`). Triage in that order. Reclassify with `action changeCategory*` (one message) or `contact-action changeCategory*` (all future mail from a sender).

## Composing

```bash
# New draft with a formatted body
spark draft --to "alice@example.com" --subject "Rollout plan" --body $'Hi Alice,\n\nTwo updates:\n\n- **Staging** is green as of this morning\n- **Prod** deploy is **Friday 10:00**\n\nDetails: [runbook](https://example.com/runbook)\n\nShout if Friday is a problem.'

# Reply (threads correctly), then revise the same draft, then send when asked
spark draft --reply-to 5678 --body "Thanks - Friday works."
spark draft --edit 9012 --body "Thanks - Friday works. I'll bring the metrics doc."
spark action send 9012
```

Key flags: repeatable `--to/--cc/--bcc`, `--account <from-address>`, `--attach <path>` (or pipe via `--attach-stream` when the app can't read the path), `--no-signature`, `--template <id|name>` with `--placeholder "name=value"` (inspect required placeholders first with `spark template <id|name>`). Sharing a draft with teammates (`--team`/`--user`/`--allow-send`) and its edge cases are covered in [reference.md](reference.md).

## Typical workflows

**Answer a question about email:** `spark search "topic"` → read bodies → answer.

**Find and read:** `spark emails --filter "from:alice@example.com subject:report"` → `spark thread <id>`.

**Draft a reply:** find the message → `spark draft --reply-to <id> --body ...` (markdown when it has structure) → give the user the `Link:`.

**Revise a draft:** `spark draft --edit <id> --body ...` (only the fields that change) → re-share the `Link:`.

**Send from a template:** `spark templates` → `spark template "<name>"` (check placeholders) → `spark draft --template "<name>" --to <addr> --placeholder "<name>=<value>"`.

**Schedule a meeting:** `spark availability --week --attendees a@example.com,b@example.com` → propose a slot → `spark event create --title ... --start ...` → confirm details with the user → `spark event update <event-id> --add <attendees>` to push invitations (invitation mail goes out at this step).

**Triage:** `spark emails Inbox --filter "category:priority is:unread"` first, then personal, invitations, notifications, newsletters. Act with `spark action archive|pin|snooze|moveToFolder|assign <id> ...`.

**Team work:** `spark comment <id> --body ...` to discuss a thread; `spark action assign <id> --assignee bob@example.com --date <due> --comment ...` to delegate; `spark emails --filter "assigned_to:unassigned"` for shared-inbox triage; `spark team "<name>"` for workload.

## Keeping this skill up to date

The CLI and this skill share a version (`metadata.version` above). Check for a mismatch only when: the user asks about an undocumented Spark feature; a command fails with an unexpected "unknown command/option"; or the user says they upgraded Spark. Then run `spark --version`.

**This copy is a fork** (`drewburchfield/spark-cli-skills`) carrying local improvements on top of the vendor skill. Do NOT overwrite it with `spark skill > SKILL.md` - that discards the fork's additions. If the CLI version is newer than `metadata.version`, tell the user the fork needs a re-weave: in the fork repo, `git fetch upstream && git merge upstream/main`, re-apply local additions if touched, push, then `npx skills update -g`.

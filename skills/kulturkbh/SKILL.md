---
name: kulturkbh
description: Use when the user asks what is on in Copenhagen (talks, exhibitions, concerts, film, theatre, literature, food, active events), especially free or cheap ones, on a date, in a category or matching words. Lists events from kulturKBH (https://kulturkbh.dk) with a link to each event's own page, where the user reads more and books or buys tickets themselves.
---
<!-- version: 0.14.4 -->

# kulturkbh

- `bin/kulturkbh` (`bin/kulturkbh.exe` on Windows) in this skill's folder is a CLI for https://kulturkbh.dk; below, `kulturkbh` means that path. Every command prints exactly one JSON document on stdout; progress goes to stderr.
- Write commands (marked in the table) print a dry run without `--confirm`. Show the user the dry run and get an explicit yes before rerunning with `--confirm`.
- A Task that spans several logins or sites is never one command: chain commands from each CLI skill.
- Session, network and input failures are handled here. Only Drift, bugs and missing Tasks go to the `cph-activities-feedback` skill.

## Commands

<!-- commands:start -->
| Command | Flags | Does |
|---|---|---|
| `kulturkbh event list` | `[--from <from>]` first date, YYYY-MM-DD (default: today)<br>`[--to <to>]` last date, YYYY-MM-DD (default: no limit)<br>`[--type <type>]` category, e.g. musik, foredrag, udstilling, film, teater, litteratur, mad, active<br>`[--query <query>]` words to find in the title or description<br>`[--free]` only events whose price says they are free<br>`[--include-outside]` also events outside Copenhagen (Københavns and Frederiksberg Kommune), e.g. Gentofte, Hvidovre, Tårnby …<br>`[--limit <n>]` most events to return (default 50) | Free and cheap culture events in Copenhagen from kulturKBH, with a link to each event's own page |
<!-- commands:end -->

Built-ins: `help` (commands, flags, exit codes as JSON; `<command> --help` prints one command's flags), `check [--op <name>] [--writes]`, `doctor`, `version`, and `login` when the site needs one. Global flags: `--account <id>`, `--confirm`.

Run the command the user's question needs. There is no setup step; recover only on failure.

## When it fails

A failure is `{"error": {"kind", "message", "next", ...}}` with a fixed exit code. Do what `next` says:

| Exit / case | kind | Do |
|---|---|---|
| `bin/kulturkbh` missing | | Run `bash <this skill's folder>/install.sh` once (Git Bash on Windows), then retry |
| 1 | bug | Tell the user and offer to file it with `cph-activities-feedback`, passing the envelope. File only on a yes |
| 2 | input | Fix the flags (see `kulturkbh help`) |
| 2, error lists accounts | input | Ask the user which account, then pass `--account <id>` on this and later calls |
| 3 | drift | Stop. Offer to file it with `cph-activities-feedback`, passing the envelope. File only on a yes |
| 4 | session | Run `kulturkbh login`; the user signs in in the Chrome window; rerun the command (only skills with `login` exit 4) |
| 5 | network | Tell the user the site isn't responding, and stop |
| The CLI can't do what the user asked | | Offer a feature request with `cph-activities-feedback` |
| The user asks whether it works, or a failure looks odd | | Run `kulturkbh check` and report what it prints |

On Drift the site has changed away from what the CLI understands. Stop the task there. Answer only from what the CLI returns: never work around Drift with `curl`, raw API calls or the browser, because that answer would rest on a response nobody has checked.

## When NOT to use

<!-- never:start -->
- kulturKBH is read-only here: the CLI never sends a form or changes anything. The CLI never sends `POST /*`; the user does it on the site.
- kulturKBH is read-only here: the CLI never sends a form or changes anything. The CLI never sends `PUT /*`; the user does it on the site.
- kulturKBH is read-only here: the CLI never sends a form or changes anything. The CLI never sends `PATCH /*`; the user does it on the site.
- kulturKBH is read-only here: the CLI never sends a form or changes anything. The CLI never sends `DELETE /*`; the user does it on the site.
<!-- never:end -->
- Booking, buying tickets or signing up: the CLI never does it. Give the user the event's `url` so they book themselves.
- Big commercial concerts and arenas, and events kulturKBH does not list: it is one editor's hand-picked calendar of mostly free or cheap culture.
- Activities that are places rather than dated events (a disc golf course, a harbour bath).
- Anything the Commands table does not list: offer a feature request instead of improvising.
- Bulk scraping or automated polling of the site.

---
name: wannasport
description: Use when the user wants to play a sport in Copenhagen and asks where a court, lane or slot is free on a day (padel, tennis, badminton, squash, football, volleyball, swimming, table tennis and 30-odd more). Searches wannasport (https://www.wannasport.com) for free times at venues in Københavns Kommune, nearest first, with price and a link to each venue's page where the user books themselves.
---
<!-- version: 0.3.0 -->

# wannasport

- `bin/wannasport` (`bin/wannasport.exe` on Windows) in this skill's folder is a CLI for https://www.wannasport.com; below, `wannasport` means that path. Every command prints exactly one JSON document on stdout; progress goes to stderr.
- Write commands (marked in the table) print a dry run without `--confirm`. Show the user the dry run and get an explicit yes before rerunning with `--confirm`.
- A Task that spans several logins or sites is never one command: chain commands from each CLI skill.
- Session, network and input failures are handled here. Only Drift, bugs and missing Tasks go to the `cph-activities-feedback` skill.

## Commands

<!-- commands:start -->
| Command | Flags | Does |
|---|---|---|
| `wannasport slot search` | `--sport <sport>` sport slug from `sport list`, e.g. padel, tennis, badminton<br>`[--date <date>]` the day, YYYY-MM-DD (default: today)<br>`[--from <from>]` earliest start time, HH:MM<br>`[--to <to>]` latest start time, HH:MM<br>`[--radius-km <n>]` search radius from central Copenhagen in km (default 10)<br>`[--include-outside]` also venues outside Københavns Kommune (Frederiksberg, Gentofte, Hvidovre …)<br>`[--limit <n>]` most venues to return, nearest first (default 20) | Free times for a sport (padel, tennis, badminton, squash, swimming …) at venues near central Copenhagen on one day, with price and a link to book it yourself |
| `wannasport sport list` |  | The sports wannasport lists, with the slug `slot search --sport` takes |
<!-- commands:end -->

Built-ins: `help` (commands, flags, exit codes as JSON; `<command> --help` prints one command's flags), `check [--op <name>] [--writes]`, `doctor`, `version`, and `login` when the site needs one. Global flags: `--account <id>`, `--confirm`.

Run the command the user's question needs. There is no setup step; recover only on failure.

## When it fails

A failure is `{"error": {"kind", "message", "next", ...}}` with a fixed exit code. Do what `next` says:

| Exit / case | kind | Do |
|---|---|---|
| `bin/wannasport` missing | | Run `bash <this skill's folder>/install.sh` once (Git Bash on Windows), then retry |
| 1 | bug | Tell the user and offer to file it with `cph-activities-feedback`, passing the envelope. File only on a yes |
| 2 | input | Fix the flags (see `wannasport help`) |
| 2, error lists accounts | input | Ask the user which account, then pass `--account <id>` on this and later calls |
| 3 | drift | Stop. Offer to file it with `cph-activities-feedback`, passing the envelope. File only on a yes |
| 4 | session | Run `wannasport login`; the user signs in in the Chrome window; rerun the command (only skills with `login` exit 4) |
| 5 | network | Tell the user the site isn't responding, and stop |
| The CLI can't do what the user asked | | Offer a feature request with `cph-activities-feedback` |
| The user asks whether it works, or a failure looks odd | | Run `wannasport check` and report what it prints |

On Drift the site has changed away from what the CLI understands. Stop the task there. Answer only from what the CLI returns: never work around Drift with `curl`, raw API calls or the browser, because that answer would rest on a response nobody has checked.

## When NOT to use

- Booking or paying: the CLI never does it. Give the user the court's `url` so they book themselves.
- Venues that do not sell through wannasport (some clubs book only through MATCHi or their own site): say so rather than guessing.
- Events, concerts and talks: that is `kulturkbh` and `billetto`.
- Anything the Commands table does not list: offer a feature request instead of improvising.
- `area` comes from the venue's coordinates and Københavns Kommune's own district boundaries; `unknown` means within 300 m of the border (a beach, a quay, the Frederiksberg border).
- Bulk scraping or automated polling of the site.

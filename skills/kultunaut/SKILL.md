---
name: kultunaut
description: Use when the user asks what is on in Copenhagen (Københavns and Frederiksberg Kommune) on a day or in a period. KultuNaut is the broadest calendar (concerts, theatre, exhibitions, talks, sport, church, children), and every event links to its KultuNaut page. Gives no prices.
---
<!-- version: 0.11.0 -->

# kultunaut

- `bin/kultunaut` (`bin/kultunaut.exe` on Windows) in this skill's folder is a CLI for https://www.kultunaut.dk; below, `kultunaut` means that path. Every command prints exactly one JSON document on stdout; progress goes to stderr.
- Write commands (marked in the table) print a dry run without `--confirm`. Show the user the dry run and get an explicit yes before rerunning with `--confirm`.
- A Task that spans several logins or sites is never one command: chain commands from each CLI skill.
- Session, network and input failures are handled here. Only Drift, bugs and missing Tasks go to the `cph-activities-feedback` skill.

## Commands

<!-- commands:start -->
| Command | Flags | Does |
|---|---|---|
| `kultunaut event list` | `[--from <from>]` first date, YYYY-MM-DD (default: today)<br>`[--to <to>]` last date, YYYY-MM-DD (default: --from)<br>`[--genre <genre>]` one genre from `genre list` (any case), e.g. musik, jazz, teater<br>`[--from-time <from-time>]` earliest start time, HH:MM; events with no start time are left out<br>`[--to-time <to-time>]` latest start time, HH:MM; events with no start time are left out<br>`[--exclude-kids]` leave out events KultuNaut tags for children (For børn, Børneteater, Baby/Barsel, Familiefilm, … Børn)<br>`[--include-ongoing]` also exhibitions and courses that started before --from<br>`[--limit <n>]` most events to return (default 40) | Everything on in Copenhagen (Københavns and Frederiksberg Kommune) on a day or period from KultuNaut, the broadest calendar, with a link to each event's page; no prices |
| `kultunaut genre list` |  | The genres KultuNaut sorts events into, for `event list --genre` |
<!-- commands:end -->

Built-ins: `help` (commands, flags, exit codes as JSON; `<command> --help` prints one command's flags), `check [--op <name>] [--writes]`, `doctor`, `version`, and `login` when the site needs one. Global flags: `--account <id>`, `--confirm`.

Run the command the user's question needs. There is no setup step; recover only on failure.

- `event list` takes `--from`/`--to` (YYYY-MM-DD, default today), `--genre` (from `genre list`, any case), `--from-time`/`--to-time` (start times; events with no time are left out), `--limit`. Exhibitions and courses already running are left out unless `--include-ongoing`.
- `date`/`time`/`endTime` are parsed from `when`, the page's own text: if they look wrong, read `when`.

## When it fails

A failure is `{"error": {"kind", "message", "next", ...}}` with a fixed exit code. Do what `next` says:

| Exit / case | kind | Do |
|---|---|---|
| `bin/kultunaut` missing | | Run `bash <this skill's folder>/install.sh` once (Git Bash on Windows), then retry |
| 1 | bug | Tell the user and offer to file it with `cph-activities-feedback`, passing the envelope. File only on a yes |
| 2 | input | Fix the flags (see `kultunaut help`) |
| 2, error lists accounts | input | Ask the user which account, then pass `--account <id>` on this and later calls |
| 3 | drift | Stop. Offer to file it with `cph-activities-feedback`, passing the envelope. File only on a yes |
| 4 | session | Run `kultunaut login`; the user signs in in the Chrome window; rerun the command (only skills with `login` exit 4) |
| 5 | network | Tell the user the site isn't responding, and stop |
| The CLI can't do what the user asked | | Offer a feature request with `cph-activities-feedback` |
| The user asks whether it works, or a failure looks odd | | Run `kultunaut check` and report what it prints |

On Drift the site has changed away from what the CLI understands. Stop the task there. Answer only from what the CLI returns: never work around Drift with `curl`, raw API calls or the browser, because that answer would rest on a response nobody has checked.

## When NOT to use

<!-- never:start -->
- Liking, rating (POST /nautlog) or submitting events is the user's own, on the site. The CLI never sends `POST /*`; the user does it on the site.
- Liking, rating (POST /nautlog) or submitting events is the user's own, on the site. The CLI never sends `PUT /*`; the user does it on the site.
- Liking, rating (POST /nautlog) or submitting events is the user's own, on the site. The CLI never sends `PATCH /*`; the user does it on the site.
- Liking, rating (POST /nautlog) or submitting events is the user's own, on the site. The CLI never sends `DELETE /*`; the user does it on the site.
<!-- never:end -->
- Booking or buying: never. Give the user the event's `url` (its KultuNaut page, which links on to the organiser).
- Prices: KultuNaut's list shows none. Use `billetto` or `kulturkbh` for prices.
- Anything the Commands table does not list: offer a feature request instead of improvising.
- Bulk scraping or automated polling of the site. A day can hold 600+ events: narrow with `--genre`, `--from-time`/`--to-time` and `--limit` instead of reading them all.

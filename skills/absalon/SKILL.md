---
name: absalon
description: "Use when the user asks what is on at Folkehuset Absalon (Vesterbro, Copenhagen): daily communal dinners (fællesspisning), dance, yoga, workshops, ceramics, bingo and quiz, parties and concerts, markets, children's activities and films, on a day or period, in a category, free ones or at a time of day. Lists occurrences from absaloncph.dk with a link to each event's own page, where the user reads more and signs up themselves."
---
<!-- version: 0.19.4 -->

# absalon

- `bin/absalon` (`bin/absalon.exe` on Windows) in this skill's folder is a CLI for https://absaloncph.dk; below, `absalon` means that path. Every command prints exactly one JSON document on stdout; progress goes to stderr.
- Write commands (marked in the table) print a dry run without `--confirm`. Show the user the dry run and get an explicit yes before rerunning with `--confirm`.
- A Task that spans several logins or sites is never one command: chain commands from each CLI skill.
- Session, network and input failures are handled here. Only Drift, bugs (a bot block that keeps happening is one), and missing Tasks go to the `cph-activities-feedback` skill.

## Commands

<!-- commands:start -->
| Command | Flags | Does |
|---|---|---|
| `absalon category list` |  | Absalon's event categories with the number of occurrences from today on |
| `absalon event list` | `[--from <from>]` first date, YYYY-MM-DD (default: today)<br>`[--to <to>]` last date, YYYY-MM-DD (default: the same as --from)<br>`[--category <category>]...` category slug or Danish name from `category list` (any case); repeat or comma-separate for several<br>`[--exclude-kids]` leave out events in the category Børn & familie<br>`[--free]` only events whose text says they are free<br>`[--from-time <from-time>]` only events starting at or after HH:MM<br>`[--to-time <to-time>]` only events starting at or before HH:MM<br>`[--query <query>]` words to find in the title or description<br>`[--limit <n>]` most events to return (default 40) | What is on at Folkehuset Absalon (Vesterbro) on a day or period: dinners, dance, yoga, workshops, parties and more, with a link to each event |
<!-- commands:end -->

Built-ins: `help` (commands, flags, exit codes as JSON; `<command> --help` prints one command's flags), `check [--op <name>] [--writes]`, `doctor`, `version`, and `login` when the site needs one. Global flags: `--account <id>`, `--confirm`.

Run the command the user's question needs. There is no setup step; recover only on failure.

## When it fails

A failure is `{"error": {"kind", "message", "next", ...}}` with a fixed exit code. Do what `next` says:

| Exit / case | kind | Do |
|---|---|---|
| `bin/absalon` missing | | Run `bash <this skill's folder>/install.sh` once (Git Bash on Windows), then retry |
| 1 | bug | Tell the user and offer to file it with `cph-activities-feedback`, passing the envelope. File only on a yes |
| 2 | input | Fix the flags (see `absalon help`) |
| 2, error lists accounts | input | Ask the user which account, then pass `--account <id>` on this and later calls |
| 3 | drift | Stop. Offer to file it with `cph-activities-feedback`, passing the envelope. File only on a yes |
| 4 | session | Run `absalon login`; the user signs in in the Chrome window; rerun the command (only skills with `login` exit 4) |
| 5 | network | Tell the user the site isn't responding, and stop |
| 5, error has `blocked` | network | Tell the user the site refused the request as automated traffic, and stop; do not retry to find out. Ask the user whether it happens every time; if so, offer a bug report with `cph-activities-feedback` (the site blocks the CLI). File only on a yes |
| The CLI can't do what the user asked | | Offer a feature request with `cph-activities-feedback` |
| The user asks whether it works, or a failure looks odd | | Run `absalon check` and report what it prints |

On Drift the site has changed away from what the CLI understands. Stop the task there. Answer only from what the CLI returns: never work around Drift with `curl`, raw API calls or the browser, because that answer would rest on a response nobody has checked.

## When NOT to use

- Booking, buying tickets or signing up: the CLI never does it. Give the user the event's `url` so they do it on the site.
- Other venues: Absalon's calendar lists only its own house (events with `venue: null` are held elsewhere).
- Anything the Commands table does not list: offer a feature request instead of improvising, except what the lines at the end of this list name, which the user always does on the site.
- Bulk scraping or automated polling of the site.
<!-- never:start -->
- Signing up, buying tickets or booking at Absalon is the user's own, on the site. The CLI never sends `POST /*`; the user does it on the site.
- Signing up, buying tickets or booking at Absalon is the user's own, on the site. The CLI never sends `PUT /*`; the user does it on the site.
- Signing up, buying tickets or booking at Absalon is the user's own, on the site. The CLI never sends `PATCH /*`; the user does it on the site.
- Signing up, buying tickets or booking at Absalon is the user's own, on the site. The CLI never sends `DELETE /*`; the user does it on the site.
<!-- never:end -->

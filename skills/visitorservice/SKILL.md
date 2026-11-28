---
name: visitorservice
description: Use when the user asks which Christmas markets (julemarkeder) are open in Copenhagen (Københavns and Frederiksberg Kommune) on a day, a weekend or in December. Reads the municipality's Copenhagen Visitor Service calendar: each open day's hours, place, price, indoor or outdoor when the page says so, and a link. Has no flea markets.
---
<!-- version: 0.19.2 -->

# visitorservice

- `bin/visitorservice` (`bin/visitorservice.exe` on Windows) in this skill's folder is a CLI for https://visitorservice.kk.dk; below, `visitorservice` means that path. Every command prints exactly one JSON document on stdout; progress goes to stderr.
- Write commands (marked in the table) print a dry run without `--confirm`. Show the user the dry run and get an explicit yes before rerunning with `--confirm`.
- A Task that spans several logins or sites is never one command: chain commands from each CLI skill.
- Session, network and input failures are handled here. Only Drift, bugs (a bot block that keeps happening is one), and missing Tasks go to the `cph-activities-feedback` skill.

## Commands

<!-- commands:start -->
| Command | Flags | Does |
|---|---|---|
| `visitorservice market list` | `[--from <from>]` first date, YYYY-MM-DD (default: today)<br>`[--to <to>]` last date, YYYY-MM-DD (default: --from)<br>`[--type <type>]` julemarked, the only type this calendar has; any other type exits 2 and names the skills to ask<br>`[--indoor]` only markets whose page says they are indoors; markets that do not say are left out and counted in indoorUnknown<br>`[--free]` only markets the page marks as free<br>`[--from-time <from-time>]` only days still open at or after HH:MM; days with no hours are left out<br>`[--to-time <to-time>]` only days open by HH:MM; days with no hours are left out<br>`[--limit <n>]` most markets to return (default 20) | Christmas markets in Copenhagen (Københavns and Frederiksberg Kommune) on a day or period from the municipality's Visitor Service calendar, with each open day's hours, the address when the page gives it, indoor or outdoor when its text says so, free or not, and a link to the market's page. It has no flea markets |
<!-- commands:end -->

Built-ins: `help` (commands, flags, exit codes as JSON; `<command> --help` prints one command's flags), `check [--op <name>] [--writes]`, `doctor`, `version`, and `login` when the site needs one. Global flags: `--account <id>`, `--confirm`.

Run the command the user's question needs. There is no setup step; recover only on failure.

- `market list` takes `--from`/`--to` (YYYY-MM-DD, default today), `--indoor`, `--free`, `--from-time`/`--to-time` (the market is open at some point in that window; days with no hours are left out) and `--limit`. Each market costs one page load, so search the days you need.
- A row is one market: `date`/`time`/`endTime` are its first open day in the search, `endDate` the last, and `days` lists every open day with its own hours. Hours often differ by weekday: read `days`.
- `dayByDay: false` means the page gives one long period with one pair of hours and does not say whether the market closes on some day: tell the user to check the page.
- `indoor` is true or false only when the page's text says so, else null. Null is unknown, never outdoors. `--indoor` keeps only true and counts the rest in `indoorUnknown`.
- `description` is the page's teaser (else the start of its body), at most 500 characters; read it to know what the market is. `venue`, `address`, `postcode`, `district`, `price` and `free` are null when the page does not give them. `complete: false` means some market could not be read or the search was too wide: narrow the dates. `unreadable` counts the Copenhagen markets left out because their page gave no dates; name the gap instead of saying there are no more.
- The page's calendar holds coming openings only, so past dates, and sometimes today once it has closed, come back empty or short.

## When it fails

A failure is `{"error": {"kind", "message", "next", ...}}` with a fixed exit code. Do what `next` says:

| Exit / case | kind | Do |
|---|---|---|
| `bin/visitorservice` missing | | Run `bash <this skill's folder>/install.sh` once (Git Bash on Windows), then retry |
| 1 | bug | Tell the user and offer to file it with `cph-activities-feedback`, passing the envelope. File only on a yes |
| 2 | input | Fix the flags (see `visitorservice help`) |
| 2, error lists accounts | input | Ask the user which account, then pass `--account <id>` on this and later calls |
| 3 | drift | Stop. Offer to file it with `cph-activities-feedback`, passing the envelope. File only on a yes |
| 4 | session | Run `visitorservice login`; the user signs in in the Chrome window; rerun the command (only skills with `login` exit 4) |
| 5 | network | Tell the user the site isn't responding, and stop |
| 5, error has `blocked` | network | Tell the user the site refused the request as automated traffic, and stop; do not retry to find out. Ask the user whether it happens every time; if so, offer a bug report with `cph-activities-feedback` (the site blocks the CLI). File only on a yes |
| The CLI can't do what the user asked | | Offer a feature request with `cph-activities-feedback` |
| The user asks whether it works, or a failure looks odd | | Run `visitorservice check` and report what it prints |

On Drift the site has changed away from what the CLI understands. Stop the task there. Answer only from what the CLI returns: never work around Drift with `curl`, raw API calls or the browser, because that answer would rest on a response nobody has checked.

## When NOT to use

- Flea markets and other markets: this calendar has none. Use `kultunaut event list --genre Loppemarked/Genbrug` and `brugbyen event list --category Marked`.
- Booking or buying: never. Give the user the market's `url`.
- Anything the Commands table does not list: offer a feature request instead of improvising, except what the lines at the end of this list name, which the user always does on the site.
- Bulk scraping or automated polling of the site.
<!-- never:start -->
- Signing up, buying or writing to the event calendar is the user's own, on the site. The CLI never sends `POST /*`; the user does it on the site.
- Signing up, buying or writing to the event calendar is the user's own, on the site. The CLI never sends `PUT /*`; the user does it on the site.
- Signing up, buying or writing to the event calendar is the user's own, on the site. The CLI never sends `PATCH /*`; the user does it on the site.
- Signing up, buying or writing to the event calendar is the user's own, on the site. The CLI never sends `DELETE /*`; the user does it on the site.
<!-- never:end -->

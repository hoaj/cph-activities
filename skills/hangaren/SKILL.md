---
name: hangaren
description: Use when the user asks for club nights, DJs or electronic music at Hangaren (Refshaleøen, Copenhagen), or what is on there on a day, a weekend or in a period, by time, price or artist. Reads Hangaren's own events page on hangaren.dk: start and end, line-up, entry price and age limit when stated, and links to the event and its ticket seller. Read only.
---
<!-- version: 0.16.1 -->

# hangaren

- `bin/hangaren` (`bin/hangaren.exe` on Windows) in this skill's folder is a CLI for https://www.hangaren.dk; below, `hangaren` means that path. Every command prints exactly one JSON document on stdout; progress goes to stderr.
- Write commands (marked in the table) print a dry run without `--confirm`. Show the user the dry run and get an explicit yes before rerunning with `--confirm`.
- A Task that spans several logins or sites is never one command: chain commands from each CLI skill.
- Session, network and input failures are handled here. Only Drift, bugs (a bot block that keeps happening is one), and missing Tasks go to the `cph-activities-feedback` skill.

## Commands

<!-- commands:start -->
| Command | Flags | Does |
|---|---|---|
| `hangaren event list` | `[--from <from>]` first date a night starts on, YYYY-MM-DD (default: today)<br>`[--to <to>]` last date a night starts on, YYYY-MM-DD (default: the same as --from)<br>`[--from-time <from-time>]` only nights starting at or after HH:MM<br>`[--to-time <to-time>]` only nights starting at or before HH:MM<br>`[--max-price <n>]` keep nights whose cheapest stated ticket (`priceMinDKK`) is at most this many kroner; nights with no stated price are left out<br>`[--free]` only nights the page states are free<br>`[--query <query>]` words that must all be in the title or the artists (any case, accents ignored)<br>`[--include-cancelled]` also nights the page marks as cancelled or postponed<br>`[--limit <n>]` most nights to return (default 40) | Upcoming club nights at Hangaren (Refshaleøen, Copenhagen) on a day or period, soonest first, with start and end time, line-up, entry price and age limit when the page states them, and links to the event and its ticket seller |
<!-- commands:end -->

Built-ins: `help` (commands, flags, exit codes as JSON; `<command> --help` prints one command's flags), `check [--op <name>] [--writes]`, `doctor`, `version`, and `login` when the site needs one. Global flags: `--account <id>`, `--confirm`.

Run the command the user's question needs. There is no setup step; recover only on failure.

## Reading the rows

Source: **Hangaren** (https://www.hangaren.dk). Name it when you present a row, and always give the row's `url`. One run is one load of the events page.

- **A night past midnight stays on its start date.** `date` and `time` are when it starts; `endDate` and `endTime` when it ends, so Friday 23:00 to 06:00 is `date` Friday, `endDate` Saturday. `--from` and `--to` match the start date: for "Saturday night" ask for Saturday, and at 01:00 on Saturday ask for Friday to see the night in progress.
- **`endTime` comes from the event's own "Opening hours" line** when it has one that starts when the calendar does, because the calendar's end is sometimes a leftover. Without that line it is the calendar's end.
- **Prices are free text.** `priceMinDKK` and `priceMaxDKK` are the lowest and highest entry amounts the page states in kroner, across early-bird, presale and door tiers; lockers and late-arrival fees are left out. They are null when it states none, and `priceText` then may still say something. Read `priceText` before quoting a price: it says whether a fee comes on top and which tier needs arriving early. A free first hour stays in `priceText` and does not make the night free. `free` is true only when the page says the whole night is free, false when it states an amount, else null.
- **Age:** `ageFrom` is the limit the event states, usually 20 and sometimes another age. Null means this event states none. Hangaren's info page gives 20+ as the general limit and says it may vary, so treat null as "probably 20+, check the page", and never as open to all ages.
- **`artists`** come from a "Line-up" section or a comma-separated title. Null means the page does not list them that way, and the title may still name the act. `--query` searches the title and `artists`.
- **`soldOut`** is true only when the title or a line of its own says so, else null. Null is unknown, not "tickets left". Hangaren says it keeps tickets for the door even when the presale sells out.
- **Cancelled and postponed nights** are left out unless you pass `--include-cancelled`; then `cancelled` is true on them.
- `ticketUrl` is the seller's page (usually Resident Advisor, sometimes Billetto), as the event links it. Give it to the user and **never fetch it**.
- `complete: false` means something is missing: `unreadable` counts event cards that could not be read (say so instead of "no more"), the `--limit` cut the list, or the search reaches further back than the page's latest past nights.
- The site's cache can be a day or two old, so a last-minute change may not show yet: tell the user to check the `url` before they go.

## When it fails

A failure is `{"error": {"kind", "message", "next", ...}}` with a fixed exit code. Do what `next` says:

| Exit / case | kind | Do |
|---|---|---|
| `bin/hangaren` missing | | Run `bash <this skill's folder>/install.sh` once (Git Bash on Windows), then retry |
| 1 | bug | Tell the user and offer to file it with `cph-activities-feedback`, passing the envelope. File only on a yes |
| 2 | input | Fix the flags (see `hangaren help`) |
| 2, error lists accounts | input | Ask the user which account, then pass `--account <id>` on this and later calls |
| 3 | drift | Stop. Offer to file it with `cph-activities-feedback`, passing the envelope. File only on a yes |
| 4 | session | Run `hangaren login`; the user signs in in the Chrome window; rerun the command (only skills with `login` exit 4) |
| 5 | network | Tell the user the site isn't responding, and stop |
| 5, error has `blocked` | network | Tell the user the site refused the request as automated traffic, and stop; do not retry to find out. Ask the user whether it happens every time; if so, offer a bug report with `cph-activities-feedback` (the site blocks the CLI). File only on a yes |
| The CLI can't do what the user asked | | Offer a feature request with `cph-activities-feedback` |
| The user asks whether it works, or a failure looks odd | | Run `hangaren check` and report what it prints |

On Drift the site has changed away from what the CLI understands. Stop the task there. Answer only from what the CLI returns: never work around Drift with `curl`, raw API calls or the browser, because that answer would rest on a response nobody has checked.

## When NOT to use

- Buying tickets or signing up: never. Give the user `ticketUrl` or `url`.
- Anyone under the night's age limit: Hangaren is an adult club.
- Other clubs and venues: use `billetto event search` and `kultunaut event list`.
- Fetching ra.co, or the site's JSON or iCal formats (`?format=json`, `?format=ical`): robots.txt disallows those formats, and ra.co's terms forbid automated access.
- Anything the Commands table does not list: offer a feature request instead of improvising, except what the lines at the end of this list name, which the user always does on the site.
- Bulk scraping or automated polling of the site.
<!-- never:start -->
- Buying tickets, signing up or sending anything to Hangaren is the user's own, on the site. The CLI never sends `POST /*`; the user does it on the site.
- Buying tickets, signing up or sending anything to Hangaren is the user's own, on the site. The CLI never sends `PUT /*`; the user does it on the site.
- Buying tickets, signing up or sending anything to Hangaren is the user's own, on the site. The CLI never sends `PATCH /*`; the user does it on the site.
- Buying tickets, signing up or sending anything to Hangaren is the user's own, on the site. The CLI never sends `DELETE /*`; the user does it on the site.
- Hangaren's robots.txt disallows this part of the site. The CLI never sends `/api/*`; the user does it on the site.
- Hangaren's robots.txt disallows this part of the site. The CLI never sends `/search*`; the user does it on the site.
- Hangaren's robots.txt disallows this part of the site. The CLI never sends `/config*`; the user does it on the site.
- Hangaren's robots.txt disallows this part of the site. The CLI never sends `/account*`; the user does it on the site.
- Hangaren's robots.txt disallows this part of the site. The CLI never sends `/commerce/*`; the user does it on the site.
- Hangaren's robots.txt disallows this part of the site. The CLI never sends `/static/*`; the user does it on the site.
<!-- never:end -->

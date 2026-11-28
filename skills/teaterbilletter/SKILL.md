---
name: teaterbilletter
description: Use when the user asks for theatre, revue, stand-up, musicals, opera, ballet, children's theatre or new circus in Copenhagen (Københavns and Frederiksberg Kommune) on a day or period, by price or by the age it suits. Reads teaterbilletter.dk (Det Københavnske Teatersamarbejde, 100+ theatres) for shows soonest first, each with price, age limit and a link where the user buys tickets themselves.
---
<!-- version: 0.19.2 -->

# teaterbilletter

- `bin/teaterbilletter` (`bin/teaterbilletter.exe` on Windows) in this skill's folder is a CLI for https://teaterbilletter.dk; below, `teaterbilletter` means that path. Every command prints exactly one JSON document on stdout; progress goes to stderr.
- Write commands (marked in the table) print a dry run without `--confirm`. Show the user the dry run and get an explicit yes before rerunning with `--confirm`.
- A Task that spans several logins or sites is never one command: chain commands from each CLI skill.
- Session, network and input failures are handled here. Only Drift, bugs (a bot block that keeps happening is one), and missing Tasks go to the `cph-activities-feedback` skill.

## Commands

<!-- commands:start -->
| Command | Flags | Does |
|---|---|---|
| `teaterbilletter category list` |  | The theatre categories teaterbilletter.dk files productions under, for `show list --category` |
| `teaterbilletter show list` | `[--from <from>]` first date, YYYY-MM-DD (default: today)<br>`[--to <to>]` last date, YYYY-MM-DD (default: the same as --from)<br>`[--category <category>]` category from `category list`, e.g. stand-up, musical, børneteater (part of a name is enough)<br>`[--age <n>]` only productions suitable for someone this old (no age limit, or a limit at most this)<br>`[--min-age-from <n>]` leave out productions meant for younger children: ageFrom below N (e.g. --age 17 --min-age-from 10 for a teenager)<br>`[--max-price <n>]` keep shows whose cheapest ticket (`priceMinDKK`, often a child or youth price) is at most this many kroner<br>`[--from-time <from-time>]` earliest start time, HH:MM<br>`[--to-time <to-time>]` latest start time, HH:MM<br>`[--query <query>]` words that must all be in the title<br>`[--include-outside]` also venues outside Copenhagen (Københavns and Frederiksberg Kommune), e.g. Gentofte, Lyngby, Hvidovre …<br>`[--limit <n>]` most shows to return (default 40) | Theatre, revue, stand-up, musicals, opera, ballet and children's theatre in Copenhagen (Københavns and Frederiksberg Kommune) on a day or period, soonest first, with price, age limit and a link to buy tickets yourself |
<!-- commands:end -->

Built-ins: `help` (commands, flags, exit codes as JSON; `<command> --help` prints one command's flags), `check [--op <name>] [--writes]`, `doctor`, `version`, and `login` when the site needs one. Global flags: `--account <id>`, `--confirm`.

Run the command the user's question needs. There is no setup step; recover only on failure.

## When it fails

A failure is `{"error": {"kind", "message", "next", ...}}` with a fixed exit code. Do what `next` says:

| Exit / case | kind | Do |
|---|---|---|
| `bin/teaterbilletter` missing | | Run `bash <this skill's folder>/install.sh` once (Git Bash on Windows), then retry |
| 1 | bug | Tell the user and offer to file it with `cph-activities-feedback`, passing the envelope. File only on a yes |
| 2 | input | Fix the flags (see `teaterbilletter help`) |
| 2, error lists accounts | input | Ask the user which account, then pass `--account <id>` on this and later calls |
| 3 | drift | Stop. Offer to file it with `cph-activities-feedback`, passing the envelope. File only on a yes |
| 4 | session | Run `teaterbilletter login`; the user signs in in the Chrome window; rerun the command (only skills with `login` exit 4) |
| 5 | network | Tell the user the site isn't responding, and stop |
| 5, error has `blocked` | network | Tell the user the site refused the request as automated traffic, and stop; do not retry to find out. Ask the user whether it happens every time; if so, offer a bug report with `cph-activities-feedback` (the site blocks the CLI). File only on a yes |
| The CLI can't do what the user asked | | Offer a feature request with `cph-activities-feedback` |
| The user asks whether it works, or a failure looks odd | | Run `teaterbilletter check` and report what it prints |

On Drift the site has changed away from what the CLI understands. Stop the task there. Answer only from what the CLI returns: never work around Drift with `curl`, raw API calls or the browser, because that answer would rest on a response nobody has checked.

## When NOT to use

- Buying tickets: never; give the user the show's `bookingUrl` so they buy themselves.
- Concerts and other events: that is `kulturkbh`, `kultunaut` and `billetto`.
- Anyone else's account on https://teaterbilletter.dk.
- Anything the Commands table does not list: offer a feature request instead of improvising, except what the lines at the end of this list name, which the user always does on the site.
- Bulk scraping or automated polling of the site.
<!-- never:start -->
- Buying tickets, favourites and newsletters are the user's own, on the site. The CLI never sends `POST /*`; the user does it on the site.
- Buying tickets, favourites and newsletters are the user's own, on the site. The CLI never sends `PUT /*`; the user does it on the site.
- Buying tickets, favourites and newsletters are the user's own, on the site. The CLI never sends `PATCH /*`; the user does it on the site.
- Buying tickets, favourites and newsletters are the user's own, on the site. The CLI never sends `DELETE /*`; the user does it on the site.
<!-- never:end -->

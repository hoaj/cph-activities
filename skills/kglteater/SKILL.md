---
name: kglteater
description: Use when the user asks for opera, ballet, plays, musicals, dance or concerts at Det Kongelige Teater (the Royal Danish Theatre: Operaen, Gamle Scene, Skuespilhuset) on a day or period, by genre, stage, time, price or the age it suits. Reads Det Kongelige Teater's calendar on kglteater.dk, soonest first, with the cheapest ticket price, whether tickets are running out, and a link where the user buys tickets themselves.
---
<!-- version: 0.19.3 -->

# kglteater

- `bin/kglteater` (`bin/kglteater.exe` on Windows) in this skill's folder is a CLI for https://www.kglteater.dk; below, `kglteater` means that path. Every command prints exactly one JSON document on stdout; progress goes to stderr.
- Write commands (marked in the table) print a dry run without `--confirm`. Show the user the dry run and get an explicit yes before rerunning with `--confirm`.
- A Task that spans several logins or sites is never one command: chain commands from each CLI skill.
- Session, network and input failures are handled here. Only Drift, bugs (a bot block that keeps happening is one), and missing Tasks go to the `cph-activities-feedback` skill.

## Commands

<!-- commands:start -->
| Command | Flags | Does |
|---|---|---|
| `kglteater genre list` |  | The genres Det Kongelige Teater files its calendar under, for `show list --genre` |
| `kglteater show list` | `[--from <from>]` first date, YYYY-MM-DD (default: today)<br>`[--to <to>]` last date, YYYY-MM-DD (default: the same as --from)<br>`[--genre <genre>]...` genre from `genre list`, e.g. opera, ballet, skuespil, koncert (part of a name is enough); repeat or comma-separate for several<br>`[--stage <stage>]...` stage from `stage list`, e.g. Operaen, Gamle Scene, Skuespilhuset; repeat or comma-separate for several<br>`[--max-price <n>]` keep performances whose cheapest ticket (`priceMinDKK`) is at most this many kroner<br>`[--free]` only free performances<br>`[--from-time <from-time>]` earliest start time, HH:MM<br>`[--to-time <to-time>]` latest start time, HH:MM<br>`[--age <n>]` only productions suitable for someone this old (no stated age, or an age at most this); reads show pages like --details<br>`[--exclude-kids]` leave out performances the site labels For børn<br>`[--query <query>]` words that must all be in the title<br>`[--details]` also read each production's page for priceMaxDKK and ageFrom (at most 10 productions a run)<br>`[--include-outside]` also tours and places outside Copenhagen (Københavns and Frederiksberg Kommune), e.g. Dyrehaven, Moesgaard<br>`[--include-cancelled]` also cancelled performances<br>`[--limit <n>]` most performances to return (default 40) | Opera, ballet, plays, concerts and more at Det Kongelige Teater on a day or period, soonest first, with the cheapest price, availability and a link to the performance on kglteater.dk |
| `kglteater stage list` |  | The stages and places Det Kongelige Teater plays at, for `show list --stage`, each with its area |
<!-- commands:end -->

Built-ins: `help` (commands, flags, exit codes as JSON; `<command> --help` prints one command's flags), `check [--op <name>] [--writes]`, `doctor`, `version`, and `login` when the site needs one. Global flags: `--account <id>`, `--confirm`.

Run the command the user's question needs. There is no setup step; recover only on failure.

## Reading the rows

Source: **Det Kongelige Teater** (https://www.kglteater.dk). Name it when you present a row, and always give the row's `url`.

- **Terms:** the site's terms (section 17 of its Handelsbetingelser) restrict copying or reusing its content elsewhere without the theatre's permission. The maintainer accepted this for this plugin.
- **Prices are read outside the ticket checkout.** `priceMinDKK` is the calendar's cheapest ticket for that performance, often a discounted one, and null when the site gives none. `priceMaxDKK` and `ageFrom` are only on the production's page: they are null unless you pass `--details` or `--age`, and null when the page states none. `free: true` means the site marks it free.
- **Show pages are capped.** `--details` and `--age` read at most 10 productions a run, one at a time. `showsWithoutDetails` counts those left unread; `--age` keeps them, since their age is unknown. Use them only when the answer needs them.
- `availability` is `available`, `few`, `soldOut`, `cancelled`, or null when another seller handles the tickets or the site gives no status.
- `url` is the performance's page on kglteater.dk. `bookingUrl` is the other seller's page, or the theatre's own ticket link: give it to the user and never open it.
- **Left out by default:** guided tours (`--genre rundvisning` asks for them), performances sold only to schools (always), cancelled ones (`--include-cancelled`), and tours and places outside Copenhagen (`--include-outside`, or name the `--stage`).
- `complete: false` means more performances match than were read: narrow the period or raise `--limit`.

## When it fails

A failure is `{"error": {"kind", "message", "next", ...}}` with a fixed exit code. Do what `next` says:

| Exit / case | kind | Do |
|---|---|---|
| `bin/kglteater` missing | | Run `bash <this skill's folder>/install.sh` once (Git Bash on Windows), then retry |
| 1 | bug | Tell the user and offer to file it with `cph-activities-feedback`, passing the envelope. File only on a yes |
| 2 | input | Fix the flags (see `kglteater help`) |
| 2, error lists accounts | input | Ask the user which account, then pass `--account <id>` on this and later calls |
| 3 | drift | Stop. Offer to file it with `cph-activities-feedback`, passing the envelope. File only on a yes |
| 4 | session | Run `kglteater login`; the user signs in in the Chrome window; rerun the command (only skills with `login` exit 4) |
| 5 | network | Tell the user the site isn't responding, and stop |
| 5, error has `blocked` | network | Tell the user the site refused the request as automated traffic, and stop; do not retry to find out. Ask the user whether it happens every time; if so, offer a bug report with `cph-activities-feedback` (the site blocks the CLI). File only on a yes |
| The CLI can't do what the user asked | | Offer a feature request with `cph-activities-feedback` |
| The user asks whether it works, or a failure looks odd | | Run `kglteater check` and report what it prints |

On Drift the site has changed away from what the CLI understands. Stop the task there. Answer only from what the CLI returns: never work around Drift with `curl`, raw API calls or the browser, because that answer would rest on a response nobody has checked.

## When NOT to use

- Buying tickets: never; give the user the row's `bookingUrl` or `url` so they buy themselves.
- Other theatres: that is `teaterbilletter`, which does not include Det Kongelige Teater. Other concerts and events: `kulturkbh`, `kultunaut` and `billetto`.
- Anyone else's account on https://www.kglteater.dk.
- Anything the Commands table does not list: offer a feature request instead of improvising, except what the lines at the end of this list name, which the user always does on the site.
- Bulk scraping or automated polling of the site.
<!-- never:start -->
- Buying tickets, signing in, favourites and newsletters are the user's own, on the site. The CLI never sends `POST /*`; the user does it on the site.
- Buying tickets, signing in, favourites and newsletters are the user's own, on the site. The CLI never sends `PUT /*`; the user does it on the site.
- Buying tickets, signing in, favourites and newsletters are the user's own, on the site. The CLI never sends `PATCH /*`; the user does it on the site.
- Buying tickets, signing in, favourites and newsletters are the user's own, on the site. The CLI never sends `DELETE /*`; the user does it on the site.
- The ticket checkout is the user's own, on the site. The CLI never sends `/da/buyingflow*`; the user does it on the site.
- Signing in is the user's own, on the site. The CLI never sends `/da/login*`; the user does it on the site.
- Signing in is the user's own, on the site. The CLI never sends `/tixly-callback*`; the user does it on the site.
<!-- never:end -->

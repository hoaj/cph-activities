---
name: culturebox
description: Use when the user asks about club nights, DJs or electronic music at Culture Box in Copenhagen on a day, a weekend or a period, or whether an artist plays there. Reads the club's own calendar on culture-box.com, soonest first, with opening hours, lineup per room, entrance price and links to the night's page and tickets. Culture Box is an 18+ nightclub.
---
<!-- version: 0.17.4 -->

# culturebox

- `bin/culturebox` (`bin/culturebox.exe` on Windows) in this skill's folder is a CLI for https://culture-box.com; below, `culturebox` means that path. Every command prints exactly one JSON document on stdout; progress goes to stderr.
- Write commands (marked in the table) print a dry run without `--confirm`. Show the user the dry run and get an explicit yes before rerunning with `--confirm`.
- A Task that spans several logins or sites is never one command: chain commands from each CLI skill.
- Session, network and input failures are handled here. Only Drift, bugs (a bot block that keeps happening is one), and missing Tasks go to the `cph-activities-feedback` skill.

## Commands

<!-- commands:start -->
| Command | Flags | Does |
|---|---|---|
| `culturebox event list` | `[--from <from>]` first date a night opens on, YYYY-MM-DD (default: today)<br>`[--to <to>]` last date a night opens on, YYYY-MM-DD (default: the same as --from)<br>`[--from-time <from-time>]` only nights opening at or after HH:MM; nights with no hours are left out<br>`[--to-time <to-time>]` only nights opening at or before HH:MM; nights with no hours are left out<br>`[--max-price <n>]` keep nights whose lowest stated entrance (`priceMinDKK`) is at most this many kroner<br>`[--free]` only nights the site marks as free<br>`[--query <query>]` words that must all be in the title, a room, a series or an artist's name<br>`[--limit <n>]` most nights to return (default 40) | Club nights at Culture Box (Copenhagen) on a day or period, soonest first: opening hours, lineup per room, entrance price, and links to the night's page and tickets |
<!-- commands:end -->

Built-ins: `help` (commands, flags, exit codes as JSON; `<command> --help` prints one command's flags), `check [--op <name>] [--writes]`, `doctor`, `version`, and `login` when the site needs one. Global flags: `--account <id>`, `--confirm`.

Run the command the user's question needs. There is no setup step; recover only on failure.

## Reading the rows

Source: **Culture Box** (https://culture-box.com). Name it when you present a row, and always give the row's `url`.

- **Age:** Culture Box is an 18+ nightclub. The site's About page says 18+ on all in-house events and tells readers to check the event information for any other event; `houseAgeFrom` is that 18. `ageFrom` is a limit the night's own page states, else null: use `ageFrom ?? houseAgeFrom`, and never suggest a night to anyone under that age.
- **A night stays on the date it opens.** A night from Saturday 22:00 to Sunday 08:00 has `date` Saturday, `time` `22:00`, `endDate` Sunday and `endTime` `08:00`. `--from` and `--to` match `date` only, so at 02:00 on a Sunday the night still running is under Saturday's date.
- `--from-time` and `--to-time` compare the opening `time`, so `--from-time 23:00` leaves out a night that opened at 22:00 and is still going. Nights with no stated hours are left out by either flag.
- `rooms` is the lineup per room: `name`, `series` (the promoter or series when the site sets it apart in bold, else null) and `artists`, one entry per line as the site writes it, so `A B2B B` stays one entry. A line the site does not set apart can be a series name rather than an artist.
- `title` is built here, because the site titles a night only by its date: the series, else each room's first lineup line.
- **Price:** `price` is the site's own text. `priceMinDKK` and `priceMaxDKK` are the amounts in it, so `150 DKK / 100 DKK after 6AM` is 100 to 150: read `price` for the condition. `--max-price` compares `priceMinDKK` and leaves out nights with no stated price. `free` is true only when the site says free and names no amount, and null when it states no price.
- `soldOut` is true when the entrance line or a button says so, else null. Null means the site does not say, never that tickets are left.
- `ticketUrl` is the night's ticket link, often on another seller's site such as ra.co. Give it to the user and never open it. `url` is the night's page on culture-box.com.
- **Event pages are capped.** `ticketUrl`, `ageFrom` and a sold-out button come from each night's page, read one at a time for at most 10 nights a run. `detailsRead: false` means that row's page was not read, so its null `ticketUrl` and `ageFrom` are unknown; `withoutDetails` counts those rows. Narrow the dates to read them.
- `complete: false` means the calendar held a card that could not be read (`unreadable` counts them) or a further page of nights. Name the gap instead of saying there is nothing more.

## When it fails

A failure is `{"error": {"kind", "message", "next", ...}}` with a fixed exit code. Do what `next` says:

| Exit / case | kind | Do |
|---|---|---|
| `bin/culturebox` missing | | Run `bash <this skill's folder>/install.sh` once (Git Bash on Windows), then retry |
| 1 | bug | Tell the user and offer to file it with `cph-activities-feedback`, passing the envelope. File only on a yes |
| 2 | input | Fix the flags (see `culturebox help`) |
| 2, error lists accounts | input | Ask the user which account, then pass `--account <id>` on this and later calls |
| 3 | drift | Stop. Offer to file it with `cph-activities-feedback`, passing the envelope. File only on a yes |
| 4 | session | Run `culturebox login`; the user signs in in the Chrome window; rerun the command (only skills with `login` exit 4) |
| 5 | network | Tell the user the site isn't responding, and stop |
| 5, error has `blocked` | network | Tell the user the site refused the request as automated traffic, and stop; do not retry to find out. Ask the user whether it happens every time; if so, offer a bug report with `cph-activities-feedback` (the site blocks the CLI). File only on a yes |
| The CLI can't do what the user asked | | Offer a feature request with `cph-activities-feedback` |
| The user asks whether it works, or a failure looks odd | | Run `culturebox check` and report what it prints |

On Drift the site has changed away from what the CLI understands. Stop the task there. Answer only from what the CLI returns: never work around Drift with `curl`, raw API calls or the browser, because that answer would rest on a response nobody has checked.

## When NOT to use

- Buying tickets or signing up: never. Give the user the row's `ticketUrl` or `url`.
- Anyone under 18, unless the night's own page states a lower `ageFrom`.
- Other clubs: this calendar has only Culture Box. Use `billetto` and `kultunaut` for others.
- Anything the Commands table does not list: offer a feature request instead of improvising, except what the lines at the end of this list name, which the user always does on the site.
- Bulk scraping or automated polling of the site.
<!-- never:start -->
- Buying tickets, signing up and the newsletter are the user's own, on the site. The CLI never sends `POST /*`; the user does it on the site.
- Buying tickets, signing up and the newsletter are the user's own, on the site. The CLI never sends `PUT /*`; the user does it on the site.
- Buying tickets, signing up and the newsletter are the user's own, on the site. The CLI never sends `PATCH /*`; the user does it on the site.
- Buying tickets, signing up and the newsletter are the user's own, on the site. The CLI never sends `DELETE /*`; the user does it on the site.
- Signing in is the user's own, on the site. The CLI never sends `/wp-login*`; the user does it on the site.
- Signing in is the user's own, on the site. The CLI never sends `/wp-admin*`; the user does it on the site.
<!-- never:end -->

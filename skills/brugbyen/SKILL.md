---
name: brugbyen
description: Use when the user asks what is on at Københavns Kommune's own culture houses, libraries and halls (HUSET, Krudttønden, BRØK, Kulturhuset Islands Brygge ...), on a day or period, optionally only free, for an audience (børn, unge, voksne, seniorer), a category or a district. Every event links to its page on brugbyen.kk.dk. Gives no prices.
---
<!-- version: 0.17.4 -->

# brugbyen

- `bin/brugbyen` (`bin/brugbyen.exe` on Windows) in this skill's folder is a CLI for https://brugbyen.kk.dk; below, `brugbyen` means that path. Every command prints exactly one JSON document on stdout; progress goes to stderr.
- Write commands (marked in the table) print a dry run without `--confirm`. Show the user the dry run and get an explicit yes before rerunning with `--confirm`.
- A Task that spans several logins or sites is never one command: chain commands from each CLI skill.
- Session, network and input failures are handled here. Only Drift, bugs and missing Tasks go to the `cph-activities-feedback` skill.

## Commands

<!-- commands:start -->
| Command | Flags | Does |
|---|---|---|
| `brugbyen event list` | `[--from <from>]` first date, YYYY-MM-DD (default: today)<br>`[--to <to>]` last date, YYYY-MM-DD (default: --from)<br>`[--category <category>]...` category name or id from `filter list` (any case); repeat or comma-separate for several<br>`[--group <group>]...` audience: børn (kids), unge (youth), voksne (adults), seniorer (seniors); repeat or comma-separate for several<br>`[--district <district>]...` district name or id from `filter list` (any case); repeat or comma-separate for several<br>`[--free]` only free events<br>`[--from-time <from-time>]` earliest start time, HH:MM; events with no start time are left out<br>`[--to-time <to-time>]` latest start time, HH:MM; events with no start time are left out<br>`[--include-ongoing]` also exhibitions and courses that started before --from<br>`[--limit <n>]` most events to return (default 40) | What is on at Københavns Kommune's own culture houses, libraries and halls (brugbyen.kk.dk) on a day or period, optionally only free, for an audience, category or district, with a link to each event's page; no prices and no descriptions (`event show --url <url>` reads one event's description). `date` is the day the event occurs within the search (on a one-day search always the searched day, by brugbyen's own filter; in a period `shownDate` when it lies in it, else null). A recurring event (`recurring`, `otherDates` > 0) shows its first upcoming date as `shownDate` and that date's time: `timeMayDiffer` says the time may be another day's |
| `brugbyen event show` | `--url <url>` the event's page: a `url` from `event list`, or its path /det-sker/<slug> (exactly one event, on brugbyen.kk.dk) | One event's description from its own page on brugbyen.kk.dk: `event list` rows carry none. Returns `{ title, url, description }`; `description` is the page's teaser (else its body) as plain text, at most 500 characters, or null when the page has no text |
| `brugbyen filter list` |  | The categories, audiences (groups) and districts `event list` can filter on, with their ids |
<!-- commands:end -->

Built-ins: `help` (commands, flags, exit codes as JSON; `<command> --help` prints one command's flags), `check [--op <name>] [--writes]`, `doctor`, `version`, and `login` when the site needs one. Global flags: `--account <id>`, `--confirm`.

Run the command the user's question needs. There is no setup step; recover only on failure.

- `event list` takes `--from`/`--to` (YYYY-MM-DD, default today), `--group` (børn, unge, voksne, seniorer; English kids, youth, adults, seniors work too), `--category`, `--district` (names or ids from `filter list`, any case; repeat the flag or comma-separate), `--free`, `--from-time`/`--to-time` (start times; events with no time are left out), `--limit`. Exhibitions and courses already running are left out unless `--include-ongoing`.
- `date` is the day the event occurs within the search: on a one-day search always the searched day (brugbyen's own filter guarantees it), in a period `shownDate` when it lies in the period, else null. A recurring event (`recurring`, `otherDates` > 0) shows its first upcoming date as `shownDate`, with that date's `time`: `timeMayDiffer` is true when the time may belong to another day than `date`, so check the event page for the time. Do not drop an event for a different `shownDate`.
- `shownDate`/`time`/`endTime` are parsed from `dateText`, the page's own text: if they look wrong, read `dateText`.

## When it fails

A failure is `{"error": {"kind", "message", "next", ...}}` with a fixed exit code. Do what `next` says:

| Exit / case | kind | Do |
|---|---|---|
| `bin/brugbyen` missing | | Run `bash <this skill's folder>/install.sh` once (Git Bash on Windows), then retry |
| 1 | bug | Tell the user and offer to file it with `cph-activities-feedback`, passing the envelope. File only on a yes |
| 2 | input | Fix the flags (see `brugbyen help`) |
| 2, error lists accounts | input | Ask the user which account, then pass `--account <id>` on this and later calls |
| 3 | drift | Stop. Offer to file it with `cph-activities-feedback`, passing the envelope. File only on a yes |
| 4 | session | Run `brugbyen login`; the user signs in in the Chrome window; rerun the command (only skills with `login` exit 4) |
| 5 | network | Tell the user the site isn't responding, and stop |
| The CLI can't do what the user asked | | Offer a feature request with `cph-activities-feedback` |
| The user asks whether it works, or a failure looks odd | | Run `brugbyen check` and report what it prints |

On Drift the site has changed away from what the CLI understands. Stop the task there. Answer only from what the CLI returns: never work around Drift with `curl`, raw API calls or the browser, because that answer would rest on a response nobody has checked.

## When NOT to use

<!-- never:start -->
- Signing up, booking or writing to a culture house's calendar is the user's own, on the site. The CLI never sends `POST /*`; the user does it on the site.
- Signing up, booking or writing to a culture house's calendar is the user's own, on the site. The CLI never sends `PUT /*`; the user does it on the site.
- Signing up, booking or writing to a culture house's calendar is the user's own, on the site. The CLI never sends `PATCH /*`; the user does it on the site.
- Signing up, booking or writing to a culture house's calendar is the user's own, on the site. The CLI never sends `DELETE /*`; the user does it on the site.
<!-- never:end -->
- Booking or buying: never. Give the user the event's `url` (its brugbyen page, which links on to the organiser).
- Prices: the list shows none. `--free` only filters to free events. Use `billetto` or `kulturkbh` for prices.
- Events outside the municipality's own venues: use `kultunaut` for the broadest calendar.
- Anything the Commands table does not list: offer a feature request instead of improvising.
- Bulk scraping or automated polling of the site.

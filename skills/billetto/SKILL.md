---
name: billetto
description: Use when the user asks what is on in Copenhagen at small venues, culture houses, clubs, talks, workshops, courses or parties, or searches for an event by words, date, category or free entry. Searches Billetto (https://billetto.dk) around the city centre, soonest first, with a link to each event's page where the user buys tickets themselves. Needs Google Chrome, which it opens unseen to read the search settings billetto.dk's own page uses.
---
<!-- version: 0.11.0 -->

# billetto

- `bin/billetto` (`bin/billetto.exe` on Windows) in this skill's folder is a CLI for https://billetto.dk; below, `billetto` means that path. Every command prints exactly one JSON document on stdout; progress goes to stderr.
- Write commands (marked in the table) print a dry run without `--confirm`. Show the user the dry run and get an explicit yes before rerunning with `--confirm`.
- A Task that spans several logins or sites is never one command: chain commands from each CLI skill.
- Session, network and input failures are handled here. Only Drift, bugs and missing Tasks go to the `cph-activities-feedback` skill.

## Commands

<!-- commands:start -->
| Command | Flags | Does |
|---|---|---|
| `billetto event search` | `[--query <query>]` words to search for (default: everything)<br>`[--from <from>]` first date, YYYY-MM-DD (default: today)<br>`[--to <to>]` last date, YYYY-MM-DD (default: no limit)<br>`[--category <category>]` Billetto category or subcategory, as printed in `category`/`subcategory` (e.g. music, rock, science)<br>`[--free]` only free events (price 0)<br>`[--include-outside]` also events whose postcode is outside Copenhagen (Københavns and Frederiksberg Kommune), e.g. Gentofte, Hvidovre, Tårnby …<br>`[--radius-km <n>]` search radius around the city centre in km (default 10)<br>`[--limit <n>]` most events to return (default 50) | Events on Billetto around Copenhagen (small venues, culture houses, clubs, talks, workshops), soonest first, with a link to each event's page to buy tickets |
<!-- commands:end -->

Built-ins: `help` (commands, flags, exit codes as JSON; `<command> --help` prints one command's flags), `check [--op <name>] [--writes]`, `doctor`, `version`, and `login` when the site needs one. Global flags: `--account <id>`, `--confirm`.

Run the command the user's question needs. There is no setup step; recover only on failure.

## When it fails

A failure is `{"error": {"kind", "message", "next", ...}}` with a fixed exit code. Do what `next` says:

| Exit / case | kind | Do |
|---|---|---|
| `bin/billetto` missing | | Run `bash <this skill's folder>/install.sh` once (Git Bash on Windows), then retry |
| 1 | bug | Tell the user and offer to file it with `cph-activities-feedback`, passing the envelope. File only on a yes |
| 2 | input | Fix the flags (see `billetto help`) |
| 2, error lists accounts | input | Ask the user which account, then pass `--account <id>` on this and later calls |
| 3 | drift | Stop. Offer to file it with `cph-activities-feedback`, passing the envelope. File only on a yes |
| 4 | session | Run `billetto login`; the user signs in in the Chrome window; rerun the command (only skills with `login` exit 4) |
| 5 | network | Tell the user the site isn't responding, and stop |
| The CLI can't do what the user asked | | Offer a feature request with `cph-activities-feedback` |
| The user asks whether it works, or a failure looks odd | | Run `billetto check` and report what it prints |

On Drift the site has changed away from what the CLI understands. Stop the task there. Answer only from what the CLI returns: never work around Drift with `curl`, raw API calls or the browser, because that answer would rest on a response nobody has checked.

## When NOT to use

<!-- never:start -->
- Billetto's search index is Billetto's: the CLI only searches it. The CLI never sends `PUT /1/*`; the user does it on the site.
- Billetto's search index is Billetto's: the CLI only searches it. The CLI never sends `PATCH /1/*`; the user does it on the site.
- Billetto's search index is Billetto's: the CLI only searches it. The CLI never sends `DELETE /1/*`; the user does it on the site.
- Billetto's search index is Billetto's: the CLI only searches it. The CLI never sends `POST /1/indexes/*/batch`; the user does it on the site.
- Billetto's search index is Billetto's: the CLI only searches it. The CLI never sends `POST /1/indexes/*/deleteByQuery`; the user does it on the site.
- Billetto's search index is Billetto's: the CLI only searches it. The CLI never sends `POST /1/indexes/*/clear`; the user does it on the site.
- Billetto's search index is Billetto's: the CLI only searches it. The CLI never sends `POST /1/indexes/*/operation`; the user does it on the site.
<!-- never:end -->
- Buying tickets or signing up: the CLI never does it. Give the user the event's `url` so they buy themselves.
- Big concerts and arenas sold through Ticketmaster: Billetto does not sell them.
- Free and cheap museum and culture events picked by hand: that is the `kulturkbh` skill; ask both when the user wants everything.
- Anything the Commands table does not list: offer a feature request instead of improvising.
- Bulk scraping or automated polling of the site.
- Remote mode (`mcp --http` on a host from `cph-activities-deploy`): the container has no Chrome, which this skill needs to read billetto.dk's search settings. Run it on your own machine.
- `area` comes from the event's coordinates and the districts of Københavns Kommune plus Frederiksberg Kommune, or from its postcode when it has no coordinates; events `outside` Copenhagen are left out unless `--include-outside`.

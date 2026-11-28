---
name: dmi
description: Use when the user plans something in Copenhagen (Københavns and Frederiksberg Kommune) for a day or a few hours and the weather matters (outdoor vs indoor), or asks about the weather: DMI's forecast hour by hour for up to 10 days, with a dry/showers/wet verdict, temperature, wind and DMI's own text and warnings. Use the Commands table to see which Tasks it covers.
---
<!-- version: 0.19.3 -->

# dmi

- `bin/dmi` (`bin/dmi.exe` on Windows) in this skill's folder is a CLI for https://www.dmi.dk; below, `dmi` means that path. Every command prints exactly one JSON document on stdout; progress goes to stderr.
- Write commands (marked in the table) print a dry run without `--confirm`. Show the user the dry run and get an explicit yes before rerunning with `--confirm`.
- A Task that spans several logins or sites is never one command: chain commands from each CLI skill.
- Session, network and input failures are handled here. Only Drift, bugs (a bot block that keeps happening is one), and missing Tasks go to the `cph-activities-feedback` skill.

## Commands

<!-- commands:start -->
| Command | Flags | Does |
|---|---|---|
| `dmi forecast` | `[--date <date>]` the day, YYYY-MM-DD (default: today in Copenhagen)<br>`[--from-time <from-time>]` start of the window, HH:MM (default: the whole day)<br>`[--to-time <to-time>]` end of the window, HH:MM (default: the whole day)<br>`[--place-id <place-id>]` GeoNames id of the place (default 2618425, Copenhagen; Frederiksberg uses Copenhagen's) | DMI's weather forecast for a day or a few hours, up to about 10 days ahead, hour by hour, with a dry/showers/wet verdict (outdoor or indoor?), temperature, wind, DMI's own text and warnings |
<!-- commands:end -->

Built-ins: `help` (commands, flags, exit codes as JSON; `<command> --help` prints one command's flags), `check [--op <name>] [--writes]`, `doctor`, `version`, and `login` when the site needs one. Global flags: `--account <id>`, `--confirm`.

Run the command the user's question needs. There is no setup step; recover only on failure.

## When it fails

A failure is `{"error": {"kind", "message", "next", ...}}` with a fixed exit code. Do what `next` says:

| Exit / case | kind | Do |
|---|---|---|
| `bin/dmi` missing | | Run `bash <this skill's folder>/install.sh` once (Git Bash on Windows), then retry |
| 1 | bug | Tell the user and offer to file it with `cph-activities-feedback`, passing the envelope. File only on a yes |
| 2 | input | Fix the flags (see `dmi help`) |
| 2, error lists accounts | input | Ask the user which account, then pass `--account <id>` on this and later calls |
| 3 | drift | Stop. Offer to file it with `cph-activities-feedback`, passing the envelope. File only on a yes |
| 4 | session | Run `dmi login`; the user signs in in the Chrome window; rerun the command (only skills with `login` exit 4) |
| 5 | network | Tell the user the site isn't responding, and stop |
| 5, error has `blocked` | network | Tell the user the site refused the request as automated traffic, and stop; do not retry to find out. Ask the user whether it happens every time; if so, offer a bug report with `cph-activities-feedback` (the site blocks the CLI). File only on a yes |
| The CLI can't do what the user asked | | Offer a feature request with `cph-activities-feedback` |
| The user asks whether it works, or a failure looks odd | | Run `dmi check` and report what it prints |

On Drift the site has changed away from what the CLI understands. Stop the task there. Answer only from what the CLI returns: never work around Drift with `curl`, raw API calls or the browser, because that answer would rest on a response nobody has checked.

## When NOT to use

- Weather outside Denmark, marine forecasts (sea, water level) and historical weather: the CLI reads only DMI's city forecast, about 10 days ahead, for Copenhagen (Frederiksberg uses Copenhagen's).
- Anything the Commands table does not list: offer a feature request instead of improvising, except what the lines at the end of this list name, which the user always does on the site.
- Bulk scraping or automated polling of the site.
<!-- never:start -->
- DMI's site is only read: the CLI never sends a form or analytics. The CLI never sends `POST /*`; the user does it on the site.
- DMI's site is only read: the CLI never sends a form or analytics. The CLI never sends `PUT /*`; the user does it on the site.
- DMI's site is only read: the CLI never sends a form or analytics. The CLI never sends `PATCH /*`; the user does it on the site.
- DMI's site is only read: the CLI never sends a form or analytics. The CLI never sends `DELETE /*`; the user does it on the site.
<!-- never:end -->

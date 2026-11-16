---
name: cph-activities
description: Use when the user asks what to do in Copenhagen in general terms (a date, an evening out, the weekend, something with friends or kids, "what's on Wednesday"), so the answer needs events and activities from several sources at once. Says which of this plugin's CLI skills to ask (kulturkbh, billetto, kultunaut, brugbyen, wannasport), and how to merge events several sources list into one, keeping the most complete and most current details and every link.
---
<!-- version: 0.9.0 -->

# cph-activities: what to do in Copenhagen

This skill has no CLI of its own. It runs the plugin's CLI skills and combines what they return. Each CLI skill's own SKILL.md says where its binary is and how it fails; follow it for every call.

| Source | Skill and command | Gives | Booking |
|---|---|---|---|
| kulturKBH | `kulturkbh event list` | Hand-picked, mostly free or cheap culture: talks, exhibitions, music, film, theatre, food, runs | Link to the organiser's page |
| Billetto | `billetto event search` | Small venues, culture houses, libraries, clubs, comedy, workshops, courses, church concerts | Link to the ticket page |
| KultuNaut | `kultunaut event list` | The broadest calendar: concerts, theatre, exhibitions, talks, church, sport, children; no prices | Link to the event's KultuNaut page |
| brugbyen | `brugbyen event list` | The municipality's own culture houses, libraries and halls; filters on the site for audience, free, category and district; no prices | Link to the event's brugbyen page |
| wannasport | `wannasport slot search --sport <slug>` (`sport list` for the slugs) | Free times to play a sport: padel, tennis, squash, table tennis, badminton … | Link to the venue's booking page |

Every source is limited to Københavns and Frederiksberg Kommune by default (`area`), and none of them books anything: the user always books or buys through the `url`.

## Which to ask

- **Events on a day or a weekend:** `kulturkbh event list`, `billetto event search` and `kultunaut event list` with the same `--from`/`--to`. Pass `--free` to the first two when the user wants free things (KultuNaut has no prices). KultuNaut can return hundreds a day: narrow it with `--genre`, `--from-time`/`--to-time` and `--limit`. Pass `--exclude-kids` to `kultunaut event list` when the question is for adults or teenagers: KultuNaut lists many children's club trainings. kulturKBH merges its own duplicates: an event several sources announce comes once, with the others in `alsoAt`. Also ask `brugbyen event list` with the same dates: pass `--group` for the audience (e.g. `--group unge,voksne` for an adult with a teenager) and `--free` when the user asks for free things (brugbyen filters on the site, and has no prices).
- **Something active or playful** (a date, a group of friends): also `wannasport slot search` for one to three sports that fit, with `--date` and an evening `--from`/`--to`. Don't ask for every sport: `sport list` has 41.
- **One kind of thing** (comedy, jazz, a talk): Billetto takes `--query` and `--category`; kulturKBH takes `--type` and `--query`.
- Run the independent commands in parallel.

## Merging events from kulturKBH, Billetto, KultuNaut and brugbyen

The sources often list the same event. One may be more current or say more (a price where the other says "Se billetsiden", a time where the other has none). Merge them into one event; never just drop one.

**Same event** when all of these hold:

1. Same date. A recurring brugbyen event (`otherDates` > 0) matches on title and venue even when its `shownDate` is another day: brugbyen guarantees it occurs on the day searched.
2. Start times within 30 minutes of each other, or one of them has no time.
3. The same title once both are normalised: lower case, accents kept, punctuation, emoji and quotes removed, whitespace collapsed. One title containing the other counts too ("Vin & Videnskab: Mikroorganismer" and "Vin & Videnskab: Mikroorganismer – nyt fra forskningsfronten").

Don't require the same venue: the sources name venues differently, and a venue that differs is exactly what the user must hear about.

**Probably the same event** when the titles differ but the date, the exact start time and the venue match (one venue name contains the other once normalised, e.g. "Københavns Museum" and "Københavns Museum, Stormgade 18"), and the price agrees if both give one. Merge these too, but say so: "kulturKBH calls it 'Juletræstænding', Billetto 'Syng julen ind' — same time and place, probably one event."

**Field by field**, keep the most specific value:

| Field | Keep |
|---|---|
| time | an exact time over none |
| price | a number or range over a pointer ("Se billetsiden", "Se eventet"); "free" from either; KultuNaut and brugbyen have no price, so it comes from the others |
| description | the longer one |
| venue and address | the one with a street and postcode |
| on sale / sold out | Billetto's (it is the ticket system) |
| links | every source's: the ticket link first, then the others as "more info" |

**When they disagree** (Billetto, kulturKBH, KultuNaut or brugbyen) on time, price or venue, Billetto's value leads, because it is where tickets are sold and so usually the most current. Show the values and say which source says what, e.g. "Billetto: Chr. Hansen Auditorium; kulturKBH: Universitetets Festsal, Frue Plads 4 — check the ticket page." Never pick one silently.

Keep a `sources` list on every merged event (`kulturkbh`, `billetto`, `kultunaut`, `brugbyen`), so the user can see which sources confirm it.

## Answering

- Group by evening flow when it helps (before dinner, the main thing, afterwards) and give times, price and the link for each.
- Billetto events with `ongoing: true` started before the day (courses, season passes): mention them only if the user asks for that kind of thing.
- If a source fails, answer from the others and say which one is missing and why (its `error.kind`).

## When NOT to use

- A question about one source only: use that skill directly.
- Booking, buying or signing up: no skill here does it.
- Places that have no times (a park, a harbour bath, a disc golf course): no source here covers them yet.

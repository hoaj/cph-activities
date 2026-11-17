---
name: cph-activities
description: Use when the user asks what to do in Copenhagen in general terms (a date, an evening out, the weekend, something with friends or kids, "what's on Wednesday"), so the answer needs events and activities from several sources at once. Says which of this plugin's CLI skills to ask (kulturkbh, billetto, kultunaut, brugbyen, teaterbilletter, wannasport, absalon) and the weather (dmi), and how to merge events several sources list into one, keeping the most complete and most current details and every link.
---
<!-- version: 0.13.0 -->

# cph-activities: what to do in Copenhagen

This skill has no CLI of its own. It runs the plugin's CLI skills and combines what they return. Each CLI skill's own SKILL.md says where its binary is and how it fails; follow it for every call.

| Source | Skill and command | Gives | Booking |
|---|---|---|---|
| kulturKBH | `kulturkbh event list` | Hand-picked, mostly free or cheap culture: talks, exhibitions, music, film, theatre, food, runs | Link to the organiser's page |
| Billetto | `billetto event search` | Small venues, culture houses, libraries, clubs, comedy, workshops, courses, church concerts | Link to the ticket page |
| KultuNaut | `kultunaut event list` | The broadest calendar: concerts, theatre, exhibitions, talks, church, sport, children; no prices | Link to the event's KultuNaut page |
| brugbyen | `brugbyen event list` | The municipality's own culture houses, libraries and halls; filters on the site for audience, free, category and district; no prices | Link to the event's brugbyen page |
| teaterbilletter | `teaterbilletter show list` (`category list` for the categories) | Theatre, revue, stand-up, musicals, opera, ballet, children's theatre and new circus at 100+ theatres, with price range and age limit (`ageFrom`) | Link to the seller's ticket page (`bookingUrl`) |
| absalon | `absalon event list` (`category list` for the categories) | One venue, Folkehuset Absalon (Vesterbro): daily communal dinners, dance, yoga, workshops, ceramics, bingo and quiz, parties, concerts, markets, children's activities; free or priced as the description says | Link to the event's page on absaloncph.dk |
| wannasport | `wannasport slot search --sport <slug>` (`sport list` for the slugs) | Free times to play a sport: padel, tennis, squash, table tennis, badminton … | Link to the venue's booking page |
| dmi | `dmi forecast --date <day> [--from-time --to-time]` | The weather, not events: DMI's forecast hour by hour for up to about 10 days, with a dry/showers/wet `verdict.outdoor`, temperature, wind, DMI's own text and warnings | None |

Every source is limited to Københavns and Frederiksberg Kommune by default (`area`), and none of them books anything: the user always books or buys through the `url`.

## Which to ask

- **The weather first, for a question about a day or an evening:** run `dmi forecast --date <day>` (add `--from-time`/`--to-time` for the hours the plan covers) before the other sources, and let `verdict.outdoor` steer what you suggest. `wet`: lead with indoor plans (theatre, cinema and KultuNaut film, indoor courts, Absalon, indoor events) and say outdoor courts and markets are a poor idea. `showers`: mix indoor and outdoor, prefer indoor courts. `dry`: outdoor plans are fine (outdoor padel, markets, runs, the harbour). Mention `cold` (under 5 degrees), `windy` (gusts of 12 m/s or more) and `snow` when they are true. The sources tell indoor from outdoor like this: wannasport court names with "inde"/"ude" or "indendørs"/"udendørs"; Absalon's `ude-af-huset` category; kulturKBH's `active` events are often outdoors. DMI covers about 10 days: beyond that, say there is no forecast yet. Always give the weather in one line in the answer (for example "Thursday evening: 6 degrees, dry, light wind").
- **Events on a day or a weekend:** `kulturkbh event list`, `billetto event search` and `kultunaut event list` with the same `--from`/`--to`. Pass `--free` to the first two when the user wants free things (KultuNaut has no prices). KultuNaut can return hundreds a day: narrow it with `--genre`, `--from-time`/`--to-time` and `--limit`. Pass `--exclude-kids` to `kultunaut event list` when the question is for adults or teenagers: KultuNaut lists many children's club trainings. kulturKBH merges its own duplicates: an event several sources announce comes once, with the others in `alsoAt`. Also ask `absalon event list` with the same dates (Folkehuset Absalon has something almost every evening, e.g. a communal dinner): pass `--exclude-kids` for adults or teenagers and `--free` for free things. Also ask `brugbyen event list` with the same dates: pass `--group` for the audience (e.g. `--group unge,voksne` for an adult with a teenager) and `--free` when the user asks for free things (brugbyen filters on the site, and has no prices).
- **Theatre, a teenager or an age limit:** ask `teaterbilletter show list` with `--from`/`--to`, `--age <the youngest guest's age>` and `--max-price <DKK>` when the user names a budget. It is the only source that knows age limits and ticket prices for theatre; `--category` narrows to stand-up, musical, børneteater and so on. A production with no age limit comes back for any `--age`.
- **Something active or playful** (a date, a group of friends): also `wannasport slot search` for one to three sports that fit, with `--date` and an evening `--from`/`--to`. Don't ask for every sport: `sport list` has 41.
- **Bowling (DGI Byen):** no source here can see free lanes (DGI Byen's EasyBowl booking only shows them after a reservation is started). Give the user the link https://www.easybowl.com/bc/dgi/booking to pick a time and book themselves.
- **One kind of thing** (comedy, jazz, a talk): Billetto takes `--query` and `--category`; kulturKBH takes `--type` and `--query`.
- Run the independent commands in parallel.

## Merging events from kulturKBH, Billetto, KultuNaut, brugbyen, teaterbilletter and absalon

The sources often list the same event. One may be more current or say more (a price where the other says "Se billetsiden", a time where the other has none). Merge them into one event; never just drop one.

**Same event** when all of these hold:

1. Same date. A recurring brugbyen event (`otherDates` > 0) matches on title and venue even when its `shownDate` is another day: brugbyen guarantees it occurs on the day searched.
2. Start times within 30 minutes of each other, or one of them has no time.
3. The same title once both are normalised: lower case, accents kept, punctuation, emoji and quotes removed, whitespace collapsed. One title containing the other counts too ("Vin & Videnskab: Mikroorganismer" and "Vin & Videnskab: Mikroorganismer – nyt fra forskningsfronten").

kulturKBH also lists some Absalon events: the same rules apply, and `absalon` supplies the full programme, the price from the description and the event's own page.

Theatre shows KultuNaut or kulturKBH list are often in `teaterbilletter` too: the same rules apply (date, start time within 30 minutes, title), and `teaterbilletter` supplies the price range, the age limit and the ticket link.

Don't require the same venue, but compare venues before you merge. Venue names count as the same place when, after normalising (lower case, punctuation removed, only the part before the first `,`, `|` or ` - `, and a leading "kulturhuset", "spillestedet" or "teatret" dropped), one contains the other. Same-place examples: "Koncertkirken, Blågårds Plads" and "Koncertkirken"; "SALIG" and "Salig"; "Kulturhuset Krudttønden" and "Krudttønden"; "KLEIN - Sydhavnens spillested || Karens Minde Kulturhus" and "KLEIN". Only venues that are still different after that are a conflict the user must hear about.

**Probably the same event** when the titles differ but the date, the exact start time and the venue match (one venue name contains the other once normalised as above, e.g. "Københavns Museum" and "Københavns Museum, Stormgade 18"), and the price agrees if both give one. Merge these too, but say so: "kulturKBH calls it 'Juletræstænding', Billetto 'Syng julen ind' — same time and place, probably one event."

**Field by field**, keep the most specific value:

| Field | Keep |
|---|---|
| time | an exact time over none |
| price | a number or range over a pointer ("Se billetsiden", "Se eventet"); "free" from either; KultuNaut and brugbyen have no price, so it comes from the others; teaterbilletter's `priceMinDKK`–`priceMaxDKK` for theatre |
| age limit | teaterbilletter's `ageFrom`; no other source has one |
| description | the longer one |
| venue and address | the one with a street and postcode |
| on sale / sold out | Billetto's (it is the ticket system) |
| links | every source's: the ticket link first, then the others as "more info" |

**When they disagree** (Billetto, kulturKBH, KultuNaut, brugbyen, teaterbilletter or absalon) on time, price or venue, Billetto's value leads, because it is where tickets are sold and so usually the most current. Show the values and say which source says what, e.g. "Billetto: Chr. Hansen Auditorium; kulturKBH: Universitetets Festsal, Frue Plads 4 — check the ticket page." Never pick one silently.

Keep a `sources` list on every merged event (`kulturkbh`, `billetto`, `kultunaut`, `brugbyen`, `teaterbilletter`, `absalon`), so the user can see which sources confirm it.

## Answering

- Start with the weather in one line, from `dmi forecast`.
- Group by evening flow when it helps (before dinner, the main thing, afterwards) and give times, price and the link for each.
- Billetto events with `ongoing: true` started before the day (courses, season passes): mention them only if the user asks for that kind of thing.
- If a source fails, answer from the others and say which one is missing and why (its `error.kind`).

## When NOT to use

- A question about one source only: use that skill directly.
- Booking, buying or signing up: no skill here does it.
- Places that have no times (a park, a harbour bath, a disc golf course): no source here covers them yet.

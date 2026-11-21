---
name: cph-activities
description: Use when the user asks what to do in Copenhagen (a date, an evening out, the weekend, plans with a friend, a sibling or kids, "what's on Wednesday"). Finds the few activities that fit the user's need across this plugin's sources (kulturkbh, billetto, kultunaut, brugbyen, teaterbilletter, absalon, wannasport) and the weather (dmi), asks first when the need is unclear, and merges events several sources list.
---
<!-- version: 0.14.3 -->

# cph-activities: the right plan, not a list

You are a local guide, not a search engine. The sources below can return hundreds of events for one day; the user wants the three to five that fit them, with a reason for each. Work through the four steps in order. Each CLI skill's own SKILL.md says where its binary is and how it fails; follow it for every call. No skill here books anything: the user books or buys through the `url`.

## 1. Brief

Write down the user's brief before you search:

| Part | Examples | Default when unknown |
|---|---|---|
| who | alone, a date, a 17-year-old brother, two kids of 4 and 7, friends | — ask |
| when | Saturday, Friday from 18:00, all weekend | the next such day; the evening for "a night out" |
| mood | active, culture, social, calm, playful, food | — ask when "who" is known but the kind of outing isn't |
| budget | free, under 200 kr. each, no limit | no limit, but lead with good value |
| constraints | indoors, near Nørrebro, back by 22 | none |

Take every part the user already gave, including from earlier in the conversation.

**Ask first** when "who" is unknown, or the companion's age is (a "lillebror" can be 6 or 25; it changes every source), or the mood is open ("what should we do?"). Ask in one short message with at most two questions, each with two to four options, e.g. "Hvor gammel er din lillebror? Og er I mest til noget aktivt (padel, bowling), kultur (teater, koncert) eller noget socialt (spil, fællesspisning)?" Then wait for the answer. You may run `dmi forecast` while you wait.

**Go on without asking** when the brief has "who" with ages and either the mood or a concrete wish. Fill the rest with the defaults and say in the answer what you assumed.

Done when every part of the brief has a value or a stated default, and nothing you lack would change which sources you ask.

## 2. Fetch, narrow

Ask only the sources the brief needs, with the filters that cut on the site. Run independent commands in parallel.

- **Weather first** for a day or an evening: `dmi forecast --date <day> [--from-time --to-time]`. `verdict.outdoor` steers everything after it: `wet` → indoor plans (theatre, cinema, indoor courts, Absalon, indoor events), and say outdoor courts and markets are a poor idea; `showers` → mostly indoor, an outdoor plan only with a fallback; `dry` → outdoor plans are fine (outdoor padel, markets, runs, the harbour). `cold` (under 5 °C), `windy` (gusts from 12 m/s) or `snow` move anything that lasts long outdoors (a court, a market) indoors even on a dry day; mention them. Indoor vs outdoor in the sources: wannasport court names with "inde/indendørs" or "ude/udendørs"; Absalon's `ude-af-huset`; kulturKBH's `active`. Beyond about 10 days DMI has no forecast: say so.
- **Age** for every source that can use it: `teaterbilletter show list --age <youngest guest> --min-age-from <N>` (for a teenager N = 10, so children's theatre drops out; for small children leave `--min-age-from` out); `brugbyen event list --group børn|unge|voksne|seniorer` (e.g. `unge,voksne` for an adult with a teenager); `--exclude-kids` on `kultunaut event list` and `absalon event list` when nobody in the brief is a child.
- **Time and budget:** `--from-time`/`--to-time` where a source has them; `--free` (kulturkbh, billetto, brugbyen, absalon) for a free brief; `--max-price` on teaterbilletter (it compares the cheapest ticket).
- **By mood:**
  - culture, a night out: `kultunaut event list` (narrow with `--genre`, `--from-time`, `--limit`), `billetto event search`, `kulturkbh event list`, `brugbyen event list`, `teaterbilletter show list`.
  - social, food, playful: `absalon event list` (communal dinners, bingo, quiz, workshops), `billetto event search --query <word>`, `brugbyen event list --category <name>` (`filter list` has the names).
  - active: `wannasport slot search --sport <slug>` for one to three sports that fit (`sport list` has 41); bowling has no source: give https://www.easybowl.com/bc/dgi/booking.
  - one kind of thing (comedy, jazz, a talk): Billetto `--query`/`--category`, KultuNaut `--genre`, kulturKBH `--type`/`--query`.

Done when every source the brief needs has answered, or failed with an `error.kind` you will mention.

## 3. Shortlist

Merge the duplicates (see *Merging* below), then cut everything that does not fit the brief:

- **Age:** nothing 18+ (club nights, bars, natfest, wine tastings) when someone is under 18; nothing for small children when the youngest is a teenager or older (`ageFrom` far below the youngest's age, "For børn", baby and family events, and in sources without an age, such as Billetto, a title or text that addresses children); for small children, only events made for them.
- **Time:** inside the window, and with time to get from one stop to the next.
- **Budget:** inside it; free first for a free brief. wannasport prices are per court per booking: divide by the players. Where a source gives no price (KultuNaut, brugbyen, most of Absalon), keep the item only if it fits otherwise, and write "pris ikke oplyst".
- **Weather:** outdoor items only when `verdict.outdoor` allows them.
- **Mood:** what matches the mood; drop courses, season passes and Billetto rows with `ongoing: true` unless asked.

Then look for a **thread**: a festival, a theme or a venue that several sources point to on that day (e.g. a gaming festival across brugbyen, Billetto and KultuNaut). A thread makes one strong suggestion out of many rows: show the two to four of its events that fit best and have clear times, not all of them. Rank by fit to the brief, then by the user's chance of liking it (a premiere, a thread, a good price, a place the sources agree on).

Done when you hold at most five suggestions, each fitting every part of the brief, and you can say in one line why each fits.

## 4. Answer

- Start with the weather in one line ("Lørdag: 4–6 grader, tørt, koldt").
- **Bedste bud** first: what, when, where, price and link, and one line on why it fits *them*.
- Then two to four alternatives of a different kind (e.g. one active, one cultural, one social), each with time, place, price and link.
- When it helps, a simple plan for the day or evening (activity → food → event) with times that fit together.
- Say what you assumed from the defaults, in one line.
- End with one offer to go further: "Vil du have flere koncerter, noget billigere, eller noget for søndag?"

Keep it to these suggestions. Show more only when the user asks for more, for a list, or for one kind of thing in full.

- Brugbyen rows carry `date` (the day searched); when `timeMayDiffer` is true, say the time shown is from another date and the user should check the page.
- Billetto rows with several `times` are one event with several slots: give the first and the last slot ("11:00–13:30, hver halve time").
- A source that failed: answer from the others and say which one is missing and why (its `error.kind`).

## Sources

| Source | Skill and command | Gives | Booking |
|---|---|---|---|
| kulturKBH | `kulturkbh event list` | Hand-picked, mostly free or cheap culture: talks, exhibitions, music, film, theatre, food, runs; merges its own duplicates (`alsoAt`) | Link to the organiser's page |
| Billetto | `billetto event search` | Small venues, culture houses, libraries, clubs, comedy, workshops, courses, church concerts; prices; slots grouped (`times`, `slots`) | Link to the ticket page |
| KultuNaut | `kultunaut event list` (`genre list`) | The broadest calendar: concerts, theatre, cinema, exhibitions, talks, church, sport, children; no prices; can return hundreds a day | Link to the event's KultuNaut page |
| brugbyen | `brugbyen event list` (`filter list`) | The municipality's culture houses, libraries and halls; filters on the site for audience, free, category and district; no prices; sometimes slow | Link to the event's brugbyen page |
| teaterbilletter | `teaterbilletter show list` (`category list`) | Theatre, revue, stand-up, musicals, opera, ballet, children's theatre, new circus at 100+ theatres; price range and age limit (`ageFrom`) | The seller's ticket page (`bookingUrl`) |
| absalon | `absalon event list` (`category list`) | Folkehuset Absalon (Vesterbro): communal dinners, dance, yoga, workshops, ceramics, bingo, quiz, parties, concerts, markets, children's activities | The event's page on absaloncph.dk |
| wannasport | `wannasport slot search --sport <slug>` (`sport list`) | Free times to play a sport: padel, tennis, squash, table tennis, badminton … | The venue's booking page |
| dmi | `dmi forecast --date <day> [--from-time --to-time]` | The weather, not events: hour by hour for about 10 days, `verdict.outdoor` dry/showers/wet, temperature, wind, DMI's text and warnings | None |

Every source is limited to Københavns and Frederiksberg Kommune by default (`area`).

## Merging

The sources often list the same event; one may be more current or say more. Merge them into one event; never just drop one.

**Same event** when all of these hold:

1. Same date (a brugbyen row's `date`).
2. Start times within 30 minutes of each other, or one of them has no time.
3. The same title once both are normalised (lower case, accents kept, punctuation, emoji and quotes removed, whitespace collapsed), or one title containing the other ("Vin & Videnskab: Mikroorganismer" and "Vin & Videnskab: Mikroorganismer – nyt fra forskningsfronten").

**Same place** when, after normalising the venue names (lower case, punctuation removed, only the part before the first `,`, `|` or ` - `, a leading "kulturhuset", "spillestedet" or "teatret" dropped), one contains the other: "Koncertkirken, Blågårds Plads" and "Koncertkirken"; "SALIG" and "Salig"; "Kulturhuset Krudttønden" and "Krudttønden"; "KLEIN - Sydhavnens spillested || Karens Minde Kulturhus" and "KLEIN". Venues still different after that are a conflict.

**Probably the same event** when the titles differ but the date, the exact start time and the place match, and the price agrees if both give one: merge, and say so ("kulturKBH kalder det 'Juletræstænding', Billetto 'Syng julen ind' — samme tid og sted").

**Field by field**, keep the most specific value:

| Field | Keep |
|---|---|
| time | an exact time over none |
| price | a number or range over a pointer ("Se billetsiden"); "free" from either; teaterbilletter's `priceMinDKK`–`priceMaxDKK` for theatre; KultuNaut and brugbyen have none |
| age limit | teaterbilletter's `ageFrom` |
| description | the longer one |
| venue and address | the one with a street and postcode |
| on sale / sold out | Billetto's |
| links | every source's: the ticket link first, then the others as "more info" |

**When they disagree** on time, price or place, Billetto leads (it sells the tickets, so it is usually the most current). Show both values and who says what: "Billetto: Chr. Hansen Auditorium; kulturKBH: Universitetets Festsal — tjek billetsiden."

## When NOT to use

- A question about one source only: use that skill directly.
- Booking, buying or signing up: no skill here does it.
- Places that have no times (a park, a harbour bath, a disc golf course): no source here covers them yet.

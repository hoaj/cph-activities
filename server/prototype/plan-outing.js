// PROTOTYPE (ticket hoaj/cph-activities#24): the pure logic behind plan_outing. No DOM, no I/O.
// planOuting(brief, snapshot) -> NeedsInput | Shortlist.  Works as a <script> (window.PlanOuting) and as CommonJS.
(function (root) {
  "use strict";

  /** @typedef {{label?:string, age?:number}} Person */
  /** @typedef {{people:Person[], date?:string, from?:string, to?:string, mood?:string[], wishes?:string,
   *   budgetPerPerson?:number, indoorOnly?:boolean, area?:string, excludeIds?:string[]}} Brief */

  // ---------- small helpers ----------
  const WD = ["søndag", "mandag", "tirsdag", "onsdag", "torsdag", "fredag", "lørdag"];
  const MOOD_DA = { active: "aktivt", culture: "kultur", social: "socialt", calm: "roligt", food: "mad", gaming: "gaming", nightlife: "natteliv" };
  const tmin = (t) => (typeof t === "string" && /^\d\d:\d\d/.test(t) ? +t.slice(0, 2) * 60 + +t.slice(3, 5) : null);
  const hhmm = (m) => String(Math.floor(m / 60) % 24).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0");
  const uniq = (a) => [...new Set(a.filter((x) => x != null && x !== ""))];
  const norm = (s) =>
    String(s || "").toLowerCase().replace(/[\u{1F300}-\u{1FAFF}\u2600-\u27BF]/gu, "").replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
  const venueNorm = (v) =>
    norm(String(v || "").split(/,|\||\s-\s/)[0]).replace(/^(kulturhuset|spillestedet|teatret) /, "");
  const samePlace = (a, b) => {
    const x = venueNorm(a), y = venueNorm(b);
    return x.length >= 3 && y.length >= 3 && (x.includes(y) || y.includes(x));
  };
  const dayName = (d) => WD[new Date(d + "T12:00:00").getDay()];
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  // stem match with a unicode-aware left boundary (\b does not know ø/å/æ)
  const stems = (list) => new RegExp("(?<![\\p{L}])(?:" + list + ")", "iu");

  const RX = {
    adult: stems("18\\+|18 år|18-års|natklub|club ?night|clubnight|klubaften|natfest|bar(?![\\p{L}])|vinsmagning|ølsmagning|vin(?![\\p{L}])|øl(?![\\p{L}])|wine|beer|cocktail|tasting|party(?![\\p{L}])|afterparty|after party|rave|techno|house ?party|dj(?![\\p{L}])|natteliv"),
    kids: stems("børn|baby|småbørn|familie|tumle|legestue|rytmik|dukketeater|kids|for de mindste|børneteater|børnebio|sansefest|forældre"),
    noise: stems("kursus|forløb|sæsonkort|medlemskab|tilmelding|u\\d{1,2}(?![\\p{L}\\d])|årgang|hold(?![\\p{L}])|holdet|træning|trin \\d|weekendkursus|ugentlig"),
    outdoor: stems("udendørs|udeaktivitet|ude(?![\\p{L}])|torvedag|loppemarked|julemarked|juletræsmarked|byvandring|byens rum|i naturen|ekskursion|løbe|løb(?![\\p{L}])|havn|skøjt|powerwalk|stavgang|julemarked|fodboldkamp|tur(?![\\p{L}])|rundt i"),
    active: stems("løb(?![\\p{L}])|løbe|running|yoga|padel|fitness|motion|boldspil|fodbold|håndbold|bordtennis|ketcher|badminton|squash|tennis|gymnastik|svøm|klatr|skøjt|kampsport|bevægelse|dans(?!k)|powerwalk|stavgang|sport|bowling|pilates|crossfit|basket"),
    culture: stems("musik|koncert|teater|forestilling|udstilling|foredrag|film|biograf|dokumentar|litteratur|lyrik|oplæsning|opera|ballet|klassisk|jazz|comedy|stand ?up|revy|kunst|museum|performance|heritage|omvisning|show|cabaret|dukketeater|science|fine_art|books|performing|nycirkus|drama|thriller|komedie"),
    social: stems("spisning|fællesspis|banko|quiz|spil(?!lested)|workshop|værksted|keramik|marked|fest|fælles|café|community|food|mad(?![\\p{L}])|hobby|craft|diy|bingo|brætspil|meetup|byfest|loppemarked|sang|kor(?![\\p{L}])|åbent hus"),
    calm: stems("yoga|meditation|udstilling|omvisning|natur|stille|lyrik|oplæsning|spa(?![\\p{L}])|klassisk|keramik|akvarel|tegning|bibliotek|kirke|gudstjeneste|wellness|mindful"),
    food: stems("spisning|mad(?![\\p{L}])|gastronomi|food|brunch|frokost|middag|smagning|dinner|kaffe|fællesspis"),
    gaming: stems("game(?![sr])|gaming|rollespil|ttrpg|esport|e-sport|brætspil|bordspil|[\\p{L}]*nørd|spillab|arcade|videospil|patata|lan(?![\\p{L}])|quiz|bingo|spil(?!lested)"),
    nightMusic: stems("elektronisk|hip-?hop|rock|electro|disco|metal|pop|fest & koncert|rave|techno|dj(?![\\p{L}])"),
    shortOutdoorOK: stems("zzzz"),
  };

  // ---------- 1. features per item ----------
  function annotate(it) {
    const cats = (it.categories || []).join(" ");
    const text = norm([it.title, cats, (it.extra && it.extra.description) || ""].join(" "));
    const head = norm([it.title, cats].join(" "));
    const aud = it.audience || [];
    const f = {};
    const m = /(\d{1,2})\s*[-–]\s*(\d{1,2})\s*år/.exec(text) || /(\d{1,2})\s*[-–]\s*(\d{1,2})\s*aar/.exec(text);
    const fra = /fra (\d{1,2}) år/.exec(text);
    f.minAge = it.ageFrom != null ? it.ageFrom : m ? +m[1] : fra ? +fra[1] : null;
    f.maxAge = m ? +m[2] : null;
    const onlyKidsAud = aud.length > 0 && aud.every((a) => a === "børn");
    f.audKids = aud.includes("børn") || aud.includes("familie");
    f.kids = onlyKidsAud || (it.source !== "brugbyen" && aud.includes("børn")) || RX.kids.test(head) ||
      (it.ageFrom != null && it.ageFrom <= 12) || !!m ||
      /children|after_school|school|family/.test(cats);
    f.teen = aud.includes("unge");
    f.adult = RX.adult.test(head) || (it.extra && RX.adult.test(norm(it.extra.description || "")) && /18\+|18 år/.test(norm(it.extra.description || ""))) ||
      ((tmin(it.time) ?? 0) >= 22 * 60 && RX.nightMusic.test(head));
    f.nightlife = f.adult || (((tmin(it.time) ?? 0) >= 21 * 60) && RX.nightMusic.test(head));
    f.noise = RX.noise.test(head) && it.kind !== "slots";
    f.outdoorish = it.indoor === false || (it.indoor == null && RX.outdoor.test(head) && it.kind !== "slots");
    const mo = new Set();
    if (it.kind === "slots") { mo.add("active"); if (it.extra.sport === "tabletennis") mo.add("social"); }
    else {
      if (RX.active.test(head) && it.kind !== "show") mo.add("active");
      if (it.kind === "show" || RX.culture.test(head)) mo.add("culture");
      if (RX.social.test(head)) mo.add("social");
      if (RX.calm.test(head)) mo.add("calm");
      if (RX.food.test(head)) mo.add("food");
      if (RX.gaming.test(head)) mo.add("gaming");
      if (f.nightlife) mo.add("nightlife");
      if (/active/.test(cats)) mo.add("active");
      if (mo.has("active") && /koreograf|ballet|forestilling|værk|duet|performance/.test(text)) mo.delete("active");
    }
    f.moods = mo;
    f.text = text;
    f.head = head;
    return f;
  }

  // ---------- 2. merge duplicates across sources ----------
  const PRIO = { billetto: 0, teaterbilletter: 1, kulturkbh: 2, absalon: 3, kultunaut: 4, brugbyen: 5 };
  function titleSame(a, b) {
    const x = norm(a), y = norm(b);
    if (!x || !y) return false;
    if (x === y) return true;
    const [s, l] = x.length <= y.length ? [x, y] : [y, x];
    return s.length >= 5 && l.includes(s);
  }
  function mergeItems(items) {
    const ev = items.filter((i) => i.kind !== "slots");
    const parent = ev.map((_, i) => i);
    const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
    const byDate = {};
    ev.forEach((it, i) => (byDate[it.date] = byDate[it.date] || []).push(i));
    const notesOf = {};
    for (const idx of Object.values(byDate)) {
      for (let a = 0; a < idx.length; a++) for (let b = a + 1; b < idx.length; b++) {
        const x = ev[idx[a]], y = ev[idx[b]];
        if (x.source === y.source) continue;
        const tx = tmin(x.time), ty = tmin(y.time);
        const closeTime = tx == null || ty == null || Math.abs(tx - ty) <= 30;
        let same = closeTime && titleSame(x.title, y.title);
        let probable = false;
        if (!same && tx != null && tx === ty && samePlace(x.venue, y.venue)) {
          const pa = x.priceMin, pb = y.priceMin;
          if (pa == null || pb == null || pa === pb) { same = true; probable = true; }
        }
        if (same) {
          parent[find(idx[a])] = find(idx[b]);
          if (probable) (notesOf[idx[a]] = notesOf[idx[a]] || []).push(`${x.source} kalder det "${x.title}", ${y.source} "${y.title}": samme tid og sted`);
        }
      }
    }
    const groups = {};
    ev.forEach((it, i) => (groups[find(i)] = groups[find(i)] || []).push(i));
    const out = [];
    for (const g of Object.values(groups)) {
      const rows = g.map((i) => ev[i]).sort((a, b) => (PRIO[a.source] ?? 9) - (PRIO[b.source] ?? 9));
      const p = Object.assign({}, rows[0]);
      p.sources = uniq(rows.map((r) => r.source));
      p.ids = rows.map((r) => r.id);
      p.titles = uniq(rows.map((r) => r.title));
      p.urls = uniq(rows.map((r) => r.url));
      p.notes = g.flatMap((i) => notesOf[i] || []);
      p.audience = uniq(rows.flatMap((r) => r.audience || []));
      p.categories = uniq(rows.flatMap((r) => r.categories || []));
      const timed = rows.find((r) => r.time);
      p.time = p.time || (timed && timed.time) || null;
      p.endTime = p.endTime || (rows.find((r) => r.endTime) || {}).endTime || null;
      const priced = rows.find((r) => r.priceMin != null);
      if (priced) { p.priceMin = priced.priceMin; p.priceMax = priced.priceMax; p.priceText = priced.priceText; }
      if (rows.some((r) => r.free === true)) { p.free = true; p.priceMin = 0; }
      const ag = rows.find((r) => r.ageFrom != null);
      if (ag) p.ageFrom = ag.ageFrom;
      const withAddr = rows.find((r) => /\d{4}/.test(r.address || ""));
      if (withAddr) { p.address = withAddr.address; if (!p.venue) p.venue = withAddr.venue; }
      const descs = rows.map((r) => (r.extra && r.extra.description) || "").sort((a, b) => b.length - a.length);
      p.extra = Object.assign({}, p.extra, { description: descs[0] });
      if (rows.some((r) => r.extra && r.extra.timeMayDiffer) && !rows.some((r) => r.source !== "brugbyen" && r.time)) p.timeMayDiffer = true;
      const times = uniq(rows.map((r) => r.time));
      if (times.length > 1) p.notes.push("tider afviger: " + rows.filter((r) => r.time).map((r) => `${r.source} ${r.time}`).join(", "));
      p.mergedFrom = rows.length;
      out.push(p);
    }
    for (const s of items.filter((i) => i.kind === "slots")) out.push(Object.assign({}, s, { sources: [s.source], ids: [s.id], urls: [s.url], notes: [], mergedFrom: 1 }));
    return out;
  }

  // ---------- 3. weather ----------
  function weatherOf(snap, date, fromMin, toMin, evening) {
    const w = snap.weather && snap.weather[date];
    const f = w && (evening && w.evening ? w.evening : w.day);
    if (!f) return { line: `Ingen vejrudsigt for ${date} i datagrundlaget.`, v: { outdoor: "dry" }, none: true };
    const v = f.verdict || {};
    const d = f.day || {};
    const bits = [];
    if (d.minTemp != null) bits.push(`${Math.round(d.minTemp)}–${Math.round(d.maxTemp)} grader`);
    bits.push(v.outdoor === "wet" ? "regn" + (v.rainMm ? ` (${Math.round(v.rainMm)} mm)` : "") : v.outdoor === "showers" ? "byger" : "tørt");
    if (v.snow) bits.push("sne");
    if (v.cold) bits.push("koldt");
    if (v.windy) bits.push("blæsende" + (v.maxGust ? ` (stød ${Math.round(v.maxGust)} m/s)` : ""));
    const label = cap(dayName(date)) + (evening ? " aften" : "");
    return { line: `${label}: ${bits.join(", ")}`, v, raw: f };
  }

  // ---------- 4. thread detection ----------
  const STOP = new Set("og i på til for med af en et den det de der som kl fra om at er var vil kan bliver ved over under efter før hos mod ind ud fra alle vores jeres dig mig os jer din dit dine min mit mine kom prøv få lav lær mød the and of in with your our all".split(" "));
  const GENERIC = new Set("koncert workshop børn familie jul julen julemarked foredrag udstilling åbent åben film teater musik kultur gratis dag dagen aften lørdag søndag onsdag nov november weekend event arrangement billetter spillet legestue kursus aften nyt ny fest festival marked quiz bingo yoga".split(" "));
  function findThreads(cands) {
    const toks = (t) => norm(t).split(" ").filter(Boolean);
    const map = new Map();
    cands.forEach((c, i) => {
      if (c.kind === "slots") return;
      const keys = new Set();
      for (const title of c.titles || [c.title]) { const w = toks(title);
      for (let k = 0; k < w.length; k++) {
        if (!STOP.has(w[k]) && !GENERIC.has(w[k]) && w[k].length >= 7 && !/^\d+$/.test(w[k])) keys.add(w[k]);
        if (k + 1 < w.length && !STOP.has(w[k]) && !STOP.has(w[k + 1]) && !(GENERIC.has(w[k]) && GENERIC.has(w[k + 1])) && w[k].length >= 2 && w[k + 1].length >= 2 && !/^\d+$/.test(w[k]) && !/^\d+$/.test(w[k + 1])) keys.add(w[k] + " " + w[k + 1]);
      } }
      for (const k of keys) { if (!map.has(k)) map.set(k, new Set()); map.get(k).add(i); }
    });
    const found = [];
    for (const [k, set] of map) {
      const mem = [...set];
      if (mem.length < (k.includes(" ") ? 2 : 3) || mem.length > 14) continue;
      const srcs = uniq(mem.flatMap((i) => cands[i].sources));
      if (srcs.length < 2) continue;
      // a title-prefix / quoted theme is stronger than an incidental word pair
      const strong = mem.filter((i) => (cands[i].titles || [cands[i].title]).some((t) => norm(t).startsWith(k))).length;
      found.push({ key: k, mem, srcs, strength: srcs.length * 3 + mem.length + strong * 2 + (k.includes(" ") ? 2 : 0) });
    }
    found.sort((a, b) => b.strength - a.strength);
    const used = new Set(), threads = [];
    for (const t of found) {
      const free = t.mem.filter((i) => !used.has(i));
      if (free.length < 2 || uniq(free.flatMap((i) => cands[i].sources)).length < 2) continue;
      free.forEach((i) => used.add(i));
      threads.push({ key: t.key, mem: free, srcs: uniq(free.flatMap((i) => cands[i].sources)) });
    }
    return threads;
  }

  // ---------- 5. wishes -> extra moods / keywords ----------
  const WISH_MOOD = [
    [/aktiv|padel|sport|løb|motion|bevæg|tennis|badminton|squash/i, "active"],
    [/kultur|teater|koncert|udstilling|film|biograf|musik|foredrag|jazz|comedy|stand.?up/i, "culture"],
    [/social|fællesspis|quiz|bingo|workshop/i, "social"],
    [/gaming|spil|game|nørd|rollespil/i, "gaming"],
    [/mad|spise|brunch|middag|frokost/i, "food"],
    [/rolig|stille|hygge|afslap/i, "calm"],
    [/natteliv|klub|fest|byen/i, "nightlife"],
  ];
  function wishWords(w) {
    return uniq(norm(w).split(" ").filter((x) => x.length >= 3 && !STOP.has(x)));
  }

  // ---------- 6. main ----------
  function planOuting(brief, snap) {
    const people = (brief.people || []).map((p) => ({ label: p.label, age: p.age }));
    const moodIn = brief.mood || [];
    const wishes = (brief.wishes || "").trim();
    const noAge = people.map((p, i) => [p, i]).filter(([p]) => !(typeof p.age === "number" && p.age >= 0));
    const open = !moodIn.length && !wishes && brief.budgetPerPerson == null && !brief.indoorOnly && !brief.from && !brief.to;
    if (!people.length || noAge.length || open) {
      const missing = [];
      if (!people.length) missing.push("people");
      noAge.forEach(([, i]) => missing.push(`people[${i}].age`));
      if (!moodIn.length && !wishes && (open || !people.length)) missing.push("mood");
      const qs = [];
      const opts = {};
      if (!people.length) {
        qs.push("Hvem skal med, og hvor gamle er de?");
        opts.age = ["under 6", "6-12", "13-17", "18+"];
      } else if (noAge.length) {
        const names = noAge.map(([p, i]) => p.label || `person ${i + 1}`);
        qs.push(`Hvor gammel er ${names.length > 1 ? names.slice(0, -1).join(", ") + " og " + names[names.length - 1] : names[0]}?`);
        opts.age = ["under 6", "6-12", "13-17", "18+"];
      }
      if (missing.includes("mood")) {
        opts.mood = ["active", "culture", "social", "gaming"];
        qs.push("Og er I mest til noget aktivt (padel, bowling), kultur (teater, koncert) eller noget socialt (spil, fællesspisning)?");
      }
      return { status: "needs_input", missing, ask: qs.slice(0, 2).join(" "), options: opts };
    }

    const assumptions = [];
    const days = snap.days || [];
    let date = brief.date;
    if (!date) { date = days.includes("2026-11-21") ? "2026-11-21" : days[0]; assumptions.push(`Ingen dag valgt: bruger ${dayName(date)} ${date.slice(8)}/${date.slice(5, 7)}.`); }
    else if (!days.includes(date)) { assumptions.push(`Der er ingen data for ${date}; bruger ${days[0]}.`); date = days[0]; }
    const ages = people.map((p) => p.age);
    const youngest = Math.min(...ages), oldest = Math.max(...ages);
    const minors = youngest < 18, small = youngest < 10;
    const night = moodIn.includes("nightlife");
    let from = brief.from, to = brief.to;
    if (!from) { from = night ? "20:00" : "10:00"; assumptions.push(`Tidsrum ikke oplyst: ${from} og frem${!to ? " til " + (night ? "sen aften" : "23:00") : ""}.`); }
    if (!to) to = night ? "02:00" : "23:00";
    const fromM = tmin(from);
    let toM = tmin(to); if (toM <= fromM) toM += 24 * 60;
    if (toM > 24 * 60) assumptions.push("Data dækker kun begivenheder på selve dagen: ting efter midnat er ikke med.");
    const evening = fromM >= 17 * 60;
    const wx = weatherOf(snap, date, fromM, toM, evening);
    const wxv = wx.v || {};
    const wet = wxv.outdoor === "wet", showers = wxv.outdoor === "showers", coldish = !!(wxv.cold || wxv.windy || wxv.snow);

    const wMoods = wishes ? uniq(WISH_MOOD.filter(([r]) => r.test(wishes)).map(([, m]) => m)) : [];
    const moods = uniq([...moodIn, ...wMoods]);
    const wWords = wishWords(wishes);
    const budget = brief.budgetPerPerson;
    const players = Math.max(people.length, 2);
    const excl = new Set(brief.excludeIds || []);
    const dropped = {};
    const drop = (why) => (dropped[why] = (dropped[why] || 0) + 1);

    // day's rows, merged
    let rows = mergeItems((snap.items || []).filter((i) => i.date === date));
    const mergedAway = (snap.items || []).filter((i) => i.date === date).length - rows.length;
    const kept = [];
    for (const it of rows) {
      const f = annotate(it);
      const t = tmin(it.time);
      if (it.ids.some((id) => excl.has(id))) { drop("allerede vist"); continue; }
      if (it.kind === "slots") {
        const times = (it.times || []).filter((x) => tmin(x) >= fromM && tmin(x) + 60 <= toM);
        if (!times.length) { drop("uden for tidsrum"); continue; }
        it.timesIn = times;
        if (it.indoor == null && ["badminton", "squash", "tabletennis"].includes(it.extra.sport)) it.indoor = true;
        f.outdoorish = it.indoor === false;
      } else {
        if (t == null) { if (small || evening) { drop("uden tid"); continue; } }
        else if (t < fromM || t >= toM) { drop("uden for tidsrum"); continue; }
      }
      if (f.noise && !(wishes && /kursus|hold|træning/i.test(wishes))) { drop("kurser, hold og sæsonkort"); continue; }
      if (it.source === "billetto" && it.extra && it.extra.onSale === false) { drop("ikke til salg"); continue; }
      // age
      if (minors && f.adult) { drop("18+ / natteliv for voksne"); continue; }
      if (youngest >= 13 && (f.kids || (it.ageFrom != null && it.ageFrom <= youngest - 8 && f.audKids))) { drop("for børn"); continue; }
      if (small) {
        const forKids = f.kids || f.audKids;
        if (!forKids || it.kind === "slots") { drop("ikke for små børn"); continue; }
        if (f.minAge != null && f.minAge > youngest) { drop("ikke for små børn"); continue; }
        if (t != null && t >= 19 * 60) { drop("for sent for små børn"); continue; }
      } else if (youngest < 13 && f.maxAge != null && f.maxAge < youngest) { drop("for små børn"); continue; }
      else if (youngest < 13 && f.minAge != null && f.minAge > youngest + 1 && it.kind === "show") { drop("for ældre"); continue; }
      if (brief.area && brief.area !== "cph" && !norm([it.venue, it.address].join(" ")).includes(norm(brief.area))) { drop("andet område"); continue; }
      // weather
      if (f.outdoorish) {
        if (wet) { drop("udendørs i regn"); continue; }
        if (coldish) { drop("udendørs i kulde/blæst"); continue; }
        if (brief.indoorOnly) { drop("kun indendørs"); continue; }
      } else if (brief.indoorOnly && it.indoor == null && it.kind === "slots") { drop("kun indendørs"); continue; }
      // budget
      let pp = it.priceMin;
      if (it.kind === "slots" && pp != null) pp = Math.round(pp / players);
      if (budget != null) {
        if (budget === 0) {
          const likelyFree = it.priceMin == null && it.source === "brugbyen";
          if (!(it.free === true || it.priceMin === 0 || likelyFree)) { drop("koster penge"); continue; }
          it.freeGuess = likelyFree;
        } else if (pp != null && pp > budget) { drop("over budget"); continue; }
      }
      // mood
      const wishHits = wWords.filter((w) => f.text.includes(w));
      f.wishHits = wishHits;
      if (moods.length) {
        const hit = moods.filter((m) => f.moods.has(m));
        if (night && minors) { /* nightlife for a minor: late shows and concerts that are not 18+ */
          if (f.nightlife && f.adult) { drop("18+ / natteliv for voksne"); continue; }
          const late = t != null && t >= 19 * 60 && (f.moods.has("culture") || f.moods.has("social") || f.moods.has("gaming") || it.kind === "show");
          if (late) hit.push("nightlife");
        }
        if (!hit.length && !wishHits.length) { drop("andet humør"); continue; }
        f.hit = hit;
      } else f.hit = [];
      f.pp = pp;
      kept.push(Object.assign(it, { f }));
    }

    // score
    const people17 = minors ? youngest : null;
    for (const it of kept) {
      const f = it.f; let s = 0;
      s += f.hit.length * 3 + Math.min(f.wishHits.length, 2) * 3;
      s += (it.sources.length - 1) * 1.5;
      if (it.extra && it.extra.premiere) s += 2;
      if (it.free || it.priceMin === 0) s += 1.5; else if (f.pp != null && f.pp <= 100) s += 0.8;
      if (it.time || it.kind === "slots") s += 1; else s -= 2;
      if (it.kind === "show" || it.kind === "slots") s += 0.5;
      if (it.timeMayDiffer) s -= 1.5;
      if (it.indoor === true) s += wet || showers || coldish ? 1 : 0.3;
      if (f.outdoorish && showers) s -= 4;
      if (people17 != null && f.teen) s += 2;
      if (small && (f.kids || f.audKids)) s += 1;
      if (it.kind === "slots") s -= 0.5; // many near-identical courts
      if (f.moods.size === 0) s -= 1;
      it.score = s;
    }
    kept.sort((a, b) => b.score - a.score);

    // threads
    const tcands = kept.filter((c) => c.kind !== "slots");
    const threads = findThreads(tcands).map((t) => {
      const mem = t.mem.map((i) => tcands[i]);
      return { key: t.key, mem, srcs: t.srcs };
    });
    const inThread = new Set();
    const suggestions = [];

    const sClass = (c) => {
      if (c.kind === "slots" || c.f.moods.has("active")) return "aktiv";
      if (c.f.moods.has("gaming") || c.f.moods.has("social") || c.f.moods.has("food") || c.f.moods.has("nightlife")) return c.f.moods.has("culture") && c.kind === "show" ? "kultur" : "socialt";
      return "kultur";
    };

    function why(c) {
      const w = [];
      const f = c.f;
      if (minors && youngest >= 13 && (f.teen || it_ok(c))) w.push(`passer til ${youngest} år`);
      else if (small) w.push(`for børn, passer til ${youngest} år`);
      else if (people.length > 1 && !minors) w.push(`for ${people.length} voksne`);
      if (c.free || c.priceMin === 0) w.push(c.freeGuess ? "formentlig gratis (pris ikke oplyst)" : "gratis");
      else if (budget != null && f.pp != null) w.push(`under ${budget} kr. pr. person (ca. ${f.pp} kr.)`);
      else if (c.priceMin == null && c.kind !== "slots") w.push("pris ikke oplyst");
      if (c.indoor === true) w.push(wet ? "regn: indendørs" : "indendørs");
      else if (c.indoor === false || f.outdoorish) w.push("udendørs, tørvejr");
      for (const m of f.hit.slice(0, 2)) w.push(MOOD_DA[m] || m);
      if (f.wishHits && f.wishHits.length) w.push(`matcher "${f.wishHits[0]}"`);
      if (c.sources.length > 1) w.push(`${c.sources.length} kilder er enige`);
      if (c.extra && c.extra.premiere) w.push("premiere");
      if (c.timeMayDiffer) w.push("tid kan afvige: tjek siden");
      if (c.notes && c.notes.length && c.notes[0].startsWith("tider afviger")) w.push("tider afviger mellem kilder");
      return uniq(w);
    }
    function it_ok(c) { return c.f.teen || c.kind === "show" || c.f.moods.size > 0; }

    function priceOf(c) {
      if (c.kind === "slots") {
        const pp = [c.priceMin, c.priceMax].map((x) => (x == null ? null : Math.round(x / players)));
        const rng = (a, b) => (a === b ? `${a}` : `${a}–${b}`);
        return `${rng(c.priceMin, c.priceMax)} kr. pr. bane (ca. ${rng(pp[0], pp[1])} kr. pr. person ved ${players})`;
      }
      if (c.free || c.priceMin === 0) return "gratis";
      return c.priceText || (c.freeGuess ? "gratis? (pris ikke oplyst)" : "pris ikke oplyst");
    }
    function timeOf(c) {
      if (c.kind === "slots") { const t = c.timesIn; return `${t[0]}–${t[t.length - 1]} · ${t.length} ledige tider`; }
      return c.time ? c.time + (c.endTime ? "–" + c.endTime : "") : "tid ikke oplyst";
    }
    const toItem = (c) => ({ time: timeOf(c), title: c.title, place: [c.venue].filter(Boolean).join(", "), price: priceOf(c), url: c.urls[0] || c.url, sources: c.sources, ids: c.ids, _c: c });

    // thread suggestions
    for (const th of threads) {
      const ok = th.mem.filter((c) => c.time && !c.timeMayDiffer).sort((a, b) => b.score - a.score);
      const mem = (ok.length >= 2 ? ok : th.mem).slice(0, 4);
      const seenT = new Set(); const pick = [];
      for (const c of mem) { const k = norm(c.title).slice(0, 18); if (seenT.has(k)) continue; seenT.add(k); pick.push(c); }
      pick.sort((a, b) => (tmin(a.time) ?? 0) - (tmin(b.time) ?? 0));
      if (pick.length < 2) continue;
      th.mem.forEach((c) => inThread.add(c));
      const titleKey = cap(th.key);
      const top = Math.max(...th.mem.map((c) => c.score));
      suggestions.push({
        kind: "tråd", title: `${titleKey}: ${th.mem.length} steder samme dag`,
        why: uniq([`${th.mem.length} steder samme dag`, `${th.srcs.length} kilder peger på det`, ...why(pick[0]).filter((x) => !/kilder er enige/.test(x))]).slice(0, 5),
        items: pick.map(toItem), _score: top + 3 + th.mem.length * 0.3, _members: th.mem,
      });
    }
    // single suggestions (slots: best court per sport+venue, max 2 per sport)
    const seenSlot = new Set(); const perSport = {};
    for (const c of kept) {
      if (inThread.has(c)) continue;
      if (c.kind === "slots") {
        const k = c.extra.sport + "|" + c.venue;
        if (seenSlot.has(k)) continue; seenSlot.add(k);
        perSport[c.extra.sport] = (perSport[c.extra.sport] || 0) + 1;
        if (perSport[c.extra.sport] > 2) continue;
      }
      suggestions.push({ kind: sClass(c), title: c.title, why: why(c), items: [toItem(c)], _score: c.score, _members: [c] });
    }
    suggestions.sort((a, b) => b._score - a._score);

    // pick best + alternatives of different kinds
    const chosen = [];
    const venueSeen = new Set();
    const tryAdd = (s, requireNewKind) => {
      if (chosen.includes(s)) return false;
      if (requireNewKind && chosen.some((x) => x.kind === s.kind)) return false;
      const v = norm(s.items[0].place) + "|" + norm(s.items[0].title).slice(0, 12);
      if (chosen.some((x) => x.items[0].title === s.items[0].title)) return false;
      if (s.kind !== "tråd" && s.items[0].place && chosen.filter((x) => norm(x.items[0].place) === norm(s.items[0].place)).length >= 1 && s.items[0].sources[0] === "wannasport" && chosen.some((x) => x.items[0].sources[0] === "wannasport")) return false;
      chosen.push(s); return true;
    };
    if (suggestions.length) tryAdd(suggestions[0], false);
    for (const s of suggestions) { if (chosen.length >= 5) break; tryAdd(s, true); }
    for (const s of suggestions) { if (chosen.length >= 3) break; tryAdd(s, false); }
    const best = chosen[0];
    const alternatives = chosen.slice(1, 5);

    if (!best) {
      const reasons = Object.entries(dropped).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, v]) => `${v} fjernet: ${k}`);
      return {
        status: "ok", weather: wx.line, best: null, alternatives: [], assumptions: [...assumptions, "Intet passede jeres brief.", ...reasons],
        more: {}, next: ["Prøv et bredere tidsrum eller en anden dag.", "Slå budgetgrænsen eller 'kun indendørs' fra."], nextFacets: ["wider", "relax"], plan: undefined,
      };
    }

    // plan
    let plan;
    {
      const dur = (c) => { const a = tmin(c.time), b = tmin(c.endTime); if (a != null && b != null && b > a) return b - a; return c.kind === "slots" ? 60 : c.kind === "show" ? 120 : 90; };
      const startOf = (c) => (c.kind === "slots" ? tmin(c.timesIn[0]) : tmin(c.time));
      const extra = suggestions.filter((s) => !chosen.includes(s)).slice(0, 8);
      let slotStops = 0;
      const pool = [best, ...alternatives, ...extra].map((s) => ({ s, c: s.items[0]._c, many: s.items })).filter((x) => startOf(x.c) != null);
      const stops = [];
      const fits = (c) => stops.every((st) => startOf(c) >= st.end + 30 || startOf(c) + dur(c) + 30 <= st.start);
      for (const x of pool) {
        if (x.c.kind === "slots") { if (slotStops) continue; // one court session is enough for a plan
          // pick the slot that fits after the previous stop
          const prev = stops.filter((st) => st.start < tmin(x.c.timesIn[x.c.timesIn.length - 1])).sort((a, b) => b.end - a.end)[0];
          const want = prev ? prev.end + 30 : startOf(x.c);
          const t = x.c.timesIn.find((tt) => tmin(tt) >= want);
          if (!t || (tmin(t) > 21 * 60 && x.s !== best)) continue;
          const c = Object.assign({}, x.c, { timesIn: [t], time: t });
          if (!fits(c)) continue;
          stops.push({ start: tmin(t), end: tmin(t) + dur(c), text: `${t} ${x.c.title} (${x.c.venue})`, kind: "slots" }); slotStops++;
        } else {
          const members = x.s.kind === "tråd" ? x.s.items.map((i) => i._c) : [x.c];
          const c = members.find((m) => m.time && fits(m));
          if (!c) continue;
          stops.push({ start: startOf(c), end: startOf(c) + dur(c), text: `${c.time}${c.endTime ? "–" + c.endTime : ""} ${c.title} (${c.venue || "sted ikke oplyst"})` });
        }
        if (stops.length >= 3) break;
      }
      stops.sort((a, b) => a.start - b.start);
      const steps = [];
      if (stops.length && stops[0].start >= 18 * 60 + 30 && stops[0].start <= 21 * 60 && fromM <= stops[0].start - 90) steps.push(`ca. ${hhmm(stops[0].start - 90)} aftensmad inden`);
      for (let i = 0; i < stops.length; i++) {
        steps.push(stops[i].text);
        const nxt = stops[i + 1];
        const gapS = stops[i].end, gapE = nxt ? nxt.start : Math.min(toM, gapS + 150);
        const meal = (a, b, lab) => gapS <= a + 60 && gapE >= b - 0 && gapE - gapS >= 60 && !steps.some((x) => x.includes(lab));
        if (meal(12 * 60, 14 * 60, "frokost") && !(wet && false)) steps.push(`ca. ${hhmm(Math.max(gapS + 15, 12 * 60 + 15))} frokost i nærheden`);
        else if (nxt && gapE - gapS >= 60 && gapS >= 16 * 60 + 30 && gapE <= 21 * 60) steps.push(`ca. ${hhmm(gapS + 15)} aftensmad i nærheden`);
        else if (!nxt && gapS >= 16 * 60 && gapS <= 20 * 60 && gapS + 60 <= toM) steps.push(`bagefter: aftensmad eller en kop kaffe nær ${stops[i].text.split("(").pop().replace(")", "")}`);
      }
      if (steps.length >= 2) plan = steps;
    }

    // more: what else matched, by facet, excluding what is shown
    const shownIds = new Set(chosen.flatMap((s) => s._members.flatMap((m) => m.ids)));
    const rest = kept.filter((c) => !c.ids.some((id) => shownIds.has(id)) && !(c.kind === "slots" && false));
    const more = {};
    const bump = (k) => (more[k] = (more[k] || 0) + 1);
    for (const c of rest) {
      const t = tmin(c.time);
      if (c.free || c.priceMin === 0) bump("free");
      if (t != null && t >= 17 * 60) bump("evening");
      if (t != null && t < 13 * 60 && c.kind !== "slots") bump("morning");
      if (/koncert|musik|jazz|klassisk|rock|pop/i.test(c.f.head) && c.kind !== "slots") bump("concerts");
      if (c.kind === "show" || /teater|forestilling|stand up|revy|komedie/i.test(c.f.head)) bump("theatre");
      if (c.kind === "slots" || c.f.moods.has("active")) bump("active");
      if (c.f.moods.has("gaming")) bump("gaming");
      if (c.f.moods.has("food")) bump("food");
      if (c.f.moods.has("social")) bump("social");
      if (c.f.moods.has("culture")) bump("culture");
      if (c.f.pp != null && c.f.pp <= 100 && !(c.free || c.priceMin === 0)) bump("cheap");
      if (c.indoor === true) bump("indoor");
    }
    for (const k of Object.keys(more)) if (more[k] < 2) delete more[k];

    // next: grounded in more (never suggest what the brief already is)
    const NEXT = [
      ["concerts", (n) => `Flere koncerter (${n} til)`, !moods.includes("culture") || true],
      ["theatre", (n) => `Teater og shows (${n} til)`, true],
      ["active", (n) => `Noget aktivt: baner og motion (${n})`, !moods.includes("active")],
      ["free", (n) => `Kun gratis (${n})`, budget !== 0],
      ["cheap", (n) => `Noget billigere, under 100 kr. (${n})`, budget == null || budget > 100],
      ["evening", (n) => `Kun efter kl. 17 (${n})`, fromM < 17 * 60],
      ["morning", (n) => `Noget tidligere på dagen (${n})`, fromM <= 10 * 60 && false],
      ["gaming", (n) => `Mere gaming og spil (${n})`, !moods.includes("gaming")],
      ["food", (n) => `Noget med mad (${n})`, !moods.includes("food")],
      ["social", (n) => `Noget socialt (${n})`, !moods.includes("social")],
    ];
    const cand = NEXT.filter(([k, , ok]) => ok && more[k] >= 3 && k !== "culture").sort((a, b) => more[b[0]] - more[a[0]]);
    const next = [], nextFacets = [];
    for (const [k, f] of cand.slice(0, 3)) { next.push(f(more[k])); nextFacets.push(k); }
    const nd = days.find((d) => d !== date && d > date) || days.find((d) => d !== date);
    if (nd && next.length < 4) { next.push(`Samme brief ${dayName(nd)} i stedet?`); nextFacets.push("day:" + nd); }
    if (next.length < 2) { next.push("Vis andre forslag (skjul dem du har set)"); nextFacets.push("others"); }

    // assumptions
    const A = assumptions;
    if (budget == null) A.push("Budget ikke oplyst: ingen grænse, men god pris vægtes.");
    else if (budget === 0) A.push("Gratis-brief: jeg medregner brugbyen-rækker uden pris som formentlig gratis (kommunale huse).");
    if (suggestions.some((s) => s.items.some((i) => i._c.kind === "slots"))) A.push(`Banepris delt på ${players} personer.`);
    if (suggestions.some((s) => s.items.some((i) => i.price === "pris ikke oplyst"))) A.push('Hvor en kilde ikke giver en pris står "pris ikke oplyst".');
    if (wet) A.push("Regn: udendørs er sorteret fra.");
    else if (showers) A.push("Byger: udendørs er trukket ned.");
    else if (coldish) A.push(`Vejret er ${[wxv.cold && "koldt", wxv.windy && "blæsende", wxv.snow && "snefyldt"].filter(Boolean).join(" og ")}: længere udendørs ting er sorteret fra, selv om det er tørt.`);
    if (dropped["18+ / natteliv for voksne"]) A.push(`${dropped["18+ / natteliv for voksne"]} klubaftener, barer og 18+-ting er fjernet, fordi en af jer er ${youngest >= 10 ? youngest + " år" : "under 18"}.`);
    if (dropped["for børn"]) A.push(`${dropped["for børn"]} børnebegivenheder er fjernet: yngste er ${youngest} år.`);
    if (dropped["ikke for små børn"]) A.push(`${dropped["ikke for små børn"]} ting er fjernet, fordi de ikke er lavet til børn på ${youngest} år.`);
    if (night && minors) A.push("Natteliv med en under 18: jeg viser sene koncerter, shows og events i stedet for klubber.");
    if (mergedAway > 0) A.push(`${mergedAway} dubletter på tværs af kilder er slået sammen.`);
    if (brief.indoorOnly) A.push("Kun indendørs: ting uden oplyst indoor/outdoor, som ikke ser udendørs ud, er med.");
    const pn = chosen.flatMap((s) => s.items.flatMap((i) => i._c.notes || [])).filter((n) => !n.startsWith("tider afviger"));
    pn.slice(0, 2).forEach((n) => A.push("Samme begivenhed: " + n));

    const strip = (s) => ({ kind: s.kind, title: s.title, why: s.why, items: s.items.map((i) => ({ time: i.time, title: i.title, place: i.place, price: i.price, url: i.url, sources: i.sources, ids: i.ids })) });
    return { status: "ok", weather: wx.line, best: strip(best), alternatives: alternatives.map(strip), plan, assumptions: A, more, next, nextFacets, _stats: { candidates: kept.length, dropped, mergedAway } };
  }

  // ---------- 7. refinement: what clicking a `next` chip does to the brief ----------
  function refineBrief(brief, facet, shown) {
    const b = JSON.parse(JSON.stringify(brief));
    const add = (m) => (b.mood = uniq([...(b.mood || []), m]));
    if (facet === "free") b.budgetPerPerson = 0;
    else if (facet === "cheap") b.budgetPerPerson = 100;
    else if (facet === "evening") b.from = "17:00";
    else if (facet === "morning") b.to = "14:00";
    else if (facet === "concerts") { add("culture"); b.wishes = ((b.wishes || "") + " koncert").trim(); }
    else if (facet === "theatre") { add("culture"); b.wishes = ((b.wishes || "") + " teater").trim(); }
    else if (["active", "gaming", "food", "social"].includes(facet)) { b.mood = [facet]; }
    else if (facet.startsWith("day:")) b.date = facet.slice(4);
    else if (facet === "others") b.excludeIds = uniq([...(b.excludeIds || []), ...(shown || [])]);
    else if (facet === "wider") { b.from = undefined; b.to = undefined; }
    else if (facet === "relax") { b.budgetPerPerson = undefined; b.indoorOnly = false; }
    return b;
  }
  function shownIds(res) {
    if (!res || !res.best) return [];
    return [res.best, ...res.alternatives].flatMap((s) => s.items.flatMap((i) => i.ids || []));
  }

  const api = { planOuting, refineBrief, shownIds, MOOD_DA, dayName };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.PlanOuting = api;
})(typeof globalThis !== "undefined" ? globalThis : this);

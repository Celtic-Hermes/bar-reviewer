// Her progress, saved only on this phone (in the browser's "localStorage").
// Nothing here is ever sent anywhere.
//
// What's saved:
//   subjects:  running totals per subject (multiple-choice right/answered, essay ratings,
//              fill-in-the-blank: how many "Got it" out of how many rated)
//   review:    questions to look at again, by ID (a wrong pick, or an essay rated Partly / Missed it)
//   bookmarks: questions she bookmarked, by ID
//   daily:     how many questions she finished on each day, by her phone's date:
//              { "2026-11-17": 12, … } (the last 400 days). For her streak and daily goal.
//   results:   each question's latest result, by ID:
//              { "q-0007": { "last": "got", "on": "2026-11-17", "inARow": 2, "level": "moderate" } }
//              last:   "right" / "wrong" (multiple choice), "got" / "partly" / "missed" (essay,
//                      fill in the blank); on: the date; level: the Blanks level (fill in the blank);
//              inARow: right answers in a row that count toward mastery (2 or more = mastered),
//                      at most one per day; countedOn: the day it last went up.
//   settings:  her choices (Settings screen): { "dailyGoal": 20 (10, 20, 30 or 50),
//              "examDate": "2027-09-12" (optional, YYYY-MM-DD),
//              "showQuote": true / false (the home screen's quote of the day; missing = on) }. Anything missing or odd
//              is left out, and the default is used (see cleanSettings).
//   schedule:  her Study Schedule, by day ("YYYY-MM-DD"); a day is stored only if it has
//              something, with short keys to keep it small:
//              { "2026-11-18": { "k": [ { "t": "Read Rule 91", "m": 30, "d": 1,
//                                         "s": "Remedial Law", "l": "topic:Remedial Law|Special Proceedings" } ],
//                                "off": 1 } }
//              k: the day's tasks, in order; t: title; m: minutes (optional); d: 1 if done;
//              y: type (q Questions, c Case reading, f Fill-in-the-blank, r Review, e Exam;
//                 missing = Other);
//              s: subject (optional); l: what the title opens (optional: "subject:<name>" or
//              "topic:<subject>|<topic>"); off: 1 if it's a Day off. See cleanSchedule.
//   tests:     her tests (tests.js), a list: [ { "id": "t-…", "subject", "view" ("official" / "notes" /
//              "notebooklm"), "made" (ISO date), "all" (true if every topic was picked), "picks": [ { "t": topic, "s": sub-topic or null } ],
//              "type" ("mcq" / "fillblank" / "both"), "level" (fill in the blank difficulty ID),
//              "limit" (minutes, 0 = untimed), "qIds" (question IDs, in the test's shuffled order),
//              "index" (the question she's on), "answers" ({ id: "B" } multiple choice, or
//              { id: { "12": "typed", "14.0": "…" } } fill in the blank: box key -> what she typed),
//              "flags", "hidden" ({ id: [word numbers hidden] }, fill in the blank), "used" (seconds),
//              "state" ("open" / "done"),
//              "finished" (done only) } ]. At most 5 open and 30 done (the newest). See cleanTests.
//   streakBest: her longest streak of study days ever (kept here, since "daily" only
//              keeps 400 days)
//   notes:     her own notes on a case or a rule, by its ID:
//              { "case-0002": { "html": "…", "text": "…", "updated": "2026-11-18T09:30:00.000Z" }, … }
//              html: her note with only <b>, <i>, <u> and <br> (see cleanNoteHtml);
//              text: the same note as plain text (for the My notes list). Notes saved before
//              formatting existed have only "text"; they're turned into html when loaded.
//   tags:      her color tag on a question, by ID: "green", "yellow" or "red"
//              (what each color means is up to her; no tag = not in the list)
//   highlights: words she highlighted, as a list of word positions (0 = first word).
//               Stored by question ID (e.g. "q-0007") for the question text, and by
//               case ID + part (e.g. "case-0002:facts") for a case's facts, issue and ruling.
//   highlightColors: for the full decision text only ("case-0002:fulltext"), the color of
//               each highlighted word: { "case-0002:fulltext": { "15": "facts", … } }.
//               A highlighted word with no color saved is yellow ("ruling").

const STORAGE_KEY = "barReviewer.progress.v1";

// Highlighter colors for the full decision text (defined up here because loading her
// progress, just below, already needs them).
// facts = green, issue = pink, ruling = yellow (the original highlighter), doctrine = yellow-green.
const HIGHLIGHT_COLORS = ["facts", "issue", "ruling", "doctrine"];
const DEFAULT_HIGHLIGHT_COLOR = "ruling";

// Color tags (defined up here because loading her progress, just below, already needs them).
const TAG_COLORS = ["green", "yellow", "red"];

// Keep only tags the app understands (a question ID → one of the three colors).
function cleanTags(value) {
  const clean = {};
  if (!isPlainObject(value)) { return clean; }
  Object.keys(value).forEach(function (id) {
    if (TAG_COLORS.indexOf(value[id]) !== -1) { clean[id] = value[id]; }
  });
  return clean;
}

// Daily counts and per-question results (defined up here because loading her progress,
// just below, already needs them).
const RESULT_KINDS = ["right", "wrong", "got", "partly", "missed"];
const FB_LEVEL_IDS = ["light", "key", "moderate", "intensive", "verbatim"];
// A fill-in-the-blank "Got it" counts toward mastery only at these levels.
const MASTERY_FB_LEVELS = ["moderate", "intensive", "verbatim"];
const DAILY_DAYS_KEPT = 400;
const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

// Keep only sensible day counts: { "2026-11-17": 12 } (whole numbers above 0).
function cleanDaily(value) {
  const clean = {};
  if (!isPlainObject(value)) { return clean; }
  Object.keys(value).forEach(function (day) {
    const n = value[day];
    if (DATE_KEY.test(day) && typeof n === "number" && isFinite(n) && n > 0 && Math.floor(n) === n) { clean[day] = n; }
  });
  return clean;
}

// Keep only sensible results (a damaged value can't break anything).
function cleanResults(value) {
  const clean = {};
  if (!isPlainObject(value)) { return clean; }
  Object.keys(value).forEach(function (id) {
    const r = value[id];
    if (!isPlainObject(r) || RESULT_KINDS.indexOf(r.last) === -1) { return; }
    const result = {
      last: r.last,
      on: (typeof r.on === "string" && DATE_KEY.test(r.on)) ? r.on : null,
      inARow: (typeof r.inARow === "number" && isFinite(r.inARow) && r.inARow > 0) ? Math.floor(r.inARow) : 0
    };
    if (FB_LEVEL_IDS.indexOf(r.level) !== -1) { result.level = r.level; }
    if (typeof r.countedOn === "string" && DATE_KEY.test(r.countedOn)) { result.countedOn = r.countedOn; }
    clean[id] = result;
  });
  return clean;
}

// Her settings (defined up here because loading her progress, just below, needs them).
const DAILY_GOALS = [10, 20, 30, 50];
const DEFAULT_DAILY_GOAL = 20;

// Keeps only settings it knows, with valid values. Missing, old or odd values are left out,
// so the default is used instead and nothing ever crashes. (A new setting: add a line here.)
function cleanSettings(value) {
  const clean = {};
  if (!isPlainObject(value)) { return clean; }
  if (DAILY_GOALS.indexOf(value.dailyGoal) !== -1) { clean.dailyGoal = value.dailyGoal; }
  if (isCalendarDate(value.examDate)) { clean.examDate = value.examDate; }
  if (typeof value.showQuote === "boolean") { clean.showQuote = value.showQuote; }
  return clean;
}

// "2027-09-12": a real date written YYYY-MM-DD (not "2027-02-31").
function isCalendarDate(text) {
  if (typeof text !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(text)) { return false; }
  const d = new Date(text + "T00:00:00");
  return !isNaN(d) && d.getFullYear() === Number(text.slice(0, 4)) &&
    d.getMonth() + 1 === Number(text.slice(5, 7)) && d.getDate() === Number(text.slice(8, 10));
}

// Her Study Schedule (defined up here because loading her progress, just below, needs it).
// Keeps only what it understands: real dates, tasks with a title, sensible minutes, a link
// in a known form. Anything else is dropped, so old or damaged data never breaks anything.
const SCHEDULE_TITLE_MAX = 120;
const SCHEDULE_TASKS_MAX = 50;      // per day
const SCHEDULE_MINUTES_MAX = 999;
const SCHEDULE_TYPE_IDS = ["q", "c", "f", "r", "e"];  // + "o" (Other), the default, never stored

function cleanScheduleTask(task) {
  if (!isPlainObject(task) || typeof task.t !== "string" || !task.t.trim()) { return null; }
  const clean = { t: task.t.trim().slice(0, SCHEDULE_TITLE_MAX) };
  const m = Number(task.m);
  if (Number.isInteger(m) && m > 0 && m <= SCHEDULE_MINUTES_MAX) { clean.m = m; }
  if (task.d) { clean.d = 1; }
  if (SCHEDULE_TYPE_IDS.indexOf(task.y) !== -1) { clean.y = task.y; }
  if (typeof task.s === "string" && task.s.trim()) { clean.s = task.s.trim().slice(0, 60); }
  if (typeof task.l === "string" && /^(subject|topic|case|rule):./.test(task.l) && task.l.length <= 200) { clean.l = task.l; }
  return clean;
}

function cleanSchedule(value) {
  const clean = {};
  if (!isPlainObject(value)) { return clean; }
  Object.keys(value).forEach(function (date) {
    const day = value[date];
    if (!isCalendarDate(date) || !isPlainObject(day)) { return; }
    const tasks = (Array.isArray(day.k) ? day.k : []).map(cleanScheduleTask).filter(Boolean).slice(0, SCHEDULE_TASKS_MAX);
    const keep = {};
    if (tasks.length) { keep.k = tasks; }
    if (day.off) { keep.off = 1; }
    if (keep.k || keep.off) { clean[date] = keep; }
  });
  return clean;
}

// Her notes (defined up here because loading her progress, just below, needs them).
const NOTE_ID = /^(case|rule)-\d+$/;
const NOTE_MAX_LENGTH = 50000;

// ---------- Cleaning a note's formatting (safety) ----------
// Her notes may only contain bold, italic, underline and line breaks. cleanNoteHtml takes
// any HTML (what she typed, something she pasted, a note from a backup file) and builds a
// brand-new copy that has ONLY <b>, <i>, <u>, <br> and plain text. Everything else is
// dropped: other tags (their text is kept), every attribute (so no links, colors, styles
// or event code), and scripts, styles, pictures and frames (dropped entirely).
// The HTML is read with DOMParser, which never runs scripts or loads pictures.
const NOTE_DROP_WHOLE = ["SCRIPT", "STYLE", "TEMPLATE", "IFRAME", "OBJECT", "EMBED", "NOSCRIPT",
  "HEAD", "TITLE", "SVG", "MATH", "CANVAS", "VIDEO", "AUDIO", "IMG", "PICTURE", "SELECT",
  "TEXTAREA", "INPUT", "BUTTON", "META", "LINK"];
const NOTE_BLOCKS = ["DIV", "P", "LI", "UL", "OL", "H1", "H2", "H3", "H4", "H5", "H6", "TR",
  "TABLE", "BLOCKQUOTE", "PRE", "SECTION", "ARTICLE", "HEADER", "FOOTER", "DL", "DT", "DD"];

function escapeNoteText(text) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function cleanNoteHtml(html) {
  if (typeof html !== "string" || !html) { return ""; }
  let doc;
  try {
    doc = new DOMParser().parseFromString("<!doctype html><body>" + html, "text/html");
  } catch (e) {
    return "";
  }
  let out = "";
  const lineBreak = function () {
    if (out && !/<br>$/.test(out)) { out += "<br>"; }
  };
  function walk(node) {
    node.childNodes.forEach(function (child) {
      if (child.nodeType === 3) {  // text: spaces and line breaks in the HTML code become one space
        out += escapeNoteText(child.nodeValue.replace(/[ \t\n\r\f]+/g, " "));
        return;
      }
      if (child.nodeType !== 1) { return; }  // comments and the like
      const tag = child.nodeName.toUpperCase();
      if (NOTE_DROP_WHOLE.indexOf(tag) !== -1) { return; }
      if (tag === "BR") { out += "<br>"; return; }
      // Which of the three styles this element gives its text (tags, or a pasted style).
      const style = (child.getAttribute && child.getAttribute("style")) || "";
      const marks = [];
      // (Browsers write these in different ways: <b> or <strong>, font-weight bold / bolder /
      // 600–900; <i> or <em>, italic / oblique; <u>, text-decoration(-line) underline.)
      if (tag === "B" || tag === "STRONG" || /font-weight\s*:\s*(bold|bolder|[6-9]00)\b/i.test(style)) { marks.push("b"); }
      if (tag === "I" || tag === "EM" || /font-style\s*:\s*(italic|oblique)/i.test(style)) { marks.push("i"); }
      if (tag === "U" || /text-decoration[^;]*underline/i.test(style)) { marks.push("u"); }
      const block = NOTE_BLOCKS.indexOf(tag) !== -1;
      if (block) { lineBreak(); }
      marks.forEach(function (m) { out += "<" + m + ">"; });
      walk(child);
      marks.slice().reverse().forEach(function (m) { out += "</" + m + ">"; });
      if (block) { lineBreak(); }
    });
  }
  walk(doc.body);
  // Tidy: no empty style tags, no line breaks at the very start or end.
  let previous;
  do {
    previous = out;
    out = out.replace(/<(b|i|u)><\/\1>/g, "");
  } while (out !== previous);
  out = out.replace(/^(\s*<br>)+/, "").replace(/(<br>\s*)+$/, "");
  return out;  // (no length cut: a long note must never be lost)
}

// A cleaned note as plain text (line breaks kept), e.g. for the My notes list.
function noteHtmlToText(html) {
  return html.replace(/<br>/g, "\n").replace(/<\/?(b|i|u)>/g, "")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").replace(/\u00a0/g, " ");
}

// A plain-text note (saved before formatting existed) as html.
function noteTextToHtml(text) {
  return escapeNoteText(text).replace(/\r?\n/g, "<br>");
}

// Keep only sensible notes: a case or rule ID → { html, text, updated }, not blank.
// The html is always cleaned again here, so a damaged or edited backup can't add anything.
function cleanNotes(value) {
  const clean = {};
  if (!isPlainObject(value)) { return clean; }
  Object.keys(value).forEach(function (id) {
    const n = value[id];
    if (!NOTE_ID.test(id) || !isPlainObject(n)) { return; }
    let html = "";
    if (typeof n.html === "string") {
      html = cleanNoteHtml(n.html);
    } else if (typeof n.text === "string") {
      html = noteTextToHtml(n.text.slice(0, NOTE_MAX_LENGTH));  // an older plain-text note
    }
    const text = noteHtmlToText(html);
    if (!text.trim()) { return; }
    clean[id] = {
      html: html,
      text: text,
      updated: (typeof n.updated === "string" && !isNaN(Date.parse(n.updated))) ? n.updated : null
    };
  });
  return clean;
}

// ---------- Her tests (tests.js) ----------
// progress.tests: a list of tests, each { id, subject, view, made, all, picks, type, level, limit,
// qIds, index, answers, flags, hidden, used, state, finished }. Only question IDs are stored, never
// question text. At most TESTS_OPEN_MAX unfinished ("open") and TESTS_DONE_MAX finished
// ("done") tests are kept: the newest ones. Anything unusable is dropped; never throws.
const TESTS_OPEN_MAX = 5;
const TESTS_DONE_MAX = 30;
const TEST_TYPES = ["mcq", "fillblank", "both"];      // "both" = multiple choice + fill in the blank
const TEST_VIEWS = ["official", "notes", "notebooklm"];
const TEST_LIMIT_MAX = 600;                         // minutes (0 = untimed)
const TEST_QUESTIONS_MAX = 500;
const TEST_ID = /^t-[a-z0-9]{1,20}$/;
const TEST_QUESTION_ID = /^(q|pq|nq)-\d+$/;

function isIsoDate(text) {
  return typeof text === "string" && text.length <= 40 && !isNaN(new Date(text).getTime());
}

function cleanTest(t) {
  if (!t || typeof t !== "object" || Array.isArray(t)) { return null; }
  if (typeof t.id !== "string" || !TEST_ID.test(t.id)) { return null; }
  if (typeof t.subject !== "string" || !t.subject || t.subject.length > 100) { return null; }
  if (!isIsoDate(t.made)) { return null; }
  const qIds = [];
  (Array.isArray(t.qIds) ? t.qIds : []).forEach(function (id) {
    if (typeof id === "string" && TEST_QUESTION_ID.test(id) && qIds.indexOf(id) === -1 && qIds.length < TEST_QUESTIONS_MAX) { qIds.push(id); }
  });
  if (qIds.length === 0) { return null; }
  const picks = [];
  (Array.isArray(t.picks) ? t.picks : []).forEach(function (pick) {
    if (!pick || typeof pick.t !== "string" || !pick.t || pick.t.length > 200) { return; }
    picks.push({ t: pick.t, s: (typeof pick.s === "string" && pick.s.length <= 200) ? pick.s : null });
  });
  const answers = {};
  if (t.answers && typeof t.answers === "object" && !Array.isArray(t.answers)) {
    Object.keys(t.answers).forEach(function (id) {
      if (qIds.indexOf(id) === -1) { return; }
      const a = t.answers[id];
      if (["A", "B", "C", "D"].indexOf(a) !== -1) {
        answers[id] = a;  // a multiple-choice pick
      } else if (a && typeof a === "object" && !Array.isArray(a)) {
        const typed = {};  // fill in the blank: box key -> what she typed
        Object.keys(a).forEach(function (key) {
          if (/^\d+(\.\d+)?$/.test(key) && typeof a[key] === "string") { typed[key] = a[key].slice(0, 200); }
        });
        answers[id] = typed;
      }
    });
  }
  const flags = [];
  (Array.isArray(t.flags) ? t.flags : []).forEach(function (id) {
    if (qIds.indexOf(id) !== -1 && flags.indexOf(id) === -1) { flags.push(id); }
  });
  // Fill in the blank: which words of each item are hidden (word numbers), fixed when she first opens it.
  const hidden = {};
  if (t.hidden && typeof t.hidden === "object" && !Array.isArray(t.hidden)) {
    Object.keys(t.hidden).forEach(function (id) {
      if (qIds.indexOf(id) === -1 || !Array.isArray(t.hidden[id])) { return; }
      const words = [];
      t.hidden[id].forEach(function (n) {
        if (typeof n === "number" && Math.floor(n) === n && n >= 0 && n < 100000 && words.indexOf(n) === -1 && words.length < 5000) { words.push(n); }
      });
      hidden[id] = words;
    });
  }
  const limit = wholeNumberOrZero(t.limit);
  const index = wholeNumberOrZero(t.index);
  const test = {
    id: t.id,
    subject: t.subject,
    view: TEST_VIEWS.indexOf(t.view) !== -1 ? t.view : "official",
    made: t.made,
    all: t.all === true,   // she picked every topic ("All topics")
    picks: picks,
    type: TEST_TYPES.indexOf(t.type) !== -1 ? t.type : "both",
    level: FB_LEVEL_IDS.indexOf(t.level) !== -1 ? t.level : "key",
    limit: Math.min(limit, TEST_LIMIT_MAX),
    qIds: qIds,
    index: index < qIds.length ? index : 0,
    answers: answers,
    flags: flags,
    hidden: hidden,
    used: wholeNumberOrZero(t.used),   // seconds of test time used so far
    state: t.state === "done" ? "done" : "open"
  };
  if (test.state === "done") { test.finished = isIsoDate(t.finished) ? t.finished : t.made; }
  return test;
}

function cleanTests(value) {
  if (!Array.isArray(value)) { return []; }
  const seen = {};
  const tests = [];
  value.forEach(function (t) {
    let test = null;
    try { test = cleanTest(t); } catch (e) { test = null; }
    if (test && !seen[test.id]) { seen[test.id] = true; tests.push(test); }
  });
  function newest(list, field, max) {
    return list.sort(function (a, b) { return new Date(b[field]) - new Date(a[field]); }).slice(0, max);
  }
  const open = newest(tests.filter(function (t) { return t.state === "open"; }), "made", TESTS_OPEN_MAX);
  const done = newest(tests.filter(function (t) { return t.state === "done"; }), "finished", TESTS_DONE_MAX);
  return open.concat(done);
}

function emptyProgress() {
  return { subjects: {}, review: {}, bookmarks: {}, tags: {}, notes: {}, highlights: {}, highlightColors: {}, daily: {}, results: {}, settings: {}, schedule: {}, tests: [], streakBest: 0 };
}

// Read saved progress. If there's none, or it's damaged, start fresh instead of crashing.
function loadProgress() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) { return emptyProgress(); }
    const data = JSON.parse(raw);
    if (!data || typeof data !== "object") { return emptyProgress(); }
    return {
      subjects: dropOldFillBlankTotals(followMovedSubjects(data.subjects || {})),
      review: data.review || {},
      bookmarks: data.bookmarks || {},
      tags: cleanTags(data.tags),
      notes: cleanNotes(data.notes),
      daily: cleanDaily(data.daily),
      results: cleanResults(data.results),
      settings: cleanSettings(data.settings),
      schedule: cleanSchedule(data.schedule),
      tests: cleanTests(data.tests),
      streakBest: wholeNumberOrZero(data.streakBest),
      highlights: cleanHighlights(data.highlights),
      highlightColors: cleanHighlightColors(data.highlightColors)
    };
  } catch (e) {
    return emptyProgress();
  }
}

// Subjects whose content moved somewhere else: old name → new name.
// Her running totals saved under the old name are added to the new one, so her
// scores keep showing (on the new subject's screen). Her review list, bookmarks and
// highlights are saved by question/case ID, so they need nothing.
// (If a subject with an old name here is ever added again, remove it from this list first.)
const MOVED_SUBJECTS = {
  "Communication Law": "Mercantile Law"  // now a topic under Mercantile Law
};

// Topics that were renamed: "Subject|Old topic" → new topic name. Saved places on this device
// (last practiced, the round she's in, the saved spot) and Study Schedule links saved with the old
// name follow the rename. Her scores, notes and highlights are saved by ID and need nothing.
const RENAMED_TOPICS = {
  "Mercantile Law|Communication Law": "Commercial Law"
};

function currentTopicName(subject, topic) {
  const key = subject + "|" + topic;
  return Object.prototype.hasOwnProperty.call(RENAMED_TOPICS, key) ? RENAMED_TOPICS[key] : topic;
}

let subjectsWereMoved = false;  // true if loading her progress just moved some totals

function followMovedSubjects(subjects) {
  Object.keys(MOVED_SUBJECTS).forEach(function (oldName) {
    const old = subjects[oldName];
    if (!old || typeof old !== "object") { return; }
    subjectsWereMoved = true;
    const newName = MOVED_SUBJECTS[oldName];
    const into = subjects[newName] || {};
    ["mcqCorrect", "mcqAnswered", "got", "partly", "missed", "fbCorrect", "fbAnswered"].forEach(function (field) {
      into[field] = wholeNumberOrZero(into[field]) + wholeNumberOrZero(old[field]);
    });
    subjects[newName] = into;
    delete subjects[oldName];
  });
  return subjects;
}

// The first fill-in-the-blank design saved % self-ratings (fbRated, fbPercentTotal).
// Those measured something else, so they're dropped; the score now counts Got it / Missed it.
function dropOldFillBlankTotals(subjects) {
  Object.keys(subjects).forEach(function (name) {
    const s = subjects[name];
    if (s && typeof s === "object" && ("fbRated" in s || "fbPercentTotal" in s)) {
      delete s.fbRated;
      delete s.fbPercentTotal;
      subjectsWereMoved = true;  // (reuses the "save once after loading" flag)
    }
  });
  return subjects;
}

let progress = loadProgress();
if (subjectsWereMoved) { saveProgress(); }  // keep the moved totals

// Returns true if it saved, false if the phone refused.
function saveProgress() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
    return true;
  } catch (e) {
    // Saving can fail (for example, in private browsing). The app keeps working anyway.
    return false;
  }
}

// Totals for one subject, created the first time they're needed.
function subjectStats(subject) {
  if (!progress.subjects[subject]) {
    progress.subjects[subject] = { mcqCorrect: 0, mcqAnswered: 0, got: 0, partly: 0, missed: 0, fbCorrect: 0, fbAnswered: 0 };
  }
  return progress.subjects[subject];
}

// A multiple-choice answer: count it, and add it to (or take it off) the review list.
function recordMcq(question, isRight) {
  const stats = subjectStats(question.subject);
  stats.mcqAnswered += 1;
  noteResult(question, isRight ? "right" : "wrong", isRight ? "add" : "reset");
  if (isRight) {
    stats.mcqCorrect += 1;
    delete progress.review[question.id];
  } else {
    progress.review[question.id] = "Wrong answer";
  }
  saveProgress();
}

// An essay self-rating: count it, and add it to (or take it off) the review list.
// A fill-in-the-blank rating: "Got it" or "Missed it" (after "Show answer").
// Per subject: how many she rated (fbAnswered) and how many were "Got it" (fbCorrect).
// "Missed it" puts the item in her review list; "Got it" takes it off.
// (The level she picked, how much was filled in for her, isn't part of the score.)
function recordFillBlank(question, rating, level) {
  const stats = subjectStats(question.subject);
  // Got it: counts toward mastery only at Moderate or harder; at Light or Key Legal
  // Terms it leaves the count as it was. Missed it (any level) starts it over.
  const effect = rating !== "Got it" ? "reset" : (MASTERY_FB_LEVELS.indexOf(level) !== -1 ? "add" : "keep");
  noteResult(question, rating === "Got it" ? "got" : "missed", effect, level);
  stats.fbAnswered = wholeNumberOrZero(stats.fbAnswered) + 1;
  if (rating === "Got it") {
    stats.fbCorrect = wholeNumberOrZero(stats.fbCorrect) + 1;
    delete progress.review[question.id];
  } else {
    progress.review[question.id] = rating;
  }
  saveProgress();
}

function recordEssay(question, rating) {
  const stats = subjectStats(question.subject);
  noteResult(question, rating === "Got it" ? "got" : (rating === "Partly" ? "partly" : "missed"),
    rating === "Got it" ? "add" : "reset");
  if (rating === "Got it") { stats.got += 1; }
  if (rating === "Partly") { stats.partly += 1; }
  if (rating === "Missed it") { stats.missed += 1; }
  if (rating === "Got it") {
    delete progress.review[question.id];
  } else {
    progress.review[question.id] = rating;
  }
  saveProgress();
}

// ---------- Today's count and each question's latest result ----------
// Today's date on her phone, like "2026-11-17" (her own time zone, not world time).
function todayKey() {
  const d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}

// One finished question: +1 for today, and its latest result. "effect" is what it does to
// the right-in-a-row count: "add" (+1), "reset" (back to 0) or "keep" (unchanged).
// The count goes up at most once a day: a second right answer on the day it already went
// up leaves it as it is (after a reset, the first right answer starts it again at 1).
// (The caller saves.)
function noteResult(question, last, effect, level) {
  const today = todayKey();
  progress.daily[today] = (progress.daily[today] || 0) + 1;
  // Keep only the most recent days.
  const days = Object.keys(progress.daily).sort();
  days.slice(0, Math.max(0, days.length - DAILY_DAYS_KEPT)).forEach(function (day) { delete progress.daily[day]; });

  const before = progress.results[question.id];
  const inARow = before ? before.inARow : 0;
  // The day the count last went up (results saved before this was added: their date).
  let countedOn = before ? (before.countedOn || (inARow > 0 ? before.on : null)) : null;
  let newCount = inARow;
  if (effect === "reset") {
    newCount = 0;
    countedOn = null;
  } else if (effect === "add" && (inARow === 0 || countedOn !== today)) {
    newCount = inARow + 1;
    countedOn = today;
  }
  const result = { last: last, on: today, inARow: newCount };
  if (countedOn && newCount > 0) { result.countedOn = countedOn; }
  if (FB_LEVEL_IDS.indexOf(level) !== -1) { result.level = level; }
  progress.results[question.id] = result;
}

// ---------- Reset: redo some questions from scratch ----------
// Clears her answers for these questions only: their latest result and "right in a row" count
// (so they're no longer mastered) and their place in Review missed. Notes, highlights, tags,
// bookmarks, today's count, the daily history, the streaks and the per-subject running totals
// are NOT touched. Returns exactly what was removed, so undoReset can put it all back.
function resetQuestions(ids) {
  // The order things were saved in, so Undo puts them back exactly as they were.
  const removed = { results: {}, review: {}, resultsOrder: Object.keys(progress.results), reviewOrder: Object.keys(progress.review) };
  ids.forEach(function (id) {
    if (Object.prototype.hasOwnProperty.call(progress.results, id)) {
      removed.results[id] = progress.results[id];
      delete progress.results[id];
    }
    if (Object.prototype.hasOwnProperty.call(progress.review, id)) {
      removed.review[id] = progress.review[id];
      delete progress.review[id];
    }
  });
  saveProgress();
  return removed;
}

// Undo a reset: put back exactly what resetQuestions removed.
function undoReset(removed) {
  progress.results = putBackInOrder(progress.results, removed.results, removed.resultsOrder);
  progress.review = putBackInOrder(progress.review, removed.review, removed.reviewOrder);
  saveProgress();
}

// "now" with the "removed" entries put back, everything in its original order ("order"),
// then anything added since (kept as it is).
function putBackInOrder(now, removed, order) {
  const result = {};
  order.forEach(function (id) {
    if (Object.prototype.hasOwnProperty.call(removed, id)) { result[id] = removed[id]; }
    else if (Object.prototype.hasOwnProperty.call(now, id)) { result[id] = now[id]; }
  });
  Object.keys(now).forEach(function (id) { if (!Object.prototype.hasOwnProperty.call(result, id)) { result[id] = now[id]; } });
  return result;
}

// ---------- Her notes on cases and rules ----------
// Her note as cleaned html (only <b>, <i>, <u>, <br>), or "" if none.
function noteHtmlFor(id) {
  const note = progress.notes[id];
  return note ? note.html : "";
}

// Save (or, if blank, remove) her note on a case or rule, from the notes box's HTML.
// It's cleaned first, so only bold, italic, underline and line breaks are ever saved.
// Returns true if it saved.
function setNote(id, html) {
  if (!NOTE_ID.test(id)) { return false; }
  const clean = cleanNoteHtml(html);
  const text = noteHtmlToText(clean);
  if (!text.trim()) {
    delete progress.notes[id];
  } else {
    progress.notes[id] = { html: clean, text: text, updated: new Date().toISOString() };
  }
  return saveProgress();
}

// ---------- Mastery ----------
// A question is mastered once its right-in-a-row count reaches 2: right on two different
// days in a row, with nothing wrong in between (see noteResult).
const MASTERY_IN_A_ROW = 2;

function isMastered(questionId) {
  const r = progress.results[questionId];
  return Boolean(r && r.inARow >= MASTERY_IN_A_ROW);
}

// How many of these questions are mastered: { mastered, total }.
function masteryOf(questions) {
  const valid = questions.filter(function (q) { return q && typeof q.id === "string"; });
  return {
    mastered: valid.filter(function (q) { return isMastered(q.id); }).length,
    total: valid.length
  };
}

// ---------- Daily goal and streak (the Today card) ----------
function dailyGoal() {
  const goal = settingsObject().dailyGoal;
  return DAILY_GOALS.indexOf(goal) !== -1 ? goal : DEFAULT_DAILY_GOAL;
}

function setDailyGoal(goal) {
  if (DAILY_GOALS.indexOf(goal) === -1) { return; }
  settingsObject().dailyGoal = goal;
  saveProgress();
}

// "Show quote of the day" (Settings → Display): on unless she has switched it off.
function showQuote() {
  return settingsObject().showQuote !== false;
}

function setShowQuote(on) {
  settingsObject().showQuote = !!on;
  saveProgress();
}

// ---------- Study Schedule ----------
function scheduleObject() {
  if (!isPlainObject(progress.schedule)) { progress.schedule = {}; }
  return progress.schedule;
}

// One day: { tasks: [ … ], off: true/false } (a copy-free view of what's saved; empty if nothing).
function scheduleDay(date) {
  const day = scheduleObject()[date];
  return { tasks: day && Array.isArray(day.k) ? day.k : [], off: !!(day && day.off) };
}

// Save one day (tasks list and Day off); a day with nothing in it is removed.
function setScheduleDay(date, tasks, off) {
  if (!isCalendarDate(date)) { return; }
  const clean = cleanSchedule({ [date]: { k: tasks, off: off } })[date];
  if (clean) { scheduleObject()[date] = clean; } else { delete scheduleObject()[date]; }
  saveProgress();
}

// Her exam date ("YYYY-MM-DD"), or "" if she hasn't set one. Never filled in for her.
function examDate() {
  const date = settingsObject().examDate;
  return isCalendarDate(date) ? date : "";
}

// Save it ("" removes it).
function setExamDate(value) {
  if (isCalendarDate(value)) {
    settingsObject().examDate = value;
  } else {
    delete settingsObject().examDate;
  }
  saveProgress();
}

function todayCount() {
  return progress.daily[todayKey()] || 0;
}

// "2026-11-17" for a date, and the day before a date (at noon, so clock changes can't skip a day).
function dayKeyOf(date) {
  return date.getFullYear() + "-" + String(date.getMonth() + 1).padStart(2, "0") + "-" + String(date.getDate()).padStart(2, "0");
}
function dayBefore(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() - 1, 12);
}

// Her streak: consecutive days with at least one finished question.
// current: the streak up to today, or up to yesterday if she hasn't studied yet today
//          (it's still alive until today ends); studiedToday: whether today counts yet;
// best: her longest streak ever (saved, since only 400 days of counts are kept).
function streakInfo() {
  const daily = progress.daily;
  const now = new Date();
  let day = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12);
  const studiedToday = (daily[dayKeyOf(day)] || 0) > 0;
  if (!studiedToday) { day = dayBefore(day); }
  let current = 0;
  while ((daily[dayKeyOf(day)] || 0) > 0) {
    current += 1;
    day = dayBefore(day);
  }
  // Longest run among the days kept.
  let longest = 0;
  let run = 0;
  let previous = null;
  Object.keys(daily).sort().forEach(function (key) {
    const parts = key.split("-").map(Number);
    const date = new Date(parts[0], parts[1] - 1, parts[2], 12);
    run = (previous && dayKeyOf(dayBefore(date)) === previous) ? run + 1 : 1;
    longest = Math.max(longest, run);
    previous = key;
  });
  if (longest > progress.streakBest) {
    progress.streakBest = longest;
    saveProgress();
  }
  return { current: current, studiedToday: studiedToday, best: progress.streakBest, everStudied: Object.keys(daily).length > 0 };
}

function isBookmarked(questionId) {
  return Boolean(progress.bookmarks[questionId]);
}

function toggleBookmark(questionId) {
  if (isBookmarked(questionId)) {
    delete progress.bookmarks[questionId];
  } else {
    progress.bookmarks[questionId] = true;
  }
  saveProgress();
}

// ---------- Color tags (green / yellow / red, or none) ----------
// Her tag on a question: "green", "yellow", "red", or null for none.
function tagOf(questionId) {
  return TAG_COLORS.indexOf(progress.tags[questionId]) !== -1 ? progress.tags[questionId] : null;
}

// Set a question's tag (null removes it).
function setTag(questionId, color) {
  if (TAG_COLORS.indexOf(color) !== -1) {
    progress.tags[questionId] = color;
  } else {
    delete progress.tags[questionId];
  }
  saveProgress();
}

// ---------- Where she is right now ----------
// So a reload (or an app update) puts her back on the same screen, in the middle of
// the same practice round. Kept in its own slot, separate from her progress above,
// so it is NOT part of a backup file: restoring an old backup should never drop her
// into an old, half-finished round.
// It is cleared when she goes back to the home screen, or finishes a round.
const SPOT_KEY = "barReviewer.currentSpot.v1";

// ---------- Away for a while → back to the home screen ----------
// A short break (switching apps, locking the phone): she's exactly where she left off.
// A long break (this many minutes or more): she starts at the home screen instead, and the
// saved spot (and any practice round in it) is dropped. Her progress is never touched.
// (To change how long "a while" is, change this one number.)
const AWAY_HOME_MINUTES = 30;
const LAST_SEEN_KEY = "barReviewer.lastSeen.v1";  // when she last used the app (this device only, not in backups)

// ---------- The last topic she practiced (for the home screen's "Pick up where you stopped") ----------
// Kept on this device only (not in backups): which subject, topic and sub-topic, and when.
const LAST_PRACTICE_KEY = "barReviewer.lastPractice.v1";

// "view" is "official", "notes" (the class notes, data/class-notes.json) or "notebooklm" (data/notebooklm.json).
// "notes" (true for the class notes) is also kept, as older versions saved only that.
function savedViewOf(raw) {
  if (raw.view === "notes" || raw.view === "notebooklm" || raw.view === "official") { return raw.view; }
  return raw.notes === true ? "notes" : "official";
}

function saveLastPractice(subject, topic, subtopic, view) {
  try {
    localStorage.setItem(LAST_PRACTICE_KEY, JSON.stringify({ subject: subject, topic: topic, subtopic: subtopic || null, notes: view === "notes", view: view, at: Date.now() }));
  } catch (e) { /* fine */ }
}

// { subject, topic, subtopic (or null), at } or null (nothing saved, or it doesn't look right).
function loadLastPractice() {
  try {
    const raw = JSON.parse(localStorage.getItem(LAST_PRACTICE_KEY));
    if (!isPlainObject(raw) || typeof raw.subject !== "string" || typeof raw.topic !== "string" || !Number(raw.at)) { return null; }
    return { subject: raw.subject, topic: currentTopicName(raw.subject, raw.topic), subtopic: typeof raw.subtopic === "string" ? raw.subtopic : null, notes: savedViewOf(raw) === "notes", view: savedViewOf(raw), at: Number(raw.at) };
  } catch (e) {
    return null;
  }
}

// ---------- The practice round she's in the middle of (for the subject screen's "Continue") ----------
// Kept on this device only (not in backups), separate from her progress: { subject, topic, subtopic,
// at, round }, where "round" is the same round object the saved spot keeps (the order of the
// questions, which one she's on, her answers so far). Unlike the saved spot it survives the
// home-screen timeout and leaving the app; it's removed when the round is finished.
const LAST_ROUND_KEY = "barReviewer.lastRound.v1";

function saveLastRound(subject, topic, subtopic, round, view) {
  try {
    localStorage.setItem(LAST_ROUND_KEY, JSON.stringify({ subject: subject, topic: topic, subtopic: subtopic || null, notes: view === "notes", view: view, at: Date.now(), round: round }));
  } catch (e) { /* fine */ }
}

// The saved round, or null (none, or it doesn't look right).
function loadLastRound() {
  try {
    const raw = JSON.parse(localStorage.getItem(LAST_ROUND_KEY));
    if (!isPlainObject(raw) || typeof raw.subject !== "string" || typeof raw.topic !== "string" || !isPlainObject(raw.round)) { return null; }
    const r = raw.round;
    if (!Array.isArray(r.questionIds) || r.questionIds.length === 0 || !Number.isInteger(r.index) || r.index < 0 || r.index >= r.questionIds.length) { return null; }
    return { subject: raw.subject, topic: currentTopicName(raw.subject, raw.topic), subtopic: typeof raw.subtopic === "string" ? raw.subtopic : null, notes: savedViewOf(raw) === "notes", view: savedViewOf(raw), at: Number(raw.at) || 0, round: r };
  } catch (e) {
    return null;
  }
}

function clearLastRound() {
  try { localStorage.removeItem(LAST_ROUND_KEY); } catch (e) { /* fine */ }
}

// Note "she's here / was here just now" (called when the app is hidden or closed, and with each saved spot).
function markSeen() {
  try { localStorage.setItem(LAST_SEEN_KEY, String(Date.now())); } catch (e) { /* fine */ }
}

// True if she's been away from the app for AWAY_HOME_MINUTES or more. (Never seen before, or a
// clock that makes no sense: no.)
function awayTooLong() {
  try {
    const then = Number(localStorage.getItem(LAST_SEEN_KEY));
    if (!then) { return false; }
    const minutes = (Date.now() - then) / 60000;
    return minutes >= AWAY_HOME_MINUTES;
  } catch (e) {
    return false;
  }
}

// Gives back the saved spot, or null if there's none (or it's damaged).
function loadSpot() {
  try {
    const raw = localStorage.getItem(SPOT_KEY);
    if (!raw) { return null; }
    const spot = JSON.parse(raw);
    return isPlainObject(spot) ? spot : null;
  } catch (e) {
    return null;
  }
}

function saveSpot(spot) {
  markSeen();
  try {
    localStorage.setItem(SPOT_KEY, JSON.stringify(spot));
  } catch (e) {
    // Couldn't save (for example, private browsing). The app keeps working anyway.
  }
}

function clearSpot() {
  try {
    localStorage.removeItem(SPOT_KEY);
  } catch (e) {
    // Nothing to do.
  }
}

// ---------- Highlights ----------
// Keep only lists of whole word positions, so damaged saved data can't break anything.
function cleanHighlights(value) {
  const clean = {};
  if (!value || typeof value !== "object" || Array.isArray(value)) { return clean; }
  Object.keys(value).forEach(function (key) {
    if (!Array.isArray(value[key])) { return; }
    const positions = value[key].filter(function (n) {
      return typeof n === "number" && isFinite(n) && n >= 0 && Math.floor(n) === n;
    });
    if (positions.length > 0) { clean[key] = positions; }
  });
  return clean;
}

// ---------- Highlighter colors (full decision text only) ----------

// Keep only sensible color entries (a damaged value can't break anything).
function cleanHighlightColors(value) {
  const clean = {};
  if (!isPlainObject(value)) { return clean; }
  Object.keys(value).forEach(function (key) {
    if (!isPlainObject(value[key])) { return; }
    const colors = {};
    Object.keys(value[key]).forEach(function (position) {
      if (/^\d+$/.test(position) && HIGHLIGHT_COLORS.indexOf(value[key][position]) !== -1) {
        colors[position] = value[key][position];
      }
    });
    if (Object.keys(colors).length > 0) { clean[key] = colors; }
  });
  return clean;
}

// The color of one highlighted word (yellow if none was saved).
function highlightColorOf(key, position) {
  const colors = progress.highlightColors[key];
  return (colors && colors[position]) || DEFAULT_HIGHLIGHT_COLOR;
}

// Highlight several words in one color (new words, or a different color). Saves once.
function colorHighlights(key, positions, color) {
  const list = highlightedWords(key).slice();
  const colors = progress.highlightColors[key] || {};
  positions.forEach(function (position) {
    if (list.indexOf(position) === -1) { list.push(position); }
    colors[position] = color;
  });
  list.sort(function (a, b) { return a - b; });
  progress.highlights[key] = list;
  progress.highlightColors[key] = colors;
  saveProgress();
}

// Forget the colors of words that lost their highlight.
function forgetColors(key, positions) {
  const colors = progress.highlightColors[key];
  if (!colors) { return; }
  positions.forEach(function (position) { delete colors[position]; });
  if (Object.keys(colors).length === 0) { delete progress.highlightColors[key]; }
}

// The highlighted word positions for one question (or one part of a case).
function highlightedWords(key) {
  return progress.highlights[key] || [];
}

// Tap a word: highlight it, or remove its highlight if it already has one.
function toggleHighlight(key, position) {
  const list = highlightedWords(key).slice();
  const spot = list.indexOf(position);
  if (spot === -1) {
    list.push(position);
    list.sort(function (a, b) { return a - b; });
  } else {
    list.splice(spot, 1);
    forgetColors(key, [position]);
  }
  if (list.length > 0) {
    progress.highlights[key] = list;
  } else {
    delete progress.highlights[key];
  }
  saveProgress();
}

// Highlight (turnOn = true) or un-highlight (false) several words at once,
// e.g. a run of words selected by dragging with a mouse. Saves once at the end.
function setHighlights(key, positions, turnOn) {
  let list = highlightedWords(key).slice();
  positions.forEach(function (position) {
    const spot = list.indexOf(position);
    if (turnOn && spot === -1) { list.push(position); }
    if (!turnOn && spot !== -1) { list.splice(spot, 1); }
  });
  if (!turnOn) { forgetColors(key, positions); }
  list.sort(function (a, b) { return a - b; });
  if (list.length > 0) {
    progress.highlights[key] = list;
  } else {
    delete progress.highlights[key];
  }
  saveProgress();
}

// ---------- Back up and restore ----------
// A backup file is her progress (exactly as saved above), wrapped with a label
// so the app can recognize its own files, plus the date it was made.
const BACKUP_LABEL = "Bar Reviewer progress backup";

function progressBackupText() {
  return JSON.stringify({
    app: BACKUP_LABEL,
    backupVersion: 1,
    savedAt: new Date().toISOString(),
    progress: progress
  }, null, 2);
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function wholeNumberOrZero(value) {
  return (typeof value === "number" && isFinite(value) && value >= 0) ? Math.floor(value) : 0;
}

// Check a backup file's text. Never crashes on a bad file.
// Gives back { progress, savedAt } if it's a good backup, or { error } with a plain message.
function readBackup(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    return { error: "That file isn't a Bar Reviewer backup. Nothing was changed." };
  }
  if (!isPlainObject(data) || data.app !== BACKUP_LABEL || !isPlainObject(data.progress)) {
    return { error: "That file isn't a Bar Reviewer backup. Nothing was changed." };
  }
  const p = data.progress;
  if (!isPlainObject(p.subjects) || !isPlainObject(p.review) || !isPlainObject(p.bookmarks)) {
    return { error: "That backup file looks damaged. Nothing was changed." };
  }

  // Copy only the parts the app understands, so a damaged file can't break anything.
  const clean = emptyProgress();
  Object.keys(p.subjects).forEach(function (subject) {
    const s = p.subjects[subject];
    if (!isPlainObject(s)) { return; }
    clean.subjects[subject] = {
      mcqCorrect: wholeNumberOrZero(s.mcqCorrect),
      mcqAnswered: wholeNumberOrZero(s.mcqAnswered),
      got: wholeNumberOrZero(s.got),
      partly: wholeNumberOrZero(s.partly),
      missed: wholeNumberOrZero(s.missed),
      fbCorrect: wholeNumberOrZero(s.fbCorrect),    // older backups have none: 0
      fbAnswered: wholeNumberOrZero(s.fbAnswered)
    };
  });
  Object.keys(p.review).forEach(function (id) {
    if (typeof p.review[id] === "string") { clean.review[id] = p.review[id]; }
  });
  Object.keys(p.bookmarks).forEach(function (id) {
    if (p.bookmarks[id]) { clean.bookmarks[id] = true; }
  });
  // Older backups have no tags; that's fine, they just start empty.
  clean.tags = cleanTags(p.tags);
  // Older backups have no notes: they start empty.
  clean.notes = cleanNotes(p.notes);
  // Older backups have no daily counts or results either: they start empty.
  clean.daily = cleanDaily(p.daily);
  clean.results = cleanResults(p.results);
  clean.settings = cleanSettings(p.settings);
  clean.schedule = cleanSchedule(p.schedule);  // older backups have none: it starts empty
  clean.tests = cleanTests(p.tests);  // older backups have no tests: none
  clean.streakBest = wholeNumberOrZero(p.streakBest);
  // Backups made before a subject moved: follow the move.
  followMovedSubjects(clean.subjects);
  // Older backups have no highlights; that's fine, they just start empty.
  clean.highlights = cleanHighlights(p.highlights);
  // Older backups have no highlight colors; their highlights show yellow.
  clean.highlightColors = cleanHighlightColors(p.highlightColors);

  const savedAt = new Date(data.savedAt);
  return { progress: clean, savedAt: isNaN(savedAt) ? null : savedAt };
}

// Replace the progress on this phone with a checked backup. Returns true if it saved.
function restoreProgress(newProgress) {
  progress = newProgress;
  progress.settings = cleanSettings(progress.settings);  // never trust settings as they come
  progress.schedule = cleanSchedule(progress.schedule);  // nor the schedule
  progress.tests = cleanTests(progress.tests);  // nor her tests
  return saveProgress();
}

// Her settings object, always usable (an empty one if it's missing for any reason).
function settingsObject() {
  if (!isPlainObject(progress.settings)) { progress.settings = {}; }
  return progress.settings;
}

// ---------- Fill in the blank: the "Blanks" level she last picked ----------
// Just a convenience (so the dropdown starts where she left it). Not part of backups.
const FB_LEVEL_KEY = "barReviewer.fbLevel.v1";

function loadFbLevel() {
  try {
    return localStorage.getItem(FB_LEVEL_KEY);
  } catch (e) {
    return null;
  }
}

function saveFbLevel(level) {
  try {
    localStorage.setItem(FB_LEVEL_KEY, level);
  } catch (e) {
    // Couldn't save. The dropdown just starts at the default next time.
  }
}

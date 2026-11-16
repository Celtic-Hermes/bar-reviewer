// Her progress, saved only on this phone (in the browser's "localStorage").
// Nothing here is ever sent anywhere.
//
// What's saved:
//   subjects:  running totals per subject (multiple-choice right/answered, essay ratings,
//              fill-in-the-blank: how many rated and the sum of her % ratings)
//   review:    questions to look at again, by ID (a wrong pick, or an essay rated Partly / Missed it)
//   bookmarks: questions she bookmarked, by ID
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

function emptyProgress() {
  return { subjects: {}, review: {}, bookmarks: {}, highlights: {}, highlightColors: {} };
}

// Read saved progress. If there's none, or it's damaged, start fresh instead of crashing.
function loadProgress() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) { return emptyProgress(); }
    const data = JSON.parse(raw);
    if (!data || typeof data !== "object") { return emptyProgress(); }
    return {
      subjects: followMovedSubjects(data.subjects || {}),
      review: data.review || {},
      bookmarks: data.bookmarks || {},
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

let subjectsWereMoved = false;  // true if loading her progress just moved some totals

function followMovedSubjects(subjects) {
  Object.keys(MOVED_SUBJECTS).forEach(function (oldName) {
    const old = subjects[oldName];
    if (!old || typeof old !== "object") { return; }
    subjectsWereMoved = true;
    const newName = MOVED_SUBJECTS[oldName];
    const into = subjects[newName] || {};
    ["mcqCorrect", "mcqAnswered", "got", "partly", "missed", "fbRated", "fbPercentTotal"].forEach(function (field) {
      into[field] = wholeNumberOrZero(into[field]) + wholeNumberOrZero(old[field]);
    });
    subjects[newName] = into;
    delete subjects[oldName];
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
    progress.subjects[subject] = { mcqCorrect: 0, mcqAnswered: 0, got: 0, partly: 0, missed: 0, fbRated: 0, fbPercentTotal: 0 };
  }
  return progress.subjects[subject];
}

// A multiple-choice answer: count it, and add it to (or take it off) the review list.
function recordMcq(question, isRight) {
  const stats = subjectStats(question.subject);
  stats.mcqAnswered += 1;
  if (isRight) {
    stats.mcqCorrect += 1;
    delete progress.review[question.id];
  } else {
    progress.review[question.id] = "Wrong answer";
  }
  saveProgress();
}

// An essay self-rating: count it, and add it to (or take it off) the review list.
// A fill-in-the-blank self-rating: 0, 25, 50, 75 or 100 (% of the blanks she got).
// Running totals per subject: how many she rated, and the sum of the percentages
// (so the average is fbPercentTotal / fbRated). Below 100% goes into her review list.
function recordFillBlank(question, percent) {
  const stats = subjectStats(question.subject);
  stats.fbRated = wholeNumberOrZero(stats.fbRated) + 1;
  stats.fbPercentTotal = wholeNumberOrZero(stats.fbPercentTotal) + percent;
  if (percent === 100) {
    delete progress.review[question.id];
  } else {
    progress.review[question.id] = percent + "%";
  }
  saveProgress();
}

function recordEssay(question, rating) {
  const stats = subjectStats(question.subject);
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

// ---------- Where she is right now ----------
// So a reload (or an app update) puts her back on the same screen, in the middle of
// the same practice round. Kept in its own slot, separate from her progress above,
// so it is NOT part of a backup file: restoring an old backup should never drop her
// into an old, half-finished round.
// It is cleared when she goes back to the home screen, or finishes a round.
const SPOT_KEY = "barReviewer.currentSpot.v1";

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
      fbRated: wholeNumberOrZero(s.fbRated),            // older backups have none: 0
      fbPercentTotal: wholeNumberOrZero(s.fbPercentTotal)
    };
  });
  Object.keys(p.review).forEach(function (id) {
    if (typeof p.review[id] === "string") { clean.review[id] = p.review[id]; }
  });
  Object.keys(p.bookmarks).forEach(function (id) {
    if (p.bookmarks[id]) { clean.bookmarks[id] = true; }
  });
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
  return saveProgress();
}

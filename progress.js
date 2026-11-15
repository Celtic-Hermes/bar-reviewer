// Her progress, saved only on this phone (in the browser's "localStorage").
// Nothing here is ever sent anywhere.
//
// What's saved:
//   subjects:  running totals per subject (multiple-choice right/answered, essay ratings)
//   review:    questions to look at again, by ID (a wrong pick, or an essay rated Partly / Missed it)
//   bookmarks: questions she bookmarked, by ID

const STORAGE_KEY = "barReviewer.progress.v1";

function emptyProgress() {
  return { subjects: {}, review: {}, bookmarks: {} };
}

// Read saved progress. If there's none, or it's damaged, start fresh instead of crashing.
function loadProgress() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) { return emptyProgress(); }
    const data = JSON.parse(raw);
    if (!data || typeof data !== "object") { return emptyProgress(); }
    return {
      subjects: data.subjects || {},
      review: data.review || {},
      bookmarks: data.bookmarks || {}
    };
  } catch (e) {
    return emptyProgress();
  }
}

let progress = loadProgress();

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
    progress.subjects[subject] = { mcqCorrect: 0, mcqAnswered: 0, got: 0, partly: 0, missed: 0 };
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
      missed: wholeNumberOrZero(s.missed)
    };
  });
  Object.keys(p.review).forEach(function (id) {
    if (typeof p.review[id] === "string") { clean.review[id] = p.review[id]; }
  });
  Object.keys(p.bookmarks).forEach(function (id) {
    if (p.bookmarks[id]) { clean.bookmarks[id] = true; }
  });

  const savedAt = new Date(data.savedAt);
  return { progress: clean, savedAt: isNaN(savedAt) ? null : savedAt };
}

// Replace the progress on this phone with a checked backup. Returns true if it saved.
function restoreProgress(newProgress) {
  progress = newProgress;
  return saveProgress();
}

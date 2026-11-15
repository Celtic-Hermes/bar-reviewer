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

function saveProgress() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
  } catch (e) {
    // Saving can fail (for example, in private browsing). The app keeps working anyway.
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

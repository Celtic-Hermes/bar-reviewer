// The 8 bar subjects, in the official order.
const SUBJECTS = [
  "Political Law",
  "Labor Law and Social Legislation",
  "Civil Law",
  "Taxation Law",
  "Mercantile Law",
  "Criminal Law",
  "Remedial Law",
  "Legal and Judicial Ethics"
];

// Extra subjects that are not one of the 8 bar subjects.
// They appear on the home screen under a "Miscellaneous" heading.
// Empty for now (Communication Law moved to a topic under Mercantile Law);
// the home screen shows a short "nothing here yet" note instead.
const MISC_SUBJECTS = [];

let allQuestions = [];      // filled in from the topic files listed in data/catalog.json
let allCases = [];          // filled in from the same topic files
let catalogCases = [];      // from data/catalog.json: every case's id, name, grNumber, year, subject, topic, status
let catalogRules = [];      // from data/catalog.json: every rule's id, title, number, subject, topic, status
let allRules = [];          // filled in from data/rules.json (rules whose full text can be read)
let currentSubject = null;  // the subject she tapped
let currentTopic = null;    // the topic she tapped (or "All topics")
let currentSubtopic = null; // the sub-topic she picked, ALL_SUBTOPICS, OTHER_SUBTOPIC, or null (none)

// The current practice round: which questions, where she is, and her results so far.
let session = null;

// When she practices a question picked from a case screen (instead of a topic),
// these hold that question and the case, so "Practice again" and "‹ Back" work.
let fixedQuestions = null;
let practiceCase = null;

let shownScreen = "screen-home";  // which screen is showing right now
let updateWaiting = false;        // a new version of the app is ready (see "Offline support")
let currentCase = null;           // the case on the case screen

// iPhone Safari only shows a button's "pressed" look (the CSS :active style) if the page
// listens for finger touches. This empty listener switches that on; it does nothing else.
document.addEventListener("touchstart", function () {}, { passive: true });

// ---------- Switching screens ----------
// Only one screen is visible at a time.
function showScreen(id) {
  saveAllNotes();  // leaving a screen with a notes box: save what she typed first
  ["screen-home", "screen-subject", "screen-subtopics", "screen-topic", "screen-tagged", "screen-question", "screen-results", "screen-case", "screen-rule", "screen-notes"].forEach(function (screenId) {
    document.getElementById(screenId).hidden = (screenId !== id);
  });
  window.scrollTo(0, 0);
  shownScreen = id;
  document.body.dataset.screen = id;  // lets style.css lay out wide screens per screen
  if (id === "screen-home") { showTodayCard(); showMyNotesButton(); }  // up to date whenever she comes home
  updateSidebar();
  rememberSpot();
  reloadForUpdateIfSafe();  // a new version waiting? Moving between screens is a safe moment
}

// ---------- Sidebar (wide screens only: 1024px and up; style.css hides it on phones) ----------
// Home, Search, the subjects, and My notes. The section she's in is highlighted.
// Leaving a round from here works like the question screen's Back button.
function buildSidebar() {
  const box = document.getElementById("sidebar-subjects");
  box.innerHTML = "";
  SUBJECTS.concat(MISC_SUBJECTS).forEach(function (subject, i) {
    const link = document.createElement("button");
    link.type = "button";
    link.className = "sidebar-link";
    link.dataset.go = "subject";
    link.dataset.subject = subject;
    const number = document.createElement("span");
    number.className = "sidebar-icon sidebar-number";
    number.setAttribute("aria-hidden", "true");
    number.textContent = i < SUBJECTS.length ? String(i + 1) : "•";
    link.append(number, subject);
    box.appendChild(link);
  });
}

// Which sidebar section the screen she's on belongs to.
function sidebarSection() {
  if (shownScreen === "screen-home") { return "home"; }
  if (shownScreen === "screen-notes") { return "notes"; }
  const from = shownScreen === "screen-case" ? caseCameFrom : (shownScreen === "screen-rule" ? ruleCameFrom : null);
  if (from === "notes") { return "notes"; }
  if (from === "search") { return "search"; }
  return currentSubject ? "subject:" + currentSubject : "home";
}

function updateSidebar() {
  const section = sidebarSection();
  document.querySelectorAll("#sidebar .sidebar-link").forEach(function (link) {
    const name = link.dataset.go === "subject" ? "subject:" + link.dataset.subject : link.dataset.go;
    if (name === section) { link.setAttribute("aria-current", "page"); } else { link.removeAttribute("aria-current"); }
  });
}

// ---------- Phones: the ☰ menu (the same sidebar, sliding in from the left) ----------
// Opens with ☰. Closes when she picks a section, taps ✕ or the dimmed page, or presses Esc.
// On wide screens there's no ☰ (the sidebar is always there), so it's never "open".
const SIDEBAR_ALWAYS = window.matchMedia("(min-width: 1024px)");

function openMenu() {
  if (SIDEBAR_ALWAYS.matches) { return; }
  document.body.classList.add("menu-open");
  document.getElementById("menu-backdrop").hidden = false;
  document.getElementById("menu-btn").setAttribute("aria-expanded", "true");
  document.getElementById("sidebar-close").focus();
}

function closeMenu(returnFocus) {
  if (!document.body.classList.contains("menu-open")) { return; }
  document.body.classList.remove("menu-open");
  document.getElementById("menu-backdrop").hidden = true;
  document.getElementById("menu-btn").setAttribute("aria-expanded", "false");
  if (returnFocus) { document.getElementById("menu-btn").focus(); }
}

document.getElementById("menu-btn").addEventListener("click", openMenu);
document.getElementById("sidebar-close").addEventListener("click", function () { closeMenu(true); });
document.getElementById("menu-backdrop").addEventListener("click", function () { closeMenu(true); });
document.addEventListener("keydown", function (event) {
  if (event.key === "Escape") { closeMenu(true); }
});
SIDEBAR_ALWAYS.addEventListener("change", function () { closeMenu(false); });  // e.g. iPad turned sideways

document.getElementById("sidebar").addEventListener("click", function (event) {
  const link = event.target.closest(".sidebar-link");
  if (!link) { return; }
  closeMenu(false);
  const go = link.dataset.go;
  if (go === "home") {
    showScreen("screen-home");
  } else if (go === "search") {
    showScreen("screen-home");
    const input = document.getElementById("search-input");
    input.focus();
    input.select();
  } else if (go === "notes") {
    openNotes();
  } else if (go === "subject") {
    openSubject(link.dataset.subject);
  }
});

// ---------- Remember where she is (so a reload puts her back) ----------
// Called whenever something changes: a new screen, an answer, a rating, a checkbox.
// On the home screen or the results screen there's nothing to come back to,
// so the saved spot is cleared and a reload simply opens the home screen.
function rememberSpot() {
  if (shownScreen === "screen-home" || shownScreen === "screen-results") {
    clearSpot();
    return;
  }
  const spot = {
    screen: shownScreen.replace("screen-", ""),  // "subject", "question" or "case"
    subject: currentSubject,
    topic: currentTopic,
    subtopic: currentSubtopic,
    shuffle: document.getElementById("shuffle").checked,
    mode: currentMode()
  };
  // In the middle of a round (or reading a case opened from a question): keep the round.
  const inRound = session && (shownScreen === "screen-question" ||
    (shownScreen === "screen-case" && caseCameFrom === "question"));
  if (inRound) {
    spot.round = {
      questionIds: session.questions.map(function (q) { return q.id; }),  // the order she's going in
      index: session.index,                                              // which question she's on
      mcqCorrect: session.mcqCorrect,
      mcqTotal: session.mcqTotal,
      ratings: session.ratings,
      fbAnswered: session.fbAnswered,  // fill-in-the-blank: how many rated this round
      fbCorrect: session.fbCorrect,    // ...and how many of those were "Got it"
      fbView: session.fbView,          // fill in the blank: "quiz" or "read"
      current: session.current,  // what she's done on this question: her pick, or answer shown, rating, checked key points
      practiceCaseId: practiceCase ? practiceCase.id : null
    };
  }
  if (shownScreen === "screen-case" && currentCase) {
    spot.caseId = currentCase.id;
    spot.caseCameFrom = caseCameFrom;
  }
  if (shownScreen === "screen-rule" && currentRule) {
    spot.ruleId = currentRule.id;
    spot.ruleCameFrom = ruleCameFrom;
  }
  if (spot.caseCameFrom === "search" || spot.ruleCameFrom === "search") {
    spot.search = document.getElementById("search-input").value;  // to show the same results on Back
  }
  saveSpot(spot);
}

// On startup: if she was somewhere, rebuild that screen (and round). Never crashes:
// if anything in the saved spot doesn't make sense anymore, she just gets the home screen.
function restoreSpot() {
  const spot = loadSpot();
  if (!spot) { return; }
  let ok = false;
  try {
    ok = putBackSpot(spot);
  } catch (e) {
    ok = false;
  }
  if (!ok) {
    clearSpot();
    showScreen("screen-home");
  }
}

function putBackSpot(spot) {
  // Saved before Communication Law moved under Mercantile Law: follow the move.
  // (The round itself is saved by question IDs, which didn't change.)
  if (spot.subject === "Communication Law") {
    spot.subject = "Mercantile Law";
    if (spot.topic === "Right to Privacy") { spot.topic = "Communication Law"; }
  }
  // The notes list, and a case or rule opened from it, don't belong to a subject.
  if (spot.screen === "notes") {
    openNotes();
    return true;
  }
  if (spot.screen === "case" && spot.caseCameFrom === "notes") {
    const noteCase = findCase(spot.caseId);
    if (noteCase) { openCase(noteCase, "notes"); } else { openNotes(); }
    return true;
  }
  if (spot.screen === "rule" && spot.ruleCameFrom === "notes") {
    const noteRule = findRule(spot.ruleId);
    if (noteRule) { openRule(noteRule, "notes"); } else { openNotes(); }
    return true;
  }
  // A case or rule opened from the search: put the search back too, for Back.
  if ((spot.screen === "case" && spot.caseCameFrom === "search") || (spot.screen === "rule" && spot.ruleCameFrom === "search")) {
    document.getElementById("search-input").value = typeof spot.search === "string" ? spot.search : "";
    showSearchResults();
    const found = spot.screen === "case" ? findCase(spot.caseId) : findRule(spot.ruleId);
    if (!found) { return false; }
    if (spot.screen === "case") { openCase(found, "search"); } else { openRule(found, "search"); }
    return true;
  }
  if (SUBJECTS.concat(MISC_SUBJECTS).indexOf(spot.subject) === -1) { return false; }
  currentSubject = spot.subject;
  currentTopic = (typeof spot.topic === "string") ? spot.topic : null;
  currentSubtopic = (typeof spot.subtopic === "string") ? spot.subtopic : null;

  const shuffleSwitch = document.getElementById("shuffle");
  shuffleSwitch.checked = Boolean(spot.shuffle);
  showShuffleNote();
  setMode(spot.mode);  // older saved spots have no mode: that means "both"

  if (spot.screen === "subject") {
    openSubject(currentSubject);
    return true;
  }
  if (spot.screen === "subtopics") {
    if (isRealTopic(currentTopic) && subtopicsFor(currentSubject, currentTopic).length > 0) {
      openSubtopics(currentTopic);
    } else {
      openSubject(currentSubject);  // the topic has no sub-topics anymore
    }
    return true;
  }

  if (spot.screen === "rule") {
    const rule = findRule(spot.ruleId);
    if (rule) { openRule(rule); } else { openTopicOrSubject(); }
    return true;
  }
  if (spot.screen === "topic" || spot.screen === "tagged") {
    openTopicOrSubject();
    return true;
  }

  // Rebuild the round, if there was one. If its questions have changed since, skip it.
  const roundOk = spot.round ? putBackRound(spot.round) : false;

  if (spot.screen === "question") {
    if (!roundOk) { openTopicOrSubject(); }
    return true;
  }
  if (spot.screen === "case") {
    const theCase = findCase(spot.caseId);
    if (!theCase) {
      openTopicOrSubject();
    } else if (spot.caseCameFrom === "question" && roundOk) {
      openCase(theCase, "question");
    } else {
      // Opened from a topic screen (or, before topic screens existed, the subject screen).
      openCase(theCase, isRealTopic(currentTopic) ? "topic" : "subject");
    }
    return true;
  }
  return false;
}

// Rebuild a practice round from its saved question IDs, and show the question she was on.
function putBackRound(round) {
  if (!isPlainObject(round) || !Array.isArray(round.questionIds) || round.questionIds.length === 0) { return false; }
  const questions = round.questionIds.map(function (id) {
    return allQuestions.find(function (q) { return q && q.id === id; });
  });
  // A question was removed from the file since: the round can't be rebuilt exactly.
  if (questions.some(function (q) { return !q; })) { return false; }
  const index = round.index;
  if (typeof index !== "number" || Math.floor(index) !== index || index < 0 || index >= questions.length) { return false; }

  practiceCase = round.practiceCaseId ? findCase(round.practiceCaseId) : null;
  fixedQuestions = practiceCase ? questions.slice() : null;
  const ratings = isPlainObject(round.ratings) ? round.ratings : {};
  session = {
    questions: questions,
    index: index,
    mcqCorrect: wholeNumberOrZero(round.mcqCorrect),
    mcqTotal: wholeNumberOrZero(round.mcqTotal),
    ratings: {
      "Got it": wholeNumberOrZero(ratings["Got it"]),
      "Partly": wholeNumberOrZero(ratings["Partly"]),
      "Missed it": wholeNumberOrZero(ratings["Missed it"])
    },
    fbAnswered: wholeNumberOrZero(round.fbAnswered),
    fbCorrect: wholeNumberOrZero(round.fbCorrect),
    fbView: round.fbView === "read" ? "read" : "quiz"
  };
  showQuestion();
  putBackCurrent(round.current);
  return true;
}

// Show what she'd already done on the current question, without counting it again.
function putBackCurrent(saved) {
  if (!isPlainObject(saved)) { return; }
  const question = session.questions[session.index];
  if (question.type === "fillblank") {
    if (FB_LEVELS.indexOf(saved.fbLevel) !== -1 && Array.isArray(saved.fbHidden)) {
      // The same level, the same words hidden, and what she typed, as before the reload.
      session.current.fbTyped = isPlainObject(saved.fbTyped) ? saved.fbTyped : {};
      applyFbLevel(question, saved.fbLevel, saved.fbHidden);
      if (saved.answerShown) {
        session.current.answerShown = true;
        revealFillBlank();
      }
      if (FB_RATINGS.indexOf(saved.fbRating) !== -1) {
        session.current.fbRating = saved.fbRating;
        showFbRated(saved.fbRating);
      }
    }
  } else if (question.type === "mcq") {
    if (["A", "B", "C", "D"].indexOf(saved.picked) !== -1) {
      // She had already submitted this answer.
      session.current.picked = saved.picked;
      showPicked(question, saved.picked);
    } else if (["A", "B", "C", "D"].indexOf(saved.selected) !== -1) {
      // She had picked a choice but not submitted it yet.
      selectChoice(saved.selected);
    }
  } else {
    if (saved.answerShown) {
      session.current.answerShown = true;
      revealAnswer();
    }
    if (Array.isArray(saved.checked)) {
      const boxes = document.querySelectorAll("#key-points input[type=checkbox]");
      session.current.checked = saved.checked.filter(function (n) { return boxes[n] !== undefined; });
      session.current.checked.forEach(function (n) { boxes[n].checked = true; });
    }
    if (["Got it", "Partly", "Missed it"].indexOf(saved.rating) !== -1) {
      session.current.rating = saved.rating;
      showRated(saved.rating);
    }
  }
  rememberSpot();
}

function questionsFor(subject) {
  return allQuestions.filter(function (q) { return q.subject === subject; });
}

// ---------- Screen 1: Home ----------
function buildHome() {
  const list = document.getElementById("subject-list");
  SUBJECTS.forEach(function (subject, index) {
    list.appendChild(makeSubjectCard(subject, index + 1));
  });
  const miscList = document.getElementById("misc-list");
  MISC_SUBJECTS.forEach(function (subject) {
    miscList.appendChild(makeSubjectCard(subject, "•"));
  });
  // No extra subjects yet: show the placeholder note instead of an empty gap.
  miscList.hidden = (MISC_SUBJECTS.length === 0);
  document.getElementById("misc-empty").hidden = (MISC_SUBJECTS.length !== 0);
}

// One tappable subject card on the home screen.
function makeSubjectCard(subject, badge) {
  const card = document.createElement("button");
  card.className = "subject-card";
  const number = document.createElement("span");
  number.className = "subject-number";
  number.textContent = badge;
  const name = document.createElement("span");
  name.className = "subject-name";
  name.textContent = subject;
  const arrow = document.createElement("span");
  arrow.className = "subject-arrow";
  arrow.textContent = "›";
  card.append(number, name, arrow);
  card.addEventListener("click", function () { openSubject(subject); });
  return card;
}

// ---------- Screen 2: One subject (its topics) ----------
const ALL_TOPICS = "All topics";
const REVIEW_MISSED = "Review missed";
const BOOKMARKED = "Bookmarked";
const TAGGED = "Tagged";

// Friendly messages for when one of her lists is empty.
const EMPTY_LIST_MESSAGES = {};
EMPTY_LIST_MESSAGES[REVIEW_MISSED] =
  "Nothing to review yet. Questions you get wrong, or rate Partly or Missed it, will show up here.";
EMPTY_LIST_MESSAGES[BOOKMARKED] =
  "No bookmarks yet. Tap ☆ Bookmark on any question to save it here.";
EMPTY_LIST_MESSAGES[TAGGED] =
  "No tagged questions yet. Tap a color (green, yellow or red) on any question to tag it.";

function countLabel(n) {
  return n + (n === 1 ? " question" : " questions");
}

// ---------- Question type: "essay", "mcq" or "both" ----------
// Picked on the subject screen. Narrows every round started from a topic,
// "All topics", "Review missed" or "Bookmarked" to just that type.
const QUESTION_MODES = ["essay", "mcq", "fillblank", "both"];  // "both" is shown as "All"

function currentMode() {
  const picked = document.querySelector('input[name="question-mode"]:checked');
  return picked ? picked.value : "both";
}

function setMode(mode) {
  if (QUESTION_MODES.indexOf(mode) === -1) { mode = "both"; }
  document.querySelector('input[name="question-mode"][value="' + mode + '"]').checked = true;
}

function fitsMode(question, mode) {
  if (mode === "mcq") { return question.type === "mcq"; }
  if (mode === "fillblank") { return question.type === "fillblank"; }
  if (mode === "essay") { return question.type !== "mcq" && question.type !== "fillblank"; }
  return true;
}

// "No essay questions" / "No multiple choice questions" / "No fill-in-the-blank items".
function noneOfMode(mode) {
  if (mode === "mcq") { return "No multiple choice questions"; }
  if (mode === "fillblank") { return "No fill-in-the-blank items"; }
  return "No essay questions";
}

// The count shown on each card, worded for the picked type:
// "6 essay questions", "4 multiple choice", or "10 questions".
function modeCountLabel(n, mode) {
  if (mode === "essay") { return n + (n === 1 ? " essay question" : " essay questions"); }
  if (mode === "mcq") { return n + " multiple choice"; }
  if (mode === "fillblank") { return n + " fill-in-the-blank"; }
  return countLabel(n);
}

document.querySelectorAll('input[name="question-mode"]').forEach(function (radio) {
  radio.addEventListener("change", function () {
    document.getElementById("list-empty").hidden = true;
    showTopicCards(currentSubject);  // update the counts on every card
    rememberSpot();
  });
});

// The questions for a subject + a choice from the subject screen:
// a topic name, "All topics", "Review missed", or "Bookmarked",
// keeping only the question type she picked (unless mode is left out),
// and, inside a topic, only the sub-topic she picked (if she picked one).
function questionsForTopic(subject, topic, mode, subtopic) {
  return questionsFor(subject).filter(function (q) {
    if (mode && !fitsMode(q, mode)) { return false; }
    if (topic === ALL_TOPICS) { return true; }
    if (topic === REVIEW_MISSED) { return Boolean(progress.review[q.id]); }
    if (topic === BOOKMARKED) { return isBookmarked(q.id); }
    if (topic === TAGGED) { return tagOf(q.id) !== null; }
    return q.topic === topic && inSubtopic(q, subtopic);
  });
}

// ---------- Sub-topics (optional third level: subject → topic → sub-topic) ----------
// Any question or case may have a "subtopic". A topic where none of its content has
// one works as before. A topic where some does shows a sub-topic picker first.
const ALL_SUBTOPICS = "*all*";      // "All of <topic>": the whole topic
const OTHER_SUBTOPIC = "*other*";   // "Other": content in that topic with no sub-topic

// The sub-topic of a question or case, or null if it has none (or a bad value).
function subtopicOf(item) {
  return (item && typeof item.subtopic === "string" && item.subtopic.trim()) ? item.subtopic.trim() : null;
}

// Does this question or case belong to the picked sub-topic? (No pick, or "All": yes.)
function inSubtopic(item, subtopic) {
  if (subtopic === null || subtopic === undefined || subtopic === ALL_SUBTOPICS) { return true; }
  if (subtopic === OTHER_SUBTOPIC) { return subtopicOf(item) === null; }
  return subtopicOf(item) === subtopic;
}

// The sub-topics inside a topic, from its questions and cases, in the order they first appear.
function subtopicsFor(subject, topic) {
  const names = [];
  questionsFor(subject).concat(allCases.filter(function (c) { return c.subject === subject; }))
    .forEach(function (item) {
      const name = item.topic === topic ? subtopicOf(item) : null;
      if (name && names.indexOf(name) === -1) { names.push(name); }
    });
  return names;
}

// Is this one of the real topics (not "All topics", "Review missed" or "Bookmarked")?
function isRealTopic(topic) {
  return [ALL_TOPICS, REVIEW_MISSED, BOOKMARKED, TAGGED].indexOf(topic) === -1;
}

function subtopicLabel(subtopic, topic) {
  if (subtopic === ALL_SUBTOPICS) { return "All of " + topic; }
  if (subtopic === OTHER_SUBTOPIC) { return "Other"; }
  return subtopic;
}

// The sub-topic picker for one topic: "All of <topic>", then each sub-topic,
// then "Other" if some of the topic's questions have no sub-topic.
function openSubtopics(topic) {
  currentTopic = topic;
  currentSubtopic = null;
  const subject = currentSubject;
  const mode = currentMode();
  document.getElementById("subtopics-back").textContent = "‹ " + subject;
  document.getElementById("subtopics-subject").textContent = subject;
  document.getElementById("subtopics-title").textContent = topic;
  document.getElementById("subtopics-count").textContent =
    countLabel(questionsForTopic(subject, topic).length) + " available";

  const choices = [ALL_SUBTOPICS].concat(subtopicsFor(subject, topic));
  if (questionsFor(subject).concat(casesFor(subject)).some(function (item) { return item.topic === topic && subtopicOf(item) === null; })) {
    choices.push(OTHER_SUBTOPIC);
  }
  const list = document.getElementById("subtopic-list");
  list.innerHTML = "";
  choices.forEach(function (subtopic) {
    const card = document.createElement("button");
    card.className = "subject-card";
    const name = document.createElement("span");
    name.className = "subject-name";
    name.textContent = subtopicLabel(subtopic, topic);
    const howMany = document.createElement("span");
    howMany.className = "topic-count";
    howMany.textContent = modeCountLabel(questionsForTopic(subject, topic, mode, subtopic).length, mode);
    const arrow = document.createElement("span");
    arrow.className = "subject-arrow";
    arrow.textContent = "›";
    card.append(name, howMany, arrow);
    card.addEventListener("click", function () { openTopic(topic, subtopic); });
    list.appendChild(card);
  });
  showScreen("screen-subtopics");
}

// ---------- Topic screen (one topic, or one sub-topic of it) ----------
// "Start practice" for just that topic / sub-topic, and the cases filed under it.
// Cases only appear here (not on the subject screen).
function casesFor(subject) {
  return allCases.filter(function (c) { return c.subject === subject; });
}

function openTopic(topic, subtopic) {
  currentTopic = topic;
  currentSubtopic = (subtopic === undefined) ? null : subtopic;
  fixedQuestions = null;
  practiceCase = null;
  const subject = currentSubject;
  const inPicker = currentSubtopic !== null;  // she came through the sub-topic picker
  document.getElementById("topic-back").textContent = "‹ " + (inPicker ? topic : subject);
  document.getElementById("topic-subject").textContent = inPicker ? subject + " · " + topic : subject;
  document.getElementById("topic-title").textContent = inPicker ? subtopicLabel(currentSubtopic, topic) : topic;

  const total = questionsForTopic(subject, topic, null, currentSubtopic).length;
  const mode = currentMode();
  const count = questionsForTopic(subject, topic, mode, currentSubtopic).length;
  document.getElementById("topic-count").textContent = countLabel(total);
  const start = document.getElementById("topic-start");
  start.textContent = "Start practice (" + modeCountLabel(count, mode) + ")";
  start.disabled = (count === 0);
  const note = document.getElementById("topic-empty");
  note.hidden = (count !== 0);
  note.textContent = total === 0 ? "No questions here yet."
    : noneOfMode(mode) + " here. Pick All under Question type (on the subject screen) to see the others.";

  const cases = casesFor(subject).filter(function (c) { return c.topic === topic && inSubtopic(c, currentSubtopic); });
  const list = document.getElementById("topic-case-list");
  list.innerHTML = "";
  cases.forEach(function (theCase) {
    list.appendChild(makeCaseCard(theCase, function () { openCase(theCase, "topic"); }));
  });
  document.getElementById("topic-case-empty").hidden = (cases.length !== 0);

  // Built from one rule (all its questions come from the same source document)?
  // Then she can read that whole rule.
  topicRule = ruleForQuestions(questionsForTopic(subject, topic, null, currentSubtopic));
  document.getElementById("topic-rule").hidden = !topicRule;
  showScreen("screen-topic");
}

document.getElementById("topic-start").addEventListener("click", function () {
  fixedQuestions = null;
  practiceCase = null;
  startPractice();
});

document.getElementById("topic-back").addEventListener("click", function () {
  if (currentSubtopic !== null && subtopicsFor(currentSubject, currentTopic).length > 0) {
    openSubtopics(currentTopic);
  } else {
    openSubject(currentSubject);
  }
});

// Back to where a round (or a case) came from: the topic screen for a real topic
// (or its sub-topic picker, if she hasn't picked a sub-topic), her Tagged list,
// else the subject screen.
function openTopicOrSubject() {
  if (currentTopic === TAGGED) {
    openTagged();
    return;
  }
  const topicExists = isRealTopic(currentTopic) && topicsFor(currentSubject).indexOf(currentTopic) !== -1;
  if (!topicExists) {
    openSubject(currentSubject);
  } else if (currentSubtopic === null && subtopicsFor(currentSubject, currentTopic).length > 0) {
    openSubtopics(currentTopic);
  } else {
    openTopic(currentTopic, currentSubtopic);
  }
}

document.getElementById("subtopics-back").addEventListener("click", function () {
  openSubject(currentSubject);
});

// List of topics in a subject, in the order they first appear in the file.
function topicsFor(subject) {
  const topics = [];
  questionsFor(subject).concat(casesFor(subject)).forEach(function (item) {
    if (typeof item.topic === "string" && item.topic && !topics.includes(item.topic)) { topics.push(item.topic); }
  });
  return topics;
}

// Make one tappable card showing a name and how many questions it has.
function makeTopicCard(subject, topic) {
  const card = document.createElement("button");
  card.className = "subject-card";
  const name = document.createElement("span");
  name.className = "subject-name";
  name.textContent = topic;
  const howMany = document.createElement("span");
  howMany.className = "topic-count";
  const mode = currentMode();
  howMany.textContent = modeCountLabel(questionsForTopic(subject, topic, mode).length, mode);
  const arrow = document.createElement("span");
  arrow.className = "subject-arrow";
  arrow.textContent = "›";
  card.append(name, howMany, arrow);
  card.addEventListener("click", function () {
    currentTopic = topic;
    currentSubtopic = null;
    fixedQuestions = null;
    practiceCase = null;
    // A topic with sub-topics: pick one first. Any other topic: its topic screen.
    // ("All topics", "Review missed" and "Bookmarked" start practicing right away.)
    if (isRealTopic(topic) && subtopicsFor(subject, topic).length > 0) {
      openSubtopics(topic);
      return;
    }
    if (isRealTopic(topic)) {
      openTopic(topic, null);
      return;
    }
    // "Tagged" opens its list (or, if it's empty, says so like the other lists).
    if (topic === TAGGED && questionsForTopic(subject, TAGGED, currentMode()).length > 0) {
      openTagged();
      return;
    }
    startPractice();
  });
  return card;
}

function openSubject(subject) {
  currentSubject = subject;
  currentSubtopic = null;
  const count = questionsFor(subject).length;
  document.getElementById("subject-title").textContent = subject;
  document.getElementById("subject-count").textContent = countLabel(count) + " available";
  document.getElementById("list-empty").hidden = true;

  showSubjectStats(subject);

  // No questions? Hide the topic list and say why.
  document.getElementById("topic-area").hidden = (count === 0);
  document.getElementById("subject-empty").hidden = (count !== 0);

  showTopicCards(subject);
  showScreen("screen-subject");
}

// Her lists and the topic cards on the subject screen (rebuilt when the question type changes).
function showTopicCards(subject) {
  // Her lists: "Review missed", "Bookmarked" and "Tagged".
  const myLists = document.getElementById("my-lists");
  myLists.innerHTML = "";
  [REVIEW_MISSED, BOOKMARKED, TAGGED].forEach(function (name) {
    myLists.appendChild(makeTopicCard(subject, name));
  });

  // One card per topic, with "All topics" first.
  const list = document.getElementById("topic-list");
  list.innerHTML = "";
  [ALL_TOPICS].concat(topicsFor(subject)).forEach(function (topic) {
    list.appendChild(makeTopicCard(subject, topic));
  });
}


// ---------- Her "Tagged" list ----------
// Every question she color-tagged in this subject (of the question type picked on the
// subject screen), grouped by color: green, then yellow, then red. Each card shows its
// color. Tap one to practice just it, or "Start practice" for all of them.
function openTagged() {
  currentTopic = TAGGED;
  currentSubtopic = null;
  fixedQuestions = null;
  practiceCase = null;
  const subject = currentSubject;
  const mode = currentMode();
  const questions = questionsForTopic(subject, TAGGED, mode);
  if (questions.length === 0) {
    // Nothing tagged anymore (for example, she just removed the last tag).
    openSubject(subject);
    showEmptyListMessage(TAGGED);
    return;
  }
  document.getElementById("tagged-back").textContent = "‹ " + subject;
  document.getElementById("tagged-subject").textContent = subject;

  // "5 questions: 2 green, 2 yellow, 1 red"
  const counts = TAG_COLORS.map(function (color) {
    const n = questions.filter(function (q) { return tagOf(q.id) === color; }).length;
    return n > 0 ? n + " " + color : null;
  }).filter(Boolean);
  document.getElementById("tagged-count").textContent =
    modeCountLabel(questions.length, mode) + ": " + counts.join(", ");
  document.getElementById("tagged-start").textContent = "Start practice (" + modeCountLabel(questions.length, mode) + ")";

  const list = document.getElementById("tagged-list");
  list.innerHTML = "";
  TAG_COLORS.forEach(function (color) {
    questions.filter(function (q) { return tagOf(q.id) === color; }).forEach(function (question) {
      list.appendChild(makeQuestionCard(question, function () {
        fixedQuestions = [question];  // practice just this one; Back returns to this list
        practiceCase = null;
        currentTopic = TAGGED;
        startPractice();
      }));
    });
  });
  showScreen("screen-tagged");
}

document.getElementById("tagged-start").addEventListener("click", function () {
  fixedQuestions = null;
  practiceCase = null;
  currentTopic = TAGGED;
  startPractice();
});

document.getElementById("tagged-back").addEventListener("click", function () {
  openSubject(currentSubject);
});

// "Essay", "Multiple choice" or "Fill in the blank".
function questionTypeLabel(question) {
  if (question.type === "mcq") { return "Multiple choice"; }
  if (question.type === "fillblank") { return "Fill in the blank"; }
  return "Essay";
}

// A small dot in her tag color (or nothing, if the question has no tag).
// Its look lives in the ".tag-mark" rule in style.css.
function tagMark(question) {
  const tag = tagOf(question.id);
  if (!tag) { return null; }
  const mark = document.createElement("span");
  mark.className = "tag-mark";
  mark.dataset.tag = tag;
  mark.setAttribute("role", "img");
  mark.setAttribute("aria-label", tag.charAt(0).toUpperCase() + tag.slice(1) + " tag");
  return mark;
}

// One tappable card for a question in a list: her tag color (if any), the start of the
// question, then its type and topic, and "Unverified" if nobody has checked it yet.
function makeQuestionCard(question, onTap) {
  const card = document.createElement("button");
  card.className = "subject-card question-card";
  const mark = tagMark(question);
  if (mark) { card.appendChild(mark); }
  const text = document.createElement("span");
  text.className = "subject-name";
  const prompt = plainText(question.prompt).replace(/\s+/g, " ").trim();
  // A short preview, cut at the end of a whole word.
  text.textContent = prompt.length > 110 ? prompt.slice(0, 110).replace(/\s+\S*$/, "") + "…" : prompt;
  const where = [questionTypeLabel(question), question.topic].filter(Boolean).join(" · ");
  text.appendChild(cardDetail(where, question.status === "verified"));
  const arrow = document.createElement("span");
  arrow.className = "subject-arrow";
  arrow.textContent = "›";
  card.append(text, arrow);
  card.addEventListener("click", onTap);
  return card;
}

// ---------- A rule's full text ("📖 Read the full rule") ----------
// Any sub-topic (or topic) whose questions ALL come from one source document — the same
// "source.grNumber", like "A.M. No. 07-9-12-SC" or "Rules of Court, Rule 91" — gets the
// button, as long as data/rules.json lists that document. Nothing else needs setting up,
// so rules added later get it too. Each rule's text is its own file,
// data/rule-texts/rule-0001.txt …, downloaded only when she taps the button and then
// kept on the phone for offline use (see sw.js), like a decision's full text.
// Each Section (or Article) is shown in its own card; PART / RULE headings sit between
// the cards. Her highlights use the colored highlighter and are saved as e.g.
// "rule-0001:fulltext", with the words numbered across the whole rule.
let topicRule = null;    // the rule behind the topic screen being shown, if any
let currentRule = null;  // the rule on the rule screen
let ruleCameFrom = "topic";  // where the rule screen's Back goes: "topic", "notes" or "search" (home)

function findRule(ruleId) {
  return allRules.find(function (r) { return r.id === ruleId; }) || null;
}

// The rule all these questions come from, or null (none, or more than one source).
function ruleForQuestions(questions) {
  if (questions.length === 0) { return null; }
  const number = questions[0] && questions[0].source && questions[0].source.grNumber;
  if (typeof number !== "string" || !number) { return null; }
  const allSame = questions.every(function (q) { return q && q.source && q.source.grNumber === number; });
  if (!allSame) { return null; }
  return allRules.find(function (r) { return r.number === number; }) || null;
}

document.getElementById("topic-rule").addEventListener("click", function () {
  if (topicRule) { openRule(topicRule); }
});

document.getElementById("rule-back").addEventListener("click", function () {
  if (ruleCameFrom === "notes") { openNotes(); } else if (ruleCameFrom === "search") { backToSearch(); } else { openTopicOrSubject(); }
});

function loadRuleText(ruleId) {
  // Only IDs like "rule-0001" are used to build the file name (bad content can't point elsewhere).
  if (typeof ruleId !== "string" || !/^rule-\d+$/.test(ruleId)) {
    return Promise.reject(new Error("missing"));
  }
  return fetch("data/rule-texts/" + ruleId + ".txt").then(function (response) {
    if (response.status === 404) { throw new Error("missing"); }
    if (!response.ok) { throw new Error("status " + response.status); }
    return response.text();
  }).then(function (text) {
    if (!text.trim()) { throw new Error("missing"); }
    return text;
  });
}

// "cameFrom": "notes" (her My notes list), "search" (the home screen's search), otherwise a topic screen.
function openRule(rule, cameFrom) {
  currentRule = rule;
  ruleCameFrom = (cameFrom === "notes" || cameFrom === "search") ? cameFrom : "topic";
  let where;
  if (ruleCameFrom !== "topic") {
    // Not opened from a topic: name the subject and topic its questions are filed under.
    const q = allQuestions.find(function (x) { return x && x.source && x.source.grNumber === rule.number; });
    where = q ? [q.subject, q.topic] : [];
  } else {
    where = [currentSubject, currentTopic, currentSubtopic && currentSubtopic.charAt(0) !== "*" ? currentSubtopic : null];
  }
  document.getElementById("rule-subject").textContent = where.filter(Boolean).join(" · ");
  document.getElementById("rule-title").textContent = rule.title || "Untitled rule";
  document.getElementById("rule-number").textContent = rule.number || "";
  document.getElementById("rule-draft-badge").hidden = (rule.status === "verified");
  showNotesBox(document.getElementById("rule-notes"), rule.id);

  // Source: a tappable link if it's a web address.
  const source = document.getElementById("rule-source");
  source.innerHTML = "";
  const url = typeof rule.sourceUrl === "string" ? rule.sourceUrl.trim() : "";
  if (/^https?:\/\//i.test(url)) {
    const link = document.createElement("a");
    link.className = "source-link";
    link.href = url;
    link.target = "_blank";
    link.rel = "noopener";
    link.textContent = "Open the source ›";
    const note = document.createElement("span");
    note.className = "source-note";
    note.textContent = url;
    source.append(link, note);
  } else {
    source.textContent = url || "Not given.";
  }
  document.getElementById("rule-source-card").hidden = false;
  const credit = document.getElementById("rule-credit");
  credit.textContent = /lawphil\.net/i.test(url)
    ? "Text from The LawPhil Project, Arellano Law Foundation (see Source below)." : "";
  credit.hidden = true;

  // Clear the old text, then load this rule's text.
  const box = document.getElementById("rule-text");
  box.hidden = true;
  box.textContent = "";
  delete box.dataset.hlKey;
  document.getElementById("rule-palette").hidden = true;
  const note = document.getElementById("rule-note");
  note.textContent = "Loading…";
  note.hidden = false;
  showScreen("screen-rule");

  loadRuleText(rule.id)
    .then(function (text) {
      if (currentRule !== rule || shownScreen !== "screen-rule") { return; }
      showRuleText(box, text, rule);
      note.hidden = true;
      box.hidden = false;
      document.getElementById("rule-palette").hidden = false;
      credit.hidden = !credit.textContent;
    })
    .catch(function (error) {
      if (currentRule !== rule) { return; }
      if (error.message === "missing") {
        note.textContent = "The full text of this rule hasn't been added yet.";
      } else if (navigator.onLine === false || error instanceof TypeError) {
        note.textContent = "Couldn't load the full text. You may be offline, and this rule hasn't been opened on this phone before.\nConnect to the internet and try again. After that, it will work offline too.";
      } else {
        note.textContent = "Couldn't load the full text right now. Please try again in a moment.";
      }
    });
}

// Where a Section (or Article) starts: "SECTION 1.", "Sec. 5.", "Article 3." …
const RULE_SECTION_START = /^(?:SECTION|Section|SEC\.|Sec\.|ARTICLE|Article|ART\.|Art\.)\s+\d+\s*\./;
// A heading between sections: "PART II", "RULE 7" (with its title on the next line) …
const RULE_GROUP_HEADING = /^(?:PART|RULE|TITLE|CHAPTER|BOOK)\s+[0-9IVXLC]+\b/;

// Split the text (paragraphs separated by a blank line) into headings and sections.
function ruleBlocks(text) {
  const blocks = [];
  let section = null;
  text.replace(/\r/g, "").split(/\n\s*\n/).forEach(function (para) {
    const p = para.trim();
    if (!p) { return; }
    if (RULE_SECTION_START.test(p)) {
      section = { kind: "section", paras: [p] };
      blocks.push(section);
    } else if (RULE_GROUP_HEADING.test(p) || !section) {
      blocks.push({ kind: "heading", text: p });
      section = null;
    } else {
      section.paras.push(p);
    }
  });
  return blocks;
}

function showRuleText(box, text, rule) {
  const key = rule.id + ":fulltext";
  const highlighted = highlightedWords(key);
  const same = function (a, b) { return a.replace(/\s+/g, " ").trim().toLowerCase() === b.replace(/\s+/g, " ").trim().toLowerCase(); };
  box.textContent = "";
  box.dataset.hlKey = key;
  let nextWord = 0;
  ruleBlocks(text).forEach(function (block, i) {
    if (block.kind === "heading") {
      if (i === 0 && same(block.text, rule.title || "")) { return; }  // already the screen's title
      const heading = document.createElement("p");
      heading.className = "rule-heading";
      heading.textContent = block.text;
      box.appendChild(heading);
      return;
    }
    // A section's card. Its heading ("Section 3. Where to file.") is shown in bold.
    let body = block.paras.join("\n\n");
    if (body.indexOf("**") === -1) {
      body = body.replace(/^([^\n]{1,200}?\.)(?=\s?[-–—])/, "**$1**");
    }
    const card = document.createElement("div");
    card.className = "card rule-section hl-block";
    const p = document.createElement("p");
    p.className = "prompt reading-text";
    p.appendChild(richText(body, highlighted, false, nextWord));
    card.appendChild(p);
    box.appendChild(card);
    nextWord += card.querySelectorAll(".hl-word").length;
  });
  box.querySelectorAll(".hl-word.hl-on").forEach(function (word) {
    word.dataset.hlColor = highlightColorOf(key, Number(word.dataset.word));
  });
  joinHighlights(box);
}

// ---------- Today card (home screen): streak and daily goal ----------
function showTodayCard() {
  const streak = streakInfo();
  const count = todayCount();
  const goal = dailyGoal();

  document.getElementById("today-streak").textContent = streak.current > 0
    ? "🔥 " + streak.current + "-day streak"
    : "🔥 No streak yet";
  document.getElementById("today-streak").classList.toggle("none", streak.current === 0);
  const best = document.getElementById("today-best");
  best.textContent = "Best: " + streak.best + (streak.best === 1 ? " day" : " days");
  best.hidden = streak.best === 0;

  document.getElementById("today-count").textContent = "Today " + count + " / " + goal;
  const bar = document.getElementById("today-bar");
  bar.setAttribute("aria-valuemax", String(goal));
  bar.setAttribute("aria-valuenow", String(Math.min(count, goal)));
  document.getElementById("today-bar-fill").style.width = Math.min(100, Math.round(100 * count / goal)) + "%";
  bar.classList.toggle("done", count >= goal);

  let note;
  if (count >= goal) {
    note = "Daily goal reached! 🎉";
  } else if (!streak.studiedToday && streak.current > 0) {
    note = "Answer a question today to keep your " + streak.current + "-day streak.";
  } else if (!streak.studiedToday) {
    note = streak.everStudied ? "Answer a question today to start a new streak." : "Answer a question today to start a streak.";
  } else {
    const left = goal - count;
    note = left + (left === 1 ? " more question" : " more questions") + " to reach today's goal.";
  }
  document.getElementById("today-note").textContent = note;
  document.getElementById("today-goal").value = String(goal);

  // Mastery across everything in the app (shown once the questions have loaded).
  const mastery = masteryOf(allQuestions);
  document.getElementById("today-mastery").hidden = mastery.total === 0;
  if (mastery.total > 0) {
    document.getElementById("today-mastery-count").textContent = "⭐ Mastery " + mastery.mastered + " / " + mastery.total;
    const mbar = document.getElementById("mastery-bar");
    mbar.setAttribute("aria-valuemax", String(mastery.total));
    mbar.setAttribute("aria-valuenow", String(mastery.mastered));
    // At least a sliver once anything is mastered (1 of 254 would otherwise round to 0%).
    const percent = 100 * mastery.mastered / mastery.total;
    document.getElementById("mastery-bar-fill").style.width = (mastery.mastered > 0 ? Math.max(2, Math.round(percent)) : 0) + "%";
  }
}

document.getElementById("today-goal").addEventListener("change", function (event) {
  setDailyGoal(Number(event.target.value));
  showTodayCard();
});

// Back in the app on a new day (or after a while): bring the home screen's card up to date.
document.addEventListener("visibilitychange", function () {
  if (document.visibilityState === "visible" && shownScreen === "screen-home") { showTodayCard(); }
});

// ---------- Her notes (on cases and rules) ----------
// Every notes box is an editable area (<div class="notes-box" contenteditable>) with a
// B / I / U toolbar above it (data-for = the box's id) and a status line after it
// (id + "-status"). showNotesBox(box, id) loads her note for that case or rule.
// - It saves by itself while she types (half a second after she pauses), and right away
//   when she leaves the box, the screen, or the app. What's saved is always cleaned
//   first (cleanNoteHtml in progress.js): only bold, italic, underline and line breaks.
// - Pasting or dropping text in: it's cleaned BEFORE it goes into the box.
// - The box grows with her text, so she never scrolls inside a small box.
// - The toolbar buttons never take the focus from the box, so on an iPhone the keyboard
//   stays open and her selection stays put when she taps B, I or U.
const NOTE_SAVE_DELAY = 500;

function showNotesBox(box, id) {
  saveNotesNow(box);  // anything typed for the previous case or rule is saved first
  box.dataset.noteId = id;
  box.innerHTML = noteHtmlFor(id);  // already cleaned: only <b>, <i>, <u>, <br> and text
  box.dataset.unsaved = "no";
  showNotesEmpty(box);
  setNotesStatus(box, "Saved on this phone as you type.");
  showFormatButtons(box);
}

// The placeholder ("Write your own notes…") shows only while the box is empty.
function showNotesEmpty(box) {
  box.classList.toggle("is-empty", !box.textContent.trim() && !box.querySelector("br + br, b, i, u"));
}

function setNotesStatus(box, text) {
  const status = document.getElementById(box.id + "-status");
  if (status) { status.textContent = text; }
}

function saveNotesNow(box) {
  if (box.saveTimer) {
    clearTimeout(box.saveTimer);
    box.saveTimer = null;
  }
  if (!box.dataset.noteId || box.dataset.unsaved !== "yes") { return; }
  const ok = setNote(box.dataset.noteId, box.innerHTML);
  box.dataset.unsaved = "no";
  setNotesStatus(box, ok ? "Saved on this phone." : "Couldn't save on this phone. Private browsing may be on.");
}

function noteChanged(box) {
  showNotesEmpty(box);
  box.dataset.unsaved = "yes";
  setNotesStatus(box, "Saving…");
  if (box.saveTimer) { clearTimeout(box.saveTimer); }
  box.saveTimer = setTimeout(function () { saveNotesNow(box); }, NOTE_SAVE_DELAY);
}

// Put pasted or dropped content in, cleaned first (bold / italic / underline / line breaks only).
function insertCleanNote(box, data) {
  const html = data.getData("text/html");
  const clean = html ? cleanNoteHtml(html) : noteTextToHtml(data.getData("text/plain") || "");
  if (!clean) { return; }
  box.focus();
  if (!document.execCommand("insertHTML", false, clean)) {
    document.execCommand("insertText", false, noteHtmlToText(clean));
  }
  noteChanged(box);
}

// ---------- B / I / U ----------
const NOTE_FORMATS = { bold: true, italic: true, underline: true };

// Is the cursor (or selection) inside this box?
function selectionIn(box) {
  const sel = window.getSelection();
  return Boolean(sel && sel.rangeCount > 0 && box.contains(sel.getRangeAt(0).commonAncestorContainer));
}

// Show each button as pressed when the cursor is in text that already has that style.
function showFormatButtons(box) {
  const inside = document.activeElement === box && selectionIn(box);
  document.querySelectorAll('.notes-toolbar[data-for="' + box.id + '"] .notes-fmt').forEach(function (button) {
    let on = false;
    if (inside) {
      try { on = document.queryCommandState(button.dataset.cmd); } catch (e) { on = false; }
    }
    button.setAttribute("aria-pressed", on ? "true" : "false");
  });
}

// Bold / italic / underline on the selection (or on what she types next). Doing it again
// removes it. Used by the B / I / U buttons and by the keyboard shortcuts alike, so both
// give the same result and light up the buttons the same way.
function applyNoteFormat(box, cmd) {
  if (!NOTE_FORMATS[cmd]) { return; }
  if (document.activeElement !== box) { box.focus(); }  // style what she types next
  document.execCommand("styleWithCSS", false, false);  // <b>/<i>/<u>, not style="…"
  document.execCommand(cmd, false, null);
  noteChanged(box);
  showFormatButtons(box);
}

// Keyboard shortcuts on a computer: Cmd+B / Cmd+I / Cmd+U on a Mac, Ctrl+B / Ctrl+I /
// Ctrl+U on Windows and others. (On a Mac, Ctrl+B already means "cursor back one
// letter", so only Cmd is used there.) The browser's own action for these keys
// (e.g. bookmarks, or "view source" for Ctrl+U) is cancelled.
const NOTE_SHORTCUT_KEYS = { b: "bold", i: "italic", u: "underline" };
let isMacLike = /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent || "");

function noteShortcut(event) {
  const modifier = isMacLike ? (event.metaKey && !event.ctrlKey) : (event.ctrlKey && !event.metaKey);
  if (!modifier || event.altKey || event.shiftKey) { return null; }
  return NOTE_SHORTCUT_KEYS[(event.key || "").toLowerCase()] || null;
}

document.querySelectorAll(".notes-toolbar").forEach(function (toolbar) {
  const box = document.getElementById(toolbar.dataset.for);
  toolbar.querySelectorAll(".notes-fmt").forEach(function (button) {
    // Don't let the button take the focus: the keyboard stays open and the selection stays.
    ["mousedown", "pointerdown", "touchstart"].forEach(function (type) {
      button.addEventListener(type, function (event) { event.preventDefault(); }, { passive: false });
    });
    // touchstart is cancelled above (so iPhone keeps the selection), so act on touchend too.
    let handledByTouch = false;
    const apply = function () { applyNoteFormat(box, button.dataset.cmd); };
    button.addEventListener("touchend", function (event) {
      event.preventDefault();
      handledByTouch = true;
      apply();
    });
    button.addEventListener("click", function () {
      if (handledByTouch) { handledByTouch = false; return; }
      apply();
    });
  });
});

document.querySelectorAll(".notes-box").forEach(function (box) {
  box.addEventListener("input", function () { noteChanged(box); });
  box.addEventListener("blur", function () { saveNotesNow(box); showFormatButtons(box); });
  box.addEventListener("focus", function () { showFormatButtons(box); });
  box.addEventListener("paste", function (event) {
    if (!event.clipboardData) { return; }
    event.preventDefault();
    insertCleanNote(box, event.clipboardData);
  });
  box.addEventListener("drop", function (event) {
    event.preventDefault();  // never let raw dropped content in
    if (event.dataTransfer) { insertCleanNote(box, event.dataTransfer); }
  });
  box.addEventListener("keyup", function () { showFormatButtons(box); });
  box.addEventListener("keydown", function (event) {
    const cmd = noteShortcut(event);
    if (!cmd) { return; }
    event.preventDefault();   // not the browser's own Cmd+B / Cmd+U
    event.stopPropagation();
    applyNoteFormat(box, cmd);
  });
});
// The cursor moved (tap, arrow keys, selecting): update the B / I / U buttons.
document.addEventListener("selectionchange", function () {
  const box = document.activeElement;
  if (box && box.classList && box.classList.contains("notes-box")) { showFormatButtons(box); }
});

// Leaving the app (switching apps, locking the phone, closing): save every open note now.
function saveAllNotes() {
  document.querySelectorAll(".notes-box").forEach(saveNotesNow);
}
window.addEventListener("pagehide", saveAllNotes);
document.addEventListener("visibilitychange", function () {
  if (document.visibilityState === "hidden") { saveAllNotes(); }
});

// ---------- My notes (home screen button, and the list of everything she's written on) ----------
// Her notes, newest first, for cases and rules that still exist: [{ kind, item, note }].
function myNotes() {
  const list = [];
  Object.keys(progress.notes).forEach(function (id) {
    const note = progress.notes[id];
    const item = id.indexOf("case-") === 0 ? findCase(id) : findRule(id);
    if (!item) { return; }  // a case or rule no longer in the content: kept, just not listed
    list.push({ kind: id.indexOf("case-") === 0 ? "case" : "rule", item: item, note: note });
  });
  list.sort(function (a, b) { return String(b.note.updated || "").localeCompare(String(a.note.updated || "")); });
  return list;
}

function showMyNotesButton() {
  const n = myNotes().length;
  document.getElementById("my-notes-btn").textContent = "📝 My notes" + (n > 0 ? " (" + n + ")" : "");
}

function openNotes() {
  const entries = myNotes();
  const list = document.getElementById("notes-list");
  list.innerHTML = "";
  entries.forEach(function (entry) { list.appendChild(makeNoteCard(entry)); });
  document.getElementById("notes-count").textContent = entries.length === 0 ? ""
    : entries.length + (entries.length === 1 ? " case or rule" : " cases and rules") + " with your notes";
  document.getElementById("notes-empty").hidden = entries.length !== 0;
  showScreen("screen-notes");
}

// One card: the case or rule name, the start of her note, then "Case · Nov 18, 2026"
// (and the Unverified label, like every case or rule card).
function makeNoteCard(entry) {
  const card = document.createElement("button");
  card.className = "subject-card note-card";
  const name = document.createElement("span");
  name.className = "subject-name";
  if (entry.kind === "case") {
    name.appendChild(caseTitle(entry.item.name));
  } else {
    name.append(entry.item.title || "Untitled rule");
  }
  const preview = document.createElement("span");
  preview.className = "note-preview";
  const text = entry.note.text.replace(/\s+/g, " ").trim();
  preview.textContent = text.length > 120 ? text.slice(0, 120).replace(/\s+\S*$/, "") + "…" : text;
  name.appendChild(preview);
  const updated = entry.note.updated ? new Date(entry.note.updated) : null;
  const when = updated && !isNaN(updated)
    ? updated.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "";
  const label = (entry.kind === "case" ? "Case" : "Rule") + (when ? " · " + when : "");
  name.appendChild(cardDetail(label, entry.item.status === "verified"));
  const arrow = document.createElement("span");
  arrow.className = "subject-arrow";
  arrow.textContent = "›";
  card.append(name, arrow);
  card.addEventListener("click", function () {
    if (entry.kind === "case") { openCase(entry.item, "notes"); } else { openRule(entry.item, "notes"); }
  });
  return card;
}

document.getElementById("my-notes-btn").addEventListener("click", openNotes);
document.getElementById("notes-back").addEventListener("click", function () { showScreen("screen-home"); });

// ---------- Wide screens: the case screen's side panel ----------
// At 1280px and wider (the sidebar takes 240px from 1024px up), her notes and "Questions linked to this case" move into a side
// panel to the right of the case text (it stays in view while she scrolls; see style.css).
// Narrower (phones), they stay exactly where they are in index.html. They are moved, not
// copied, so typing, saving and tapping work the same either way. A marker remembers each
// one's place, so they go back when the window gets narrower again.
const WIDE_LAYOUT = window.matchMedia("(min-width: 1280px)");
const caseSideParts = [
  document.querySelector("#screen-case .notes-card"),
  document.getElementById("case-questions-block")
].map(function (element) {
  const marker = document.createComment("place of " + (element.id || "notes"));
  element.before(marker);
  return { element: element, marker: marker };
});

function placeCaseSide() {
  const side = document.getElementById("case-side");
  const inner = document.getElementById("case-side-inner");
  if (WIDE_LAYOUT.matches) {
    caseSideParts.forEach(function (part) { inner.appendChild(part.element); });
    side.hidden = false;
  } else {
    caseSideParts.forEach(function (part) { part.marker.after(part.element); });
    side.hidden = true;
  }
}
placeCaseSide();
WIDE_LAYOUT.addEventListener("change", function () {
  saveAllNotes();  // (moving a box can end typing in it: save first)
  placeCaseSide();
});

// ---------- Case titles: one shared look everywhere ----------
// Every place that shows a case's name as a label builds it with caseTitle() (or, for the
// case screen heading, has class="case-title" in index.html). Its look lives in ONE rule,
// ".case-title" in style.css, so a style change there reaches every screen, including
// screens added later, as long as they use caseTitle() / makeCaseCard().
function caseTitle(name) {
  const title = document.createElement("span");
  title.className = "case-title";
  title.textContent = name || "Untitled case";
  return title;
}

// The "Unverified" label for a question or case nobody has checked yet. Its look lives
// only in the ".status-unverified" rule in style.css, so every place that uses this
// (and the two labels with that class in index.html) always matches.
function unverifiedLabel() {
  const label = document.createElement("span");
  label.className = "status-unverified";
  label.textContent = "Unverified";
  return label;
}

// The small detail line on a card: some text, then the "Unverified" label if not verified.
function cardDetail(text, verified) {
  const detail = document.createElement("span");
  detail.className = "card-detail";
  if (text) { detail.append(text); }
  if (!verified) {
    if (text) { detail.append(" "); }
    detail.appendChild(unverifiedLabel());
  }
  return detail;
}

// One tappable card for a case in any case list: its title, then "G.R. No. · year" and
// the "Unverified" label if the case isn't verified.
// "extra" (optional): more text for the detail line, e.g. the subject in search results.
function makeCaseCard(theCase, onTap, extra) {
  const card = document.createElement("button");
  card.className = "subject-card";
  const name = document.createElement("span");
  name.className = "subject-name";
  name.appendChild(caseTitle(theCase.name));
  name.appendChild(cardDetail([theCase.grNumber, theCase.year, extra].filter(Boolean).join(" · "), theCase.status === "verified"));
  const arrow = document.createElement("span");
  arrow.className = "subject-arrow";
  arrow.textContent = "›";
  card.append(name, arrow);
  card.addEventListener("click", onTap);
  return card;
}

// Show the friendly "this list is empty" message on the subject screen.
function showEmptyListMessage(topic) {
  const note = document.getElementById("list-empty");
  const mode = currentMode();
  const hasOtherTypes = mode !== "both" && questionsForTopic(currentSubject, topic).length > 0;
  if (hasOtherTypes) {
    // There are questions here, just not of the type she picked.
    note.textContent = noneOfMode(mode) + " here. Pick All under Question type to see the others.";
  } else {
    note.textContent = EMPTY_LIST_MESSAGES[topic] || "No questions here yet.";
  }
  note.hidden = false;
}

// Fill in the "Your progress" box from what's saved on the phone.
function showSubjectStats(subject) {
  const stats = subjectStats(subject);
  document.getElementById("stats-mcq").textContent = stats.mcqAnswered === 0
    ? "Not tried yet"
    : stats.mcqCorrect + " of " + stats.mcqAnswered + " correct";
  const fbAnswered = wholeNumberOrZero(stats.fbAnswered);
  document.getElementById("stats-fb").textContent = fbAnswered === 0
    ? "Not tried yet"
    : wholeNumberOrZero(stats.fbCorrect) + " of " + fbAnswered + " correct";
  document.getElementById("stats-essay").textContent =
    (stats.got + stats.partly + stats.missed) === 0
      ? "Not tried yet"
      : "Got it " + stats.got + "\nPartly " + stats.partly + "\nMissed it " + stats.missed;
  const mastery = masteryOf(questionsFor(subject));
  document.getElementById("stats-mastery").textContent = mastery.mastered + " of " + mastery.total + " mastered";
}

document.getElementById("subject-back").addEventListener("click", function () {
  showScreen("screen-home");
});

// Update the little note under the shuffle switch when it's flipped.
function showShuffleNote() {
  document.querySelector(".switch-note").textContent = document.getElementById("shuffle").checked
    ? "On: questions come in random order"
    : "Off: questions come in order";
}

document.getElementById("shuffle").addEventListener("change", function () {
  showShuffleNote();
  rememberSpot();
});

// Mix up a list into random order (the standard "Fisher–Yates" shuffle).
function shuffled(list) {
  const copy = list.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const temp = copy[i];
    copy[i] = copy[j];
    copy[j] = temp;
  }
  return copy;
}

function startPractice() {
  let questions = fixedQuestions ? fixedQuestions.slice()
    : questionsForTopic(currentSubject, currentTopic, currentMode(), currentSubtopic);
  if (questions.length === 0) {
    // Empty list: go to (or stay on) the screen she started from and explain, instead of starting.
    if (!fixedQuestions && isRealTopic(currentTopic)) {
      openTopic(currentTopic, currentSubtopic);  // its Start button is off, with a note saying why
      return;
    }
    openSubject(currentSubject);
    showEmptyListMessage(currentTopic);
    return;
  }
  if (document.getElementById("shuffle").checked) {
    questions = shuffled(questions);
  }
  session = {
    questions: questions,
    index: 0,
    mcqCorrect: 0,
    mcqTotal: 0,
    ratings: { "Got it": 0, "Partly": 0, "Missed it": 0 },
    fbAnswered: 0,
    fbCorrect: 0,
    fbView: "quiz"  // a new round starts in Quiz; Read stays on for the round once picked
  };
  showQuestion();
}

// ---------- Screen 3: Practice ----------
function showQuestion() {
  endPeek();  // never carry a peek over to the next question
  const question = session.questions[session.index];
  session.current = {};  // nothing done on this question yet
  lastPromptWord = null;
  // "Find in case" stays hidden until she answers (Submit, or Show suggested answer),
  // so it can't be used as a shortcut to the answer.
  document.getElementById("find-btn").hidden = true;
  const isLast = session.index === session.questions.length - 1;

  document.getElementById("progress").textContent =
    "Question " + (session.index + 1) + " of " + session.questions.length;
  document.getElementById("subject").textContent = question.subject;
  document.getElementById("topic").textContent = [question.topic, subtopicOf(question)].filter(Boolean).join(" · ");
  setHighlightableText(document.getElementById("prompt"), question.prompt, question.id);
  document.getElementById("prompt").hidden = false;
  document.getElementById("fb-level").hidden = true;
  document.getElementById("fb-new-row").hidden = true;  // "New blanks": fill in the blank only
  document.getElementById("fb-level-note").hidden = true;
  // Anything not marked "verified" (including a missing status) shows the draft label.
  document.getElementById("draft-badge").hidden = (question.status === "verified");
  showBookmark(question);
  showTag(question);
  showQuestionCases(question);

  const nextButton = document.getElementById("next-btn");
  nextButton.hidden = true;
  nextButton.textContent = isLast ? "See results" : "Next";

  const isMcq = question.type === "mcq";
  const isFill = question.type === "fillblank";
  document.getElementById("question-label").textContent =
    isMcq ? "Multiple choice" : (isFill ? "Fill in the blank" : "Essay question");
  document.getElementById("mcq-area").hidden = !isMcq;
  document.getElementById("fill-area").hidden = !isFill;
  document.getElementById("essay-area").hidden = isMcq || isFill;

  if (isMcq) {
    showMcq(question);
  } else if (isFill) {
    showFillBlank(question);
  } else {
    showEssay(question);
  }
  applyFbView();

  showScreen("screen-question");
}

// --- Bookmark button ---
function showBookmark(question) {
  const button = document.getElementById("bookmark-btn");
  const on = isBookmarked(question.id);
  button.textContent = on ? "★ Bookmarked" : "☆ Bookmark";
  button.classList.toggle("on", on);
}

document.getElementById("bookmark-btn").addEventListener("click", function () {
  const question = session.questions[session.index];
  toggleBookmark(question.id);
  showBookmark(question);
});

// --- Color tag (green / yellow / red, or none) ---
// Tapping a color tags the question with it (replacing any other color); tapping the
// color it already has removes the tag. Saved right away, by question ID.
function showTag(question) {
  const tag = tagOf(question.id);
  document.querySelectorAll(".tag-dot").forEach(function (dot) {
    dot.setAttribute("aria-pressed", dot.dataset.tag === tag ? "true" : "false");
  });
}

document.querySelectorAll(".tag-dot").forEach(function (dot) {
  dot.addEventListener("click", function () {
    const question = session.questions[session.index];
    setTag(question.id, tagOf(question.id) === dot.dataset.tag ? null : dot.dataset.tag);
    showTag(question);
  });
});

// --- Multiple choice ---
function showMcq(question) {
  const container = document.getElementById("choices");
  container.innerHTML = "";
  document.getElementById("mcq-feedback").hidden = true;
  const submit = document.getElementById("submit-answer");
  submit.hidden = false;
  submit.disabled = true;  // grayed out until she picks a choice

  ["A", "B", "C", "D"].forEach(function (letter) {
    const button = document.createElement("button");
    button.className = "choice";
    button.dataset.letter = letter;
    const badge = document.createElement("span");
    badge.className = "choice-letter";
    badge.textContent = letter;
    const text = document.createElement("span");
    text.className = "choice-text";
    setRichText(text, question.choices[letter]);
    button.append(badge, text);
    button.setAttribute("aria-pressed", "false");
    button.addEventListener("click", function () {
      selectChoice(letter);
      rememberSpot();
    });
    container.appendChild(button);
  });
}

// Tapping a choice only selects it (she can still change her mind). Nothing is scored yet.
function selectChoice(letter) {
  session.current.selected = letter;
  document.querySelectorAll(".choice").forEach(function (button) {
    const on = button.dataset.letter === letter;
    button.classList.toggle("selected", on);
    button.setAttribute("aria-pressed", on ? "true" : "false");
  });
  document.getElementById("submit-answer").disabled = false;
}

// "Submit answer" locks in her selected choice, scores it, and shows the feedback.
document.getElementById("submit-answer").addEventListener("click", function () {
  const question = session.questions[session.index];
  const picked = session.current.selected;
  if (!picked || session.current.picked) { return; }  // nothing picked, or already submitted
  submitChoice(question, picked);
});

function submitChoice(question, picked) {
  const isRight = picked === question.correct;
  session.mcqTotal += 1;
  if (isRight) { session.mcqCorrect += 1; }
  recordMcq(question, isRight);  // save on the phone
  session.current.picked = picked;
  showPicked(question, picked);
  rememberSpot();
}

// Show a picked answer as right or wrong (also used to put her answer back after a reload).
function showPicked(question, picked) {
  const isRight = picked === question.correct;
  // Lock the choices and color them: correct one green, her wrong pick red.
  document.getElementById("submit-answer").hidden = true;
  document.querySelectorAll(".choice").forEach(function (button) {
    button.disabled = true;
    button.classList.remove("selected");
    button.removeAttribute("aria-pressed");
    const letter = button.dataset.letter;
    if (letter === question.correct) {
      button.classList.add("right");
      button.querySelector(".choice-letter").textContent = "✓";
    } else if (letter === picked) {
      button.classList.add("wrong");
      button.querySelector(".choice-letter").textContent = "✗";
    }
  });

  const result = document.getElementById("mcq-result");
  result.textContent = isRight
    ? "Correct!"
    : "Not quite. The correct answer is " + question.correct + ".";
  result.className = "feedback-title " + (isRight ? "got-text" : "missed-text");
  setRichText(document.getElementById("mcq-explanation"), question.explanation);
  document.getElementById("mcq-feedback").hidden = false;
  document.getElementById("next-btn").hidden = false;
  document.getElementById("find-btn").hidden = false;  // she has answered: "Find in case" is allowed now
}

// --- Fill in the blank ---
// Content: "prompt" has blanks written as ____ (four or more underscores), and
// "fullText" is the same text with nothing blanked out. The blanks written in the
// content are the key legal terms.
// 1. The "Blanks" dropdown picks how much of the text is hidden (more hidden = harder):
//    - Light: only 2–3 of the key legal terms (all of them if the item has 3 or fewer);
//    - Key Legal Terms: all the key legal terms, nothing else;
//    - Moderate / Intensive / Verbatim Bar Mode: all the key legal terms, plus other
//      words picked at random, until about 35% / 55% / 75% of the words are hidden.
//    The text shows right away at the level she used last. She can change the level
//    until she taps "Show answer".
// 2. Each hidden word is a text box she types into. "Show answer" marks each box green
//    (right) or red (wrong or empty), ignoring capitals, punctuation, spaces and accents,
//    and shows the full text, with every word that was hidden in bold and underlined.
// 3. She rates herself Got it / Missed it. That decides Review missed and her score.
// Each word stays one "word" for highlighting whether it's hidden or not, so her
// highlights stay on the same words at every level.
const FB_LEVELS = ["light", "key", "moderate", "intensive", "verbatim"];
const FB_LEVEL_NAMES = {
  light: "Light", key: "Key Legal Terms", moderate: "Moderate",
  intensive: "Intensive", verbatim: "Verbatim Bar Mode"
};
const FB_LEVEL_SHARE = { moderate: 0.35, intensive: 0.55, verbatim: 0.75 };  // share of words hidden
const FB_LIGHT_MOST = 3;          // Light: at most this many key-term blanks
const FB_DEFAULT_LEVEL = "key";
const FB_RATINGS = ["Got it", "Missed it"];
const BLANK = /_{4,}/;
const HAS_LETTER = /[A-Za-zÀ-ÿ]/;

// Words that are never hidden as extra words: "SEC." / "Section", list labels like
// "(a)", "(iv)" or "(1)", and anything without a letter (numbers, dashes).
function canHideWord(text) {
  if (!HAS_LETTER.test(text)) { return false; }
  if (/^(SEC\.|SECTION|Section)$/.test(text)) { return false; }
  if (/^\(([a-z]|[ivx]+|\d{1,2})\)$/.test(text)) { return false; }  // list labels: (a), (iv), (1)
  return true;
}

// How many words a piece of text has (for working out the share hidden).
function wordCount(text) {
  return text.split(/\s+/).filter(function (w) { return /[A-Za-zÀ-ÿ0-9]/.test(w); }).length;
}

// Everything about this item's words, worked out once when it's shown:
// for each word in the question, its text, and whether it's a key-term blank (and its answer).
let fbInfo = null;

function showFillBlank(question) {
  const words = Array.from(document.querySelectorAll("#prompt .hl-word"));
  const answers = blankAnswers(question.prompt, question.fullText);
  const blankCount = words.filter(function (w) { return BLANK.test(w.textContent); }).length;
  const canUse = answers && answers.length === blankCount;
  let b = 0;
  fbInfo = {
    words: words.map(function (span) {
      const text = span.textContent;
      const isBlank = BLANK.test(text);
      const info = { span: span, text: text, isBlank: isBlank };
      if (isBlank) {
        info.answer = canUse ? answers[b] : null;
        b += 1;
      }
      return info;
    }),
    usable: !!canUse,
    total: canUse ? Math.max(1, wordCount(question.fullText)) : 1
  };

  // Start: the dropdown and the text. The answer stays hidden.
  document.getElementById("fb-level").hidden = false;
  document.getElementById("fb-new-row").hidden = false;
  const select = document.getElementById("fb-level-select");
  select.disabled = false;
  document.getElementById("fb-show").hidden = false;
  document.getElementById("fb-peek").hidden = false;
  document.getElementById("fb-answer-area").hidden = true;
  document.getElementById("fb-result").hidden = true;
  document.querySelectorAll(".btn-fbrate").forEach(function (b) {
    b.classList.remove("selected");
    b.disabled = false;
  });

  // The Read view: the section's full text, exactly as stored.
  setRichText(document.getElementById("fb-read"),
    typeof question.fullText === "string" && question.fullText.trim()
      ? question.fullText : "The full text for this item hasn't been added yet.");

  let level = loadFbLevel();
  if (FB_LEVELS.indexOf(level) === -1) { level = FB_DEFAULT_LEVEL; }
  applyFbLevel(question, level, pickHiddenWords(level));
}

// --- Fill in the blank: Quiz or Read ---
// Read shows this item's section (its fullText) as plain reading text: no blanks, no
// boxes, nothing graded, and "Next" is there right away. Each item is one section, so
// sections are never merged. The choice stays for the rest of the round (Next keeps
// her in Read), and switching back to Quiz finds the quiz just as she left it.
// In Read, everything marked fb-quiz-only in index.html is hidden by style.css.
function applyFbView() {
  const question = session.questions[session.index];
  const isFill = question.type === "fillblank";
  const reading = isFill && session.fbView === "read";
  document.getElementById("screen-question").classList.toggle("fb-reading", reading);
  document.getElementById("fb-view").hidden = !isFill;
  document.getElementById("fb-read").hidden = !reading;
  document.querySelectorAll(".fb-view-btn").forEach(function (button) {
    button.setAttribute("aria-pressed", button.dataset.view === (reading ? "read" : "quiz") ? "true" : "false");
  });
  if (isFill) {
    // Quiz: Next only after she rates. Read: Next right away.
    document.getElementById("next-btn").hidden = !reading && !session.current.fbRating;
  }
}

document.querySelectorAll(".fb-view-btn").forEach(function (button) {
  button.addEventListener("click", function () {
    session.fbView = button.dataset.view === "read" ? "read" : "quiz";
    applyFbView();
    rememberSpot();
  });
});

// What each blank stands for, in order, from lining up the text around the blanks with
// the full text. Gives back null if anything doesn't line up.
function blankAnswers(prompt, full) {
  if (typeof prompt !== "string" || typeof full !== "string") { return null; }
  const pieces = prompt.split(/_{4,}/);
  if (pieces.length < 2 || full.indexOf(pieces[0]) !== 0) { return null; }
  const answers = [];
  let at = pieces[0].length;
  for (let i = 1; i < pieces.length; i++) {
    const piece = pieces[i];
    const isLast = i === pieces.length - 1;
    let end;
    if (isLast && piece === "") {
      end = full.length;              // the text ends with a blank
    } else if (piece === "") {
      return null;                    // two blanks in a row: can't tell where one ends
    } else {
      end = isLast ? full.length - piece.length : full.indexOf(piece, at + 1);
      if (end <= at || full.slice(end, end + piece.length) !== piece) { return null; }
    }
    const answer = full.slice(at, end);
    if (!answer.trim()) { return null; }
    answers.push(answer);
    at = end + piece.length;
  }
  return at === full.length ? answers : null;
}

// Which words to hide at a level. Gives back their word numbers (0 = first word).
function pickHiddenWords(level) {
  const all = fbInfo.words.map(function (w, n) { return n; });
  const blanks = all.filter(function (n) { return fbInfo.words[n].isBlank; });
  if (!fbInfo.usable) { return blanks; }  // content doesn't line up: just the written blanks
  if (level === "light") {
    return shuffled(blanks).slice(0, FB_LIGHT_MOST).sort(function (a, b) { return a - b; });
  }
  if (level === "key") { return blanks; }

  // Moderate / Intensive / Verbatim: the key terms, then random words up to the share.
  const target = Math.round(fbInfo.total * FB_LEVEL_SHARE[level]);
  let hidden = hiddenWordCount(blanks);
  const picked = blanks.slice();
  const others = shuffled(all.filter(function (n) {
    return !fbInfo.words[n].isBlank && canHideWord(fbInfo.words[n].text);
  }));
  for (let i = 0; i < others.length && hidden < target; i++) {
    picked.push(others[i]);
    hidden += 1;
  }
  return picked.sort(function (a, b) { return a - b; });
}

// Can "New blanks" hide different words at this level? Not at Key Legal Terms (always
// all the key terms), not at Light when the item has 3 key terms or fewer (all of them
// are always picked), and not at the higher levels when no other word could be picked.
function canPickNewBlanks(level) {
  if (!fbInfo.usable || level === "key") { return false; }
  const blanks = fbInfo.words.filter(function (w) { return w.isBlank; }).length;
  if (level === "light") { return blanks > FB_LIGHT_MOST; }
  const extras = fbInfo.hidden.filter(function (n) { return !fbInfo.words[n].isBlank; }).length;
  const candidates = fbInfo.words.filter(function (w) { return !w.isBlank && canHideWord(w.text); }).length;
  return extras > 0 && extras < candidates;
}

// Why "New blanks" can't change anything here (shown if she taps it anyway).
function noNewBlanksReason(level) {
  if (level === "key") {
    return "Key Legal Terms always hides the same key terms. Pick another level to get different blanks.";
  }
  if (level === "light") {
    return "This section has only a few key terms, and Light already hides all of them.";
  }
  return "There are no other words to hide at this level in this section.";
}

// Show the "New blanks" button as available or grayed out.
function showNewBlanksButton() {
  const button = document.getElementById("fb-new");
  const available = !session.current.answerShown && canPickNewBlanks(session.current.fbLevel);
  button.classList.toggle("off", !available);
  button.setAttribute("aria-disabled", available ? "false" : "true");
}

// "New blanks": the same level, but different words hidden (never the same set again
// if there's any other choice). What she typed stays in boxes that are still hidden.
document.getElementById("fb-new").addEventListener("click", function () {
  const note = document.getElementById("fb-new-note");
  const level = session.current.fbLevel;
  if (session.current.answerShown) { return; }
  if (!canPickNewBlanks(level)) {
    note.textContent = noNewBlanksReason(level);
    note.hidden = false;
    return;
  }
  note.hidden = true;
  const before = fbInfo.hidden.join(",");
  let picked = pickHiddenWords(level);
  for (let tries = 0; tries < 20 && picked.join(",") === before; tries++) {
    picked = pickHiddenWords(level);
  }
  applyFbLevel(session.questions[session.index], level, picked);
  rememberSpot();
});

// How many words of the full text are hidden (a key-term blank can stand for several words).
function hiddenWordCount(hidden) {
  return hidden.reduce(function (sum, n) {
    const w = fbInfo.words[n];
    return sum + (w.isBlank ? (w.answer ? wordCount(w.answer) : 1) : 1);
  }, 0);
}

// A word split into its punctuation before, the word itself, and its punctuation after
// ("(petition)." → "(", "petition", ")."). When hidden, only the middle part is hidden.
function splitWord(text) {
  const m = text.match(/^([^A-Za-zÀ-ÿ0-9]*)(.*?)([^A-Za-zÀ-ÿ0-9]*)$/);
  return { before: m[1], middle: m[2], after: m[3] };
}

// For a key-term blank, the text before and after the ____ ("____," → "", ",").
function splitBlank(text) {
  const at = text.search(BLANK);
  const end = at + text.match(BLANK)[0].length;
  return { before: text.slice(0, at), after: text.slice(end) };
}

// The right answer for hidden word number n (null if the content doesn't line up).
function fbAnswerFor(n) {
  const w = fbInfo.words[n];
  if (w.isBlank) { return w.answer || null; }
  return splitWord(w.text).middle;
}

// Compare what she typed with the right answer, ignoring capital letters, punctuation,
// spaces and accents: "Seventy two (72) hours" matches "seventy-two (72) hours".
function sameAnswer(typed, answer) {
  function plain(text) {
    return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
  }
  return plain(typed) !== "" && plain(typed) === plain(answer);
}

// A text box for one hidden word. It grows as she types.
function makeBlankBox(n, typed) {
  const box = document.createElement("input");
  box.type = "text";
  box.className = "fb-input";
  box.dataset.word = n;
  box.setAttribute("autocomplete", "off");
  box.setAttribute("autocorrect", "off");      // iPhone: don't "fix" legal words
  box.setAttribute("autocapitalize", "off");
  box.setAttribute("spellcheck", "false");
  box.setAttribute("enterkeyhint", "next");    // the keyboard's Return key says "next"
  box.setAttribute("aria-label", "Blank");
  box.value = typed || "";
  return box;
}

// Make the box just wide enough for what she typed (measured in the box's own font),
// never narrower than an empty blank. An empty box doesn't hint at the answer's length.
let measureCanvas = null;
function sizeBlankBox(box) {
  if (!measureCanvas) { measureCanvas = document.createElement("canvas"); }
  const ctx = measureCanvas.getContext("2d");
  const style = window.getComputedStyle(box);
  ctx.font = style.fontWeight + " " + style.fontSize + " " + style.fontFamily;
  const textWidth = box.value ? ctx.measureText(box.value).width : 0;
  box.style.width = "calc(" + Math.ceil(textWidth) + "px + 14px)";
}

// Show the text at a level, with the words numbered in "hidden" blanked out.
function applyFbLevel(question, level, hidden) {
  endPeek();
  const clean = [];
  hidden.forEach(function (n) {
    if (typeof n === "number" && fbInfo.words[n] && clean.indexOf(n) === -1) { clean.push(n); }
  });
  // What she has typed so far, kept for the words that are still hidden.
  const oldTyped = isPlainObject(session.current.fbTyped) ? session.current.fbTyped : {};
  const typed = {};
  clean.forEach(function (n) {
    if (typeof oldTyped[n] === "string" && oldTyped[n] !== "") { typed[n] = oldTyped[n]; }
  });
  fbInfo.words.forEach(function (w, n) {
    const hide = clean.indexOf(n) !== -1;
    w.span.classList.toggle("fb-blank", hide);
    w.span.textContent = "";
    if (hide) {
      // Hidden: a text box in place of the word, its punctuation stays around it.
      const parts = w.isBlank ? splitBlank(w.text) : splitWord(w.text);
      w.span.append(parts.before, makeBlankBox(n, typed[n]), parts.after);
    } else if (w.isBlank) {
      // A key-term blank not hidden at this level shows its words as normal text.
      w.span.textContent = w.answer ? w.text.replace(BLANK, w.answer) : w.text;
    } else {
      w.span.textContent = w.text;
    }
  });
  document.querySelectorAll("#prompt .fb-input").forEach(sizeBlankBox);  // now that they're on the page
  fbInfo.hidden = clean;
  session.current.fbLevel = level;
  session.current.fbHidden = clean;
  session.current.fbTyped = typed;
  document.getElementById("fb-level-select").value = level;
  document.getElementById("fb-new-note").hidden = true;
  showNewBlanksButton();

  // The full text for "Show answer", with every hidden word in bold.
  const full = typeof question.fullText === "string" ? question.fullText : "";
  setRichText(document.getElementById("fb-full"),
    full ? answerText(question, clean) : "The full text for this item hasn't been added yet.");

  const note = document.getElementById("fb-level-note");
  if (fbInfo.usable) {
    const count = hiddenWordCount(clean);
    note.textContent = count + " of " + fbInfo.total + " words hidden (" +
      Math.round(100 * count / fbInfo.total) + "%).";
  } else {
    note.textContent = clean.length + (clean.length === 1 ? " blank" : " blanks") + " to fill.";
  }
  note.hidden = false;
}

// The question's text with the hidden words put back in **…** (shown bold) and the
// other key-term blanks filled in. Built word by word from the prompt, so the lines and
// numbered points look just like the question. If the content doesn't line up (or
// already uses **), the full text unmarked.
function answerText(question, hidden) {
  const full = question.fullText;
  if (!fbInfo.usable || full.indexOf("**") !== -1 || question.prompt.indexOf("**") !== -1) { return full; }
  let n = 0;
  return question.prompt.split(/(\s+)/).map(function (bit) {
    if (bit === "" || /^\s+$/.test(bit)) { return bit; }
    const w = fbInfo.words[n];
    const hide = hidden.indexOf(n) !== -1;
    n += 1;
    if (!w) { return bit; }
    if (w.isBlank) { return bit.replace(BLANK, hide ? "**" + w.answer + "**" : w.answer); }
    if (!hide) { return bit; }
    const m = bit.match(/^([^A-Za-zÀ-ÿ0-9]*)(.*?)([^A-Za-zÀ-ÿ0-9]*)$/);
    return m[1] + "**" + m[2] + "**" + m[3];
  }).join("");
}

// Typing in a box: keep what she typed (so a reload puts it back), and grow the box.
document.getElementById("prompt").addEventListener("input", function (event) {
  const box = event.target;
  if (!box.classList || !box.classList.contains("fb-input")) { return; }
  sizeBlankBox(box);
  if (!isPlainObject(session.current.fbTyped)) { session.current.fbTyped = {}; }
  session.current.fbTyped[box.dataset.word] = box.value;
  rememberSpot();
});

// Return key in a box: go to the next box (or close the keyboard after the last one).
document.getElementById("prompt").addEventListener("keydown", function (event) {
  const box = event.target;
  if (event.key !== "Enter" || !box.classList || !box.classList.contains("fb-input")) { return; }
  event.preventDefault();
  const boxes = Array.from(document.querySelectorAll("#prompt .fb-input"));
  const next = boxes[boxes.indexOf(box) + 1];
  if (next) { next.focus(); } else { box.blur(); }
});

// --- Peek: hold the button to see the answers; let go and they hide again ---
// While held, each box is hidden and its answer is shown in its place (lighter, dotted
// underline). What she typed stays in the box. Nothing is scored or saved: it's only
// a quick look, separate from "Show answer".
let peeking = false;

function startPeek() {
  if (peeking || session.current.answerShown) { return; }
  peeking = true;
  document.querySelectorAll("#prompt .fb-input").forEach(function (box) {
    const answer = fbAnswerFor(Number(box.dataset.word));
    const peek = document.createElement("span");
    peek.className = "fb-peek";
    peek.textContent = answer === null ? "?" : answer;
    box.after(peek);
  });
  document.getElementById("prompt").classList.add("fb-peeking");
  document.getElementById("fb-peek").setAttribute("aria-pressed", "true");
}

function endPeek() {
  if (!peeking) { return; }
  peeking = false;
  document.querySelectorAll("#prompt .fb-peek").forEach(function (peek) { peek.remove(); });
  document.getElementById("prompt").classList.remove("fb-peeking");
  document.getElementById("fb-peek").setAttribute("aria-pressed", "false");
}

(function () {
  const button = document.getElementById("fb-peek");
  // Finger or mouse: peek while pressed; stop on release, on sliding off, or if the
  // phone takes over the touch (for example, to scroll).
  button.addEventListener("pointerdown", function (event) {
    event.preventDefault();  // no text selection or long-press menu on the button
    startPeek();
  });
  ["pointerup", "pointerleave", "pointercancel"].forEach(function (type) {
    button.addEventListener(type, endPeek);
  });
  button.addEventListener("contextmenu", function (event) { event.preventDefault(); });
  // Keyboard: hold Space or Enter.
  button.addEventListener("keydown", function (event) {
    if (event.key === " " || event.key === "Enter") { event.preventDefault(); startPeek(); }
  });
  button.addEventListener("keyup", function (event) {
    if (event.key === " " || event.key === "Enter") { endPeek(); }
  });
  button.addEventListener("blur", endPeek);
  window.addEventListener("blur", endPeek);  // switched apps mid-peek
})();

// "Show answer": mark each box green (right) or red (wrong or left empty), lock the
// boxes, and say how many she got. Nothing here is saved to her score: Got it / Missed it does that.
function checkBlankBoxes() {
  const boxes = document.querySelectorAll("#prompt .fb-input");
  let right = 0;
  let checked = 0;
  boxes.forEach(function (box) {
    box.readOnly = true;
    box.classList.remove("fb-right", "fb-wrong");
    const answer = fbAnswerFor(Number(box.dataset.word));
    if (answer === null) { return; }  // can't check (content doesn't line up)
    checked += 1;
    const ok = sameAnswer(box.value, answer);
    if (ok) { right += 1; }
    box.classList.add(ok ? "fb-right" : "fb-wrong");
    box.setAttribute("aria-label", ok ? "Right" : "Wrong. The answer is: " + answer);
  });
  if (checked > 0) {
    const note = document.getElementById("fb-level-note");
    note.textContent += " You typed " + right + " of " + checked + (checked === 1 ? " blank" : " blanks") + " correctly.";
  }
}

// Picking a level in the "Blanks" dropdown: new blanks at that level, remembered for next time.
document.getElementById("fb-level-select").addEventListener("change", function (event) {
  const level = event.target.value;
  if (FB_LEVELS.indexOf(level) === -1 || session.current.answerShown) { return; }
  saveFbLevel(level);
  applyFbLevel(session.questions[session.index], level, pickHiddenWords(level));
  rememberSpot();
});

// "Show answer" reveals the full text and the Got it / Missed it buttons.
// The level can't be changed after that.
function revealFillBlank() {
  checkBlankBoxes();
  document.getElementById("fb-answer-area").hidden = false;
  document.getElementById("fb-show").hidden = true;
  endPeek();
  document.getElementById("fb-peek").hidden = true;  // the full answer is showing now
  document.getElementById("fb-level-select").disabled = true;
  session.current.answerShown = true;
  showNewBlanksButton();  // grayed out once the answer is showing
  document.getElementById("find-btn").hidden = false;  // she has answered: "Find in case" is allowed now
}

document.getElementById("fb-show").addEventListener("click", function () {
  revealFillBlank();
  session.current.answerShown = true;
  rememberSpot();
});

// Got it / Missed it: counted once, then "Next" appears.
document.querySelectorAll(".btn-fbrate").forEach(function (button) {
  button.addEventListener("click", function () {
    const rating = button.dataset.rating;
    session.fbAnswered += 1;
    if (rating === "Got it") { session.fbCorrect += 1; }
    recordFillBlank(session.questions[session.index], rating, session.current.fbLevel);  // save on the phone
    session.current.fbRating = rating;
    showFbRated(rating);
    rememberSpot();
  });
});

// Show a chosen rating (also used to put her rating back after a reload).
function showFbRated(rating) {
  document.querySelectorAll(".btn-fbrate").forEach(function (b) {
    b.disabled = true;
    b.classList.toggle("selected", b.dataset.rating === rating);
  });
  const result = document.getElementById("fb-result");
  result.textContent = "You rated this: " + rating + (rating === "Missed it" ? " (added to Review missed)" : "");
  result.hidden = false;
  document.getElementById("next-btn").hidden = false;
}

// --- Essay ---
function showEssay(question) {
  setRichText(document.getElementById("alac-answer"), question.suggestedAnswer.answer);
  setRichText(document.getElementById("alac-basis"), question.suggestedAnswer.legalBasis);
  setRichText(document.getElementById("alac-application"), question.suggestedAnswer.application);
  setRichText(document.getElementById("alac-conclusion"), question.suggestedAnswer.conclusion);

  // Make a checkbox for each key point (clearing any from last time).
  const list = document.getElementById("key-points");
  list.innerHTML = "";
  question.keyPoints.forEach(function (point) {
    const item = document.createElement("li");
    const label = document.createElement("label");
    const box = document.createElement("input");
    box.type = "checkbox";
    label.appendChild(box);
    const pointText = document.createElement("span");  // one piece next to the checkbox
    pointText.appendChild(richText(point));
    label.appendChild(pointText);
    item.appendChild(label);
    list.appendChild(item);
  });

  // Start fresh: answer hidden, no rating chosen.
  document.getElementById("answer-area").hidden = true;
  document.getElementById("show-answer").hidden = false;
  document.getElementById("rating-result").hidden = true;
  document.querySelectorAll(".btn-rate").forEach(function (b) {
    b.classList.remove("selected");
    b.disabled = false;
  });
}

// "Show suggested answer" reveals the hidden answer section.
function revealAnswer() {
  document.getElementById("answer-area").hidden = false;
  document.getElementById("show-answer").hidden = true;
  document.getElementById("find-btn").hidden = false;  // she has answered: "Find in case" is allowed now
}

document.getElementById("show-answer").addEventListener("click", function () {
  revealAnswer();
  session.current.answerShown = true;
  rememberSpot();
});

// Remember which key points she has checked on this question.
document.getElementById("key-points").addEventListener("change", function () {
  const checked = [];
  document.querySelectorAll("#key-points input[type=checkbox]").forEach(function (box, n) {
    if (box.checked) { checked.push(n); }
  });
  session.current.checked = checked;
  rememberSpot();
});

// Rating buttons: she picks one, it's counted once, then "Next" appears.
document.querySelectorAll(".btn-rate").forEach(function (button) {
  button.addEventListener("click", function () {
    const rating = button.dataset.rating;
    session.ratings[rating] += 1;
    recordEssay(session.questions[session.index], rating);  // save on the phone
    session.current.rating = rating;
    showRated(rating);
    rememberSpot();
  });
});

// Show a chosen rating (also used to put her rating back after a reload).
function showRated(rating) {
  document.querySelectorAll(".btn-rate").forEach(function (b) {
    b.disabled = true;
    b.classList.toggle("selected", b.dataset.rating === rating);
  });
  const result = document.getElementById("rating-result");
  result.textContent = "You rated this: " + rating;
  result.hidden = false;
  document.getElementById("next-btn").hidden = false;
}

document.getElementById("next-btn").addEventListener("click", function () {
  session.index += 1;
  if (session.index < session.questions.length) {
    showQuestion();
  } else {
    showResults();
  }
});

document.getElementById("question-back").addEventListener("click", function () {
  if (practiceCase) {
    openCase(practiceCase, caseHome);  // she came from a case: go back to it
  } else {
    openTopicOrSubject();  // back to the topic screen (or the subject screen)
  }
});

// --- "Read the case" buttons: one for each case this question links to ---
function showQuestionCases(question) {
  const box = document.getElementById("question-cases");
  box.innerHTML = "";
  const ids = Array.isArray(question.caseIds) ? question.caseIds : [];
  ids.forEach(function (caseId) {
    const theCase = findCase(caseId);
    if (!theCase) { return; }  // a link to a case that isn't in any topic file: just skip it
    const button = document.createElement("button");
    button.className = "btn btn-secondary";
    if (ids.length === 1) {
      button.textContent = "Read the case";
    } else {
      // "Read the case: <name>", with the name in the shared case-title style.
      button.append("Read the case: ", caseTitle(theCase.name));
    }
    button.addEventListener("click", function () { openCase(theCase, "question"); });
    box.appendChild(button);
  });
}

// ---------- Screen 4: Results ----------
function showResults() {
  const essayCount = session.ratings["Got it"] + session.ratings["Partly"] + session.ratings["Missed it"];
  document.getElementById("results-subject").textContent = currentSubject + " · " + currentTopic;

  // Only show a section if this round had that kind of question.
  document.getElementById("results-mcq").hidden = (session.mcqTotal === 0);
  document.getElementById("results-mcq-score").textContent = session.mcqCorrect + " of " + session.mcqTotal;

  document.getElementById("results-fb").hidden = (session.fbAnswered === 0);
  document.getElementById("results-fb-score").textContent = session.fbCorrect + " of " + session.fbAnswered;

  document.getElementById("results-essay").hidden = (essayCount === 0);
  // Only read (or skipped) everything: say so, instead of an empty screen.
  document.getElementById("results-none").hidden = (session.mcqTotal + session.fbAnswered + essayCount) > 0;
  document.getElementById("results-got").textContent = session.ratings["Got it"];
  document.getElementById("results-partly").textContent = session.ratings["Partly"];
  document.getElementById("results-missed").textContent = session.ratings["Missed it"];

  showScreen("screen-results");
}

document.getElementById("results-again").addEventListener("click", startPractice);
document.getElementById("results-home").addEventListener("click", function () {
  showScreen("screen-home");
});

// ---------- Screen 5: One case ----------
function findCase(caseId) {
  return allCases.find(function (c) { return c && c.id === caseId; }) || null;
}

// Where to go when she taps "‹ Back" on the case screen.
let caseCameFrom = null;       // "question", "topic", "subject", "notes" or "search"
let caseHome = "topic";        // where the case screen's Back goes when not back to a question
let questionScrollSpot = 0;    // where she was on the question screen

// ---------- Bold text in content ----------
// Lets content in the JSON files use **two stars** around words to make them bold.
// SAFETY: this never uses innerHTML. Every piece of text is added as plain text,
// and the only tag ever created is <strong>. So if the JSON contains something
// like <script> or <b>, it shows up on screen as those characters and never runs.
//
// If "highlighted" is given (a list of word positions), every word is also put in
// its own small tappable <span>, numbered 0, 1, 2… from the start, and the words in
// the list get the yellow highlight. Still no innerHTML: words are added as plain text.
// Unless "noLists" is true, numbered points like "(1) … (2) …" are put on their own
// lines with the number in bold (see markLists below).
function richText(value, highlighted, noLists, startAt) {
  let text = (value === null || value === undefined) ? "" : String(value);
  text = text.split(LIST_MARK).join("");  // the marker character is ours alone
  if (!noLists) { text = markLists(text); }
  const fragment = document.createDocumentFragment();
  let wordNumber = startAt || 0;  // a rule's later sections continue the count

  // Add a piece of text to "parent": as plain text, or word by word if highlighting.
  function addText(parent, piece) {
    if (!highlighted) {
      // A list number (marked by markLists) is shown in bold; the rest as plain text.
      piece.split(new RegExp("(" + LIST_MARK + "\\S+)")).forEach(function (bit) {
        if (bit === "") { return; }
        if (bit.charAt(0) === LIST_MARK) {
          const number = document.createElement("strong");
          number.className = "list-num";
          number.textContent = bit.slice(1);
          parent.appendChild(number);
        } else {
          parent.appendChild(document.createTextNode(bit));
        }
      });
      return;
    }
    piece.split(/(\s+)/).forEach(function (bit) {
      if (bit === "") { return; }
      if (/^\s+$/.test(bit)) {
        // The space between two words gets its own <span>, so it can turn yellow
        // when the words on both sides are highlighted (one continuous stripe).
        const gap = document.createElement("span");
        gap.className = "hl-gap";
        gap.textContent = bit;  // spaces and line breaks stay as they are
        parent.appendChild(gap);
        return;
      }
      const word = document.createElement("span");
      word.className = "hl-word";
      word.dataset.word = wordNumber;
      if (highlighted.indexOf(wordNumber) !== -1) { word.classList.add("hl-on"); }
      if (bit.charAt(0) === LIST_MARK) {  // a list number: bold
        word.classList.add("list-num");
        bit = bit.slice(1);
      }
      word.textContent = bit;
      parent.appendChild(word);
      wordNumber += 1;
    });
  }

  const parts = text.split("**");
  // A ** with no partner (an odd one out) is shown as-is, not treated as bold.
  const lastPaired = (parts.length % 2 === 0) ? parts.length - 2 : parts.length - 1;
  parts.forEach(function (part, i) {
    if (i > lastPaired) {
      addText(fragment, "**" + part);
    } else if (i % 2 === 1) {
      const strong = document.createElement("strong");
      addText(strong, part);
      fragment.appendChild(strong);
    } else {
      addText(fragment, part);
    }
  });
  return fragment;
}

// ---------- Numbered points on their own lines ----------
// Text like "No. The petition was denied. (1) The earlier case… (2) The papers…" is shown as:
//   No. The petition was denied.
//   (1) The earlier case…
//   (2) The papers…
// Recognized numbers: (1) (2)…, 1. 2.…, 1) 2)…, and (a) (b)…
// To avoid splitting ordinary sentences ("Article 26(1)", "Section 13.", "between (a) X and (b) Y"):
//  - a list must start at 1 (or a), right at the start of the text or after . ? ! : ; or a line break;
//  - the next items must count up (2, 3… or b, c…) in the same style, at least two items in all.
// Lettered points inside a numbered point (between its (1) and (2)…) are indented.
// No words are added, removed or moved: only the spaces before each number change
// (to a line break), so her saved highlights still land on the same words.
const LIST_MARK = "\uE000";  // invisible marker put in front of each list number
const LIST_NUMBER = /(^|\s)(\((\d{1,2})\)|(\d{1,2})\.|(\d{1,2})\)|\(([a-z])\))(?=\s)/g;

function markLists(text) {
  const found = [];
  let m;
  LIST_NUMBER.lastIndex = 0;
  while ((m = LIST_NUMBER.exec(text)) !== null) {
    const at = m.index + m[1].length;  // where the number itself starts
    let style, value;
    if (m[3]) { style = "(n)"; value = Number(m[3]); }
    else if (m[4]) { style = "n."; value = Number(m[4]); }
    else if (m[5]) { style = "n)"; value = Number(m[5]); }
    else { style = "(a)"; value = m[6].charCodeAt(0) - 96; }
    found.push({ at: at, style: style, value: value, text: m[2] });
  }

  // Can a list start here? Start of text, or after . ? ! : ; or a line break.
  function startsPoint(at) {
    const before = text.slice(0, at).replace(/[ \t]+$/, "");
    return before === "" || /[.?!:;\n]["'”’)*]*$/.test(before);
  }

  // Pick out the real lists: 1, 2, 3… (or a, b, c…) in order, in one style.
  const chosen = [];
  const numberedRanges = [];  // where each numbered (not lettered) list runs
  ["(n)", "n.", "n)", "(a)"].forEach(function (style) {
    const ofStyle = found.filter(function (f) { return f.style === style; });
    let i = 0;
    while (i < ofStyle.length) {
      if (ofStyle[i].value !== 1 || !startsPoint(ofStyle[i].at)) { i += 1; continue; }
      const list = [ofStyle[i]];
      for (let j = i + 1; j < ofStyle.length; j++) {
        if (ofStyle[j].value === list[list.length - 1].value + 1) { list.push(ofStyle[j]); }
      }
      if (list.length >= 2) {
        list.forEach(function (f) { chosen.push(f); });
        if (style !== "(a)") { numberedRanges.push([list[0].at, list[list.length - 1].at]); }
        i = ofStyle.indexOf(list[list.length - 1]) + 1;
      } else {
        i += 1;
      }
    }
  });
  if (chosen.length === 0) { return text; }
  chosen.sort(function (a, b) { return a.at - b.at; });

  // Rebuild the text: a line break before each list number (indented if it's a lettered
  // point inside a numbered one), and the invisible marker in front of the number.
  let result = "";
  let from = 0;
  chosen.forEach(function (f) {
    let before = text.slice(from, f.at);
    const spaces = before.match(/\s*$/)[0];
    const nested = f.style === "(a)" && numberedRanges.some(function (r) { return f.at > r[0] && f.at < r[1]; });
    const indent = nested ? "\u2003\u2003" : "";
    if (f.at > 0) {
      before = before.slice(0, before.length - spaces.length) + (spaces.indexOf("\n") !== -1 ? spaces : "\n") + indent;
    }
    result += before + LIST_MARK;
    from = f.at;
  });
  return result + text.slice(from);
}

// Replace what's inside an element with text that may contain **bold** parts.
function setRichText(element, value) {
  element.textContent = "";
  element.appendChild(richText(value));
}

// ---------- Highlighter ----------
// Like setRichText, but each word can be tapped to highlight it (tap again to remove).
// "key" says where her highlights are saved: a question ID, or e.g. "case-0002:facts".
// "noLists": true for the full decision text, which keeps the Court's own layout.
function setHighlightableText(element, value, key, noLists) {
  // No ID to save under (bad content)? Show the text normally, without highlighting.
  if (typeof key !== "string" || key === "" || key.indexOf("undefined") === 0) {
    delete element.dataset.hlKey;
    element.textContent = "";
    element.appendChild(richText(value, null, noLists));
    return;
  }
  element.textContent = "";
  element.dataset.hlKey = key;
  element.appendChild(richText(value, highlightedWords(key), noLists));
  if (element.classList.contains("hl-colored")) {
    // The full decision text: each highlighted word has its own color.
    element.querySelectorAll(".hl-word.hl-on").forEach(function (word) {
      word.dataset.hlColor = highlightColorOf(key, Number(word.dataset.word));
    });
  }
  joinHighlights(element);
}

// Make next-door highlighted words look like one stripe: color the space between
// them, and square off the corners where they touch. Only the outer ends stay rounded.
// Words split by a line break in the text (a new paragraph) are not joined.
function joinHighlights(element) {
  const pieces = element.querySelectorAll(".hl-word, .hl-gap");  // in reading order
  let previousWord = null;  // the last word seen
  let gapsBetween = [];     // the spaces since that word
  let canJoin = true;       // false if those spaces include a line break

  pieces.forEach(function (piece) {
    if (piece.classList.contains("hl-gap")) {
      piece.classList.remove("hl-on");
      delete piece.dataset.hlColor;
      gapsBetween.push(piece);
      if (piece.textContent.indexOf("\n") !== -1) { canJoin = false; }
      return;
    }
    piece.classList.remove("hl-join-left", "hl-join-right");
    // Words in two different cards (a rule's sections) are never joined.
    if (previousWord && previousWord.closest(".hl-block") !== piece.closest(".hl-block")) { canJoin = false; }
    // Different colors are never joined: each color stays its own stripe.
    const joined = canJoin && previousWord &&
      previousWord.classList.contains("hl-on") && piece.classList.contains("hl-on") &&
      (previousWord.dataset.hlColor || "") === (piece.dataset.hlColor || "");
    if (joined) {
      previousWord.classList.add("hl-join-right");
      piece.classList.add("hl-join-left");
      gapsBetween.forEach(function (gap) {
        gap.classList.add("hl-on");
        if (piece.dataset.hlColor) { gap.dataset.hlColor = piece.dataset.hlColor; }
      });
    }
    previousWord = piece;
    gapsBetween = [];
    canJoin = true;
  });
}

// ---------- Highlighter colors (full decision text only) ----------
// She picks a color from the row of swatches, then taps (or drags over) words:
// - a plain word, or a word in another color -> gets the picked color;
// - a word already in the picked color -> loses its highlight (it fades out).
let activeHighlightColor = DEFAULT_HIGHLIGHT_COLOR;

function pickHighlightColor(color) {
  if (HIGHLIGHT_COLORS.indexOf(color) === -1) { return; }
  activeHighlightColor = color;
  document.querySelectorAll(".hl-swatch").forEach(function (swatch) {
    swatch.setAttribute("aria-pressed", swatch.dataset.color === color ? "true" : "false");
  });
  // The drag preview uses the picked color (see style.css): in every colored-highlighter
  // text (a decision's full text, a rule's full text).
  document.querySelectorAll(".hl-colored").forEach(function (box) {
    HIGHLIGHT_COLORS.forEach(function (c) { box.classList.toggle("hl-active-" + c, c === color); });
  });
}

document.querySelectorAll(".hl-swatch").forEach(function (swatch) {
  swatch.addEventListener("click", function () { pickHighlightColor(swatch.dataset.color); });
});

// Is this highlighted word in the picked color? (Then tapping or dragging removes it.)
function inActiveColor(word) {
  return word.classList.contains("hl-on") && (word.dataset.hlColor || DEFAULT_HIGHLIGHT_COLOR) === activeHighlightColor;
}

function tapColoredWord(element, key, word) {
  const position = Number(word.dataset.word);
  if (inActiveColor(word)) {
    setHighlights(key, [position], false);
    word.classList.remove("hl-on");
    delete word.dataset.hlColor;
  } else {
    colorHighlights(key, [position], activeHighlightColor);
    word.classList.add("hl-on");
    word.dataset.hlColor = activeHighlightColor;
  }
  joinHighlights(element);
}

// The word she highlighted most recently in the question prompt (its number), so
// "Find in case" knows which highlighted phrase she means. Not saved; reset per question.
let lastPromptWord = null;

// Listen for taps on the words inside one text box. Set up once per box when the app starts.
// Only taps on a word in this box do anything, so buttons elsewhere are never affected.
function makeHighlightable(elementId) {
  const element = document.getElementById(elementId);
  element.classList.add("highlightable");
  element.addEventListener("click", function (event) {
    // A mouse drag was just turned into a highlight: don't also toggle the word under the mouse.
    if (skipNextClick) { skipNextClick = false; return; }
    if (event.target.closest("input")) { return; }  // typing in a fill-in-the-blank box, not highlighting
    const word = event.target.closest(".hl-word");
    const key = element.dataset.hlKey;
    if (!word || !key || !element.contains(word)) { return; }
    if (element.classList.contains("hl-colored")) {
      tapColoredWord(element, key, word);
      return;
    }
    toggleHighlight(key, Number(word.dataset.word));
    word.classList.toggle("hl-on");
    joinHighlights(element);
    if (elementId === "prompt" && word.classList.contains("hl-on")) { lastPromptWord = Number(word.dataset.word); }
  });
}

["prompt", "case-facts", "case-issue", "case-ruling", "full-text", "rule-text"].forEach(makeHighlightable);

// ---------- Highlighter with a mouse: click and drag ----------
// On a touchscreen she taps one word at a time (above). With a mouse or trackpad she
// can also drag across words like normal text selection; when she lets go, those words
// get the yellow highlight and the browser's own blue selection is cleared.
// Both ways save the same thing: the list of highlighted word positions.
//
// We check what started each press ("mouse", "touch" or "pen") instead of guessing
// the device, so a laptop with a touchscreen works right for whichever she uses.
let lastPointerType = "";
let skipNextClick = false;
let mouseIsDown = false;   // true while she's holding the mouse button down
let pressCount = 1;        // 1 for a normal press, 2 for the second press of a double-click

document.addEventListener("pointerdown", function (event) {
  lastPointerType = event.pointerType;
  skipNextClick = false;
  // (A press in a fill-in-the-blank box is for typing, not for a highlight drag.)
  mouseIsDown = (event.pointerType === "mouse") && !(event.target.closest && event.target.closest("input, textarea, [contenteditable]"));
});

// The press itself says whether it's part of a double-click (more reliable than the release).
document.addEventListener("mousedown", function (event) {
  pressCount = event.detail || 1;
});

// The selected words in each highlightable text box on screen:
// a list of { element, key, words: [the selected word <span>s] }.
function selectedWords(range) {
  const picked = [];
  document.querySelectorAll(".highlightable").forEach(function (element) {
    const key = element.dataset.hlKey;
    if (!key || !range.intersectsNode(element)) { return; }
    const words = wordsInRange(range, element, element.querySelectorAll(".hl-word"));
    if (words.length > 0) { picked.push({ element: element, key: key, words: words }); }
  });
  return picked;
}

// The words (in reading order) that the selection covers.
// Fast way: every word carries its number (0, 1, 2…), so read the numbers of the words
// where the selection starts and ends and take everything in between. (Comparing the
// selection with each word one by one is very slow in a long decision.)
// If the selection starts or ends somewhere unusual, fall back to checking each word.
function wordsInRange(range, element, allWords) {
  const first = element.contains(range.startContainer)
    ? wordNumberAt(range.startContainer, range.startOffset, true) : 0;
  const last = element.contains(range.endContainer)
    ? wordNumberAt(range.endContainer, range.endOffset, false) : allWords.length - 1;
  if (first === null || last === null) {
    return Array.prototype.filter.call(allWords, function (word) { return rangeTouchesWord(range, word); });
  }
  return Array.prototype.slice.call(allWords, Math.max(0, first), Math.min(allWords.length - 1, last) + 1);
}

// The number of the first (isStart) or last word a selection edge covers, or null if unsure.
function wordNumberAt(node, offset, isStart) {
  if (node.nodeType !== 3) { return null; }  // not inside the letters of a word or space
  const piece = node.parentElement && node.parentElement.closest(".hl-word, .hl-gap");
  if (!piece) { return null; }
  if (piece.classList.contains("hl-word")) {
    const n = Number(piece.dataset.word);
    if (isStart && offset >= node.length) { return n + 1; }  // starts right after this word
    if (!isStart && offset === 0) { return n - 1; }          // ends right before this word
    return n;
  }
  // In a space between words: use the word after it (start) or before it (end).
  const neighbor = isStart ? piece.nextElementSibling : piece.previousElementSibling;
  if (!neighbor || !neighbor.classList.contains("hl-word")) { return null; }
  return Number(neighbor.dataset.word);
}

// Does the selection reach into question or case text at all?
function selectionInHighlightable(range) {
  return Array.prototype.some.call(document.querySelectorAll(".highlightable"), function (element) {
    return range.intersectsNode(element);
  });
}

function clearDragPreview() {
  document.querySelectorAll(".hl-preview, .hl-unpreview").forEach(function (piece) {
    piece.classList.remove("hl-preview", "hl-unpreview");
  });
}

// Does a drag that starts on this word REMOVE highlights (true) or ADD them (false)?
// Full decision text: removes only if the word is already in the picked color.
// Everywhere else (one yellow): removes if the word is highlighted.
function dragRemoves(startWord) {
  return startWord.closest(".hl-colored") ? inActiveColor(startWord) : startWord.classList.contains("hl-on");
}

// In a removing drag, which words lose their highlight?
// Full decision text: only those in the picked color. Elsewhere: every highlighted word.
function removedByDrag(element, word) {
  return element.classList.contains("hl-colored") ? inActiveColor(word) : word.classList.contains("hl-on");
}

// While she drags, show live which words the drag will change:
// - a drag that STARTED on a plain word: the words she passes over get a light yellow
//   preview of the highlight they're about to get ("hl-preview");
// - a drag that STARTED on a yellow word: the yellow words she passes over turn a lighter
//   yellow right away ("hl-unpreview"), showing they're about to lose their highlight.
//   When she lets go they fade from that lighter yellow to nothing.
// (The browser's own blue selection is made invisible in this text by style.css.)
document.addEventListener("selectionchange", function () {
  if (!mouseIsDown || lastPointerType !== "mouse") { return; }
  clearDragPreview();
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) { return; }
  const picked = selectedWords(selection.getRangeAt(0));
  if (picked.length === 0) { return; }
  const removing = dragRemoves(dragStartWord(selection, picked));
  picked.forEach(function (p) {
    p.words.forEach(function (word) {
      if (!removing) {
        // Light preview in the color they'll get (in the full text, also over words
        // in another color, which will change to the picked color). Words already in
        // the picked color stay as they are.
        if (!(p.element.classList.contains("hl-colored") && inActiveColor(word))) {
          word.classList.add("hl-preview");
        }
      } else if (removedByDrag(p.element, word)) {
        word.classList.add("hl-unpreview");
      }
    });
    if (removing) { lightenGapsBeside(p.element); }
  });
});

// A yellow space next to a word that's about to lose its highlight will lose its yellow
// too (the stripe breaks there), so it gets the same lighter preview.
function lightenGapsBeside(element) {
  const pieces = element.querySelectorAll(".hl-word, .hl-gap");  // in reading order
  let previousWord = null;
  let waiting = [];  // yellow spaces since the previous word
  pieces.forEach(function (piece) {
    if (piece.classList.contains("hl-gap")) {
      if (piece.classList.contains("hl-on")) { waiting.push(piece); }
      return;
    }
    const either = (previousWord && previousWord.classList.contains("hl-unpreview")) ||
      piece.classList.contains("hl-unpreview");
    if (either) { waiting.forEach(function (gap) { gap.classList.add("hl-unpreview"); }); }
    previousWord = piece;
    waiting = [];
  });
}

// Remove the browser's selection now, and once more just before the next screen redraw,
// in case the browser puts it back after letting go of the mouse.
function clearNativeSelection() {
  const selection = window.getSelection();
  if (selection) { selection.removeAllRanges(); }
  window.requestAnimationFrame(function () {
    const again = window.getSelection();
    if (!mouseIsDown && again && again.rangeCount > 0 && !again.isCollapsed &&
        selectionInHighlightable(again.getRangeAt(0))) {
      again.removeAllRanges();
    }
  });
}

// She let go of the mouse. "pointerup" comes first and "mouseup" right after;
// whichever arrives first does the work, the other is ignored.
function finishMouseDrag() {
  if (!mouseIsDown) { return; }
  mouseIsDown = false;
  applyMouseDrag();
  // Remove the drag previews only AFTER the highlights have changed, in the same moment.
  // (If the lighter preview were removed first, the browser could briefly see full yellow
  // again, and the fade would start from full yellow instead of from the lighter preview.)
  clearDragPreview();
}

function applyMouseDrag() {
  if (lastPointerType !== "mouse") { return; }  // touch: leave it to the tap code

  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) { return; }  // a plain click
  const range = selection.getRangeAt(0);
  if (!selectionInHighlightable(range)) { return; }  // she selected something else, like a heading: leave it alone

  // A double-click selects a word by itself; the first click already highlighted it.
  if (pressCount >= 2) {
    clearNativeSelection();
    skipNextClick = true;
    return;
  }

  const picked = selectedWords(range);
  if (picked.length > 0) {
    // The word where the drag STARTED decides what the drag does:
    // started on a highlighted word (in the full text: one in the picked color)
    //   -> remove the highlight from the words dragged over (they fade out);
    // otherwise -> highlight every word dragged over (in the full text: in the picked color).
    // (So a drag that ends a little past the last highlighted word still removes, instead of flipping.)
    const removing = dragRemoves(dragStartWord(selection, picked));
    const positionsOf = function (words) { return words.map(function (word) { return Number(word.dataset.word); }); };
    picked.forEach(function (p) {
      if (p.element.classList.contains("hl-colored")) {
        if (removing) {
          const losing = p.words.filter(inActiveColor);
          setHighlights(p.key, positionsOf(losing), false);
          losing.forEach(function (word) { word.classList.remove("hl-on"); delete word.dataset.hlColor; });
        } else {
          colorHighlights(p.key, positionsOf(p.words), activeHighlightColor);
          p.words.forEach(function (word) { word.classList.add("hl-on"); word.dataset.hlColor = activeHighlightColor; });
        }
      } else {
        setHighlights(p.key, positionsOf(p.words), !removing);
        p.words.forEach(function (word) { word.classList.toggle("hl-on", !removing); });
      }
      joinHighlights(p.element);
      if (!removing && p.element.id === "prompt") { lastPromptWord = Number(p.words[p.words.length - 1].dataset.word); }
    });
  }

  clearNativeSelection();  // only our yellow highlight should show
  skipNextClick = true;
}

document.addEventListener("pointerup", finishMouseDrag);
document.addEventListener("mouseup", finishMouseDrag);

// The selected word where she started dragging. If she started in a space or a margin
// (not on a word), use the selected word closest to where she started.
function dragStartWord(selection, picked) {
  const all = [];
  picked.forEach(function (p) { p.words.forEach(function (word) { all.push(word); }); });  // reading order
  const node = selection.anchorNode;  // where the drag started
  const startElement = node && (node.nodeType === 1 ? node : node.parentElement);
  const word = startElement && startElement.closest(".hl-word");
  if (word && all.indexOf(word) !== -1) { return word; }
  const range = selection.getRangeAt(0);
  const draggedForward = (range.startContainer === selection.anchorNode && range.startOffset === selection.anchorOffset);
  return draggedForward ? all[0] : all[all.length - 1];
}

// True if the selection covers at least one letter of this word
// (just touching its edge doesn't count).
function rangeTouchesWord(range, word) {
  const wordRange = document.createRange();
  wordRange.selectNodeContents(word);
  const startsBeforeWordEnds = range.compareBoundaryPoints(Range.END_TO_START, wordRange) < 0;
  const endsAfterWordStarts = range.compareBoundaryPoints(Range.START_TO_END, wordRange) > 0;
  return startsBeforeWordEnds && endsAfterWordStarts;
}

// Remove the ** marks (used for short previews, where bold isn't shown).
function plainText(value) {
  return String(value || "").split("**").join("");
}

function caseText(value) {
  return (typeof value === "string" && value.trim()) ? value : "Not available yet.";
}

// ---------- Search (home screen) ----------
// Looks through every case and rule in data/catalog.json (never the full texts) by name /
// title and G.R. number / citation, as she types.
//   - Capital letters, accents and punctuation don't matter: "g.r. no. 202666", "GR 202666"
//     and "202666" all find G.R. No. 202666.
//   - Partial words count: "viva" finds Vivares. Every word she types must be found.
//   - Best matches first (every word starts a word in the name), then in ID order.
//   - Nothing found: "Not in the app yet" and a "Look it up online" button.
const SEARCH_SHOW_AT_MOST = 20;

// "G.R. No. 202,666" → "g r no 202 666" (lower case, no accents, punctuation → spaces),
// and letters split from numbers ("GR202666" → "gr 202666").
function searchKey(text) {
  return String(text || "").normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, " ")
    .replace(/([a-z])([0-9])/g, "$1 $2").replace(/([0-9])([a-z])/g, "$1 $2").trim();
}

// Every case and rule in the catalog, ready for searching (made once, after the catalog loads).
let searchEntries = null;
function getSearchEntries() {
  if (searchEntries) { return searchEntries; }
  const entries = [];
  catalogCases.forEach(function (c) { entries.push({ kind: "case", item: c, text: [c.name, c.grNumber] }); });
  catalogRules.forEach(function (r) { entries.push({ kind: "rule", item: r, text: [r.title, r.number] }); });
  entries.forEach(function (e) {
    e.key = " " + searchKey(e.text.join(" ")) + " ";
    e.joined = e.key.replace(/ /g, "");  // "grno202666": so "GR" or "GR202666" also match
  });
  searchEntries = entries;
  return entries;
}

// The matching cases and rules for what she typed, best first.
function searchCatalog(query) {
  const words = searchKey(query).split(" ").filter(Boolean);
  if (words.length === 0) { return []; }
  const found = [];
  getSearchEntries().forEach(function (e, order) {
    // Words: anywhere, also across punctuation ("gr" in "G.R."). Numbers: only inside a number,
    // so "91" doesn't match "07-9-12".
    const all = words.every(function (w) {
      return e.key.indexOf(w) !== -1 || (/[a-z]/.test(w) && e.joined.indexOf(w) !== -1);
    });
    if (!all) { return; }
    const starts = words.every(function (w) { return e.key.indexOf(" " + w) !== -1; });
    found.push({ entry: e, rank: starts ? 0 : 1, order: order });
  });
  found.sort(function (a, b) { return a.rank - b.rank || a.order - b.order; });
  return found.map(function (f) { return f.entry; });
}

// A result card for a rule (cases use makeCaseCard): title, citation · subject, Unverified label.
function makeRuleCard(rule, onTap) {
  const card = document.createElement("button");
  card.className = "subject-card";
  const name = document.createElement("span");
  name.className = "subject-name";
  name.append(rule.title || "Untitled rule");
  name.appendChild(cardDetail(["Rule", rule.number, rule.subject].filter(Boolean).join(" · "), rule.status === "verified"));
  const arrow = document.createElement("span");
  arrow.className = "subject-arrow";
  arrow.textContent = "›";
  card.append(name, arrow);
  card.addEventListener("click", onTap);
  return card;
}

let contentLoaded = false;  // the catalog has been read (until then, don't say "Not in the app yet")

function showSearchResults() {
  const query = document.getElementById("search-input").value;
  const list = document.getElementById("search-results");
  const count = document.getElementById("search-count");
  const empty = document.getElementById("search-empty");
  list.innerHTML = "";
  count.hidden = true;
  empty.hidden = true;
  if (!searchKey(query) || !contentLoaded) { return; }
  const results = searchCatalog(query);
  if (results.length === 0) {
    const lookup = document.getElementById("search-lookup");
    lookup.innerHTML = "";
    const link = makeLookupOnline(query, "Look it up online", false);
    if (link) { lookup.appendChild(link); }
    empty.hidden = false;
    return;
  }
  results.slice(0, SEARCH_SHOW_AT_MOST).forEach(function (e) {
    if (e.kind === "case") {
      list.appendChild(makeCaseCard(e.item, function () { openSearchResult(e); }, e.item.subject));
    } else {
      list.appendChild(makeRuleCard(e.item, function () { openSearchResult(e); }));
    }
  });
  count.textContent = results.length > SEARCH_SHOW_AT_MOST
    ? "Showing " + SEARCH_SHOW_AT_MOST + " of " + results.length + ". Type more to narrow it down."
    : (results.length === 1 ? "1 match" : results.length + " matches");
  count.hidden = false;
}

function openSearchResult(e) {
  const found = e.kind === "case" ? findCase(e.item.id) : findRule(e.item.id);
  if (!found) { return; }  // listed in the catalog but its file didn't load (the app shows why at the top)
  if (e.kind === "case") { openCase(found, "search"); } else { openRule(found, "search"); }
}

// Back from a case or rule opened from the search: the home screen, results still showing.
function backToSearch() {
  showScreen("screen-home");
  showSearchResults();
  document.querySelector(".home-search").scrollIntoView({ block: "start" });
}

document.getElementById("search-input").addEventListener("input", showSearchResults);
// Return / Search on the keyboard: close the keyboard so the results can be seen.
document.getElementById("search-input").addEventListener("keydown", function (event) {
  if (event.key === "Enter") { event.preventDefault(); event.target.blur(); }
});

// ---------- "Look it up online" ----------
// A link to an ordinary web search for a case on LawPhil, e.g. "G.R. No. 202666" site:lawphil.net.
// Only a link she taps herself: the app never downloads anything from those sites, and
// never guesses a site's own page addresses (a search keeps working if a site reorganizes).
// It opens in a new tab, so the app stays where it was.
// Offline, the link is replaced by "You're offline. This needs internet." (and comes back
// by itself when she's online again).
// Used on the case screen ("Find the official text online"); search will use it too.
const LOOKUP_SITE = "lawphil.net";

function lookupSearchUrl(words) {
  return "https://www.google.com/search?q=" +
    encodeURIComponent("\"" + words.replace(/"/g, "") + "\" site:" + LOOKUP_SITE);
}

// words: the G.R. number (best) or the case title. small: the lighter, smaller version.
// Returns the block to add to the page, or null if there's nothing to look up.
function makeLookupOnline(words, label, small) {
  words = typeof words === "string" ? words.trim() : "";
  if (!words) { return null; }
  const block = document.createElement("div");
  block.className = "online-lookup";
  const link = document.createElement("a");
  link.className = "btn btn-secondary" + (small ? " btn-small" : "");
  link.href = lookupSearchUrl(words);
  link.target = "_blank";
  link.rel = "noopener";
  link.textContent = label;
  const offline = document.createElement("p");
  offline.className = "lookup-offline";
  offline.textContent = "You're offline. This needs internet.";
  const note = document.createElement("p");
  note.className = "lookup-note";
  note.textContent = "Always check the official text. The app may not have every decision.";
  // If the connection dropped since the screen was drawn, show the message instead of opening.
  link.addEventListener("click", function (event) {
    if (navigator.onLine === false) {
      event.preventDefault();
      showLookupState();
    }
  });
  block.append(link, offline, note);
  showLookupState(block);
  return block;
}

// Show the link or the offline message, in one block or in every block on the page.
function showLookupState(oneBlock) {
  const offline = navigator.onLine === false;
  const blocks = oneBlock ? [oneBlock] : document.querySelectorAll(".online-lookup");
  blocks.forEach(function (block) {
    block.querySelector("a").hidden = offline;
    block.querySelector(".lookup-offline").hidden = !offline;
  });
}
window.addEventListener("online", function () { showLookupState(); });
window.addEventListener("offline", function () { showLookupState(); });

function openCase(theCase, cameFrom) {
  caseCameFrom = cameFrom;
  if (cameFrom !== "question") { caseHome = cameFrom; }
  currentCase = theCase;
  if (cameFrom === "question") { questionScrollSpot = window.scrollY; }

  document.getElementById("case-subject").textContent =
    [theCase.subject, theCase.topic, subtopicOf(theCase)].filter(Boolean).join(" · ");
  document.getElementById("case-name").textContent = theCase.name || "Untitled case";
  document.getElementById("case-number").textContent =
    [theCase.grNumber, theCase.year].filter(Boolean).join(" · ");
  // Anything not marked "verified" (including a missing status) shows the draft label.
  document.getElementById("case-draft-badge").hidden = (theCase.status === "verified");
  setHighlightableText(document.getElementById("case-facts"), caseText(theCase.facts), theCase.id + ":facts");
  setHighlightableText(document.getElementById("case-issue"), caseText(theCase.issue), theCase.id + ":issue");
  setHighlightableText(document.getElementById("case-ruling"), caseText(theCase.ruling), theCase.id + ":ruling");
  setRichText(document.getElementById("case-doctrine"), caseText(theCase.keyDoctrine));
  showNotesBox(document.getElementById("case-notes"), theCase.id);

  // Source: a tappable link if it's a web address, otherwise plain text.
  const source = document.getElementById("case-source");
  source.innerHTML = "";
  const url = typeof theCase.sourceUrl === "string" ? theCase.sourceUrl.trim() : "";
  if (/^https?:\/\//i.test(url)) {
    const link = document.createElement("a");
    link.className = "source-link";
    link.href = url;
    link.target = "_blank";
    link.rel = "noopener";
    link.textContent = "Read the full decision ›";
    const note = document.createElement("span");
    note.className = "source-note";
    note.textContent = url + " (needs internet)";
    source.append(link, note);
  } else {
    source.textContent = url || "Not available yet.";
  }
  const lookup = document.getElementById("case-lookup");
  lookup.innerHTML = "";
  const lookupLink = makeLookupOnline(theCase.grNumber || theCase.name, "Find the official text online", true);
  if (lookupLink) { lookup.appendChild(lookupLink); }

  resetFullText();
  showCaseQuestions(theCase);
  showScreen("screen-case");
}

// ---------- Full text of the decision ----------
// The decision's caption (the parties' names, e.g. "CECILIA ZULUETA, petitioner, vs.
// COURT OF APPEALS and ALFREDO MARTIN, respondents.") gets the shared case-title style.
// It's found in the opening lines: every paragraph after a "G.R. No." / "A.C. No." line
// and before the "DECISION" or "RESOLUTION" heading (a decision covering two cases has
// two captions, each after its own number line). The text itself isn't changed: the
// caption's words just get the case-title class, so her highlights stay where they are.
function captionWordRanges(text) {
  const paragraphs = text.split(/\n\n/);
  const heading = paragraphs.slice(0, 40).findIndex(function (p) {
    return /^\s*(D ?E ?C ?I ?S ?I ?O ?N|R ?E ?S ?O ?L ?U ?T ?I ?O ?N)\s*$/.test(p);
  });
  if (heading === -1) { return []; }  // not the usual layout: leave it plain
  const isNumberLine = function (p) { return /^\s*\[?\s*(G\.R\.|A\.C\.)\s+Nos?\./.test(p); };
  const ranges = [];
  let wordCount = 0;      // words before the current paragraph
  let afterNumber = false;
  for (let i = 0; i < heading; i++) {
    const words = paragraphs[i].split(/\s+/).filter(Boolean).length;
    if (isNumberLine(paragraphs[i])) {
      afterNumber = true;
    } else if (afterNumber && words > 0) {
      ranges.push({ first: wordCount, last: wordCount + words - 1 });
    }
    wordCount += words;
  }
  return ranges;
}

function markCaption(box, text) {
  const words = box.querySelectorAll(".hl-word");
  captionWordRanges(text).forEach(function (r) {
    for (let n = r.first; n <= r.last && n < words.length; n++) { words[n].classList.add("case-title"); }
  });
}

// Download one case's full text (data/case-texts/case-0001.txt). Used by the
// "Read the full text" button and by "Find in case". Gives back the text, or fails with
// "missing" (no file for this case) or another error (for example, offline).
function loadCaseText(caseId) {
  // Only IDs like "case-0001" are used to build the file name (bad content can't point elsewhere).
  if (typeof caseId !== "string" || !/^case-\d+$/.test(caseId)) {
    return Promise.reject(new Error("missing"));
  }
  return fetch("data/case-texts/" + caseId + ".txt").then(function (response) {
    if (response.status === 404) { throw new Error("missing"); }
    if (!response.ok) { throw new Error("status " + response.status); }
    return response.text();
  }).then(function (text) {
    if (!text.trim()) { throw new Error("missing"); }
    return text;
  });
}

// Each case's full text is its own file: data/case-texts/case-0001.txt, and so on.
// It's only downloaded when she taps "Read the full text", never when the case opens,
// so cases she never reads take no space or loading time. Once read, the phone keeps
// a copy (see sw.js), so that case's full text also works offline.
let fullTextShown = false;

function resetFullText() {
  fullTextShown = false;
  const button = document.getElementById("full-text-btn");
  button.textContent = "Read the full text";
  button.disabled = false;
  document.getElementById("full-text-note").hidden = true;
  const box = document.getElementById("full-text");
  box.hidden = true;
  box.textContent = "";
  delete box.dataset.hlKey;
  document.getElementById("full-text-credit").hidden = true;
  document.getElementById("hl-palette").hidden = true;
}

function showFullTextNote(text) {
  const note = document.getElementById("full-text-note");
  note.textContent = text;
  note.hidden = false;
}

document.getElementById("full-text-btn").addEventListener("click", function () {
  const button = document.getElementById("full-text-btn");
  const box = document.getElementById("full-text");

  // Already showing: this button hides it again.
  if (fullTextShown) {
    resetFullText();
    return;
  }

  const theCase = currentCase;
  if (!theCase) { return; }

  button.disabled = true;
  button.textContent = "Loading…";
  document.getElementById("full-text-note").hidden = true;

  loadCaseText(theCase.id)
    .then(function (text) {
      if (currentCase !== theCase) { return; }  // she already opened a different case
      // Tap or drag to highlight, like the summary. Saved as e.g. "case-0001:fulltext".
      // (Shown as plain text only: nothing in the file can run as code.)
      setHighlightableText(box, text, theCase.id + ":fulltext", true);
      markCaption(box, text);  // the parties' names at the top: shared case-title style
      box.hidden = false;
      document.getElementById("full-text-credit").hidden = false;
      document.getElementById("hl-palette").hidden = false;
      fullTextShown = true;
      button.disabled = false;
      button.textContent = "Hide the full text";
    })
    .catch(function (error) {
      if (currentCase !== theCase) { return; }
      button.disabled = false;
      button.textContent = "Read the full text";
      if (error.message === "missing") {
        showFullTextNote("The full text for this case hasn't been added yet.");
      } else if (navigator.onLine === false || error instanceof TypeError) {
        showFullTextNote("Couldn't load the full text. You may be offline, and this case's full text hasn't been opened on this phone before.\nConnect to the internet and tap again. After that, it will work offline too.");
      } else {
        showFullTextNote("Couldn't load the full text right now. Please try again in a moment.");
      }
    });
});

// "Questions linked to this case": tap one to practice it.
function showCaseQuestions(theCase) {
  const list = document.getElementById("case-questions");
  list.innerHTML = "";
  const linked = allQuestions.filter(function (q) {
    return q && Array.isArray(q.caseIds) && q.caseIds.includes(theCase.id);
  });
  linked.forEach(function (question) {
    const card = document.createElement("button");
    card.className = "subject-card";
    const text = document.createElement("span");
    text.className = "subject-name";
    const prompt = plainText(question.prompt).replace(/\s+/g, " ").trim();
    // A short preview, cut at the end of a whole word.
    text.textContent = prompt.length > 110 ? prompt.slice(0, 110).replace(/\s+\S*$/, "") + "…" : prompt;
    text.appendChild(cardDetail(question.type === "mcq" ? "Multiple choice" : "Essay", question.status === "verified"));
    const arrow = document.createElement("span");
    arrow.className = "subject-arrow";
    arrow.textContent = "›";
    card.append(text, arrow);
    card.addEventListener("click", function () {
      fixedQuestions = [question];
      practiceCase = theCase;
      currentSubject = question.subject;
      currentTopic = question.topic;
      startPractice();
    });
    list.appendChild(card);
  });
  document.getElementById("case-questions-empty").hidden = (linked.length !== 0);
}

document.getElementById("case-back").addEventListener("click", function () {
  if (caseCameFrom === "question") {
    showScreen("screen-question");
    window.scrollTo(0, questionScrollSpot);  // back to the same spot, answer still showing
  } else if (caseCameFrom === "topic") {
    openTopicOrSubject();  // back to the topic screen she opened it from
  } else if (caseCameFrom === "notes") {
    openNotes();  // back to her notes list
  } else if (caseCameFrom === "search") {
    backToSearch();  // back to the home screen, search results still showing
  } else {
    openSubject(currentSubject);
  }
});

// ---------- Home: back up and restore progress ----------
function showBackupMessage(text, isProblem) {
  const message = document.getElementById("backup-message");
  message.textContent = text;
  message.className = "backup-message " + (isProblem ? "problem" : "ok");
  message.hidden = false;
}

// A file name with today's date, like bar-reviewer-progress-2026-11-15.json
function backupFileName() {
  const d = new Date();
  const pad = function (n) { return String(n).padStart(2, "0"); };
  return "bar-reviewer-progress-" + d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) + ".json";
}

// On a computer: save the file to the Downloads folder.
function downloadFile(text, name) {
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
}

// On iPhone (also inside the home-screen app), a normal download often doesn't work,
// so we open the Share menu instead, where she can tap "Save to Files".
function shareableFile(text, name) {
  if (!navigator.canShare || navigator.maxTouchPoints === 0) { return null; }  // not a phone/tablet
  const types = ["application/json", "text/plain"];
  for (let i = 0; i < types.length; i++) {
    try {
      const file = new File([text], name, { type: types[i] });
      if (navigator.canShare({ files: [file] })) { return file; }
    } catch (e) {
      // This phone can't make files this way; try the next type.
    }
  }
  return null;
}

document.getElementById("backup-btn").addEventListener("click", function () {
  document.getElementById("backup-message").hidden = true;
  const text = progressBackupText();
  const name = backupFileName();
  const file = shareableFile(text, name);

  if (file) {
    navigator.share({ files: [file] })
      .then(function () {
        showBackupMessage("Backup shared. If you chose Save to Files, it's saved as " + name + ".");
      })
      .catch(function (error) {
        if (error && error.name === "AbortError") { return; }  // she closed the Share menu
        showBackupMessage("Couldn't make the backup. Please try again.", true);
      });
    return;
  }

  try {
    downloadFile(text, name);
    showBackupMessage("Backup saved to your Downloads folder as " + name + ".");
  } catch (e) {
    showBackupMessage("Couldn't make the backup on this device.", true);
  }
});

function describeDate(date) {
  if (!date) { return "an unknown date"; }
  return date.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

document.getElementById("restore-input").addEventListener("change", function (event) {
  const input = event.target;
  const file = input.files && input.files[0];
  input.value = "";  // so the same file can be picked again later
  if (!file) { return; }
  document.getElementById("backup-message").hidden = true;

  if (file.size > 5 * 1024 * 1024) {
    showBackupMessage("That file is too big to be a Bar Reviewer backup. Nothing was changed.", true);
    return;
  }

  const reader = new FileReader();
  reader.onerror = function () {
    showBackupMessage("Couldn't open that file. Nothing was changed.", true);
  };
  reader.onload = function () {
    const backup = readBackup(String(reader.result));
    if (backup.error) {
      showBackupMessage(backup.error, true);
      return;
    }
    const sure = window.confirm(
      "Replace the progress on this phone with the backup from " + describeDate(backup.savedAt) + "?\n\n" +
      "Your current scores, review list, bookmarks, color tags, study streak, and notes will be replaced."
    );
    if (!sure) {
      showBackupMessage("Restore cancelled. Nothing was changed.");
      return;
    }
    if (restoreProgress(backup.progress)) {
      showTodayCard();  // the restored streak and today's count
      showMyNotesButton();  // and the restored notes
      showBackupMessage("Progress restored from the backup of " + describeDate(backup.savedAt) + ".");
    } else {
      showBackupMessage("Loaded the backup, but this phone wouldn't save it. Private browsing may be on.", true);
    }
  };
  reader.readAsText(file);
});

// ---------- Start the app ----------
buildHome();
buildSidebar();
updateSidebar();
showTodayCard();

// If she was somewhere else when the app last closed, don't flash the home screen
// while the files load; restoreSpot() below shows the right screen.
if (loadSpot()) { document.getElementById("screen-home").hidden = true; }

// Questions and cases: data/catalog.json lists one file per topic
// (data/content/<subject>/<topic>.json), each holding that topic's "questions" and "cases".
// All of them are loaded now. A topic file that can't be loaded is reported by name,
// and the other topics still work.
function fetchJson(file) {
  return fetch(file).then(function (response) {
    if (!response.ok) { throw new Error("status " + response.status); }
    return response.json();
  });
}

// "q-0012" → 12, so everything is kept in ID order whatever order the files load in.
function idNumber(item) {
  return parseInt(String(item.id).replace(/\D/g, ""), 10) || 0;
}

const contentReady = fetchJson("data/catalog.json")
  .then(function (catalog) {
    if (!catalog || !Array.isArray(catalog.topics)) { throw new Error("no list of topics"); }
    const isEntry = function (x) { return x && typeof x === "object" && typeof x.id === "string"; };
    catalogCases = Array.isArray(catalog.cases) ? catalog.cases.filter(isEntry) : [];
    catalogRules = Array.isArray(catalog.rules) ? catalog.rules.filter(isEntry) : [];
    const questions = [];
    const cases = [];
    return Promise.all(catalog.topics.map(function (entry) {
      if (!entry || typeof entry.file !== "string") { return null; }
      return fetchJson(entry.file).then(function (data) {
        if (!data || typeof data !== "object") { throw new Error("not a topic file"); }
        if (Array.isArray(data.questions)) { questions.push.apply(questions, data.questions); }
        if (Array.isArray(data.cases)) { cases.push.apply(cases, data.cases); }
      }).catch(function () {
        showLoadError("Couldn't load " + entry.subject + " → " + entry.topic + " (" + entry.file + "), " +
          "so its questions and cases won't show. The file may have a typo.");
      });
    })).then(function () {
      allQuestions = questions.filter(function (q) { return q && typeof q === "object"; })
        .sort(function (a, b) { return idNumber(a) - idNumber(b); });
      allCases = cases.filter(function (c) { return c && typeof c === "object" && c.id; })
        .sort(function (a, b) { return idNumber(a) - idNumber(b); });
    });
  })
  .catch(function () {
    showLoadError(
      "Couldn't load the list of topics (data/catalog.json), so no questions or cases can show. " +
      "If you opened this by double-clicking, start the local server instead. " +
      "Otherwise, the file may have a typo.");
  });

// Show a loading problem at the top of the app (several can show at once).
// Once everything has loaded (or failed), put her back where she was.
const rulesReady = fetch("data/rules.json")
  .then(function (response) {
    if (!response.ok) { throw new Error("status " + response.status); }
    return response.json();
  })
  .then(function (data) {
    if (!Array.isArray(data)) { throw new Error("not a list"); }
    allRules = data.filter(function (r) {
      return r && typeof r === "object" && typeof r.id === "string" && typeof r.number === "string";
    });
  })
  .catch(function () {
    showLoadError("Couldn't load the list of rules (data/rules.json), so \"Read the full rule\" won't show. The file may have a typo.");
  });

Promise.all([contentReady, rulesReady]).then(function () {
  contentLoaded = true;
  showSearchResults();  // she may have typed in the search while the files were loading
  showTodayCard();  // now that the questions are in, the mastery count can be shown
  showMyNotesButton();  // ...and her notes can be matched to their cases and rules
  restoreSpot();
});

function showLoadError(text) {
  const error = document.getElementById("load-error");
  error.textContent = error.hidden ? text : error.textContent + "\n\n" + text;
  error.hidden = false;
}

// ---------- Offline support ----------
// Register the service worker (sw.js), which saves the app's files on the phone.
// When a new version of the app has been installed, the page reloads once so she gets
// it, but only at a safe moment, never in the middle of a question:
//   - safe: the home, subject, sub-topic or results screen, or a question she hasn't
//     touched yet (she just arrived with "Next");
//   - wait: she's partway through a question (picked a level or a choice, revealed an
//     answer, checked a key point, rated), she's reading a case, the Find in case panel
//     is open, she's dragging to highlight, or she's typing in a text box.
// Until then the update waits, and it's applied at the next safe moment (usually when she
// taps "Next"). The reload puts her back on the same spot (rememberSpot / restoreSpot).
let reloadingForUpdate = false;

function safeToReload() {
  if (typeof sheetOpen !== "undefined" && sheetOpen) { return false; }   // Find in case panel
  if (mouseIsDown) { return false; }                                      // dragging to highlight
  const focused = document.activeElement;
  if (focused && (focused.tagName === "TEXTAREA" || focused.isContentEditable ||
      (focused.tagName === "INPUT" && /^(text|search|email|number|password|url|tel)$/.test(focused.type)))) {
    return false;                                                         // typing
  }
  if (shownScreen === "screen-question") {
    return !session || !session.current || Object.keys(session.current).length === 0;
  }
  if (shownScreen === "screen-case" || shownScreen === "screen-rule") { return false; }  // reading: wait until she leaves
  return true;
}

function reloadForUpdateIfSafe() {
  if (!updateWaiting || reloadingForUpdate || !safeToReload()) { return; }
  reloadingForUpdate = true;
  rememberSpot();            // save exactly where she is first
  window.location.reload();
}

if ("serviceWorker" in navigator) {
  const hadOldVersion = Boolean(navigator.serviceWorker.controller);
  navigator.serviceWorker.addEventListener("controllerchange", function () {
    // (On the very first visit there's no old version, so nothing to reload.)
    if (hadOldVersion) {
      updateWaiting = true;
      reloadForUpdateIfSafe();
    }
  });
  navigator.serviceWorker.register("sw.js", { updateViaCache: "none" }).then(function (registration) {
    // An app opened from the home screen often just comes back from the background,
    // which doesn't check for a new version. So check each time she comes back to it.
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "visible") { registration.update().catch(function () {}); }
    });
  }).catch(function () {
    // If this fails (for example, when opened by double-click), the app still works online.
  });
}

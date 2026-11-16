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

let allQuestions = [];      // filled in from data/questions.json
let allCases = [];          // filled in from data/cases.json
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
let currentCase = null;           // the case on the case screen

// iPhone Safari only shows a button's "pressed" look (the CSS :active style) if the page
// listens for finger touches. This empty listener switches that on; it does nothing else.
document.addEventListener("touchstart", function () {}, { passive: true });

// ---------- Switching screens ----------
// Only one screen is visible at a time.
function showScreen(id) {
  ["screen-home", "screen-subject", "screen-subtopics", "screen-question", "screen-results", "screen-case"].forEach(function (screenId) {
    document.getElementById(screenId).hidden = (screenId !== id);
  });
  window.scrollTo(0, 0);
  shownScreen = id;
  rememberSpot();
}

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
      current: session.current,  // what she's done on this question: her pick, or answer shown, rating, checked key points
      practiceCaseId: practiceCase ? practiceCase.id : null
    };
  }
  if (shownScreen === "screen-case" && currentCase) {
    spot.caseId = currentCase.id;
    spot.caseCameFrom = caseCameFrom;
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

  // Rebuild the round, if there was one. If its questions have changed since, skip it.
  const roundOk = spot.round ? putBackRound(spot.round) : false;

  if (spot.screen === "question") {
    if (!roundOk) { openSubtopicsOrSubject(); }
    return true;
  }
  if (spot.screen === "case") {
    const theCase = findCase(spot.caseId);
    if (!theCase) {
      openSubject(currentSubject);
    } else {
      openCase(theCase, (spot.caseCameFrom === "question" && roundOk) ? "question" : "subject");
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
    fbCorrect: wholeNumberOrZero(round.fbCorrect)
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
    if (FB_LEVELS.indexOf(saved.fbLevel) !== -1) {
      // The same level, and the same blanks filled in for her, as before the reload.
      applyFbLevel(question, saved.fbLevel, Array.isArray(saved.fbShown) ? saved.fbShown : []);
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

// Friendly messages for when one of her lists is empty.
const EMPTY_LIST_MESSAGES = {};
EMPTY_LIST_MESSAGES[REVIEW_MISSED] =
  "Nothing to review yet. Questions you get wrong, or rate Partly or Missed it, will show up here.";
EMPTY_LIST_MESSAGES[BOOKMARKED] =
  "No bookmarks yet. Tap ☆ Bookmark on any question to save it here.";

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
  return [ALL_TOPICS, REVIEW_MISSED, BOOKMARKED].indexOf(topic) === -1;
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
  document.getElementById("subtopics-empty").hidden = true;

  const choices = [ALL_SUBTOPICS].concat(subtopicsFor(subject, topic));
  if (questionsFor(subject).some(function (q) { return q.topic === topic && subtopicOf(q) === null; })) {
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
    card.addEventListener("click", function () {
      currentSubtopic = subtopic;
      fixedQuestions = null;
      practiceCase = null;
      startPractice();
    });
    list.appendChild(card);
  });
  showScreen("screen-subtopics");
}

// Back to where a round came from: the sub-topic picker, or the subject screen.
function openSubtopicsOrSubject() {
  if (currentSubtopic !== null && isRealTopic(currentTopic) && subtopicsFor(currentSubject, currentTopic).length > 0) {
    openSubtopics(currentTopic);
  } else {
    openSubject(currentSubject);
  }
}

document.getElementById("subtopics-back").addEventListener("click", function () {
  openSubject(currentSubject);
});

// List of topics in a subject, in the order they first appear in the file.
function topicsFor(subject) {
  const topics = [];
  questionsFor(subject).forEach(function (q) {
    if (!topics.includes(q.topic)) { topics.push(q.topic); }
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
    // A topic with sub-topics: pick one first.
    if (isRealTopic(topic) && subtopicsFor(subject, topic).length > 0) {
      openSubtopics(topic);
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
  showSubjectCases(subject);
  showScreen("screen-subject");
}

// Her lists and the topic cards on the subject screen (rebuilt when the question type changes).
function showTopicCards(subject) {
  // Her two lists: "Review missed" and "Bookmarked".
  const myLists = document.getElementById("my-lists");
  myLists.innerHTML = "";
  [REVIEW_MISSED, BOOKMARKED].forEach(function (name) {
    myLists.appendChild(makeTopicCard(subject, name));
  });

  // One card per topic, with "All topics" first.
  const list = document.getElementById("topic-list");
  list.innerHTML = "";
  [ALL_TOPICS].concat(topicsFor(subject)).forEach(function (topic) {
    list.appendChild(makeTopicCard(subject, topic));
  });
}

// The "Cases" list on the subject screen: one card per case in this subject.
function showSubjectCases(subject) {
  const list = document.getElementById("case-list");
  list.innerHTML = "";
  const cases = allCases.filter(function (c) { return c.subject === subject; });
  cases.forEach(function (theCase) {
    list.appendChild(makeCaseCard(theCase, function () { openCase(theCase, "subject"); }));
  });
  document.getElementById("case-empty").hidden = (cases.length !== 0);
}

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
function makeCaseCard(theCase, onTap) {
  const card = document.createElement("button");
  card.className = "subject-card";
  const name = document.createElement("span");
  name.className = "subject-name";
  name.appendChild(caseTitle(theCase.name));
  name.appendChild(cardDetail([theCase.grNumber, theCase.year].filter(Boolean).join(" · "), theCase.status === "verified"));
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
    if (currentSubtopic !== null) {
      const picked = currentSubtopic;
      openSubtopics(currentTopic);
      const note = document.getElementById("subtopics-empty");
      const mode = currentMode();
      note.textContent = mode === "both" ? "No questions here yet."
        : noneOfMode(mode) + " in " + subtopicLabel(picked, currentTopic) +
          ". Pick All under Question type (on the subject screen) to see the others.";
      note.hidden = false;
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
    fbCorrect: 0
  };
  showQuestion();
}

// ---------- Screen 3: Practice ----------
function showQuestion() {
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
  document.getElementById("fb-level-note").hidden = true;
  // Anything not marked "verified" (including a missing status) shows the draft label.
  document.getElementById("draft-badge").hidden = (question.status === "verified");
  showBookmark(question);
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
// "fullText" is the same text with nothing blanked out.
// 1. She picks how much is filled in for her: 0% (every blank empty, hardest), 25%,
//    50% or 75% (most blanks filled in, easiest). The text appears once she picks.
//    That share of the blanks, picked at random, is shown filled in (lighter, dotted
//    underline); at least one blank always stays empty.
// 2. She recalls the rest, then taps "Show answer": the full text, with every word that
//    was blanked out in bold and underlined.
// 3. She rates herself Got it / Missed it. That decides Review missed and her score.
const FB_LEVELS = [0, 25, 50, 75];
const FB_RATINGS = ["Got it", "Missed it"];
const BLANK = /_{4,}/;

function showFillBlank(question) {
  // Make the blanks in the question stand out (each blank is one word for highlighting).
  document.querySelectorAll("#prompt .hl-word").forEach(function (word) {
    if (BLANK.test(word.textContent)) { word.classList.add("fb-blank"); }
  });
  const full = typeof question.fullText === "string" ? question.fullText : "";
  setRichText(document.getElementById("fb-full"),
    full ? withAnswersMarked(question.prompt, full) : "The full text for this item hasn't been added yet.");

  // Start: only the level choice. The text, "Show answer" and the answer stay hidden.
  document.getElementById("prompt").hidden = true;
  document.getElementById("fb-level").hidden = false;
  document.getElementById("fb-show").hidden = true;
  document.getElementById("fb-answer-area").hidden = true;
  document.getElementById("fb-result").hidden = true;
  document.querySelectorAll(".btn-fbrate").forEach(function (b) {
    b.classList.remove("selected");
    b.disabled = false;
  });
}

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

// The full text with the words that filled each blank wrapped in **…** (shown bold).
// If anything doesn't line up (or the text already uses **), the full text unmarked.
function withAnswersMarked(prompt, full) {
  if (full.indexOf("**") !== -1 || (typeof prompt === "string" && prompt.indexOf("**") !== -1)) { return full; }
  const answers = blankAnswers(prompt, full);
  if (!answers) { return full; }
  const pieces = prompt.split(/_{4,}/);
  let marked = pieces[0];
  answers.forEach(function (answer, i) { marked += "**" + answer + "**" + pieces[i + 1]; });
  return marked;
}

// Which blanks to show filled in at a level: that share of them (rounded down), picked
// at random, always leaving at least one empty. Gives back their numbers (0 = first).
function pickShownBlanks(count, level) {
  const howMany = Math.min(count - 1, Math.floor(count * level / 100));
  const order = shuffled(Array.from({ length: count }, function (_, i) { return i; }));
  return order.slice(0, Math.max(0, howMany)).sort(function (a, b) { return a - b; });
}

// Show the text at the picked level, with the blanks numbered in "shown" filled in.
// Each blank stays one word (filled in or not), so her highlights stay on the same words.
function applyFbLevel(question, level, shown) {
  const answers = blankAnswers(question.prompt, question.fullText);
  const blanks = document.querySelectorAll("#prompt .fb-blank");
  const canFill = answers && answers.length === blanks.length;
  const filled = [];
  if (canFill) {
    shown.forEach(function (n) {
      if (typeof n !== "number" || !blanks[n] || filled.indexOf(n) !== -1) { return; }
      blanks[n].textContent = blanks[n].textContent.replace(BLANK, answers[n]);
      blanks[n].classList.remove("fb-blank");
      blanks[n].classList.add("fb-given");
      filled.push(n);
    });
  }
  session.current.fbLevel = level;
  session.current.fbShown = filled;
  const total = blanks.length;
  document.getElementById("prompt").hidden = false;
  document.getElementById("fb-level").hidden = true;
  const note = document.getElementById("fb-level-note");
  note.textContent = level + "% filled in for you: " + (total - filled.length) + " of " + total +
    (total === 1 ? " blank" : " blanks") + " to fill.";
  note.hidden = false;
  document.getElementById("fb-show").hidden = false;
}

document.querySelectorAll(".btn-fb-level").forEach(function (button) {
  button.addEventListener("click", function () {
    const question = session.questions[session.index];
    const level = Number(button.dataset.level);
    const count = document.querySelectorAll("#prompt .fb-blank").length;
    applyFbLevel(question, level, pickShownBlanks(count, level));
    rememberSpot();
  });
});

// "Show answer" reveals the full text and the Got it / Missed it buttons.
function revealFillBlank() {
  document.getElementById("fb-answer-area").hidden = false;
  document.getElementById("fb-show").hidden = true;
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
    recordFillBlank(session.questions[session.index], rating);  // save on the phone
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
    openCase(practiceCase, "subject");  // she came from a case: go back to it
  } else {
    openSubtopicsOrSubject();  // back to the sub-topic picker, or the subject screen
  }
});

// --- "Read the case" buttons: one for each case this question links to ---
function showQuestionCases(question) {
  const box = document.getElementById("question-cases");
  box.innerHTML = "";
  const ids = Array.isArray(question.caseIds) ? question.caseIds : [];
  ids.forEach(function (caseId) {
    const theCase = findCase(caseId);
    if (!theCase) { return; }  // a link to a case that isn't in cases.json: just skip it
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
let caseCameFrom = null;       // "question" or "subject"
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
function richText(value, highlighted, noLists) {
  let text = (value === null || value === undefined) ? "" : String(value);
  text = text.split(LIST_MARK).join("");  // the marker character is ours alone
  if (!noLists) { text = markLists(text); }
  const fragment = document.createDocumentFragment();
  let wordNumber = 0;

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
  // The drag preview uses the picked color (see style.css).
  const box = document.getElementById("full-text");
  HIGHLIGHT_COLORS.forEach(function (c) { box.classList.toggle("hl-active-" + c, c === color); });
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

["prompt", "case-facts", "case-issue", "case-ruling", "full-text"].forEach(makeHighlightable);

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
  mouseIsDown = (event.pointerType === "mouse");
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

function openCase(theCase, cameFrom) {
  caseCameFrom = cameFrom;
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
      "Your current scores, review list, and bookmarks will be replaced."
    );
    if (!sure) {
      showBackupMessage("Restore cancelled. Nothing was changed.");
      return;
    }
    if (restoreProgress(backup.progress)) {
      showBackupMessage("Progress restored from the backup of " + describeDate(backup.savedAt) + ".");
    } else {
      showBackupMessage("Loaded the backup, but this phone wouldn't save it. Private browsing may be on.", true);
    }
  };
  reader.readAsText(file);
});

// ---------- Start the app ----------
buildHome();

// If she was somewhere else when the app last closed, don't flash the home screen
// while the files load; restoreSpot() below shows the right screen.
if (loadSpot()) { document.getElementById("screen-home").hidden = true; }

const questionsReady = fetch("data/questions.json")
  .then(function (response) {
    if (!response.ok) { throw new Error("status " + response.status); }
    return response.json();
  })
  .then(function (data) {
    if (!Array.isArray(data)) { throw new Error("not a list"); }
    allQuestions = data;
  })
  .catch(function () {
    showLoadError(
      "Couldn't load the questions file (data/questions.json). " +
      "If you opened this by double-clicking, start the local server instead. " +
      "Otherwise, the file may have a typo.");
  });

const casesReady = fetch("data/cases.json")
  .then(function (response) {
    if (!response.ok) { throw new Error("status " + response.status); }
    return response.json();
  })
  .then(function (data) {
    if (!Array.isArray(data)) { throw new Error("not a list"); }
    allCases = data.filter(function (c) { return c && typeof c === "object" && c.id; });
  })
  .catch(function () {
    showLoadError("Couldn't load the cases file (data/cases.json), so cases can't be opened. The file may have a typo.");
  });

// Show a loading problem at the top of the app (several can show at once).
// Once both files have loaded (or failed), put her back where she was.
Promise.all([questionsReady, casesReady]).then(restoreSpot);

function showLoadError(text) {
  const error = document.getElementById("load-error");
  error.textContent = error.hidden ? text : error.textContent + "\n\n" + text;
  error.hidden = false;
}

// ---------- Offline support ----------
// Register the service worker (sw.js), which saves the app's files on the phone.
// When a new version is installed, reload once so she sees it right away.
if ("serviceWorker" in navigator) {
  const hadOldVersion = Boolean(navigator.serviceWorker.controller);
  let reloaded = false;
  navigator.serviceWorker.addEventListener("controllerchange", function () {
    if (hadOldVersion && !reloaded) {
      reloaded = true;
      window.location.reload();
    }
  });
  navigator.serviceWorker.register("sw.js", { updateViaCache: "none" }).catch(function () {
    // If this fails (for example, when opened by double-click), the app still works online.
  });
}

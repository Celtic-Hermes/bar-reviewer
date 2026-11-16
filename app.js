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
const MISC_SUBJECTS = [
  "Communication Law"
];

let allQuestions = [];      // filled in from data/questions.json
let allCases = [];          // filled in from data/cases.json
let currentSubject = null;  // the subject she tapped
let currentTopic = null;    // the topic she tapped (or "All topics")

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
  ["screen-home", "screen-subject", "screen-question", "screen-results", "screen-case"].forEach(function (screenId) {
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
  if (SUBJECTS.concat(MISC_SUBJECTS).indexOf(spot.subject) === -1) { return false; }
  currentSubject = spot.subject;
  currentTopic = (typeof spot.topic === "string") ? spot.topic : null;

  const shuffleSwitch = document.getElementById("shuffle");
  shuffleSwitch.checked = Boolean(spot.shuffle);
  showShuffleNote();
  setMode(spot.mode);  // older saved spots have no mode: that means "both"

  if (spot.screen === "subject") {
    openSubject(currentSubject);
    return true;
  }

  // Rebuild the round, if there was one. If its questions have changed since, skip it.
  const roundOk = spot.round ? putBackRound(spot.round) : false;

  if (spot.screen === "question") {
    if (!roundOk) { openSubject(currentSubject); }
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
    }
  };
  showQuestion();
  putBackCurrent(round.current);
  return true;
}

// Show what she'd already done on the current question, without counting it again.
function putBackCurrent(saved) {
  if (!isPlainObject(saved)) { return; }
  const question = session.questions[session.index];
  if (question.type === "mcq") {
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
const QUESTION_MODES = ["essay", "mcq", "both"];

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
  if (mode === "essay") { return question.type !== "mcq"; }
  return true;
}

// The count shown on each card, worded for the picked type:
// "6 essay questions", "4 multiple choice", or "10 questions".
function modeCountLabel(n, mode) {
  if (mode === "essay") { return n + (n === 1 ? " essay question" : " essay questions"); }
  if (mode === "mcq") { return n + " multiple choice"; }
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
// keeping only the question type she picked (unless mode is left out).
function questionsForTopic(subject, topic, mode) {
  return questionsFor(subject).filter(function (q) {
    if (mode && !fitsMode(q, mode)) { return false; }
    if (topic === ALL_TOPICS) { return true; }
    if (topic === REVIEW_MISSED) { return Boolean(progress.review[q.id]); }
    if (topic === BOOKMARKED) { return isBookmarked(q.id); }
    return q.topic === topic;
  });
}

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
    fixedQuestions = null;
    practiceCase = null;
    startPractice();
  });
  return card;
}

function openSubject(subject) {
  currentSubject = subject;
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
    const card = document.createElement("button");
    card.className = "subject-card";
    const name = document.createElement("span");
    name.className = "subject-name";
    name.textContent = theCase.name || "Untitled case";
    const detail = document.createElement("span");
    detail.className = "card-detail";
    detail.textContent = [theCase.grNumber, theCase.year, theCase.status === "verified" ? "" : "Draft"]
      .filter(Boolean).join(" · ");
    name.appendChild(detail);
    const arrow = document.createElement("span");
    arrow.className = "subject-arrow";
    arrow.textContent = "›";
    card.append(name, arrow);
    card.addEventListener("click", function () { openCase(theCase, "subject"); });
    list.appendChild(card);
  });
  document.getElementById("case-empty").hidden = (cases.length !== 0);
}

// Show the friendly "this list is empty" message on the subject screen.
function showEmptyListMessage(topic) {
  const note = document.getElementById("list-empty");
  const mode = currentMode();
  const hasOtherTypes = mode !== "both" && questionsForTopic(currentSubject, topic).length > 0;
  if (hasOtherTypes) {
    // There are questions here, just not of the type she picked.
    note.textContent = (mode === "mcq" ? "No multiple choice questions" : "No essay questions") +
      " here. Pick Both under Question type to see the others.";
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
  let questions = fixedQuestions ? fixedQuestions.slice() : questionsForTopic(currentSubject, currentTopic, currentMode());
  if (questions.length === 0) {
    // Empty list: go to (or stay on) the subject screen and explain, instead of starting.
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
    ratings: { "Got it": 0, "Partly": 0, "Missed it": 0 }
  };
  showQuestion();
}

// ---------- Screen 3: Practice ----------
function showQuestion() {
  const question = session.questions[session.index];
  session.current = {};  // nothing done on this question yet
  const isLast = session.index === session.questions.length - 1;

  document.getElementById("progress").textContent =
    "Question " + (session.index + 1) + " of " + session.questions.length;
  document.getElementById("subject").textContent = question.subject;
  document.getElementById("topic").textContent = question.topic;
  setHighlightableText(document.getElementById("prompt"), question.prompt, question.id);
  // Anything not marked "verified" (including a missing status) shows the draft label.
  document.getElementById("draft-badge").hidden = (question.status === "verified");
  showBookmark(question);
  showQuestionCases(question);

  const nextButton = document.getElementById("next-btn");
  nextButton.hidden = true;
  nextButton.textContent = isLast ? "See results" : "Next";

  const isMcq = question.type === "mcq";
  document.getElementById("question-label").textContent = isMcq ? "Multiple choice" : "Essay question";
  document.getElementById("mcq-area").hidden = !isMcq;
  document.getElementById("essay-area").hidden = isMcq;

  if (isMcq) {
    showMcq(question);
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
    label.appendChild(richText(point));
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
    openSubject(currentSubject);
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
    button.textContent = ids.length === 1 ? "Read the case" : "Read the case: " + (theCase.name || "Untitled case");
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
function richText(value, highlighted) {
  const text = (value === null || value === undefined) ? "" : String(value);
  const fragment = document.createDocumentFragment();
  let wordNumber = 0;

  // Add a piece of text to "parent": as plain text, or word by word if highlighting.
  function addText(parent, piece) {
    if (!highlighted) {
      parent.appendChild(document.createTextNode(piece));
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

// Replace what's inside an element with text that may contain **bold** parts.
function setRichText(element, value) {
  element.textContent = "";
  element.appendChild(richText(value));
}

// ---------- Highlighter ----------
// Like setRichText, but each word can be tapped to highlight it (tap again to remove).
// "key" says where her highlights are saved: a question ID, or e.g. "case-0002:facts".
function setHighlightableText(element, value, key) {
  // No ID to save under (bad content)? Show the text normally, without highlighting.
  if (typeof key !== "string" || key === "" || key.indexOf("undefined") === 0) {
    delete element.dataset.hlKey;
    setRichText(element, value);
    return;
  }
  element.textContent = "";
  element.dataset.hlKey = key;
  element.appendChild(richText(value, highlightedWords(key)));
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
      gapsBetween.push(piece);
      if (piece.textContent.indexOf("\n") !== -1) { canJoin = false; }
      return;
    }
    piece.classList.remove("hl-join-left", "hl-join-right");
    const joined = canJoin && previousWord &&
      previousWord.classList.contains("hl-on") && piece.classList.contains("hl-on");
    if (joined) {
      previousWord.classList.add("hl-join-right");
      piece.classList.add("hl-join-left");
      gapsBetween.forEach(function (gap) { gap.classList.add("hl-on"); });
    }
    previousWord = piece;
    gapsBetween = [];
    canJoin = true;
  });
}

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
    toggleHighlight(key, Number(word.dataset.word));
    word.classList.toggle("hl-on");
    joinHighlights(element);
  });
}

["prompt", "case-facts", "case-issue", "case-ruling"].forEach(makeHighlightable);

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
    const words = Array.prototype.filter.call(element.querySelectorAll(".hl-word"), function (word) {
      return rangeTouchesWord(range, word);
    });
    if (words.length > 0) { picked.push({ element: element, key: key, words: words }); }
  });
  return picked;
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
  const removing = dragStartWord(selection, picked).classList.contains("hl-on");
  picked.forEach(function (p) {
    p.words.forEach(function (word) {
      if (!removing) {
        word.classList.add("hl-preview");
      } else if (word.classList.contains("hl-on")) {
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
    // started on a yellow word -> remove the highlight from every word dragged over (they fade out);
    // started on a plain word  -> highlight every word dragged over.
    // (So a drag that ends a little past the last yellow word still removes, instead of flipping.)
    const turnOn = !dragStartWord(selection, picked).classList.contains("hl-on");
    picked.forEach(function (p) {
      setHighlights(p.key, p.words.map(function (word) { return Number(word.dataset.word); }), turnOn);
      p.words.forEach(function (word) { word.classList.toggle("hl-on", turnOn); });
      joinHighlights(p.element);
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
    [theCase.subject, theCase.topic].filter(Boolean).join(" · ");
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
  // Only IDs like "case-0001" are used to build the file name (bad content can't point elsewhere).
  if (!theCase || typeof theCase.id !== "string" || !/^case-\d+$/.test(theCase.id)) {
    showFullTextNote("The full text for this case hasn't been added yet.");
    return;
  }

  button.disabled = true;
  button.textContent = "Loading…";
  document.getElementById("full-text-note").hidden = true;

  fetch("data/case-texts/" + theCase.id + ".txt")
    .then(function (response) {
      if (response.status === 404) { throw new Error("missing"); }
      if (!response.ok) { throw new Error("status " + response.status); }
      return response.text();
    })
    .then(function (text) {
      if (currentCase !== theCase) { return; }  // she already opened a different case
      if (!text.trim()) { throw new Error("missing"); }
      box.textContent = text;  // plain text only: nothing in the file can run as code
      const credit = document.createElement("p");
      credit.className = "full-text-credit";
      credit.textContent = "Text from The LawPhil Project, Arellano Law Foundation (see Source below).";
      box.appendChild(credit);
      box.hidden = false;
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
    const detail = document.createElement("span");
    detail.className = "card-detail";
    detail.textContent = (question.type === "mcq" ? "Multiple choice" : "Essay") +
      (question.status === "verified" ? "" : " · Draft");
    text.appendChild(detail);
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

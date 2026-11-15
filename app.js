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

let allQuestions = [];      // filled in from data/questions.json
let currentSubject = null;  // the subject she tapped
let currentTopic = null;    // the topic she tapped (or "All topics")

// The current practice round: which questions, where she is, and her results so far.
let session = null;

// ---------- Switching screens ----------
// Only one screen is visible at a time.
function showScreen(id) {
  ["screen-home", "screen-subject", "screen-question", "screen-results"].forEach(function (screenId) {
    document.getElementById(screenId).hidden = (screenId !== id);
  });
  window.scrollTo(0, 0);
}

function questionsFor(subject) {
  return allQuestions.filter(function (q) { return q.subject === subject; });
}

// ---------- Screen 1: Home ----------
function buildHome() {
  const list = document.getElementById("subject-list");
  SUBJECTS.forEach(function (subject, index) {
    const card = document.createElement("button");
    card.className = "subject-card";
    const number = document.createElement("span");
    number.className = "subject-number";
    number.textContent = index + 1;
    const name = document.createElement("span");
    name.className = "subject-name";
    name.textContent = subject;
    const arrow = document.createElement("span");
    arrow.className = "subject-arrow";
    arrow.textContent = "›";
    card.append(number, name, arrow);
    card.addEventListener("click", function () { openSubject(subject); });
    list.appendChild(card);
  });
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

// The questions for a subject + a choice from the subject screen:
// a topic name, "All topics", "Review missed", or "Bookmarked".
function questionsForTopic(subject, topic) {
  return questionsFor(subject).filter(function (q) {
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
  howMany.textContent = countLabel(questionsForTopic(subject, topic).length);
  const arrow = document.createElement("span");
  arrow.className = "subject-arrow";
  arrow.textContent = "›";
  card.append(name, howMany, arrow);
  card.addEventListener("click", function () {
    currentTopic = topic;
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

  showScreen("screen-subject");
}

// Show the friendly "this list is empty" message on the subject screen.
function showEmptyListMessage(topic) {
  const note = document.getElementById("list-empty");
  note.textContent = EMPTY_LIST_MESSAGES[topic] || "No questions here yet.";
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
document.getElementById("shuffle").addEventListener("change", function () {
  document.querySelector(".switch-note").textContent = this.checked
    ? "On: questions come in random order"
    : "Off: questions come in order";
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
  let questions = questionsForTopic(currentSubject, currentTopic);
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
  const isLast = session.index === session.questions.length - 1;

  document.getElementById("progress").textContent =
    "Question " + (session.index + 1) + " of " + session.questions.length;
  document.getElementById("subject").textContent = question.subject;
  document.getElementById("topic").textContent = question.topic;
  document.getElementById("prompt").textContent = question.prompt;
  // Anything not marked "verified" (including a missing status) shows the draft label.
  document.getElementById("draft-badge").hidden = (question.status === "verified");
  showBookmark(question);

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

  ["A", "B", "C", "D"].forEach(function (letter) {
    const button = document.createElement("button");
    button.className = "choice";
    button.dataset.letter = letter;
    const badge = document.createElement("span");
    badge.className = "choice-letter";
    badge.textContent = letter;
    const text = document.createElement("span");
    text.className = "choice-text";
    text.textContent = question.choices[letter];
    button.append(badge, text);
    button.addEventListener("click", function () { pickChoice(question, letter); });
    container.appendChild(button);
  });
}

function pickChoice(question, picked) {
  const isRight = picked === question.correct;
  session.mcqTotal += 1;
  if (isRight) { session.mcqCorrect += 1; }
  recordMcq(question, isRight);  // save on the phone

  // Lock the choices and color them: correct one green, her wrong pick red.
  document.querySelectorAll(".choice").forEach(function (button) {
    button.disabled = true;
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
  document.getElementById("mcq-explanation").textContent = question.explanation;
  document.getElementById("mcq-feedback").hidden = false;
  document.getElementById("next-btn").hidden = false;
}

// --- Essay ---
function showEssay(question) {
  document.getElementById("alac-answer").textContent = question.suggestedAnswer.answer;
  document.getElementById("alac-basis").textContent = question.suggestedAnswer.legalBasis;
  document.getElementById("alac-application").textContent = question.suggestedAnswer.application;
  document.getElementById("alac-conclusion").textContent = question.suggestedAnswer.conclusion;

  // Make a checkbox for each key point (clearing any from last time).
  const list = document.getElementById("key-points");
  list.innerHTML = "";
  question.keyPoints.forEach(function (point) {
    const item = document.createElement("li");
    const label = document.createElement("label");
    const box = document.createElement("input");
    box.type = "checkbox";
    label.appendChild(box);
    label.appendChild(document.createTextNode(point));
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
document.getElementById("show-answer").addEventListener("click", function () {
  document.getElementById("answer-area").hidden = false;
  document.getElementById("show-answer").hidden = true;
});

// Rating buttons: she picks one, it's counted once, then "Next" appears.
document.querySelectorAll(".btn-rate").forEach(function (button) {
  button.addEventListener("click", function () {
    const rating = button.dataset.rating;
    session.ratings[rating] += 1;
    recordEssay(session.questions[session.index], rating);  // save on the phone
    document.querySelectorAll(".btn-rate").forEach(function (b) { b.disabled = true; });
    button.classList.add("selected");
    const result = document.getElementById("rating-result");
    result.textContent = "You rated this: " + rating;
    result.hidden = false;
    document.getElementById("next-btn").hidden = false;
  });
});

document.getElementById("next-btn").addEventListener("click", function () {
  session.index += 1;
  if (session.index < session.questions.length) {
    showQuestion();
  } else {
    showResults();
  }
});

document.getElementById("question-back").addEventListener("click", function () {
  openSubject(currentSubject);
});

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

fetch("data/questions.json")
  .then(function (response) {
    if (!response.ok) { throw new Error("status " + response.status); }
    return response.json();
  })
  .then(function (data) {
    if (!Array.isArray(data)) { throw new Error("not a list"); }
    allQuestions = data;
  })
  .catch(function () {
    const error = document.getElementById("load-error");
    error.textContent =
      "Couldn't load the questions file (data/questions.json). " +
      "If you opened this by double-clicking, start the local server instead. " +
      "Otherwise, the file may have a typo.";
    error.hidden = false;
  });

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

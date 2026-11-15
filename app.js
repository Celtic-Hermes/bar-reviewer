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

// ---------- Screen 2: One subject ----------
function openSubject(subject) {
  currentSubject = subject;
  const count = questionsFor(subject).length;
  document.getElementById("subject-title").textContent = subject;
  document.getElementById("subject-count").textContent = count;
  document.getElementById("subject-count-label").textContent =
    count === 1 ? "question available" : "questions available";
  // No questions? Turn off the Start button and say why.
  document.getElementById("start-practice").disabled = (count === 0);
  document.getElementById("subject-empty").hidden = (count !== 0);
  showScreen("screen-subject");
}

document.getElementById("subject-back").addEventListener("click", function () {
  showScreen("screen-home");
});

function startPractice() {
  const questions = questionsFor(currentSubject);
  if (questions.length === 0) { return; }
  session = {
    questions: questions,
    index: 0,
    mcqCorrect: 0,
    mcqTotal: 0,
    ratings: { "Got it": 0, "Partly": 0, "Missed it": 0 }
  };
  showQuestion();
}

document.getElementById("start-practice").addEventListener("click", startPractice);

// ---------- Screen 3: Practice ----------
function showQuestion() {
  const question = session.questions[session.index];
  const isLast = session.index === session.questions.length - 1;

  document.getElementById("progress").textContent =
    "Question " + (session.index + 1) + " of " + session.questions.length;
  document.getElementById("subject").textContent = question.subject;
  document.getElementById("topic").textContent = question.topic;
  document.getElementById("prompt").textContent = question.prompt;

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
  document.getElementById("results-subject").textContent = currentSubject;

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

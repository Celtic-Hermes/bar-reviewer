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

// ---------- Switching screens ----------
// Only one screen is visible at a time.
function showScreen(id) {
  ["screen-home", "screen-subject", "screen-question"].forEach(function (screenId) {
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

document.getElementById("start-practice").addEventListener("click", function () {
  const questions = questionsFor(currentSubject);
  if (questions.length > 0) {
    showQuestion(questions[0]);
  }
});

// ---------- Screen 3: Practice ----------
function showQuestion(question) {
  document.getElementById("subject").textContent = question.subject;
  document.getElementById("topic").textContent = question.topic;
  document.getElementById("prompt").textContent = question.prompt;
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
  document.querySelectorAll(".btn-rate").forEach(function (b) { b.classList.remove("selected"); });

  showScreen("screen-question");
}

document.getElementById("question-back").addEventListener("click", function () {
  openSubject(currentSubject);
});

// "Show suggested answer" reveals the hidden answer section.
document.getElementById("show-answer").addEventListener("click", function () {
  document.getElementById("answer-area").hidden = false;
  document.getElementById("show-answer").hidden = true;
});

// Rating buttons: highlight the one she taps. (Not saved yet. That comes later.)
document.querySelectorAll(".btn-rate").forEach(function (button) {
  button.addEventListener("click", function () {
    document.querySelectorAll(".btn-rate").forEach(function (b) { b.classList.remove("selected"); });
    button.classList.add("selected");
    const result = document.getElementById("rating-result");
    result.textContent = "You rated this: " + button.dataset.rating;
    result.hidden = false;
  });
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

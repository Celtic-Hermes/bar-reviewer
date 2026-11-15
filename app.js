// One placeholder essay question. Later this will come from data/questions.json.
const question = {
  id: "q-0001",
  type: "essay",
  status: "draft",
  subject: "Civil Law",
  topic: "Placeholder Topic",
  prompt:
    "[PLACEHOLDER] This is a sample fact situation. Alpha and Beta enter into a sample agreement. " +
    "Later, a sample dispute arises between them. Is Alpha correct? Explain.",
  suggestedAnswer: {
    answer: "[PLACEHOLDER] A sample direct answer goes here.",
    legalBasis: "[PLACEHOLDER] The sample rule or doctrine goes here.",
    application: "[PLACEHOLDER] How the sample rule applies to the facts goes here.",
    conclusion: "[PLACEHOLDER] The sample conclusion goes here."
  },
  keyPoints: [
    "[PLACEHOLDER] First key point",
    "[PLACEHOLDER] Second key point",
    "[PLACEHOLDER] Third key point"
  ]
};

// Fill the page with the question's text.
document.getElementById("subject").textContent = question.subject;
document.getElementById("topic").textContent = question.topic;
document.getElementById("prompt").textContent = question.prompt;
document.getElementById("alac-answer").textContent = question.suggestedAnswer.answer;
document.getElementById("alac-basis").textContent = question.suggestedAnswer.legalBasis;
document.getElementById("alac-application").textContent = question.suggestedAnswer.application;
document.getElementById("alac-conclusion").textContent = question.suggestedAnswer.conclusion;

// Make a checkbox for each key point.
const list = document.getElementById("key-points");
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

// "Show suggested answer" reveals the hidden answer section.
const showButton = document.getElementById("show-answer");
showButton.addEventListener("click", function () {
  document.getElementById("answer-area").hidden = false;
  showButton.hidden = true;
});

// Rating buttons: highlight the one she taps. (Not saved yet. That comes later.)
const result = document.getElementById("rating-result");
document.querySelectorAll(".btn-rate").forEach(function (button) {
  button.addEventListener("click", function () {
    document.querySelectorAll(".btn-rate").forEach(function (b) {
      b.classList.remove("selected");
    });
    button.classList.add("selected");
    result.textContent = "You rated this: " + button.dataset.rating;
    result.hidden = false;
  });
});

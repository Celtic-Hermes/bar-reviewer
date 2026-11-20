// ---------- Tests (one subject's tests) ----------
// Being built in steps (see "Tests" in CLAUDE.md).
// Step 1: the Tests card on the subject screen opens this subject's Tests screen.
// Step 2: "Create a test" (what's in it, type, how many, timer) saves a test in her progress
// (progress.tests, see cleanTests in progress.js); it shows in Unfinished.
// Step 3: tapping an unfinished test opens it (openTest): one question at a time, answers never
// shown, every answer and her place saved in the test at once. Nothing counts yet (that's at submit).
// Step 4: Flag and the question map.
// Uses things from app.js: currentSubject, sourceView, questionsFor, topicsFor, subtopicsFor,
// inSubtopic, subtopicLabel, OTHER_SUBTOPIC, FB_LEVELS, FB_LEVEL_LABELS, countLabel,
// modeCountLabel, viewSuffix, shuffled, askConfirm, showScreen, openSubject, setIconLabel;
// and from progress.js: progress, saveProgress, TESTS_OPEN_MAX, TEST_LIMIT_MAX.

const TEST_DEFAULT_COUNT = 20;
const TEST_DEFAULT_LEVEL = "key";           // Key Legal Terms
// The suggested time limit: minutes per question of each type.
const TEST_MINUTES_PER = { mcq: 1.5, fillblank: 2 };

// ---------- The Tests screen ----------
function testsOf(subject, state) {
  const list = Array.isArray(progress.tests) ? progress.tests : [];
  const field = state === "done" ? "finished" : "made";
  return list.filter(function (t) { return t.subject === subject && t.state === state; })
    .sort(function (a, b) { return new Date(b[field]) - new Date(a[field]); });
}

function testDate(iso) {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "" : d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

// A test's name: "All topics", or its sub-topics / topics ("Writ of Amparo, TEPO +2 more").
function testTitle(test) {
  if (test.all) { return "All topics"; }
  const names = test.picks.map(function (p) {
    if (p.s === null) { return p.t; }
    return p.s === OTHER_SUBTOPIC ? p.t + " (other)" : p.s;
  });
  if (names.length === 0) { return "Test"; }
  return names.length <= 2 ? names.join(", ") : names.slice(0, 2).join(", ") + " +" + (names.length - 2) + " more";
}

function testTypeLabel(n, type) {
  return type === "both" ? countLabel(n) : modeCountLabel(n, type);
}

function testViewLabel(view) {
  if (view === "notes") { return " · My class notes"; }
  if (view === "notebooklm") { return " · NotebookLM"; }
  return "";
}

function makeTestCard(test) {
  const card = document.createElement("button");
  card.type = "button";
  card.className = "subject-card";
  const name = document.createElement("span");
  name.className = "subject-name";
  name.append(testTitle(test));
  const meta = document.createElement("span");
  meta.className = "subject-meta";
  meta.textContent = testTypeLabel(test.qIds.length, test.type) +
    (test.limit > 0 ? " · " + test.limit + " min" : " · Untimed") + testViewLabel(test.view);
  const meta2 = document.createElement("span");
  meta2.className = "subject-meta";
  if (test.state === "done") {
    meta2.textContent = "Finished " + testDate(test.finished);
  } else {
    const answered = Object.keys(test.answers).length;
    meta2.textContent = (answered === 0 && test.index === 0)
      ? "Created " + testDate(test.made) + " · Not started"
      : "Question " + (test.index + 1) + " of " + test.qIds.length + " · " + answered + " answered";
  }
  name.append(meta, meta2);
  const arrow = document.createElement("span");
  arrow.className = "subject-arrow";
  arrow.setAttribute("aria-hidden", "true");
  arrow.textContent = "›";
  card.append(name, arrow);
  card.addEventListener("click", function () {
    if (test.state === "open") { openTest(test.id); }
  });
  return card;
}

function openTests(note) {
  const subject = currentSubject;
  setIconLabel(document.getElementById("tests-back"), "chevron-left", subject);
  document.getElementById("tests-subject").textContent = subject;
  showTestsNote(note);
  [["open", "tests-unfinished"], ["done", "tests-finished"]].forEach(function (pair) {
    const box = document.getElementById(pair[1]);
    box.innerHTML = "";
    const tests = testsOf(subject, pair[0]);
    tests.forEach(function (test) { box.appendChild(makeTestCard(test)); });
    document.getElementById(pair[1] + "-empty").hidden = tests.length > 0;
  });
  showScreen("screen-tests");
}

document.getElementById("tests-card").addEventListener("click", function () { openTests(); });

document.getElementById("tests-back").addEventListener("click", function () {
  openSubject(currentSubject);
});

document.getElementById("tests-create").addEventListener("click", openTestCreate);

// ---------- The Create a test screen ----------
// Her choices while she's on the screen (not saved: a reload starts from the defaults).
let testChoices = null;

function fitsTestType(question, type) {
  if (type === "mcq") { return question.type === "mcq"; }
  if (type === "fillblank") { return question.type === "fillblank"; }
  return question.type === "mcq" || question.type === "fillblank";
}

// The subject's questions a test can use (current view), of a type.
function testPool(subject, type) {
  return questionsFor(subject).filter(function (q) { return fitsTestType(q, type); });
}

function pickKey(pick) { return pick.t + "\u0001" + (pick.s === null ? "" : pick.s); }

function inPick(question, pick) {
  return question.topic === pick.t && (pick.s === null || inSubtopic(question, pick.s));
}

// The rows of the topic list: one per topic without sub-topics, or per sub-topic
// (+ "Other" for a topic's questions with no sub-topic). Only rows with test questions.
function testPickRows(subject) {
  const pool = testPool(subject, "both");
  const groups = [];
  topicsFor(subject).forEach(function (topic) {
    const inTopic = pool.filter(function (q) { return q.topic === topic; });
    if (inTopic.length === 0) { return; }
    const subs = subtopicsFor(subject, topic);
    const rows = [];
    if (subs.length === 0) {
      rows.push({ t: topic, s: null });
    } else {
      subs.forEach(function (s) {
        if (inTopic.some(function (q) { return inSubtopic(q, s); })) { rows.push({ t: topic, s: s }); }
      });
      if (inTopic.some(function (q) { return inSubtopic(q, OTHER_SUBTOPIC); })) { rows.push({ t: topic, s: OTHER_SUBTOPIC }); }
    }
    groups.push({ topic: topic, rows: rows, hasSubs: subs.length > 0 });
  });
  return groups;
}

function allPickRows() {
  const rows = [];
  testChoices.groups.forEach(function (g) { g.rows.forEach(function (r) { rows.push(r); }); });
  return rows;
}

function pickCount(pick) {
  return testPool(currentSubject, testChoices.type).filter(function (q) { return inPick(q, pick); }).length;
}

function openTestCreate() {
  const subject = currentSubject;
  setIconLabel(document.getElementById("test-create-back"), "chevron-left", "Tests");
  document.getElementById("test-create-subject").textContent = subject + viewSuffix();
  const hasMcq = testPool(subject, "mcq").length > 0;
  const groups = testPickRows(subject);
  testChoices = {
    type: hasMcq ? "mcq" : "fillblank",
    level: TEST_DEFAULT_LEVEL,
    groups: groups,
    picked: {},
    count: TEST_DEFAULT_COUNT,
    timed: true,
    limit: null,          // null = use the suggestion
    making: false
  };
  groups.forEach(function (g) { g.rows.forEach(function (r) { testChoices.picked[pickKey(r)] = true; }); });

  // Question type: a type with no questions here can't be picked.
  document.querySelectorAll('input[name="test-type"]').forEach(function (radio) {
    radio.disabled = testPool(subject, radio.value).length === 0;
    radio.checked = radio.value === testChoices.type;
  });
  const level = document.getElementById("test-level");
  level.innerHTML = "";
  FB_LEVELS.forEach(function (id) {
    const option = document.createElement("option");
    option.value = id;
    option.textContent = FB_LEVEL_LABELS[id] || id;
    level.appendChild(option);
  });
  level.value = testChoices.level;
  document.getElementById("test-timed").checked = true;
  buildTestPickList();
  showTestChoices();
  showScreen("screen-test-create");
}

function makePickRow(pick, label, extraClass) {
  const row = document.createElement("label");
  row.className = "test-pick" + (extraClass ? " " + extraClass : "");
  const box = document.createElement("input");
  box.type = "checkbox";
  box.dataset.key = pickKey(pick);
  const name = document.createElement("span");
  name.className = "test-pick-name";
  name.textContent = label;
  const count = document.createElement("span");
  count.className = "test-pick-count";
  row.append(box, name, count);
  box.addEventListener("change", function () {
    testChoices.picked[box.dataset.key] = box.checked;
    showTestChoices();
  });
  return row;
}

function buildTestPickList() {
  const list = document.getElementById("test-pick-list");
  list.innerHTML = "";
  testChoices.groups.forEach(function (g) {
    if (!g.hasSubs) {
      list.appendChild(makePickRow(g.rows[0], g.topic, "test-pick-topic"));
      return;
    }
    // A topic with sub-topics: its own box ticks or unticks all of them.
    const head = document.createElement("label");
    head.className = "test-pick test-pick-topic";
    const box = document.createElement("input");
    box.type = "checkbox";
    box.dataset.topic = g.topic;
    const name = document.createElement("span");
    name.className = "test-pick-name";
    name.textContent = g.topic;
    const count = document.createElement("span");
    count.className = "test-pick-count";
    head.append(box, name, count);
    box.addEventListener("change", function () {
      g.rows.forEach(function (r) { if (pickCount(r) > 0) { testChoices.picked[pickKey(r)] = box.checked; } });
      showTestChoices();
    });
    list.appendChild(head);
    g.rows.forEach(function (r) {
      list.appendChild(makePickRow(r, subtopicLabel(r.s, g.topic), "test-pick-sub"));
    });
  });
}

// The questions her current choices cover (before picking how many).
function testCovered() {
  const picks = allPickRows().filter(function (r) { return testChoices.picked[pickKey(r)]; });
  return testPool(currentSubject, testChoices.type).filter(function (q) {
    return picks.some(function (p) { return inPick(q, p); });
  });
}

function testCountFor(available) {
  return testChoices.count === "all" ? available : Math.min(testChoices.count, available);
}

function suggestedMinutes(questions, n) {
  if (questions.length === 0 || n === 0) { return 0; }
  const fb = questions.filter(function (q) { return q.type === "fillblank"; }).length / questions.length;
  const minutes = Math.ceil(n * ((1 - fb) * TEST_MINUTES_PER.mcq + fb * TEST_MINUTES_PER.fillblank));
  return Math.max(1, Math.min(TEST_LIMIT_MAX, minutes));
}

// Bring every control on the Create screen up to date with testChoices.
function showTestChoices() {
  const c = testChoices;
  document.getElementById("test-level-row").hidden = (c.type === "mcq");

  // Each row's count (for the picked type); a row with none can't be ticked.
  document.querySelectorAll("#test-pick-list input[data-key]").forEach(function (box) {
    const row = allPickRows().find(function (r) { return pickKey(r) === box.dataset.key; });
    const n = row ? pickCount(row) : 0;
    box.disabled = (n === 0);
    box.checked = n > 0 && Boolean(c.picked[box.dataset.key]);
    box.parentNode.querySelector(".test-pick-count").textContent = String(n);
    box.parentNode.classList.toggle("is-empty", n === 0);
  });
  // A topic's own box: ticked if all its usable sub-topics are, half if some.
  c.groups.forEach(function (g) {
    if (!g.hasSubs) { return; }
    const box = Array.prototype.find.call(document.querySelectorAll("#test-pick-list input[data-topic]"), function (b) { return b.dataset.topic === g.topic; });
    if (!box) { return; }
    const usable = g.rows.filter(function (r) { return pickCount(r) > 0; });
    const on = usable.filter(function (r) { return c.picked[pickKey(r)]; });
    box.disabled = usable.length === 0;
    box.checked = usable.length > 0 && on.length === usable.length;
    box.indeterminate = on.length > 0 && on.length < usable.length;
    box.parentNode.querySelector(".test-pick-count").textContent =
      String(usable.reduce(function (sum, r) { return sum + pickCount(r); }, 0));
    box.parentNode.classList.toggle("is-empty", usable.length === 0);
  });
  const usableRows = allPickRows().filter(function (r) { return pickCount(r) > 0; });
  const onRows = usableRows.filter(function (r) { return c.picked[pickKey(r)]; });
  const all = document.getElementById("test-all");
  all.disabled = usableRows.length === 0;
  all.checked = usableRows.length > 0 && onRows.length === usableRows.length;
  all.indeterminate = onRows.length > 0 && onRows.length < usableRows.length;
  document.getElementById("test-all-count").textContent = String(testPool(currentSubject, c.type).length);

  // How many: a choice bigger than what's there can't be picked (then: All).
  const covered = testCovered();
  const available = covered.length;
  if (c.count !== "all" && c.count > available) { c.count = "all"; }
  document.querySelectorAll('input[name="test-count"]').forEach(function (radio) {
    radio.disabled = radio.value !== "all" && Number(radio.value) > available;
    radio.checked = radio.value === String(c.count);
  });
  document.getElementById("test-count-all").textContent = "All (" + available + ")";

  // Timer: the suggestion follows her choices until she types her own number.
  const n = testCountFor(available);
  const suggested = suggestedMinutes(covered, n);
  document.getElementById("test-limit-row").hidden = !c.timed;
  const limitBox = document.getElementById("test-limit");
  if (c.limit === null) { limitBox.value = suggested > 0 ? String(suggested) : ""; }
  document.getElementById("test-limit-desc").textContent = suggested > 0
    ? "Suggested: " + suggested + " min (about 1½ min per multiple choice, 2 per fill-in-the-blank)."
    : "About 1½ min per multiple choice, 2 per fill-in-the-blank.";

  // The summary line and the Create button.
  const summary = document.getElementById("test-summary");
  const limit = testLimitValue();
  let problem = "";
  if (onRows.length === 0) { problem = "Pick at least one topic."; }
  else if (available === 0) { problem = "There are no questions of this type in what you picked."; }
  else if (c.timed && limit === null) { problem = "Type a time limit from 1 to " + TEST_LIMIT_MAX + " minutes, or switch Timed off."; }
  summary.classList.toggle("is-problem", problem !== "");
  summary.textContent = problem || (testTypeLabel(n, c.type) + " · " + (c.timed ? limit + " min" : "Untimed"));
  document.getElementById("test-make").disabled = problem !== "" || c.making;
}

// The time limit as a whole number of minutes, or null if it isn't a usable number.
function testLimitValue() {
  const text = document.getElementById("test-limit").value.trim();
  if (!/^\d+$/.test(text)) { return null; }
  const n = Number(text);
  return (n >= 1 && n <= TEST_LIMIT_MAX) ? n : null;
}

document.querySelectorAll('input[name="test-type"]').forEach(function (radio) {
  radio.addEventListener("change", function () {
    testChoices.type = radio.value;
    showTestChoices();
  });
});
document.querySelectorAll('input[name="test-count"]').forEach(function (radio) {
  radio.addEventListener("change", function () {
    testChoices.count = radio.value === "all" ? "all" : Number(radio.value);
    showTestChoices();
  });
});
document.getElementById("test-level").addEventListener("change", function (event) {
  testChoices.level = event.target.value;
});
document.getElementById("test-all").addEventListener("change", function (event) {
  allPickRows().forEach(function (r) { if (pickCount(r) > 0) { testChoices.picked[pickKey(r)] = event.target.checked; } });
  showTestChoices();
});
document.getElementById("test-timed").addEventListener("change", function (event) {
  testChoices.timed = event.target.checked;
  showTestChoices();
});
document.getElementById("test-limit").addEventListener("input", function () {
  testChoices.limit = document.getElementById("test-limit").value;  // her own number from now on
  showTestChoices();
});

document.getElementById("test-create-back").addEventListener("click", function () { openTests(); });

function newTestId() {
  return "t-" + Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36);
}

document.getElementById("test-make").addEventListener("click", function () {
  const c = testChoices;
  const covered = testCovered();
  const n = testCountFor(covered.length);
  const limit = c.timed ? testLimitValue() : 0;
  if (n === 0 || limit === null) { showTestChoices(); return; }
  const usableRows = allPickRows().filter(function (r) { return pickCount(r) > 0; });
  const picks = usableRows.filter(function (r) { return c.picked[pickKey(r)]; });
  const test = {
    id: newTestId(),
    subject: currentSubject,
    view: sourceView,
    made: new Date().toISOString(),
    all: picks.length === usableRows.length,
    picks: picks.map(function (r) { return { t: r.t, s: r.s }; }),
    type: c.type,
    level: c.type === "mcq" ? TEST_DEFAULT_LEVEL : c.level,
    limit: limit,
    qIds: shuffled(covered).slice(0, n).map(function (q) { return q.id; }),
    index: 0,
    answers: {},
    flags: [],
    used: 0,
    state: "open"
  };
  if (!Array.isArray(progress.tests)) { progress.tests = []; }
  const open = progress.tests.filter(function (t) { return t.state === "open"; })
    .sort(function (a, b) { return new Date(a.made) - new Date(b.made); });
  function save() {
    progress.tests.unshift(test);
    saveProgress();
    openTests();
  }
  if (open.length < TESTS_OPEN_MAX) { save(); return; }
  // Already the most unfinished tests she can keep: ask before removing the oldest.
  const oldest = open[0];
  c.making = true;
  showTestChoices();
  askConfirm("Replace your oldest unfinished test?",
    "You can keep up to " + TESTS_OPEN_MAX + " unfinished tests. The oldest one (" + oldest.subject + ": " +
    testTitle(oldest) + ", created " + testDate(oldest.made) + ") will be removed.", "Replace").then(function (ok) {
    c.making = false;
    if (!ok) { showTestChoices(); return; }
    progress.tests = progress.tests.filter(function (t) { return t.id !== oldest.id; });
    save();
  });
});

// A short note under "Create a test" (e.g. a test whose questions are all gone), or none.
function showTestsNote(text) {
  const note = document.getElementById("tests-note");
  note.textContent = text || "";
  note.hidden = !text;
}

// ---------- Taking a test ----------
// One question at a time. Multiple choice: tapping a choice picks it (highlighted, nothing more).
// Fill in the blank: the item's boxes at the test's difficulty; no live checking, no peek, no
// Show answer. Every pick, every letter typed and the question she's on are saved in the test
// right away (progress.tests), so a reload or the home-screen timeout loses nothing.
// Nothing counts toward her streak, daily goal, mastery or Review missed here (only at submit).
let currentTestId = null;
let testFb = null;   // the fill-in-the-blank item on screen: its words, like fbInfo in app.js

function findTest(id) {
  const list = Array.isArray(progress.tests) ? progress.tests : [];
  return list.find(function (t) { return t.id === id; }) || null;
}

// For the saved spot (app.js rememberSpot): the test on screen.
function testSpotId() { return currentTestId; }

function questionById(id) {
  return allQuestions.find(function (q) { return q && q.id === id; }) || null;
}

// Questions taken out of the app since the test was made: drop them (and her answers to them).
// Gives back how many were dropped.
function dropMissingQuestions(test) {
  const keep = test.qIds.filter(function (id) {
    const q = questionById(id);
    return q && (q.type === "mcq" || q.type === "fillblank");
  });
  const dropped = test.qIds.length - keep.length;
  if (dropped === 0) { return 0; }
  const current = test.qIds[test.index];
  test.qIds = keep;
  Object.keys(test.answers).forEach(function (id) { if (keep.indexOf(id) === -1) { delete test.answers[id]; } });
  if (test.hidden) { Object.keys(test.hidden).forEach(function (id) { if (keep.indexOf(id) === -1) { delete test.hidden[id]; } }); }
  test.flags = test.flags.filter(function (id) { return keep.indexOf(id) !== -1; });
  const at = keep.indexOf(current);
  test.index = at !== -1 ? at : Math.min(test.index, Math.max(0, keep.length - 1));
  return dropped;
}

function openTest(id) {
  const test = findTest(id);
  if (!test || test.state !== "open") { openTests(); return false; }
  currentSubject = test.subject;
  const dropped = dropMissingQuestions(test);
  if (test.qIds.length === 0) {
    progress.tests = progress.tests.filter(function (t) { return t.id !== test.id; });
    saveProgress();
    openTests("That test's questions are no longer in the app, so the test was removed.");
    return false;
  }
  if (dropped > 0) { saveProgress(); }
  const note = document.getElementById("test-dropped");
  note.textContent = dropped === 0 ? "" : (dropped === 1 ? "1 question is" : dropped + " questions are") +
    " no longer in the app and " + (dropped === 1 ? "was" : "were") + " taken out of this test.";
  note.hidden = dropped === 0;
  currentTestId = test.id;
  setTestMapOpen(false);
  showTestQuestion();
  return true;
}

function currentTest() {
  return currentTestId ? findTest(currentTestId) : null;
}

function showTestQuestion() {
  const test = currentTest();
  if (!test) { openTests(); return; }
  if (test.index >= test.qIds.length) { test.index = 0; }
  const question = questionById(test.qIds[test.index]);
  if (!question) { openTest(test.id); return; }  // gone while the app was open: drop it and redraw
  const isLast = test.index === test.qIds.length - 1;
  document.getElementById("test-progress").textContent = "Question " + (test.index + 1) + " of " + test.qIds.length;
  document.getElementById("test-subject").textContent = question.subject;
  document.getElementById("test-topic").textContent = [question.topic, subtopicOf(question)].filter(Boolean).join(" · ");
  document.getElementById("test-draft-badge").hidden = !showsUnverified(question);
  const view = viewOf(question);
  const badge = document.getElementById("test-notes-badge");
  badge.textContent = view === "notes" ? "From class notes" : (view === "notebooklm" ? "From NotebookLM" : "");
  badge.hidden = view === "official";

  const isMcq = question.type === "mcq";
  document.getElementById("test-question-label").textContent = isMcq ? "Multiple choice" : "Fill in the blank";
  document.getElementById("test-choices").hidden = !isMcq;
  document.getElementById("test-fb-note").hidden = true;
  if (isMcq) { showTestMcq(test, question); } else { showTestFillBlank(test, question); }

  showTestTools(test);
  document.getElementById("test-prev").disabled = test.index === 0;
  document.getElementById("test-next").disabled = isLast;   // End test comes in a later step
  document.getElementById("test-last-note").hidden = !isLast;
  showScreen("screen-test");
}

// Multiple choice: the four choices; her pick (if any) is highlighted. Never right or wrong.
function showTestMcq(test, question) {
  testFb = null;
  const prompt = document.getElementById("test-prompt");
  prompt.textContent = "";
  prompt.appendChild(richText(question.prompt));
  const box = document.getElementById("test-choices");
  box.innerHTML = "";
  const choices = isPlainObject(question.choices) ? question.choices : {};
  ["A", "B", "C", "D"].forEach(function (letter) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "choice";
    button.dataset.letter = letter;
    const mark = document.createElement("span");
    mark.className = "choice-letter";
    mark.textContent = letter;
    const text = document.createElement("span");
    text.className = "choice-text";
    setRichText(text, choices[letter]);
    button.append(mark, text);
    button.addEventListener("click", function () {
      test.answers[question.id] = letter;
      saveProgress();
      showTestPick(letter);
      showTestTools(test);  // an open map shows it as answered
    });
    box.appendChild(button);
  });
  showTestPick(test.answers[question.id]);
}

function showTestPick(letter) {
  document.querySelectorAll("#test-choices .choice").forEach(function (button) {
    const on = button.dataset.letter === letter;
    button.classList.toggle("selected", on);
    button.setAttribute("aria-pressed", on ? "true" : "false");
  });
}

// Fill in the blank: the words hidden for this item are picked once (at the test's level) and
// kept in the test, so the same boxes come back after a reload.
function showTestFillBlank(test, question) {
  const prompt = document.getElementById("test-prompt");
  prompt.textContent = "";
  prompt.appendChild(richText(question.prompt, []));  // [] = every word in its own numbered span
  const words = Array.from(prompt.querySelectorAll(".hl-word"));
  const answers = blankAnswers(question.prompt, question.fullText);
  const blankCount = words.filter(function (w) { return BLANK.test(w.textContent); }).length;
  const usable = Boolean(answers) && answers.length === blankCount;
  let b = 0;
  testFb = {
    words: words.map(function (span) {
      const text = span.textContent;
      const isBlank = BLANK.test(text);
      const info = { span: span, text: text, isBlank: isBlank, inHeading: !!span.closest(".section-heading") };
      if (isBlank) { info.answer = usable ? answers[b] : null; b += 1; }
      return info;
    }),
    usable: usable,
    total: usable ? Math.max(1, wordCount(sectionContent(question.fullText))) : 1
  };
  if (!test.hidden) { test.hidden = {}; }
  let hidden = test.hidden[question.id];
  if (!Array.isArray(hidden)) {
    hidden = pickTestHidden(test.level);
    test.hidden[question.id] = hidden;
    saveProgress();
  }
  const typed = isPlainObject(test.answers[question.id]) ? test.answers[question.id] : {};
  drawTestBlanks(hidden, test.level, typed);
  const note = document.getElementById("test-fb-note");
  const count = prompt.querySelectorAll(".fb-input").length;
  note.textContent = count + (count === 1 ? " blank" : " blanks") + " to fill · " + (FB_LEVEL_NAMES[test.level] || "");
  note.hidden = false;
}

// The words to hide at a level (word numbers), as in practice (pickHiddenWords in app.js).
function pickTestHidden(level) {
  const words = testFb.words;
  const all = words.map(function (w, n) { return n; });
  const blanks = all.filter(function (n) { return words[n].isBlank; });
  if (!testFb.usable) { return blanks; }
  if (level === "light") {
    const usable = blanks.filter(function (n) { return blankHasBox(words[n], level); });
    return shuffled(usable).slice(0, FB_LIGHT_MOST).sort(function (x, y) { return x - y; });
  }
  if (level === "key" || !FB_LEVEL_SHARE[level]) { return blanks; }
  const target = Math.round(testFb.total * FB_LEVEL_SHARE[level]);
  let count = blanks.reduce(function (sum, n) {
    const w = words[n];
    return sum + (w.answer ? blankParts(w, level).filter(function (p) { return p.box; }).length : 1);
  }, 0);
  const picked = blanks.slice();
  const others = shuffled(all.filter(function (n) { return canHideExtra(words[n]); }));
  for (let i = 0; i < others.length && count < target; i++) {
    picked.push(others[i]);
    count += 1;
  }
  return picked.sort(function (x, y) { return x - y; });
}

// Put the boxes in, like applyFbLevel in app.js (one box per word, punctuation outside it).
function drawTestBlanks(hidden, level, typed) {
  testFb.words.forEach(function (w, n) {
    const hide = hidden.indexOf(n) !== -1 && !(w.inHeading && !w.isBlank);
    if (!hide && !w.isBlank) { return; }   // a word that stays: leave it as drawn
    w.span.classList.toggle("fb-blank", hide);
    w.span.textContent = "";
    if (hide && w.isBlank && w.answer) {
      const outer = splitBlank(w.text);
      w.span.append(outer.before);
      blankParts(w, level).forEach(function (part, k) {
        if (part.space) { w.span.append(part.space); return; }
        if (!part.box) {
          const shown = document.createElement("span");
          shown.className = "fb-shown";
          shown.textContent = part.text;
          w.span.append(shown);
          return;
        }
        const bits = splitWord(part.text);
        w.span.append(bits.before, makeBlankBox(n + "." + k, typed[n + "." + k]), bits.after);
      });
      w.span.append(outer.after);
    } else if (hide) {
      const parts = w.isBlank ? splitBlank(w.text) : splitWord(w.text);
      w.span.append(parts.before, makeBlankBox(n, typed[n]), parts.after);
    } else {
      w.span.textContent = w.answer ? w.text.replace(BLANK, w.answer) : w.text;  // a key term shown at this level
    }
  });
  document.querySelectorAll("#test-prompt .fb-input").forEach(sizeBlankBox);
}

// Typing in a box: grow it and save what she typed in the test (nothing is checked).
document.getElementById("test-prompt").addEventListener("input", function (event) {
  const box = event.target;
  const test = currentTest();
  if (!test || !box.classList || !box.classList.contains("fb-input")) { return; }
  sizeBlankBox(box);
  const id = test.qIds[test.index];
  const typed = isPlainObject(test.answers[id]) ? test.answers[id] : {};
  if (box.value === "") { delete typed[box.dataset.word]; } else { typed[box.dataset.word] = box.value.slice(0, 200); }
  if (Object.keys(typed).length === 0) { delete test.answers[id]; } else { test.answers[id] = typed; }
  saveProgress();
  const wasOpen = !document.getElementById("test-map").hidden;
  if (wasOpen) { showTestMap(test); }
});

// Return key: the next box (or close the keyboard after the last one).
document.getElementById("test-prompt").addEventListener("keydown", function (event) {
  const box = event.target;
  if (event.key !== "Enter" || !box.classList || !box.classList.contains("fb-input")) { return; }
  event.preventDefault();
  const boxes = Array.from(document.querySelectorAll("#test-prompt .fb-input"));
  const next = boxes[boxes.indexOf(box) + 1];
  if (next) { next.focus(); } else { box.blur(); }
});

function goToTestQuestion(index) {
  const test = currentTest();
  if (!test || index < 0 || index >= test.qIds.length) { return; }
  test.index = index;
  saveProgress();
  document.getElementById("test-dropped").hidden = true;
  showTestQuestion();
}

// ---------- Flag and question map ----------
// Flag: marks the question on screen to come back to (test.flags). Nothing else changes.
// The map: one numbered square per question, answered (filled) or not (dashed outline), a
// small flag on flagged ones, a thick ring on the current one. Tap a number to go there.
// A fill-in-the-blank item counts as answered once any of its boxes has text.
function testAnswered(test, id) {
  return Object.prototype.hasOwnProperty.call(test.answers, id);
}

function showTestTools(test) {
  const id = test.qIds[test.index];
  const flagged = test.flags.indexOf(id) !== -1;
  const flag = document.getElementById("test-flag");
  setIconLabel(flag, "flag", flagged ? "Flagged" : "Flag");
  flag.setAttribute("aria-pressed", flagged ? "true" : "false");
  flag.classList.toggle("on", flagged);
  if (!document.getElementById("test-map").hidden) { showTestMap(test); }
}

function showTestMap(test) {
  const answered = test.qIds.filter(function (id) { return testAnswered(test, id); }).length;
  document.getElementById("test-map-count").textContent = answered + " of " + test.qIds.length + " answered · " +
    test.flags.length + " flagged";
  const grid = document.getElementById("test-map-grid");
  grid.innerHTML = "";
  test.qIds.forEach(function (id, i) {
    const cell = document.createElement("button");
    cell.type = "button";
    cell.className = "test-cell";
    const isAnswered = testAnswered(test, id);
    const isFlagged = test.flags.indexOf(id) !== -1;
    cell.classList.toggle("is-answered", isAnswered);
    cell.classList.toggle("is-flagged", isFlagged);
    cell.classList.toggle("is-current", i === test.index);
    cell.textContent = String(i + 1);
    if (isFlagged) {
      const mark = document.createElement("span");
      mark.className = "test-cell-flag";
      mark.appendChild(icon("flag"));
      cell.appendChild(mark);
    }
    cell.setAttribute("aria-label", "Question " + (i + 1) + ", " + (isAnswered ? "answered" : "not answered") +
      (isFlagged ? ", flagged" : "") + (i === test.index ? ", you are here" : ""));
    if (i === test.index) { cell.setAttribute("aria-current", "true"); }
    cell.addEventListener("click", function () {
      setTestMapOpen(false);
      goToTestQuestion(i);
    });
    grid.appendChild(cell);
  });
}

function setTestMapOpen(open) {
  const test = currentTest();
  document.getElementById("test-map").hidden = !open;
  document.getElementById("test-map-btn").setAttribute("aria-expanded", open ? "true" : "false");
  if (open && test) { showTestMap(test); }
}

document.getElementById("test-flag").addEventListener("click", function () {
  const test = currentTest();
  if (!test) { return; }
  const id = test.qIds[test.index];
  const at = test.flags.indexOf(id);
  if (at === -1) { test.flags.push(id); } else { test.flags.splice(at, 1); }
  saveProgress();
  showTestTools(test);
});

document.getElementById("test-map-btn").addEventListener("click", function () {
  setTestMapOpen(document.getElementById("test-map").hidden);
});

document.getElementById("test-prev").addEventListener("click", function () {
  const test = currentTest();
  if (test) { goToTestQuestion(test.index - 1); }
});
document.getElementById("test-next").addEventListener("click", function () {
  const test = currentTest();
  if (test) { goToTestQuestion(test.index + 1); }
});
document.getElementById("test-back").addEventListener("click", function () {
  currentTestId = null;
  openTests();
});

// ---------- Tests (one subject's tests) ----------
// Being built in steps (see "Tests" in CLAUDE.md).
// Step 1: the Tests card on the subject screen opens this subject's Tests screen.
// Step 2: "Create a test" (what's in it, type, how many, timer) saves a test in her progress
// (progress.tests, see cleanTests in progress.js); it shows in Unfinished. Taking it comes next.
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
    meta2.textContent = "Created " + testDate(test.made) + " · " +
      (answered === 0 ? "Not started" : answered + " of " + test.qIds.length + " answered");
  }
  name.append(meta, meta2);
  const arrow = document.createElement("span");
  arrow.className = "subject-arrow";
  arrow.setAttribute("aria-hidden", "true");
  arrow.textContent = "›";
  card.append(name, arrow);
  card.addEventListener("click", function () {
    document.getElementById("tests-soon").hidden = false;  // step 3 will open the test here
  });
  return card;
}

function openTests() {
  const subject = currentSubject;
  setIconLabel(document.getElementById("tests-back"), "chevron-left", subject);
  document.getElementById("tests-subject").textContent = subject;
  document.getElementById("tests-soon").hidden = true;
  [["open", "tests-unfinished"], ["done", "tests-finished"]].forEach(function (pair) {
    const box = document.getElementById(pair[1]);
    box.innerHTML = "";
    const tests = testsOf(subject, pair[0]);
    tests.forEach(function (test) { box.appendChild(makeTestCard(test)); });
    document.getElementById(pair[1] + "-empty").hidden = tests.length > 0;
  });
  showScreen("screen-tests");
}

document.getElementById("tests-card").addEventListener("click", openTests);

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

document.getElementById("test-create-back").addEventListener("click", openTests);

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

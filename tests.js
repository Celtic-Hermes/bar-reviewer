// ---------- Tests (one subject's tests) ----------
// Being built in steps (see "Tests" in CLAUDE.md).
// Step 1: the Tests card on the subject screen opens this subject's Tests screen.
// Step 2: "Create a test" (what's in it, type, how many, timer) saves a test in her progress
// (progress.tests, see cleanTests in progress.js); it shows in Unfinished.
// Step 3: tapping an unfinished test opens it (openTest): one question at a time, answers never
// shown, every answer and her place saved in the test at once. Nothing counts yet (that's at submit).
// Step 4: Flag and the question map.
// Step 5: End test (askEndTest / endTest): grade, count her answers once, show the results.
// Step 6: Review answers (openTestReview): every question with her answer and the right one; read-only.
// Then: the subject screen's big card is the tests' card ("Create a test" / "Continue test",
// showSubjectTestCard) and the Tests card became "My tests" with counts.
// Step 7: the timer (startTestTimer / stopTestTimer): counts only while the test is on screen and the
// app is in view; time's up submits the test like End test.
// Uses things from app.js: currentSubject, questionsFor, viewOf, sourceLabelOf, topicsFor, subtopicsFor,
// inSubtopic, subtopicLabel, OTHER_SUBTOPIC, FB_LEVELS, FB_LEVEL_LABELS, countLabel,
// modeCountLabel, shuffled, askConfirm, showScreen, openSubject, setIconLabel;
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

// Where a test's questions come from (progress.js cleanTests gives every test "sources"; older
// tests had one "view"). Nothing for official only; otherwise " · Cases + Notes" and so on.
const TEST_SOURCE_NAMES = { official: "Cases", notes: "Notes", notebooklm: "NotebookLM" };
const TEST_SOURCES = ["official", "notes", "notebooklm"];
function testSourcesOf(test) {
  return Array.isArray(test.sources) && test.sources.length ? test.sources : [test.view || "official"];
}
function testViewLabel(test) {
  const sources = testSourcesOf(test);
  if (sources.length === 1 && sources[0] === "official") { return ""; }
  return " · " + sources.map(function (v) { return TEST_SOURCE_NAMES[v] || v; }).join(" + ");
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
  let timeText = test.limit > 0 ? " · " + test.limit + " min" : " · Untimed";
  if (test.state === "open" && test.limit > 0 && test.used > 0) {
    timeText = " · " + Math.max(1, Math.ceil(testSecondsLeft(test) / 60)) + " min left";
  }
  meta.textContent = testTypeLabel(test.qIds.length, test.type) + timeText + testViewLabel(test);
  const meta2 = document.createElement("span");
  meta2.className = "subject-meta";
  if (test.state === "done") {
    const score = testScore(test);
    meta2.textContent = "Finished " + testDate(test.finished) + " · " + score.percent + "% (" + score.right + " of " + score.total + ")";
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
    if (test.state === "open") { openTest(test.id); } else { openTestResults(test.id); }
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

document.getElementById("tests-create").addEventListener("click", function () { openTestCreate("tests"); });

// ---------- The Create a test screen ----------
// Her choices while she's on the screen (not saved: a reload starts from the defaults).
let testChoices = null;

function fitsTestType(question, type) {
  if (type === "mcq") { return question.type === "mcq"; }
  if (type === "fillblank") { return question.type === "fillblank"; }
  return question.type === "mcq" || question.type === "fillblank";
}

// The subject's questions a test can use (every source), of a type.
function testPool(subject, type) {
  return questionsFor(subject).filter(function (q) { return fitsTestType(q, type); });
}

// The same, only from the sources ticked under "Where from" on Create a test.
function pickedPool(type) {
  return testPool(currentSubject, type).filter(function (q) { return testChoices.sources[viewOf(q)] === true; });
}

// The sources this subject has test questions from (in the order Cases, Notes, NotebookLM).
function testSourcesHere(subject) {
  const pool = testPool(subject, "both");
  return TEST_SOURCES.filter(function (v) { return pool.some(function (q) { return viewOf(q) === v; }); });
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
  return pickedPool(testChoices.type).filter(function (q) { return inPick(q, pick); }).length;
}

// Where Back goes from Create a test: "subject" (opened from the big card) or "tests" (My tests).
let testCreateCameFrom = "tests";
function testCreateFrom() { return testCreateCameFrom; }

function openTestCreate(from) {
  testCreateCameFrom = from === "subject" ? "subject" : "tests";
  const subject = currentSubject;
  setIconLabel(document.getElementById("test-create-back"), "chevron-left", testCreateCameFrom === "subject" ? subject : "My tests");
  document.getElementById("test-create-subject").textContent = subject;
  const hasMcq = testPool(subject, "mcq").length > 0;
  const groups = testPickRows(subject);
  const sources = {};
  testSourcesHere(subject).forEach(function (v) { sources[v] = true; });  // all ticked at first
  testChoices = {
    sources: sources,
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
  buildTestSources(subject);
  buildTestPickList();
  showTestChoices();
  showScreen("screen-test-create");
}

// "Where from": one checkbox per source this subject has (Cases / Notes / NotebookLM), all ticked
// at first; hidden when there's only one. At least one must stay ticked (the summary says so).
function buildTestSources(subject) {
  const here = testSourcesHere(subject);
  const box = document.getElementById("test-sources");
  box.innerHTML = "";
  document.getElementById("test-sources-block").hidden = here.length < 2;
  here.forEach(function (v) {
    const row = document.createElement("label");
    row.className = "test-pick";
    const check = document.createElement("input");
    check.type = "checkbox";
    check.dataset.source = v;
    const name = document.createElement("span");
    name.className = "test-pick-name";
    name.textContent = TEST_SOURCE_NAMES[v];
    const count = document.createElement("span");
    count.className = "test-pick-count";
    row.append(check, name, count);
    check.addEventListener("change", function () {
      testChoices.sources[v] = check.checked;
      showTestChoices();
    });
    box.appendChild(row);
  });
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
  return pickedPool(testChoices.type).filter(function (q) {
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

  // Where from: each source's box and its count (for the picked type).
  document.querySelectorAll("#test-sources input[data-source]").forEach(function (box) {
    const v = box.dataset.source;
    box.checked = c.sources[v] === true;
    const n = testPool(currentSubject, c.type).filter(function (q) { return viewOf(q) === v; }).length;
    box.parentNode.querySelector(".test-pick-count").textContent = String(n);
  });
  const anySource = TEST_SOURCES.some(function (v) { return c.sources[v] === true; });

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
  document.getElementById("test-all-count").textContent = String(pickedPool(c.type).length);

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
  if (!anySource) { problem = "Pick at least one place the questions come from."; }
  else if (onRows.length === 0) { problem = "Pick at least one topic."; }
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

document.getElementById("test-create-back").addEventListener("click", function () {
  if (testCreateCameFrom === "subject") { openSubject(currentSubject); } else { openTests(); }
});

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
  const sources = TEST_SOURCES.filter(function (v) { return c.sources[v] === true; });
  const test = {
    id: newTestId(),
    subject: currentSubject,
    sources: sources,     // where the questions come from: "official" (Cases), "notes", "notebooklm"
    view: sources[0],     // kept for older versions of the app (one view per test)
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
  touchTest(test);
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
  const badge = document.getElementById("test-notes-badge");
  badge.textContent = sourceLabelOf(question);  // "Cases", "Notes" or "NotebookLM"
  badge.hidden = false;

  const isMcq = question.type === "mcq";
  document.getElementById("test-question-label").textContent = isMcq ? "Multiple choice" : "Fill in the blank";
  document.getElementById("test-choices").hidden = !isMcq;
  document.getElementById("test-fb-note").hidden = true;
  if (isMcq) { showTestMcq(test, question); } else { showTestFillBlank(test, question); }

  showTestTools(test);
  document.getElementById("test-prev").disabled = test.index === 0;
  document.getElementById("test-next").textContent = isLast ? "End test" : "Next ›";  // the last question: Next ends the test
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
      touchTest(test);
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
  testFb = fbWordsIn(prompt, question);
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

// A fill-in-the-blank item's words, drawn into "container" (each word in its own numbered
// span, as in practice): for each, its text, whether it's a key-term blank and its answer.
function fbWordsIn(container, question) {
  container.textContent = "";
  container.appendChild(richText(question.prompt, []));  // [] = every word in its own numbered span
  const words = Array.from(container.querySelectorAll(".hl-word"));
  const answers = blankAnswers(question.prompt, question.fullText);
  const blankCount = words.filter(function (w) { return BLANK.test(w.textContent); }).length;
  const usable = Boolean(answers) && answers.length === blankCount;
  let b = 0;
  return {
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
// "info" and "container": another item's words and box (the review screen); default: the test screen.
function drawTestBlanks(hidden, level, typed, info, container) {
  info = info || testFb;
  container = container || document.getElementById("test-prompt");
  info.words.forEach(function (w, n) {
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
  container.querySelectorAll(".fb-input").forEach(sizeBlankBox);
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
  touchTest(test);
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
  touchTest(test);
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
      const svg = icon("flag");
      if (svg instanceof Node) { mark.appendChild(svg); cell.appendChild(mark); }  // no icon (an old icons.js): the label still says it
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
  if (!test) { return; }
  if (test.index >= test.qIds.length - 1) { askEndTest(); } else { goToTestQuestion(test.index + 1); }
});
document.getElementById("test-back").addEventListener("click", function () {
  stopTestTimer();
  currentTestId = null;
  openTests();
});

// ---------- End test, grading and results ----------
// Grading: multiple choice is right if her pick is the correct letter. Fill in the blank is
// right only if EVERY box holds the right word (compared like Show answer: sameAnswer).
// Unanswered = not right. The results are fixed in the test when she ends it, so the score
// never changes if the content changes later.

// The boxes of a fill-in-the-blank item at the words hidden for it: [{ key, answer }].
// null if the item can't be checked (its content doesn't line up).
function testBoxAnswers(question, hidden, level) {
  const info = fbWordsIn(document.createElement("div"), question);
  if (!info.usable) { return null; }
  const boxes = [];
  hidden.forEach(function (n) {
    const w = info.words[n];
    if (!w || (w.inHeading && !w.isBlank)) { return; }
    if (w.isBlank) {
      const parts = blankParts(w, level);
      parts.forEach(function (part, k) {
        if (part.box) { boxes.push({ key: n + "." + k, answer: splitWord(part.text).middle }); }
      });
    } else {
      boxes.push({ key: String(n), answer: splitWord(w.text).middle });
    }
  });
  return boxes;
}

function gradeTestQuestion(test, question) {
  const answer = test.answers[question.id];
  if (answer === undefined) { return "none"; }
  if (question.type === "mcq") { return answer === question.correct ? "right" : "wrong"; }
  const hidden = test.hidden && Array.isArray(test.hidden[question.id]) ? test.hidden[question.id] : null;
  if (!hidden || !isPlainObject(answer)) { return "wrong"; }
  const boxes = testBoxAnswers(question, hidden, test.level);
  if (!boxes || boxes.length === 0) { return "wrong"; }
  return boxes.every(function (b) { return typeof answer[b.key] === "string" && sameAnswer(answer[b.key], b.answer); })
    ? "right" : "wrong";
}

function askEndTest() {
  const test = currentTest();
  if (!test) { return; }
  const unanswered = test.qIds.filter(function (id) { return !testAnswered(test, id); }).length;
  const parts = [];
  if (unanswered > 0) { parts.push(unanswered + " unanswered"); }
  if (test.flags.length > 0) { parts.push(test.flags.length + " flagged"); }
  const status = parts.length ? parts.join(", ") + "." : "All " + test.qIds.length + " answered.";
  askConfirm("End this test?", status + " You can't change your answers after this.", "End test").then(function (ok) {
    if (ok) { endTest(test.id); }
  });
}

document.getElementById("test-end").addEventListener("click", askEndTest);

// Grade the test, add each ANSWERED question to her progress once (the same record functions
// as practice: today's count, streak, latest result and mastery, Review missed, subject
// totals), and show the results. "counted" is set before anything is recorded, and all of it
// happens in one go, so a test can never be counted twice.
function endTest(id, firstNote) {
  stopTestTimer();  // the time used so far goes into the test first
  const test = findTest(id);
  if (!test || test.state !== "open") { openTests(); return; }
  dropMissingQuestions(test);
  const graded = [];
  test.results = {};
  test.qIds.forEach(function (qid) {
    const question = questionById(qid);
    const r = question ? gradeTestQuestion(test, question) : "none";
    const g = question ? [question.topic, subtopicOf(question)].filter(Boolean).join(" · ") : "";
    test.results[qid] = { r: r, g: g };
    if (question && r !== "none") { graded.push({ question: question, right: r === "right" }); }
  });
  test.state = "done";
  test.finished = new Date().toISOString();
  const countIt = !test.counted;
  test.counted = true;
  if (countIt) {
    graded.forEach(function (one) {
      if (one.question.type === "mcq") {
        recordMcq(one.question, one.right);
      } else {
        recordFillBlank(one.question, one.right ? "Got it" : "Missed it", test.level);  // mastery: Steady or harder only
      }
    });
  }
  // Keep the 30 newest finished tests (cleanTests): say so if an old one had to go.
  const doneBefore = progress.tests.filter(function (t) { return t.state === "done"; }).length;
  progress.tests = cleanTests(progress.tests);
  const doneAfter = progress.tests.filter(function (t) { return t.state === "done"; }).length;
  saveProgress();
  currentTestId = null;
  const notes = [];
  if (firstNote) { notes.push(firstNote); }
  if (doneAfter < doneBefore) { notes.push("Only the " + TESTS_DONE_MAX + " newest finished tests are kept, so your oldest one was removed."); }
  openTestResults(id, notes.join(" "));
}

function testScore(test) {
  const score = { right: 0, wrong: 0, none: 0, total: test.qIds.length };
  test.qIds.forEach(function (id) {
    const r = test.results && test.results[id] ? test.results[id].r : "none";
    score[r] = (score[r] || 0) + 1;
  });
  score.percent = score.total ? Math.round(100 * score.right / score.total) : 0;
  return score;
}

let resultsTestId = null;
function testResultsSpotId() { return resultsTestId; }

function openTestResults(id, note) {
  const test = findTest(id);
  if (!test || test.state !== "done") { openTests(); return false; }
  currentSubject = test.subject;
  resultsTestId = test.id;
  setIconLabel(document.getElementById("test-results-back"), "chevron-left", "My tests");
  document.getElementById("test-results-subject").textContent = test.subject + testViewLabel(test);
  document.getElementById("test-results-sub").textContent = testTitle(test) + " · Finished " + testDate(test.finished);
  const noteBox = document.getElementById("test-results-note");
  noteBox.textContent = note || "";
  noteBox.hidden = !note;
  const score = testScore(test);
  document.getElementById("test-score").textContent = score.percent + "%";
  document.getElementById("test-score-line").textContent = score.right + " of " + score.total + " right";
  document.getElementById("test-time-used").textContent = "Time used " + clockText(test.used) +
    (test.limit > 0 ? " of " + clockText(test.limit * 60) : "");
  document.getElementById("test-right").textContent = String(score.right);
  document.getElementById("test-wrong").textContent = String(score.wrong);
  document.getElementById("test-none").textContent = String(score.none);

  // By topic (and sub-topic), in the order they first come in the test.
  const groups = [];
  const byName = {};
  test.qIds.forEach(function (qid) {
    const one = test.results[qid] || { r: "none", g: "" };
    const name = one.g || "Other";
    if (!byName[name]) { byName[name] = { name: name, right: 0, total: 0 }; groups.push(byName[name]); }
    byName[name].total += 1;
    if (one.r === "right") { byName[name].right += 1; }
  });
  const box = document.getElementById("test-breakdown");
  box.innerHTML = "";
  groups.forEach(function (g) {
    const row = document.createElement("div");
    row.className = "test-break-row";
    const name = document.createElement("span");
    name.className = "test-break-name";
    name.textContent = g.name;
    const value = document.createElement("span");
    value.className = "test-break-value";
    value.textContent = g.right + " of " + g.total + " · " + Math.round(100 * g.right / g.total) + "%";
    const bar = document.createElement("span");
    bar.className = "test-break-bar";
    bar.setAttribute("aria-hidden", "true");
    const fill = document.createElement("span");
    fill.style.width = Math.round(100 * g.right / g.total) + "%";
    bar.appendChild(fill);
    row.append(name, value, bar);
    box.appendChild(row);
  });
  showScreen("screen-test-results");
  return true;
}

document.getElementById("test-results-back").addEventListener("click", function () {
  resultsTestId = null;
  openTests();
});
document.getElementById("test-results-done").addEventListener("click", function () {
  resultsTestId = null;
  openTests();
});

document.getElementById("test-review").addEventListener("click", function () {
  if (resultsTestId) { openTestReview(resultsTestId, "all", 0); }
});

// ---------- Review answers (a finished test, read-only) ----------
// One question at a time, filtered by All / Wrong / Flagged / Unanswered, with Previous / Next
// and a Question list to jump. Shows her answer next to the right one, the explanation and
// source (multiple choice), or her typed words marked right / wrong per box and the full text
// with the hidden words in bold (fill in the blank). Nothing here is recorded or changed.
const REVIEW_FILTERS = ["all", "wrong", "flagged", "none"];
const REVIEW_FILTER_NAMES = { all: "All", wrong: "Wrong", flagged: "Flagged", none: "Unanswered" };
let review = null;   // { id, filter, pos }

function reviewSpot() { return review ? { id: review.id, filter: review.filter, pos: review.pos } : null; }

function resultOf(test, id) {
  return test.results && test.results[id] ? test.results[id] : { r: "none", g: "" };
}

// The test's question numbers (0, 1, 2…) that the filter shows.
function reviewList(test, filter) {
  const list = [];
  test.qIds.forEach(function (id, i) {
    const r = resultOf(test, id).r;
    if (filter === "all" || (filter === "flagged" ? test.flags.indexOf(id) !== -1 : r === filter)) { list.push(i); }
  });
  return list;
}

function openTestReview(id, filter, pos) {
  const test = findTest(id);
  if (!test || test.state !== "done") { openTests(); return false; }
  currentSubject = test.subject;
  resultsTestId = test.id;   // Back goes to these results
  if (REVIEW_FILTERS.indexOf(filter) === -1 || reviewList(test, filter).length === 0) { filter = "all"; }
  const count = reviewList(test, filter).length;
  pos = (typeof pos === "number" && Math.floor(pos) === pos && pos >= 0 && pos < count) ? pos : 0;
  review = { id: test.id, filter: filter, pos: pos };
  setReviewListOpen(false);
  setIconLabel(document.getElementById("test-review-back"), "chevron-left", "Results");
  showReviewQuestion();
  return true;
}

function showReviewQuestion() {
  const test = review ? findTest(review.id) : null;
  if (!test) { openTests(); return; }
  const list = reviewList(test, review.filter);
  // The filter buttons, with their counts (an empty one can't be picked).
  document.querySelectorAll("#review-filter .seg-btn").forEach(function (btn) {
    const f = btn.dataset.filter;
    const n = reviewList(test, f).length;
    btn.textContent = "";
    const name = document.createElement("span");
    name.className = "review-filter-name";
    name.textContent = REVIEW_FILTER_NAMES[f];
    const num = document.createElement("span");
    num.className = "review-filter-count";
    num.textContent = String(n);
    btn.append(name, num);
    btn.disabled = n === 0 && f !== "all";
    btn.setAttribute("aria-pressed", f === review.filter ? "true" : "false");
    btn.setAttribute("aria-label", REVIEW_FILTER_NAMES[f] + ", " + n);
  });
  const empty = list.length === 0;
  document.getElementById("review-empty").hidden = !empty;
  document.getElementById("review-empty").textContent = "Nothing to show here.";
  document.getElementById("review-body").hidden = empty;
  if (empty) { showScreen("screen-test-review"); return; }
  if (review.pos >= list.length) { review.pos = list.length - 1; }
  const i = list[review.pos];
  const id = test.qIds[i];
  const one = resultOf(test, id);
  document.getElementById("test-review-progress").textContent = "Question " + (review.pos + 1) + " of " + list.length +
    (review.filter === "all" ? "" : " · test question " + (i + 1));
  document.getElementById("review-prev").disabled = review.pos === 0;
  document.getElementById("review-next").disabled = review.pos >= list.length - 1;

  // The result, in words (and a mark), never by color alone.
  const result = document.getElementById("review-result");
  result.textContent = "";
  result.className = "feedback-title review-result " + (one.r === "right" ? "got-text" : (one.r === "wrong" ? "missed-text" : "review-none"));
  if (one.r === "right") {
    const svg = icon("check");
    if (svg instanceof Node) { svg.classList.add("icon-lead"); result.appendChild(svg); }
    result.append("Right");
  } else {
    result.append(one.r === "wrong" ? "✗ Wrong" : "Unanswered");
  }
  if (test.flags.indexOf(id) !== -1) {
    const flag = document.createElement("span");
    flag.className = "review-flagged";
    const svg = icon("flag");
    if (svg instanceof Node) { svg.classList.add("icon-lead"); flag.appendChild(svg); }
    flag.append("Flagged");
    result.append(" ", flag);
  }

  const question = questionById(id);
  showReviewParts(test, question, one);
  if (!document.getElementById("review-list").hidden) { showReviewList(test, list); }
  showScreen("screen-test-review");
}

function showReviewParts(test, question, one) {
  const prompt = document.getElementById("review-prompt");
  const choices = document.getElementById("review-choices");
  const fullCard = document.getElementById("review-full-card");
  const explainCard = document.getElementById("review-explain-card");
  const note = document.getElementById("review-fb-note");
  choices.hidden = true;
  choices.innerHTML = "";
  fullCard.hidden = true;
  explainCard.hidden = true;
  note.hidden = true;
  showCorrection(document.getElementById("review-correction"), null);
  const ok = question && (question.type === "mcq" || question.type === "fillblank");
  document.getElementById("review-subject").textContent = ok ? question.subject : test.subject;
  document.getElementById("review-topic").textContent = ok ? [question.topic, subtopicOf(question)].filter(Boolean).join(" · ") : one.g;
  const view = ok ? viewOf(question) : "official";
  const badge = document.getElementById("review-notes-badge");
  badge.textContent = ok ? sourceLabelOf(question) : "";
  badge.hidden = !ok;
  const sourceLine = document.getElementById("review-source");
  sourceLine.textContent = ok ? reviewSourceLine(question, view) : "";
  sourceLine.hidden = sourceLine.textContent === "";
  if (!ok) {
    document.getElementById("review-label").textContent = "Question";
    prompt.textContent = "No longer in the app.";
    return;
  }
  document.getElementById("review-label").textContent = question.type === "mcq" ? "Multiple choice" : "Fill in the blank";
  if (question.type === "mcq") { showReviewMcq(test, question, prompt, choices); } else { showReviewFillBlank(test, question, prompt, note); }
  const discussion = typeof question.explanation === "string" ? question.explanation.trim() : "";
  explainCard.hidden = !discussion;
  document.getElementById("review-explain-label").textContent = question.type === "mcq" ? "Explanation" : "Discussion";
  setRichText(document.getElementById("review-explain"), discussion);
  showCorrection(document.getElementById("review-correction"), question);
}

// The source, in one short line: NotebookLM's note, or the case / rule. Class-notes questions show
// only their "Notes" label (no line), as on the question screen.
function reviewSourceLine(question, view) {
  const source = isPlainObject(question.source) ? question.source : {};
  if (view === "notebooklm") { return "Answer checked against the official text (see Basis)"; }
  if (view === "notes") { return ""; }
  const bits = [source.caseTitle, source.grNumber, source.part];
  return bits.filter(function (x) { return typeof x === "string" && x; }).join(" · ");
}

function showReviewMcq(test, question, prompt, choices) {
  prompt.textContent = "";
  prompt.appendChild(richText(question.prompt));
  const picked = test.answers[question.id];
  const all = isPlainObject(question.choices) ? question.choices : {};
  ["A", "B", "C", "D"].forEach(function (letter) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "choice";
    button.disabled = true;
    const mark = document.createElement("span");
    mark.className = "choice-letter";
    mark.textContent = letter;
    const text = document.createElement("span");
    text.className = "choice-text";
    setRichText(text, all[letter]);
    const tags = [];
    if (letter === question.correct) {
      button.classList.add("right");
      const svg = icon("check");
      if (svg instanceof Node) { mark.textContent = ""; mark.appendChild(svg); }
      tags.push("Correct answer");
    }
    if (letter === picked) {
      tags.push("Your answer");
      if (letter !== question.correct) {
        button.classList.add("wrong");
        mark.textContent = "✗";
      }
    }
    if (tags.length) {
      const tag = document.createElement("span");
      tag.className = "choice-tag";
      tag.textContent = tags.join(" · ");
      text.prepend(tag);
    }
    button.setAttribute("aria-label", letter + ". " + (tags.length ? tags.join(", ") + ". " : "") + text.textContent.replace(tags.join(" · "), ""));
    button.append(mark, text);
    choices.appendChild(button);
  });
  choices.hidden = false;
}

function showReviewFillBlank(test, question, prompt, note) {
  const info = fbWordsIn(prompt, question);
  const hidden = test.hidden && Array.isArray(test.hidden[question.id]) ? test.hidden[question.id] : null;
  if (!hidden) {
    // She never opened this item, so no boxes were ever made: just the full text.
    note.textContent = "You didn't open this item during the test.";
    note.hidden = false;
    prompt.textContent = "";
    prompt.appendChild(richText(question.fullText || question.prompt));
    return;
  }
  const typed = isPlainObject(test.answers[question.id]) ? test.answers[question.id] : {};
  drawTestBlanks(hidden, test.level, typed, info, prompt);
  const answers = {};
  (testBoxAnswers(question, hidden, test.level) || []).forEach(function (b) { answers[b.key] = b.answer; });
  let right = 0;
  let total = 0;
  prompt.querySelectorAll(".fb-input").forEach(function (box) {
    box.readOnly = true;
    box.tabIndex = -1;
    const answer = answers[box.dataset.word];
    if (answer === undefined) { return; }
    total += 1;
    const good = sameAnswer(box.value, answer);
    if (good) { right += 1; }
    box.classList.add(good ? "fb-right" : "fb-wrong");
    box.setAttribute("aria-label", good ? "Right" : "Wrong. The answer is: " + answer);
  });
  note.textContent = "You typed " + right + " of " + total + (total === 1 ? " blank" : " blanks") + " correctly · " +
    (FB_LEVEL_NAMES[test.level] || "");
  note.hidden = false;
  const full = typeof question.fullText === "string" ? question.fullText : "";
  setRichText(document.getElementById("review-full"), full ? reviewAnswerText(question, info, hidden, test.level)
    : "The full text for this item hasn't been added yet.");
  document.getElementById("review-full-card").hidden = false;
}

// The item's text with the hidden words in **bold** (like answerText in app.js, for these words).
function reviewAnswerText(question, info, hidden, level) {
  const full = question.fullText;
  if (!info.usable || full.indexOf("**") !== -1 || question.prompt.indexOf("**") !== -1) { return full; }
  let n = 0;
  return question.prompt.split(/(\s+)/).map(function (bit) {
    if (bit === "" || /^\s+$/.test(bit)) { return bit; }
    const w = info.words[n];
    const hide = hidden.indexOf(n) !== -1;
    n += 1;
    if (!w) { return bit; }
    if (w.isBlank) { return bit.replace(BLANK, hide ? markedAnswer(w, level) : w.answer); }
    if (!hide) { return bit; }
    const m = bit.match(/^([^A-Za-zÀ-ÿ0-9]*)(.*?)([^A-Za-zÀ-ÿ0-9]*)$/);
    return m[1] + "**" + m[2] + "**" + m[3];
  }).join("");
}

// The Question list: one square per question in the filter, marked right (check) / wrong (✗) / unanswered.
function showReviewList(test, list) {
  const grid = document.getElementById("review-list-grid");
  grid.innerHTML = "";
  list.forEach(function (i, pos) {
    const id = test.qIds[i];
    const r = resultOf(test, id).r;
    const cell = document.createElement("button");
    cell.type = "button";
    cell.className = "test-cell" + (r === "right" ? " is-right" : (r === "wrong" ? " is-wrong" : "")) + (pos === review.pos ? " is-current" : "");
    cell.textContent = String(i + 1);
    const mark = document.createElement("span");
    mark.className = "review-cell-mark";
    if (r === "right") {
      const svg = icon("check");
      if (svg instanceof Node) { mark.appendChild(svg); cell.appendChild(mark); }
    } else if (r === "wrong") {
      mark.textContent = "✗";
      cell.appendChild(mark);
    }
    cell.setAttribute("aria-label", "Question " + (i + 1) + ", " + (r === "right" ? "right" : (r === "wrong" ? "wrong" : "unanswered")) +
      (test.flags.indexOf(id) !== -1 ? ", flagged" : "") + (pos === review.pos ? ", you are here" : ""));
    if (pos === review.pos) { cell.setAttribute("aria-current", "true"); }
    cell.addEventListener("click", function () {
      setReviewListOpen(false);
      review.pos = pos;
      showReviewQuestion();
    });
    grid.appendChild(cell);
  });
}

function setReviewListOpen(open) {
  document.getElementById("review-list").hidden = !open;
  document.getElementById("review-list-btn").setAttribute("aria-expanded", open ? "true" : "false");
  const test = review ? findTest(review.id) : null;
  if (open && test) { showReviewList(test, reviewList(test, review.filter)); }
}

document.getElementById("review-list-btn").addEventListener("click", function () {
  setReviewListOpen(document.getElementById("review-list").hidden);
});
document.querySelectorAll("#review-filter .seg-btn").forEach(function (btn) {
  btn.addEventListener("click", function () {
    if (!review || btn.disabled || review.filter === btn.dataset.filter) { return; }
    review.filter = btn.dataset.filter;
    review.pos = 0;
    showReviewQuestion();
  });
});
document.getElementById("review-prev").addEventListener("click", function () {
  if (review && review.pos > 0) { review.pos -= 1; showReviewQuestion(); }
});
document.getElementById("review-next").addEventListener("click", function () {
  if (review) { review.pos += 1; showReviewQuestion(); }
});
document.getElementById("test-review-back").addEventListener("click", function () {
  const id = review ? review.id : resultsTestId;
  review = null;
  setReviewListOpen(false);
  if (!id || !openTestResults(id)) { openTests(); }
});

// ---------- The timer ----------
// It counts only while the test screen is showing AND the app is in view: leaving the screen
// (Back, the menu, Settings…), switching apps, locking the phone or closing the app stops it
// (testScreenChanged is called by showScreen in app.js; visibilitychange / pagehide below).
// Time is measured with the clock between ticks (Date.now), not by counting ticks, so a slowed
// tab doesn't drift; one gap is never counted as more than TIMER_MAX_GAP seconds (a phone that
// slept without telling us). "used" (whole seconds) is saved every TIMER_SAVE_EVERY seconds and
// whenever the timer stops. An untimed test counts its time too (shown on the results only).
// Time's up: the test is submitted exactly like End test (endTest), then its results show.
const TIMER_SAVE_EVERY = 5;   // seconds
const TIMER_MAX_GAP = 10;     // seconds
const TIMER_NOTICES = [300, 60];  // a gentle notice at 5 minutes and 1 minute left
let testTimer = null;         // { id, last (ms), carry (ms not yet whole seconds), unsaved, interval }

function testSecondsLeft(test) {
  return Math.max(0, test.limit * 60 - test.used);
}

// 754 -> "12:34"; 3725 -> "1:02:05"
function clockText(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, "0");
  return h > 0 ? h + ":" + String(m).padStart(2, "0") + ":" + sec : m + ":" + sec;
}

function showTestTimer(test) {
  const box = document.getElementById("test-timer");
  box.hidden = !(test && test.limit > 0);
  if (box.hidden) { return; }
  const left = testSecondsLeft(test);
  box.textContent = clockText(left) + " left";
  box.classList.toggle("is-low", left <= 60);
  box.setAttribute("aria-label", "Time left: " + clockText(left));
}

let timeNoteTimer = null;
function showTimeNote(text) {
  const note = document.getElementById("test-time-note");
  note.textContent = text;
  clearTimeout(timeNoteTimer);
  timeNoteTimer = setTimeout(function () { note.textContent = ""; }, 10000);
}

function startTestTimer() {
  stopTestTimer();
  const test = currentTest();
  if (!test || test.state !== "open" || shownScreen !== "screen-test" || document.visibilityState === "hidden") { return; }
  testTimer = { id: test.id, last: Date.now(), carry: 0, unsaved: 0, interval: null };
  testTimer.interval = setInterval(tickTestTimer, 1000);
  showTestTimer(test);
  if (test.limit > 0 && testSecondsLeft(test) <= 0) {
    setTimeout(function () { timeUp(test.id); }, 0);  // opened with no time left (after the screen is shown)
  }
}

// Add the time since the last tick to the test. Returns the test (or null).
function addTimerTime() {
  if (!testTimer) { return null; }
  const test = findTest(testTimer.id);
  const now = Date.now();
  const gap = Math.min(Math.max(0, now - testTimer.last), TIMER_MAX_GAP * 1000);
  testTimer.last = now;
  if (!test || test.state !== "open") { return null; }
  testTimer.carry += gap;
  const whole = Math.floor(testTimer.carry / 1000);
  if (whole > 0) {
    testTimer.carry -= whole * 1000;
    const before = test.limit > 0 ? testSecondsLeft(test) : 0;
    test.used += whole;
    testTimer.unsaved += whole;
    if (test.limit > 0) {
      const left = testSecondsLeft(test);
      TIMER_NOTICES.forEach(function (at) {
        if (before > at && left <= at && left > 0) {
          showTimeNote(at >= 120 ? Math.round(at / 60) + " minutes left." : "1 minute left.");
        }
      });
    }
  }
  return test;
}

function tickTestTimer() {
  if (!testTimer) { return; }
  // Not on the test screen anymore, or the app is hidden: stop without counting.
  if (shownScreen !== "screen-test" || document.visibilityState === "hidden" || currentTestId !== testTimer.id) {
    stopTestTimer(true);
    return;
  }
  const test = addTimerTime();
  if (!test) { stopTestTimer(true); return; }
  if (testTimer.unsaved >= TIMER_SAVE_EVERY) {
    testTimer.unsaved = 0;
    saveProgress();
  }
  showTestTimer(test);
  if (test.limit > 0 && testSecondsLeft(test) <= 0) { timeUp(test.id); }
}

// Stop the timer and save the time used. "noCount": don't add the time since the last tick.
function stopTestTimer(noCount) {
  if (!testTimer) { return; }
  clearInterval(testTimer.interval);
  if (!noCount) { addTimerTime(); }
  const counted = testTimer.unsaved > 0;
  testTimer = null;
  if (counted || !noCount) { saveProgress(); }
}

function timeUp(id) {
  stopTestTimer();
  const test = findTest(id);
  if (!test || test.state !== "open") { return; }
  test.used = Math.max(test.used, test.limit * 60);
  if (typeof confirmDone !== "undefined" && confirmDone) { closeConfirm(false); }  // an open "End this test?" question
  endTest(id, "Time's up. Your test was submitted with the answers you gave.");
}

// Called by showScreen (app.js) on every screen change: the timer runs only on the test screen.
function testScreenChanged(id) {
  if (id === "screen-test") { startTestTimer(); } else { stopTestTimer(); }
}

document.addEventListener("visibilitychange", function () {
  if (document.visibilityState === "hidden") { stopTestTimer(); return; }
  if (shownScreen === "screen-test") { startTestTimer(); }
});
window.addEventListener("pagehide", function () { stopTestTimer(); });

// ---------- The subject screen's big card, and the My tests card ----------
// The big card: "Continue test" (that test's name, "Question N of M", time left) when this subject
// has an unfinished test (any sources): the one she used most
// recently (lastUsed; older tests: when they were made). Otherwise "Create a test", greyed out
// with the reason when there's nothing here a test can use. Under it, only with Continue test,
// a small "Create a new test" link. The My tests card counts this subject's tests (all views).

// She opened, answered or moved in a test: remember when (for "the most recently used").
function touchTest(test) {
  test.lastUsed = new Date().toISOString();
}

function lastUsedOf(test) {
  return new Date(test.lastUsed || test.made).getTime() || 0;
}

function continueTestHere(subject) {
  return testsOf(subject, "open")
    .sort(function (a, b) { return lastUsedOf(b) - lastUsedOf(a); })[0] || null;
}

function showSubjectTestCard(subject) {
  const card = document.getElementById("start-card");
  const title = document.getElementById("start-title");
  const sub = document.getElementById("start-sub");
  const link = document.getElementById("start-new-test");
  const open = continueTestHere(subject);
  const canMake = testPool(subject, "both").length > 0;
  if (open) {
    title.textContent = "Continue test: " + testTitle(open);
    sub.textContent = "Question " + (open.index + 1) + " of " + open.qIds.length +
      (open.limit > 0 ? " · " + Math.max(1, Math.ceil(testSecondsLeft(open) / 60)) + " min left" : "");
    card.disabled = false;
    card.dataset.action = "continue-test";
    card.dataset.testId = open.id;
    link.hidden = !canMake;
  } else {
    title.textContent = "Create a test";
    sub.textContent = canMake ? "Pick topics, how many questions, and a timer"
      : "No multiple choice or fill-in-the-blank questions here.";
    card.disabled = !canMake;
    card.dataset.action = "create-test";
    delete card.dataset.testId;
    link.hidden = true;
  }
  const unfinished = testsOf(subject, "open").length;
  const finished = testsOf(subject, "done").length;
  // "2 unfinished · 5 finished", "1 finished", "1 unfinished" (zeros left out) or "No tests yet".
  const parts = [];
  if (unfinished > 0) { parts.push(unfinished + " unfinished"); }
  if (finished > 0) { parts.push(finished + " finished"); }
  document.getElementById("tests-card-meta").textContent = parts.length ? parts.join(" · ") : "No tests yet";
}

document.getElementById("start-card").addEventListener("click", function (event) {
  const card = event.currentTarget;
  if (card.dataset.action === "continue-test" && card.dataset.testId) {
    if (!openTest(card.dataset.testId)) { showSubjectTestCard(currentSubject); }
    return;
  }
  openTestCreate("subject");
});
document.getElementById("start-new-test").addEventListener("click", function () { openTestCreate("subject"); });

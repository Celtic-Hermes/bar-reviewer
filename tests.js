// ---------- Tests (one subject's tests) ----------
// Being built in steps (see "Tests" in CLAUDE.md). Step 1: the Tests card on the subject
// screen opens this subject's Tests screen: "Create a test" (not working yet) and the two
// lists, Unfinished and Finished (empty for now: no tests are saved yet).
// Uses things from app.js: currentSubject, showScreen, openSubject, setIconLabel.

function openTests() {
  const subject = currentSubject;
  setIconLabel(document.getElementById("tests-back"), "chevron-left", subject);
  document.getElementById("tests-subject").textContent = subject;
  // No tests are saved yet (step 1), so both lists show their "nothing here" note.
  document.getElementById("tests-unfinished").innerHTML = "";
  document.getElementById("tests-finished").innerHTML = "";
  document.getElementById("tests-unfinished-empty").hidden = false;
  document.getElementById("tests-finished-empty").hidden = false;
  showScreen("screen-tests");
}

document.getElementById("tests-card").addEventListener("click", openTests);

document.getElementById("tests-back").addEventListener("click", function () {
  openSubject(currentSubject);
});

// "Find in case": shows where words she highlighted in a question come from in the case.
//
// 1. She highlights words in the question (tap them, as usual), then taps "🔍 Find in case".
// 2. We take the highlighted phrase (the one she highlighted most recently, if several),
//    and look for those exact words in the full text of the question's case.
// 3. Found: a panel slides up showing a few sentences around that spot, with her words
//    in bold italics.
//    Not found (common: questions are reworded, not copied), or no words highlighted,
//    or the full text can't be loaded: the panel shows the question's own source passage
//    instead, clearly labeled "Closest sourced passage".
// The panel closes by swiping it down, tapping outside it, or tapping ✕.
// Uses things from app.js: session, findCase, loadCaseText, highlightedWords, lastPromptWord.

const CONTEXT_SENTENCES = 2;   // sentences shown before and after the match
const CONTEXT_MAX_WORDS = 90;  // but never more than this many words on each side

const caseTextMemory = {};     // full texts already downloaded while the app is open

// ---------- Words, ready for comparing ----------
// "Husband's" → "husbands", "complaint[1]" → "complaint", "—" → "" (skipped).
// Ignoring case, punctuation and footnote numbers lets "clinic," match "clinic".
function comparable(word) {
  return word.toLowerCase()
    .replace(/\[\d+\]/g, "")
    .replace(/[^a-z0-9ñáéíóú]/g, "");
}

// Every word of a text, with where it sits in the text (so we can show the original).
function wordsOf(text) {
  const words = [];
  const pattern = /\S+/g;
  let found;
  while ((found = pattern.exec(text)) !== null) {
    const key = comparable(found[0]);
    if (key) {
      words.push({ key: key, raw: found[0], start: found.index, end: found.index + found[0].length });
    }
  }
  return words;
}

// Every place where "phrase" (a list of comparable words) appears, as word positions.
function findPhrase(words, phrase) {
  const spots = [];
  if (phrase.length === 0) { return spots; }
  for (let i = 0; i + phrase.length <= words.length; i++) {
    let same = true;
    for (let j = 0; j < phrase.length; j++) {
      if (words[i + j].key !== phrase[j]) { same = false; break; }
    }
    if (same) { spots.push(i); }
  }
  return spots;
}

// ---------- Which words did she pick? ----------
// Her highlighted words in this question, grouped into runs of next-door words.
// Gives back the run with the word she highlighted most recently (or the first run).
function pickedPhrase(question) {
  const positions = highlightedWords(question.id).slice().sort(function (a, b) { return a - b; });
  if (positions.length === 0) { return null; }
  const runs = [];
  positions.forEach(function (n) {
    const run = runs[runs.length - 1];
    if (run && n === run[run.length - 1] + 1) { run.push(n); } else { runs.push([n]); }
  });
  const chosen = runs.find(function (run) { return run.indexOf(lastPromptWord) !== -1; }) || runs[0];
  const promptWords = document.querySelectorAll("#prompt .hl-word");
  const text = chosen.map(function (n) { return promptWords[n] ? promptWords[n].textContent : ""; }).join(" ").trim();
  return text || null;
}

// ---------- Sentences around the match ----------
// Short words ending in "." that don't end a sentence ("G.R. No. 123", "Atty. Cruz", "Id.").
const NOT_SENTENCE_ENDS = ["no", "nos", "atty", "jr", "sr", "v", "vs", "gr", "inc", "co", "corp", "art",
  "arts", "sec", "secs", "p", "pp", "id", "eg", "ie", "mr", "mrs", "ms", "dr", "st", "j", "jj", "rollo", "ra", "par"];

function endsSentence(word) {
  const raw = word.raw.replace(/\[\d+\]/g, "");  // "subsists.[6]" ends a sentence too
  if (!/[.?!]["'”’)]*$/.test(raw)) { return false; }
  if (/^[A-Z]\.$/.test(raw)) { return false; }  // an initial, like "N."
  return NOT_SENTENCE_ENDS.indexOf(word.key) === -1;
}

// Is there a blank line (new paragraph) between word i-1 and word i?
function paragraphBreakBefore(text, words, i) {
  return i > 0 && text.slice(words[i - 1].end, words[i].start).indexOf("\n\n") !== -1;
}

// From the match, go back and forward a few sentences (stopping at paragraph edges).
function contextAround(text, words, first, last) {
  let from = first;
  let ends = 0;
  while (from > 0 && first - from < CONTEXT_MAX_WORDS && !paragraphBreakBefore(text, words, from)) {
    if (endsSentence(words[from - 1])) {
      ends += 1;
      if (ends > CONTEXT_SENTENCES) { break; }
    }
    from -= 1;
  }
  let to = last;
  ends = endsSentence(words[last]) ? 1 : 0;
  while (to < words.length - 1 && to - last < CONTEXT_MAX_WORDS && ends < CONTEXT_SENTENCES + 1 &&
         !paragraphBreakBefore(text, words, to + 1)) {
    to += 1;
    if (endsSentence(words[to])) { ends += 1; }
  }
  return { from: from, to: to };
}

// ---------- Searching ----------
// The cases to search: the question's source case first, then its other linked cases.
function casesToSearch(question) {
  const ids = [];
  const source = question.source || {};
  const sourceCase = allCases.find(function (c) { return c.grNumber && c.grNumber === source.grNumber; });
  if (sourceCase) { ids.push(sourceCase.id); }
  (Array.isArray(question.caseIds) ? question.caseIds : []).forEach(function (id) {
    if (ids.indexOf(id) === -1 && findCase(id)) { ids.push(id); }
  });
  return ids;
}

function getCaseText(caseId) {
  if (caseTextMemory[caseId]) { return Promise.resolve(caseTextMemory[caseId]); }
  return loadCaseText(caseId).then(function (text) {
    caseTextMemory[caseId] = text;
    return text;
  });
}

// Look for the phrase in each case, one after another. Gives back the first match found,
// plus whether any case's text couldn't be loaded (to explain a "not found").
function searchCases(caseIds, phraseText, excerpt) {
  const phrase = wordsOf(phraseText).map(function (w) { return w.key; });
  let couldntLoad = false;
  let index = 0;
  function next() {
    if (index >= caseIds.length) { return Promise.resolve({ found: null, couldntLoad: couldntLoad }); }
    const caseId = caseIds[index++];
    return getCaseText(caseId).then(function (text) {
      const words = wordsOf(text);
      const spots = findPhrase(words, phrase);
      if (spots.length === 0) { return next(); }
      // Several matches: pick the one nearest the question's own source passage.
      let best = spots[0];
      const excerptWords = wordsOf(excerpt || "").map(function (w) { return w.key; }).slice(0, 8);
      const excerptSpot = excerptWords.length >= 3 ? findPhrase(words, excerptWords)[0] : undefined;
      if (excerptSpot !== undefined) {
        spots.forEach(function (s) { if (Math.abs(s - excerptSpot) < Math.abs(best - excerptSpot)) { best = s; } });
      }
      return { found: { caseId: caseId, text: text, words: words, first: best, last: best + phrase.length - 1, count: spots.length }, couldntLoad: couldntLoad };
    }, function () {
      couldntLoad = true;
      return next();
    });
  }
  return next();
}

// ---------- The panel ----------
function caseLabel(caseId, source) {
  const theCase = caseId ? findCase(caseId) : null;
  const name = theCase ? theCase.name : (source && source.caseTitle);
  const number = theCase ? theCase.grNumber : (source && source.grNumber);
  return [name, number].filter(Boolean).join(" · ");
}

function showMatch(found) {
  document.getElementById("find-title").textContent = "Found in the full text";
  document.getElementById("find-case").textContent = caseLabel(found.caseId);
  const note = document.getElementById("find-note");
  note.hidden = found.count < 2;
  note.textContent = "These words appear " + found.count + " times in the decision. Showing the one nearest this question's source passage.";
  document.getElementById("find-part").hidden = true;

  const range = contextAround(found.text, found.words, found.first, found.last);
  const w = found.words;
  const box = document.getElementById("find-text");
  box.textContent = "";
  // Built from plain text pieces only (never innerHTML).
  // "…" only where the passage is cut in the middle of a sentence.
  const cutBefore = range.from > 0 && !paragraphBreakBefore(found.text, w, range.from) && !endsSentence(w[range.from - 1]);
  const cutAfter = range.to < w.length - 1 && !paragraphBreakBefore(found.text, w, range.to + 1) && !endsSentence(w[range.to]);
  if (cutBefore) { addPiece(box, "… ", "find-cut"); }
  box.appendChild(document.createTextNode(found.text.slice(w[range.from].start, w[found.first].start)));
  addPiece(box, found.text.slice(w[found.first].start, w[found.last].end), "find-match");
  box.appendChild(document.createTextNode(found.text.slice(w[found.last].end, w[range.to].end)));
  if (cutAfter) { addPiece(box, " …", "find-cut"); }
}

function addPiece(parent, text, className) {
  const span = document.createElement("span");
  span.className = className;
  span.textContent = text;
  parent.appendChild(span);
  return span;
}

// No literal match (or nothing to search): show the question's own source passage.
function showClosest(question, reason) {
  const source = question.source || {};
  document.getElementById("find-title").textContent = "Closest sourced passage";
  document.getElementById("find-case").textContent = caseLabel(null, source) || "Source not recorded";
  const note = document.getElementById("find-note");
  note.textContent = reason;
  note.hidden = false;
  const part = document.getElementById("find-part");
  part.textContent = source.part ? "From: " + source.part : "";
  part.hidden = !source.part;
  const box = document.getElementById("find-text");
  box.textContent = "";
  const excerpt = typeof source.excerpt === "string" ? source.excerpt.trim() : "";
  box.appendChild(document.createTextNode(excerpt ? "“" + plainText(excerpt) + "”" : "No source passage is recorded for this question yet."));
}

const sheet = document.getElementById("find-sheet");
const backdrop = document.getElementById("find-backdrop");
let sheetOpen = false;

function openSheet() {
  sheetOpen = true;
  sheet.hidden = false;
  backdrop.hidden = false;
  document.body.classList.add("sheet-open");
  sheet.style.transform = "";
  void sheet.offsetHeight;  // let the browser place it below the screen first, so it slides up
  sheet.classList.add("open");
  backdrop.classList.add("open");
  document.getElementById("find-close").focus({ preventScroll: true });
}

function closeSheet() {
  if (!sheetOpen) { return; }
  sheetOpen = false;
  sheet.classList.remove("open", "dragging");
  sheet.style.transform = "";
  backdrop.classList.remove("open");
  document.body.classList.remove("sheet-open");
  setTimeout(function () {
    if (!sheetOpen) { sheet.hidden = true; backdrop.hidden = true; }
  }, 300);
  document.getElementById("find-btn").focus({ preventScroll: true });
}

// Put the bold-italic match in the middle of the panel's scrolling area.
function centerMatch() {
  const body = document.getElementById("find-body");
  const match = body.querySelector(".find-match");
  body.scrollTop = 0;
  if (!match) { return; }
  const bodyBox = body.getBoundingClientRect();
  const matchBox = match.getBoundingClientRect();
  body.scrollTop = Math.max(0, matchBox.top - bodyBox.top - (body.clientHeight - matchBox.height) / 2);
}

document.getElementById("find-btn").addEventListener("click", function () {
  const question = session && session.questions[session.index];
  if (!question || this.hidden) { return; }  // only after she has answered
  const phrase = pickedPhrase(question);

  // Show the panel right away ("Searching…"), then fill it in.
  document.getElementById("find-title").textContent = "Searching…";
  document.getElementById("find-case").textContent = "";
  document.getElementById("find-note").hidden = true;
  document.getElementById("find-part").hidden = true;
  document.getElementById("find-text").textContent = phrase ? "Looking for “" + phrase + "” in the decision…" : "";
  openSheet();

  if (!phrase) {
    showClosest(question, "Tip: highlight words in the question first (tap them), then tap Find in case to look for them in the decision. Meanwhile, here is this question's source passage.");
    centerMatch();
    return;
  }
  const caseIds = casesToSearch(question);
  searchCases(caseIds, phrase, (question.source || {}).excerpt).then(function (result) {
    if (!sheetOpen || session.questions[session.index] !== question) { return; }
    if (result.found) {
      showMatch(result.found);
    } else if (caseIds.length === 0) {
      showClosest(question, "This question isn't linked to a case with full text, so here is its source passage.");
    } else if (result.couldntLoad) {
      showClosest(question, "Couldn't load the case's full text (you may be offline, and it hasn't been opened on this phone before). Here is this question's source passage instead.");
    } else {
      showClosest(question, "“" + phrase + "” doesn't appear word for word in the decision (questions are usually reworded). Here is the passage this question was based on.");
    }
    centerMatch();
  });
});

// ---------- Closing: tap outside, ✕, Escape, or swipe down ----------
backdrop.addEventListener("click", closeSheet);
document.getElementById("find-close").addEventListener("click", closeSheet);
document.addEventListener("keydown", function (event) {
  if (event.key === "Escape" && sheetOpen) { closeSheet(); }
});

// Swipe down: drag the top of the panel (or the text, when it's scrolled to the top).
// It follows her finger; let go far enough down and it closes, otherwise it springs back.
let dragStartY = null;
let dragDistance = 0;

function startSheetDrag(y) {
  dragStartY = y;
  dragDistance = 0;
  sheet.classList.add("dragging");
}
function moveSheetDrag(y) {
  dragDistance = Math.max(0, y - dragStartY);
  sheet.style.transform = "translateY(" + dragDistance + "px)";
}
function endSheetDrag() {
  if (dragStartY === null) { return; }
  dragStartY = null;
  sheet.classList.remove("dragging");
  sheet.style.transform = "";
  if (dragDistance > Math.min(100, sheet.offsetHeight * 0.25)) { closeSheet(); }
}

const grab = document.getElementById("find-grab");
grab.addEventListener("pointerdown", function (event) {
  if (event.target.closest(".sheet-close")) { return; }
  grab.setPointerCapture(event.pointerId);
  startSheetDrag(event.clientY);
});
grab.addEventListener("pointermove", function (event) {
  if (dragStartY !== null) { moveSheetDrag(event.clientY); }
});
grab.addEventListener("pointerup", endSheetDrag);
grab.addEventListener("pointercancel", endSheetDrag);

// In the text area, a downward swipe closes the panel only when the text is already
// scrolled to the top; otherwise it just scrolls the text as normal.
const sheetBody = document.getElementById("find-body");
let bodyTouchY = null;
sheetBody.addEventListener("touchstart", function (event) {
  bodyTouchY = event.touches[0].clientY;
}, { passive: true });
sheetBody.addEventListener("touchmove", function (event) {
  if (bodyTouchY === null) { return; }
  const y = event.touches[0].clientY;
  if (dragStartY === null) {
    if (sheetBody.scrollTop <= 0 && y > bodyTouchY + 8) {
      startSheetDrag(bodyTouchY);
    } else {
      return;
    }
  }
  event.preventDefault();  // move the panel, not the text
  moveSheetDrag(y);
}, { passive: false });
sheetBody.addEventListener("touchend", function () { bodyTouchY = null; endSheetDrag(); });
sheetBody.addEventListener("touchcancel", function () { bodyTouchY = null; endSheetDrag(); });

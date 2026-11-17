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

// How much of the decision to show around a match: the whole paragraph it's in, plus
// neighbouring paragraphs, so the Court's reasoning is visible and not just one sentence.
// Before the match (where the reasoning usually is): add earlier paragraphs until there
// are about BEFORE_MIN words, but at most BEFORE_PARAGRAPHS paragraphs and BEFORE_MAX words,
// and stop at a section heading (like "Our Ruling"). After the match: a little less.
const BEFORE_MIN = 200, BEFORE_MAX = 450, BEFORE_PARAGRAPHS = 3;
const AFTER_MIN = 60, AFTER_MAX = 250, AFTER_PARAGRAPHS = 2;

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
// Dashes count as spaces ("privacy––usually" is two words), and so does a period run
// straight into a capital letter ("person.Availment", a typo in one decision).
function wordsOf(text) {
  const words = [];
  const pattern = /[^\s—–]+/g;
  let found;
  while ((found = pattern.exec(text)) !== null) {
    found[0].replace(/([a-z]\.)(?=[A-Z])/g, "$1\u0000").split("\u0000").reduce(function (offset, piece) {
      const key = comparable(piece);
      if (key) {
        words.push({ key: key, raw: piece, start: found.index + offset, end: found.index + offset + piece.length });
      }
      return offset + piece.length;
    }, 0);
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

// The first and last word of the paragraph that word i is in.
function paragraphStart(text, words, i) {
  while (i > 0 && !paragraphBreakBefore(text, words, i)) { i -= 1; }
  return i;
}
function paragraphEnd(text, words, i) {
  while (i < words.length - 1 && !paragraphBreakBefore(text, words, i + 1)) { i += 1; }
  return i;
}

// A short paragraph with no sentence in it, like "Our Ruling" or "The Antecedents".
function isHeading(words, from, to) {
  return to - from < 8 && !endsSentence(words[to]);
}

// Where the "Footnotes" list starts (or the end of the text if there is none).
function footnotesStart(text, words) {
  for (let i = words.length - 1; i > 0; i--) {
    if (words[i].raw === "Footnotes" && paragraphBreakBefore(text, words, i)) { return i; }
  }
  return words.length;
}

// The stretch of the decision to show around words first…last (see the numbers at the top).
// Never mixes the decision's body with its footnotes.
// "quoteWords": how long the whole quote is (all its pieces), if more than first…last.
function contextAround(text, words, first, last, quoteWords) {
  const notes = footnotesStart(text, words);
  const lowest = first >= notes ? notes + 1 : 0;
  const highest = first >= notes ? words.length - 1 : notes - 1;

  // A long quote (100+ words) already carries its own reasoning: just its own paragraphs.
  const passageWords = Math.max(last - first + 1, quoteWords || 0);
  const wantBefore = passageWords >= 100 ? 0 : BEFORE_MIN - passageWords;
  const wantAfter = passageWords >= 100 ? 0 : AFTER_MIN - passageWords;

  let from = paragraphStart(text, words, first);
  let added = 0;
  while (from > lowest && added < BEFORE_PARAGRAPHS && first - from < wantBefore) {
    const start = Math.max(lowest, paragraphStart(text, words, from - 1));
    if (first - start > BEFORE_MAX) { break; }
    const heading = isHeading(words, start, from - 1);
    from = start;
    added += 1;
    if (heading) { break; }  // the section starts here
  }

  let to = Math.min(highest, paragraphEnd(text, words, last));
  added = 0;
  while (to < highest && added < AFTER_PARAGRAPHS && to - last < wantAfter) {
    const end = Math.min(highest, paragraphEnd(text, words, to + 1));
    if (isHeading(words, to + 1, end) || end - last > AFTER_MAX) { break; }  // next section, or too long
    to = end;
    added += 1;
  }
  return { from: from, to: to };
}

// Where the question's source excerpt is in the decision: a list of word ranges
// [{ first, last }, …], one per piece (excerpts skip stretches with " … "), or null.
function findExcerpt(words, excerpt) {
  const pieces = plainText(excerpt || "").split("…")
    .map(function (piece) { return wordsOf(piece).map(function (w) { return w.key; }); })
    .filter(function (keys) { return keys.length > 0; });
  if (pieces.length === 0) { return null; }
  const ranges = [];
  let from = 0;
  for (let p = 0; p < pieces.length; p++) {
    const spot = findPhrase(words, pieces[p]).find(function (s) { return s >= from; });
    if (spot === undefined) { return looseExcerpt(words, pieces); }
    ranges.push({ first: spot, last: spot + pieces[p].length - 1 });
    from = spot + pieces[p].length;
  }
  return ranges;
}

// Fallback for a quote that adds words in [brackets] or isn't split with "…":
// look for its first and last few words, close together.
function looseExcerpt(words, pieces) {
  const keys = [].concat.apply([], pieces);
  if (keys.length < 3) { return null; }
  const size = Math.min(6, keys.length);
  const head = findPhrase(words, keys.slice(0, size));
  const tail = findPhrase(words, keys.slice(keys.length - size));
  for (let h = 0; h < head.length; h++) {
    for (let t = 0; t < tail.length; t++) {
      const last = tail[t] + size - 1;
      if (last > head[h] && last - head[h] < keys.length * 2) { return [{ first: head[h], last: last }]; }
    }
  }
  return null;
}

// Fill the panel's text area: the quoted words (one or more ranges, in order) in bold
// italics, each inside its surrounding paragraphs. Pieces far apart in the decision are
// shown as separate stretches with a "· · ·" between them, instead of everything between.
// Built from plain text pieces only (never innerHTML).
function showInContext(text, words, ranges) {
  const groups = [];
  const quoteWords = ranges.reduce(function (sum, r) { return sum + r.last - r.first + 1; }, 0);
  ranges.forEach(function (r) {
    const win = contextAround(text, words, r.first, r.last, quoteWords);
    const prev = groups[groups.length - 1];
    if (prev && win.from <= prev.to + 120) {  // close together: show what's between, too
      prev.to = Math.max(prev.to, win.to);
      prev.ranges.push(r);
    } else {
      groups.push({ from: win.from, to: win.to, ranges: [r] });
    }
  });
  const box = document.getElementById("find-text");
  box.textContent = "";
  groups.forEach(function (g, n) {
    if (n > 0) { addPiece(box, "\n\n· · ·\n\n", "find-gap"); }
    let at = g.from;
    g.ranges.forEach(function (r) {
      if (r.first > at) { box.appendChild(document.createTextNode(text.slice(words[at].start, words[r.first].start))); }
      addPiece(box, text.slice(words[r.first].start, words[r.last].end), "find-match");
      if (r.last < g.to) { box.appendChild(document.createTextNode(text.slice(words[r.last].end, words[r.last + 1].start))); }
      at = r.last + 1;
    });
    if (at <= g.to) { box.appendChild(document.createTextNode(text.slice(words[at].start, words[g.to].end))); }
  });
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
// The case line at the top of the panel: the case name in bold, then its G.R. number.
function showCaseLabel(caseId, source) {
  const theCase = caseId ? findCase(caseId) : null;
  const name = theCase ? theCase.name : (source && source.caseTitle);
  const number = theCase ? theCase.grNumber : (source && source.grNumber);
  const line = document.getElementById("find-case");
  line.textContent = "";
  if (!name && !number) { line.textContent = "Source not recorded"; return; }
  if (name) { line.appendChild(caseTitle(name)); }  // shared case-title style (app.js)
  if (number) { line.append((name ? " · " : "") + number); }
}

function showMatch(found) {
  document.getElementById("find-title").textContent = "Found in the full text";
  showCaseLabel(found.caseId);
  const note = document.getElementById("find-note");
  note.hidden = found.count < 2;
  note.textContent = "Appears " + found.count + " times. Showing the one nearest this question's source passage.";
  document.getElementById("find-part").hidden = true;

  showInContext(found.text, found.words, [{ first: found.first, last: found.last }]);
}

function addPiece(parent, text, className) {
  const span = document.createElement("span");
  span.className = className;
  span.textContent = text;
  parent.appendChild(span);
  return span;
}

// No literal match (or nothing to search): show the question's own source passage.
// If the case's full text is available, the passage is shown inside its paragraphs
// (in bold italics), so the reasoning around it is visible too.
function showClosest(question, reason, sourceText) {
  const source = question.source || {};
  document.getElementById("find-title").textContent = "Closest sourced passage";
  showCaseLabel(null, source);
  const note = document.getElementById("find-note");
  note.textContent = reason;
  note.hidden = false;
  const part = document.getElementById("find-part");
  part.textContent = source.part ? "From: " + source.part : "";
  part.hidden = !source.part;
  const box = document.getElementById("find-text");
  box.textContent = "";
  const excerpt = typeof source.excerpt === "string" ? source.excerpt.trim() : "";
  if (excerpt && sourceText) {
    const words = wordsOf(sourceText);
    const ranges = findExcerpt(words, excerpt);
    if (ranges) {
      showInContext(sourceText, words, ranges);
      return;
    }
  }
  box.appendChild(document.createTextNode(excerpt ? "“" + plainText(excerpt) + "”" : "No source passage is recorded for this question yet."));
}

const sheet = document.getElementById("find-sheet");
const backdrop = document.getElementById("find-backdrop");
let sheetOpen = false;
// Wide screens (1280px and up, next to the sidebar): the panel opens on the right, next to the question,
// instead of sliding up (see style.css). No dimming, the page still scrolls, and the
// swipe-down-to-close gesture is off. Phones keep the slide-up panel.
const FIND_WIDE = window.matchMedia("(min-width: 1280px)");

function openSheet() {
  sheetOpen = true;
  sheet.hidden = false;
  backdrop.hidden = false;
  document.body.classList.add("sheet-open");
  sheet.setAttribute("aria-modal", FIND_WIDE.matches ? "false" : "true");  // side panel: the page stays usable
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
  // A long passage that won't fit: start it a little below the top so its beginning shows.
  const room = Math.max(40, (body.clientHeight - matchBox.height) / 2);
  body.scrollTop = Math.max(0, matchBox.top - bodyBox.top - room);
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

  const caseIds = casesToSearch(question);
  const stillHere = function () { return sheetOpen && session.questions[session.index] === question; };

  // The fallback: the question's source passage, inside its paragraphs if the
  // source case's full text can be loaded (as plain quote otherwise).
  function closest(reason) {
    const sourceId = caseIds[0];
    const loaded = sourceId ? getCaseText(sourceId).catch(function () { return null; }) : Promise.resolve(null);
    loaded.then(function (text) {
      if (!stillHere()) { return; }
      showClosest(question, reason, text);
      centerMatch();
    });
  }

  if (!phrase) {
    closest("Tip: highlight words in the question, then tap Find in case. For now: the passage this question is based on, in bold italics.");
    return;
  }
  searchCases(caseIds, phrase, (question.source || {}).excerpt).then(function (result) {
    if (!stillHere()) { return; }
    if (result.found) {
      showMatch(result.found);
      centerMatch();
    } else if (caseIds.length === 0) {
      closest("This question isn't linked to a case with full text. Here is its source passage.");
    } else if (result.couldntLoad) {
      closest("Couldn't load the full text (offline, and not opened on this phone before). Here is the source passage.");
    } else {
      closest("Not word for word in the decision (questions are reworded). Showing the passage this question is based on, in bold italics.");
    }
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
  if (event.target.closest(".sheet-close") || FIND_WIDE.matches) { return; }  // no swipe on wide screens
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
  if (bodyTouchY === null || FIND_WIDE.matches) { return; }
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

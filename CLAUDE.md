# Bar Reviewer — Project Guide for Claude

## What this project is
A mobile web app for reviewing for the **Philippine Bar Exam**. It is a PWA (Progressive Web App): it opens in a phone's browser, can be added to the home screen like a normal app, and **works offline** once loaded.

It is being built by a complete beginner (no coding experience, not a lawyer) for their girlfriend, who will use it to study. She uses an **iPhone**. The builder uses a **Mac with VS Code**.

## How the app should feel
Like a bar prep app:
- She **picks a subject, then a topic**, and can choose **in order or shuffled**.
- **One question at a time**, full-screen and easy to read on a phone.
- **Mostly essay questions**, plus some multiple choice.
- Questions can link to **related cases** she can open and read.
- **Later (not at first):** a flashcard mode.

## The 8 subjects
Use these exact names everywhere (data, menus, filters):
1. Political Law
2. Labor Law and Social Legislation
3. Civil Law
4. Taxation Law
5. Mercantile Law
6. Criminal Law
7. Remedial Law
8. Legal and Judicial Ethics

Topics so far (use these exact names):
- Mercantile Law → **Communication Law** (the privacy cases: Zulueta, Hing, Vivares, Cadajas, Regala, IBP v. Purisima)
- Legal and Judicial Ethics → **Notarial Practice**
- Remedial Law → **Special Proceedings** → sub-topic **Writ of Amparo** (fill-in-the-blank items, one per section of A.M. No. 07-9-12-SC, q-0056 to q-0082)

### Miscellaneous section
Below the 8 subjects, the home screen has a **Miscellaneous** section for extra subjects that are not bar subjects (listed in `MISC_SUBJECTS` in `app.js`). It is **empty for now** and shows a "Nothing here yet" note; keep the section in place for future content.
- Communication Law is **not** a Miscellaneous subject anymore: it is a topic under Mercantile Law.
- If a subject is ever renamed or its content moved to another subject, add the old → new name to `MOVED_SUBJECTS` in `progress.js`, so her saved per-subject scores follow the move.

Content is grouped by **subject → topic** (for example, Civil Law → Obligations and Contracts).

## Content rules (very important)
The builder is not a lawyer and does not write questions. Claude writes them, so these rules protect accuracy:

1. **Only from the actual decision text.** Every question and case summary must come from the real text of a Supreme Court decision. Never write legal content from memory.
2. **If the text can't be found, stop and say so.** If Claude can't get the full decision for a G.R. number, it tells the builder, who will ask their girlfriend to paste the text. Never fill in the gaps by guessing.
3. **Every question and case has a status:** `"draft"` or `"verified"`. **All new questions start as `"draft"`.** Claude never marks anything `"verified"`. Only a person (the girlfriend or a lawyer) checks a question and asks for the change.
4. **Every question has a source:** case title, G.R. number, the part of the decision it came from (for example, "Ruling, discussion of the second issue"), and an exact quote of that passage so a person can check it quickly. The quote should show the Court's **reasoning**, not just its bottom-line conclusion (especially for "why" or "explain" questions). Skipped stretches are marked with " … "; footnote numbers are left out. Nothing is paraphrased.
5. **Lawyer-provided questions are inspiration, not content.** When a lawyer gives sample questions, Claude writes **new, original** questions that test the same concepts, with different facts and wording, and still based on decision text (rules 1–4). Never copy or lightly reword them.
6. **Plain words.** Case summaries and explanations should be clear and easy to read, while staying faithful to what the decision says.
7. **Public-repo reminder.** The GitHub repository and app are public. For now they contain only placeholder content. **Before any real content is added, remind the builder** and talk about whether to keep the app public or make it private.

## Content format (JSON files)
Administrative cases use their A.C. number in the `grNumber` field (e.g. `"A.C. No. 9514"`).
Content lives in JSON files, separate from the app code:
- `data/questions.json`: a list of questions
- `data/cases.json`: a list of cases (summaries only)
- `data/case-texts/case-0001.txt` …: the full text of each decision, one plain-text file per case, named by case ID. Loaded only when she taps "Read the full text", then saved on her phone for offline use. Copied from the case's `sourceUrl` (LawPhil), with LawPhil's hidden watermarks (like "1awphi1") removed and nothing else changed. Separate opinions are not included.

**IDs never change once created** (like `q-0001`, `case-0001`). The app saves her progress by ID, so changing an ID would lose her history for that question.

### Case
```json
{
  "id": "case-0001",
  "status": "draft",
  "name": "Juan Dela Cruz v. People",
  "grNumber": "G.R. No. 123456",
  "year": 2020,
  "subject": "Criminal Law",
  "topic": "Self-Defense",
  "facts": "Plain-words summary of the facts.",
  "issue": "The question the Court had to decide.",
  "ruling": "What the Court decided and why, in plain words.",
  "keyDoctrine": "The legal rule to remember.",
  "sourceUrl": "Where the decision text came from, or \"pasted by user\""
}
```

### Essay question (most questions)
```json
{
  "id": "q-0001",
  "type": "essay",
  "status": "draft",
  "subject": "Criminal Law",
  "topic": "Self-Defense",
  "prompt": "A fact situation or question.",
  "suggestedAnswer": {
    "answer": "Direct answer.",
    "legalBasis": "The law, rule, or doctrine.",
    "application": "How the rule applies to these facts.",
    "conclusion": "Final conclusion."
  },
  "keyPoints": ["Point she can check off", "Another point"],
  "caseIds": ["case-0001"],
  "source": {
    "caseTitle": "Juan Dela Cruz v. People",
    "grNumber": "G.R. No. 123456",
    "url": "Where the decision text came from, or \"pasted by user\"",
    "part": "Ruling, discussion of the first issue",
    "excerpt": "Short exact quote from the decision."
  }
}
```
After reading the suggested answer, she checks off the key points she got and rates herself: **Got it / Partly / Missed it**.

### Multiple-choice question
```json
{
  "id": "q-0002",
  "type": "mcq",
  "status": "draft",
  "subject": "Criminal Law",
  "topic": "Self-Defense",
  "prompt": "The question.",
  "choices": { "A": "...", "B": "...", "C": "...", "D": "..." },
  "correct": "B",
  "explanation": "Why B is right, and why the others are wrong.",
  "caseIds": ["case-0001"],
  "source": { "caseTitle": "...", "grNumber": "...", "part": "...", "excerpt": "..." }
}
```
Exactly 4 choices (A–D) and exactly one correct answer. She gets instant feedback and the explanation.

### Fill-in-the-blank item (for memorizing exact rule text)
```json
{
  "id": "q-0056",
  "type": "fillblank",
  "status": "draft",
  "subject": "Remedial Law",
  "topic": "Special Proceedings",
  "subtopic": "Writ of Amparo",
  "prompt": "Section 4. ... The petition may be filed on any day and at any ____ ...",
  "fullText": "Section 4. ... The petition may be filed on any day and at any time ...",
  "caseIds": [],
  "source": { "caseTitle": "The Rule on the Writ of Amparo", "grNumber": "A.M. No. 07-9-12-SC", "url": "...", "part": "Section 4", "excerpt": "..." }
}
```
- Blanks are written as **four or more underscores** (`____`). `fullText` is the exact same text with nothing blanked; everything outside the blanks must match it character for character, so the app can bold the missing words when she taps **Show answer**. Don't put two blanks right next to each other, and don't use `**` in either field.
- Blank the legally significant words (required elements, periods/deadlines, standards, who may file, where), not random words.
- **How it's practiced:** a **Blanks** dropdown above the text picks how much is hidden (more hidden = harder). The blanks written in the content are the "key legal terms":
  - **Light**: 2–3 of the key legal terms (up to 3, picked at random; all of them if the item has fewer).
  - **Key Legal Terms** (~20%): all the key legal terms, nothing else.
  - **Moderate** (~35%), **Intensive** (~55%), **Verbatim Bar Mode** (~75%): all the key legal terms, plus other words picked at random until about that share of the words is hidden. "SEC."/"Section", list numbers like "(a)", and words without letters are never picked.
  - **↻ New blanks** (just under the dropdown) hides a different set of words at the same level (never the same set again if any other is possible). What she typed stays in boxes that are still hidden. It's grayed out when it can't change anything: at Key Legal Terms (always all the key terms), at Light when the item has 3 key terms or fewer, after Show answer, or when there's no other word to pick. Tapping it while grayed out (before Show answer) shows a short note saying why.
  - The dropdown starts at the level she used last (saved in `barReviewer.fbLevel.v1`, not part of backups) and can be changed until **Show answer**. A note under the text says "X of Y words hidden (Z%)".
  - Every hidden word is a **text box** she types into (shown words stay plain text). A key-term blank that stands for several words is one box. Boxes grow as she types; an empty box is always the same size, so it doesn't hint at the answer's length. The Return key moves to the next box. What she types is kept if she changes the level (for words still hidden) and after a reload (`fbTyped` in the saved spot).
  - **Show answer** marks each box **green** (right) or **red** (wrong or empty), ignoring capital letters, punctuation, spaces and accents, says "You typed X of Y blanks correctly", locks the boxes, and reveals the full text with every hidden word bold and underlined. The typed result is not saved to her score; only her own rating is. She then rates **Got it / Missed it**: Missed it goes into Review missed; per subject the app keeps `fbCorrect` of `fbAnswered` ("X of Y correct"). The level picked doesn't affect the score.
- **Quiz / Read switch** at the top of every fill-in-the-blank item. **Read** shows that item's `fullText` as plain reading text (`reading-text` class, justified): no blanks, no boxes, nothing graded, and **Next** is available right away. Each item is one section, so sections stay separate (one per screen). Read stays on for the rest of the round (saved as `fbView` in the round); a new round starts in Quiz. Switching back to Quiz finds the quiz exactly as she left it. In Read, everything marked `fb-quiz-only` in `index.html` is hidden by one rule in `style.css`. If a round ends with nothing scored, the results screen says so.
- Each word stays one "word" for highlighting whether it's hidden or not, so her highlights don't move between levels. Changing an item's `prompt` (which words are blanked) can still shift them.
- The Question type picker on the subject screen has **Essay questions / Multiple choice / Fill in the blank / All**.

## Adding a new case (default procedure)
Whenever the builder asks to add a new case, follow this checklist without being reminded. The content rules above still apply to every step.

1. **Announce the IDs first.** Before starting, tell the builder the next free case ID and the question IDs that will be used (the next 8 `q-` numbers). Look them up in the JSON files; never reuse or renumber an ID.
2. **Get the real decision text.** Fetch it from a reliable source (LawPhil, the Supreme Court E-Library, etc.), never from memory. If it can't be fetched, stop and ask the builder to have the text pasted in (content rule 2).
3. **Save the full text** as `data/case-texts/<case-id>.txt` (plain text, UTF-8):
   - Only the main decision: from the court header through the signatures and footnotes. Leave out site menus and the list of separate opinions (those aren't included).
   - Keep the paragraphs (blank line between them), and write footnote numbers as `[1]`, `[2]`… both in the text and at the start of each footnote under a `Footnotes` heading.
   - Remove LawPhil's hidden watermarks (like `1awphi1`, `ℒαwρhi৷`, `1âwphi1`): search for odd tokens and report how many were removed. Change nothing else, typos included.
   - Check every footnote number in the text has a matching footnote, and tell the builder the file's size.
4. **Add the case summary** to `data/cases.json`: `facts`, `issue`, `ruling`, `keyDoctrine` in plain words, faithful to the decision, `status: "draft"`, under the correct subject (one of the 8 exact names above) and topic. Privacy and communication cases go under **Mercantile Law → Communication Law**; reuse an existing topic name when one fits, and say so when creating a new topic. `sourceUrl` is where the text came from.
5. **Write exactly 3 essay questions and 5 multiple-choice questions**, all `status: "draft"`, all with `caseIds` linking the new case:
   - Essays use the ALAC suggested answer (`answer`, `legalBasis`, `application`, `conclusion`) plus `keyPoints`.
   - Multiple choice: exactly 4 choices (A–D), one correct, and an explanation of why it's right and the others wrong.
   - Lawyer-provided samples are inspiration only (content rule 5).
6. **Source excerpts show the reasoning.** Each `source.excerpt` is an exact quote of the decision, long enough to show the Court's actual reasoning, not just a one-line conclusion (especially for "why" or "explain" questions). Skipped stretches are marked with ` … `; footnote numbers are left out. Before finishing, check that every piece of every excerpt appears word for word in the full-text file, and that `source.part` names where it came from.
7. **Follow the text formatting conventions** in all content fields:
   - `**word**` for bold.
   - Numbered points as `(1) … (2) … (3)` (or `(a) (b)`), starting right after a sentence end, colon or semicolon. The app then shows each point on its own line with a bold number. Points written mid-sentence ("between (a) X and (b) Y") stay inline.
8. **Test before committing:** the app loads without errors, the case opens with its summary and full text, all 8 questions show up under the right subject and topic, and "Find in case" finds each question's excerpt in the full text.
9. **Cache version:** bump `CACHE_VERSION` in `sw.js` only if an app file changed (see Technical choices). Adding a case normally changes only data files, so no bump.
10. **Commit and report:** one commit for the case (or one per step if it was split), then tell the builder what was added, the IDs used, the full-text file size, and anything that needs a person to check.

## Adding a new rule (fill-in-the-blank, default procedure)
For a procedural rule or a Rules of Court rule (like the Rule on the Writ of Amparo), memorized as fill-in-the-blank items. Follow this checklist without being reminded; the content rules above still apply to every step.

1. **Announce first.** Tell the builder which rule is being done (name, A.M. or Rule number), the source link, and the next free `q-` ID. Look the ID up in `data/questions.json`; never reuse or renumber an ID. Do **one rule at a time**: one rule = one commit = one save point.
2. **Get the real text from the source.** Use the link the builder gave, or an official source (LawPhil, the Supreme Court website or E-Library). Never from memory. A third-party site (study sites, blogs) must be cross-checked against an official source; if they differ, use the official text and tell the builder what differed. If the text can't be fetched, stop and ask for it to be pasted (content rule 2).
3. **Confirm the structure before writing anything.** Count the sections and tell the builder the count and the question IDs it will use (one item per section, consecutive). If the rule has several parts (for example, separate writs or remedies in one A.M.), describe how it's organized and ask whether it should be one sub-topic or several before writing.
4. **Clean the text, change nothing else.** Decode the page with its own character set (LawPhil pages are often `windows-1252`) so dashes and quotes come out right. Remove LawPhil's hidden watermarks (like `1awphi1`) and report how many were removed. Keep everything else exactly as published: wording, typos, dashes, capitals. Paragraphs and list items are separated by a blank line. Only the rule's own sections go in, not the resolution that approves it.
5. **One `fillblank` item per section**, in order, all `status: "draft"`:
   - `subject` / `topic` / `subtopic`: where the builder asked (e.g. Remedial Law → Special Proceedings → the rule's own sub-topic). Add the new sub-topic to "Topics so far" above, with its ID range.
   - `fullText`: the whole section exactly, starting with its heading ("Section 3. Where to file petition. - …").
   - `prompt`: the same text with the legally significant words blanked (`____`), following the fill-in-the-blank rules above: required elements, periods/deadlines, standards, who may file, where, what is or isn't allowed. Never two blanks with only spaces between them.
   - `caseIds: []`. `source`: `caseTitle` = the rule's official title, `grNumber` = the A.M. number or "Rules of Court, Rule 91", `url` = the source link, `part` = "Section N (Heading)", `excerpt` = the whole section text (same as `fullText`).
6. **Check before committing:** every `fullText` appears word for word in the cleaned source text; every `prompt` lines up with its `fullText` (same text outside the blanks, so Show answer bolds the right words); the IDs are consecutive and unused; the JSON is valid.
7. **Test in the app:** the sub-topic shows up under the right subject and topic with the right item count; Quiz, Read, the Blanks levels and Show answer work on a few items.
8. **Cache version:** data-only changes need no bump (see Technical choices).
9. **Commit and report:** one commit for the rule, then tell the builder the section count, the IDs used, the source, how many watermarks were removed, and anything a person should check (for example, odd wording in the source).

## Her progress (saved only on her phone)
- Saved in the phone's browser storage (`localStorage`). Nothing is sent anywhere, and there are no accounts.
- Remember: **score per subject**, **questions she missed**, and **bookmarked questions**.
- **Color tags:** on the question screen, three dots under Bookmark (green, yellow, red) let her tag any question; tapping the color it already has removes the tag. What each color means is up to her; the app doesn't interpret them. Saved in `tags` in her progress (`{"q-0007": "red"}`) and included in backups. The subject screen's "Your lists" has **Review missed / Bookmarked / Tagged**. **Tagged** opens a list screen of every tagged question in that subject (of the picked question type), grouped green → yellow → red, each card with its color dot; tap one to practice just it, or **Start practice** for all. Question cards in any list are built with `makeQuestionCard(question, onTap)` in `app.js`. The tag colors' look lives only in the tag rules in `style.css` (`[data-tag=…]`, `.tag-dot`, `.tag-mark`).
- **Load order warning:** `progress.js` loads her progress at startup (`let progress = loadProgress()`). Anything `loadProgress` uses that is a `const` (like `TAG_COLORS`, `HIGHLIGHT_COLORS`) must be defined **above** that line, or loading fails and the app starts with empty progress.
- Also remember her **highlighted words** (tap a word to highlight it): stored by question ID, or by case ID + part (e.g. `case-0002:facts`, or `case-0002:fulltext` for the full decision text), as a list of word positions. If a question's prompt text is edited later, her saved highlights may land on different words.
  - **Highlighter colors (full decision text only):** a pinned row of 4 swatches: green = Facts, pink = Issue, yellow = Important ruling, yellow-green = Doctrine. The color of each highlighted word is saved in `highlightColors` (e.g. `{"case-0002:fulltext": {"15": "facts"}}`); a highlighted word with no saved color is yellow. Questions and case summaries keep the single yellow highlighter. Editing a case's full-text file can likewise shift her highlights there.
- **Where she is right now** (screen, subject/topic, and any practice round in progress: question order, position, answers and ratings so far) is saved in its own slot (`barReviewer.currentSpot.v1`), so a reload puts her back there. It is **not** part of backups. It is cleared when she returns to the home screen or finishes a round (results screen).
- Counting: a multiple-choice question is "missed" if answered wrong. An essay rated **Partly** or **Missed it** goes into her review list.
- iPhone note: she should use Safari's **Add to Home Screen**. iPhones can clear saved data for websites that haven't been opened in a while, but apps added to the home screen are better protected. The home screen has **Back up my progress** (saves a file via the Share menu → Save to Files) and **Restore progress** (loads that file back).

## Rules for working on this project
These rules matter more than speed.

1. **Explain every change in simple terms.**
   - Assume no coding knowledge. Avoid jargon; if a technical word is needed, explain it in one plain sentence.
   - Say *what* changed, *why*, and *which files* were touched.
2. **Make one small change at a time.**
   - Each step should do one thing the builder can see or check.
   - Don't bundle unrelated changes. Don't add features that weren't asked for.
   - If a task is big, split it into small steps and list them before starting.
3. **Always say how to run and test it.**
   - Give step-by-step instructions: what to type, what to open, what to tap, and what should appear if it worked.
   - Include how to check it on her iPhone (Safari) and in offline mode when relevant.
   - Test it yourself first where possible, and say honestly if something couldn't be tested.
4. **Commit to Git after each working step.**
   - Only commit once the step works.
   - Use a short, plain-English commit message (e.g. "Show one essay question with its suggested answer").
   - Tell the builder a save point was made and that it's possible to go back to it.
5. **When something wasn't specified, pick the simplest reasonable option and explain why.**

## Technical choices
- **Plain HTML, CSS, and JavaScript.** No frameworks or build steps unless there's a clear reason, explained first. This keeps things simple to run and fix.
- **Phone first**, especially iPhone Safari. It should still work on a computer.
- **Works offline** after the first visit (using a "service worker", a small script that saves the app's files on the phone).
  - **Cache version rule:** whenever any app file changes (`index.html`, `style.css`, `app.js`, `progress.js`, `find-in-case.js`, `manifest.webmanifest`, icons), or a file is added to or removed from the `APP_FILES` list, bump `CACHE_VERSION` in `sw.js` (v1 → v2 …) in the same commit, and tell the builder it was bumped. Editing only `data/questions.json`, `data/cases.json`, or files in `data/case-texts/` does not need a bump: they are fetched fresh whenever she's online.
  - Every new app file must be added to `APP_FILES` in `sw.js`, or it won't work offline.
  - Use relative paths only (no leading `/`), so the app works at `username.github.io/bar-reviewer/`.
- **Hosting:** GitHub Pages (free). It gives one web link to open on her iPhone and add to the home screen.
- **Running it on the Mac:** open the project folder in VS Code and use a simple local web server (instructions will be given when first needed).
- Bad or missing content in the JSON files must not crash the app. Show a clear message instead.
- **Case titles have one shared style.** Every case name shown as a label uses the `case-title` class, and its look lives only in the `.case-title` rule in `style.css`. In code, build case names with `caseTitle(name)` and case-list cards with `makeCaseCard(theCase, onTap)` (both in `app.js`); the case screen heading has `class="case-title"` in `index.html`; the parties' caption at the top of a full decision gets it automatically (`markCaption`). Any new screen that shows a case name must use these, never its own styling.
- **The "Unverified" label has one shared style too.** Anything whose `status` isn't `"verified"` shows a red **Unverified** label (the `--missed` red). Its look lives only in the `.status-unverified` rule in `style.css`; build it with `unverifiedLabel()`, or a card's detail line with `cardDetail(text, verified)` (both in `app.js`). Any new screen that shows a question or case must use these.
- **Reading text has one shared style too.** Every block of question or case text she reads (question prompts, explanations, suggested answers, case facts/issue/ruling/doctrine, the full decision text, the revealed fill-in-the-blank text) has the `reading-text` class, and its look (justified, with hyphens) lives only in the `.reading-text` rule in `style.css`. Any new screen or question type that shows reading text adds that class; never style a screen's text by its id. Reading text that contains typing boxes (fill in the blank) is justified too; it only gets a little more line spacing (`.reading-text:has(input)`). Don't add exceptions that switch justify off for one kind of text without asking the builder first. Short labels, citations (the case's Source line), multiple-choice options and key-point checkboxes aren't reading text.

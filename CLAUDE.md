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

## Her progress (saved only on her phone)
- Saved in the phone's browser storage (`localStorage`). Nothing is sent anywhere, and there are no accounts.
- Remember: **score per subject**, **questions she missed**, and **bookmarked questions**.
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

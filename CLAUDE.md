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

Content is grouped by **subject → topic** (for example, Civil Law → Obligations and Contracts).

## Content rules (very important)
The builder is not a lawyer and does not write questions. Claude writes them, so these rules protect accuracy:

1. **Only from the actual decision text.** Every question and case summary must come from the real text of a Supreme Court decision. Never write legal content from memory.
2. **If the text can't be found, stop and say so.** If Claude can't get the full decision for a G.R. number, it tells the builder, who will ask their girlfriend to paste the text. Never fill in the gaps by guessing.
3. **Every question and case has a status:** `"draft"` or `"verified"`. **All new questions start as `"draft"`.** Claude never marks anything `"verified"`. Only a person (the girlfriend or a lawyer) checks a question and asks for the change.
4. **Every question has a source:** case title, G.R. number, the part of the decision it came from (for example, "Ruling, discussion of the second issue"), and a short exact quote of that passage so a person can check it quickly.
5. **Lawyer-provided questions are inspiration, not content.** When a lawyer gives sample questions, Claude writes **new, original** questions that test the same concepts, with different facts and wording, and still based on decision text (rules 1–4). Never copy or lightly reword them.
6. **Plain words.** Case summaries and explanations should be clear and easy to read, while staying faithful to what the decision says.
7. **Public-repo reminder.** The GitHub repository and app are public. For now they contain only placeholder content. **Before any real content is added, remind the builder** and talk about whether to keep the app public or make it private.

## Content format (JSON files)
Administrative cases use their A.C. number in the `grNumber` field (e.g. `"A.C. No. 9514"`).
Content lives in JSON files, separate from the app code:
- `data/questions.json`: a list of questions
- `data/cases.json`: a list of cases

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

## Her progress (saved only on her phone)
- Saved in the phone's browser storage (`localStorage`). Nothing is sent anywhere, and there are no accounts.
- Remember: **score per subject**, **questions she missed**, and **bookmarked questions**.
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
  - **Cache version rule:** whenever any app file changes (`index.html`, `style.css`, `app.js`, `progress.js`, `manifest.webmanifest`, icons), or a file is added to or removed from the `APP_FILES` list, bump `CACHE_VERSION` in `sw.js` (v1 → v2 …) in the same commit, and tell the builder it was bumped. Editing only `data/questions.json` or `data/cases.json` does not need a bump: they are fetched fresh whenever she's online.
  - Every new app file must be added to `APP_FILES` in `sw.js`, or it won't work offline.
  - Use relative paths only (no leading `/`), so the app works at `username.github.io/bar-reviewer/`.
- **Hosting:** GitHub Pages (free). It gives one web link to open on her iPhone and add to the home screen.
- **Running it on the Mac:** open the project folder in VS Code and use a simple local web server (instructions will be given when first needed).
- Bad or missing content in the JSON files must not crash the app. Show a clear message instead.

# Bar Reviewer — Project Guide for Claude

## What this project is
A mobile web app for reviewing for the **Philippine Bar Exam**. It is a PWA (Progressive Web App): it opens in a phone's browser, can be added to the home screen like a normal app, and **works offline** once loaded.

It is being built by a complete beginner (no coding experience) for their girlfriend, who will use it to study.

## How the app should feel
Like a bar prep app:
- **One multiple-choice question at a time**, shown full-screen and easy to read on a phone.
- **Instant feedback** after answering: right or wrong, the correct answer, and an explanation.
- Questions can link to **related cases** that she can open and read.
- **Later (not at first):** an essay mode and a flashcard mode.

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

## Where the content lives
All study content is kept in JSON files, separate from the app code, so content can be added without touching code:
- **Questions file** — one entry per question.
- **Cases file** — one entry per case.
- A question links to a case by the case's **ID** (for example, a question lists `"caseIds": ["case-001"]`).

Exact field names will be agreed with the user before the files are created. Once agreed, write the format down in this file and don't change it without asking.

## Rules for working on this project
These rules matter more than speed.

1. **Explain every change in simple terms.**
   - Assume no coding knowledge. Avoid jargon; if a technical word is needed, explain it in one plain sentence.
   - Say *what* changed, *why*, and *which files* were touched.

2. **Make one small change at a time.**
   - Each step should do one thing the user can see or check.
   - Don't bundle unrelated changes. Don't add features that weren't asked for.
   - If a task is big, split it into small steps and say what the steps are before starting.

3. **Always say how to run and test it.**
   - After every change, give step-by-step instructions the user can follow: what to type, what to open, what to tap, and what they should see if it worked.
   - Include how to check it on a phone when relevant, and how to check offline mode when relevant.
   - Test it yourself first where possible, and say honestly if something couldn't be tested.

4. **Commit to Git after each working step.**
   - Only commit once the step works.
   - Use a short, plain-English commit message (e.g. "Show one question with four answer choices").
   - Tell the user a save point was made, and that it's possible to go back to it if something breaks later.

## Technical preferences
- Keep it simple and beginner-friendly: plain HTML, CSS, and JavaScript unless the user agrees to something else. Avoid extra tools, frameworks, or build steps unless there's a clear reason, and explain the reason first.
- Design for phones first (small screens, tapping with a thumb), then make sure it still works on a computer.
- The app must keep working with no internet after the first visit.
- Bad or missing content in the JSON files should not crash the app; show a clear message instead.

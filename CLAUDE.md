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
- Remedial Law → **Special Proceedings** → sub-topic **Custody of Minors and Habeas Corpus** (fill-in-the-blank items, one per section of A.M. No. 03-04-04-SC, q-0083 to q-0104)
- Remedial Law → **Special Proceedings** → sub-topic **Writ of Habeas Data** (fill-in-the-blank items, one per section of A.M. No. 08-1-16-SC, q-0105 to q-0129)
- Remedial Law → **Special Proceedings** → the **Rules of Procedure for Environmental Cases** (A.M. No. 09-6-8-SC, 104 sections in 22 Rules, one fill-in-the-blank item per section, q-0130 to q-0233 in the rule's own order; section numbers restart in each Rule, so `source.part` says "Rule 7, Section 3 (…)"), split into four sub-topics:
  - **Writ of Kalikasan** (Rule 7, 17 items)
  - **Writ of Continuing Mandamus** (Rule 8, 8 items)
  - **TEPO** (Rule 2 Sections 8–11, and Rule 13 Section 2: 5 items)
  - **Environmental Cases (General Rules)** (everything else: 74 items)
- Remedial Law → **Special Proceedings** → sub-topic **Escheats (Rule 91)** (fill-in-the-blank items, one per section of Rule 91 of the Rules of Court, q-0234 to q-0238)
- Remedial Law → **Special Proceedings** → sub-topic **Trustees (Rule 98)** (fill-in-the-blank items, one per section of Rule 98 of the Rules of Court, q-0239 to q-0247)
- Remedial Law → **Special Proceedings** → sub-topic **Absentees (Rule 107)** (fill-in-the-blank items, one per section of Rule 107 of the Rules of Court, q-0248 to q-0255)

### Read the full rule
On a topic or sub-topic screen, **📖 Read the full rule** (under Start practice) appears automatically when **all** of that (sub-)topic's questions share one `source.grNumber` and `data/rules.json` lists a rule with that `number`. (So "All of Special Proceedings", which mixes rules, has no button, and all four Environmental Rules sub-topics open the whole Environmental Rules.) It opens the rule screen: title, number, Unverified label, the pinned highlighter colors, then each section in its own card with its heading on its own bold line (see Section headings, under fill in the blank), and PART / RULE headings between the cards; then the source. The text is downloaded only then, and kept on the phone for offline use.

### Look it up online
`makeLookupOnline(words, label, small)` in `app.js` makes a link to an ordinary Google search restricted to LawPhil (`"G.R. No. 202666" site:lawphil.net`; the G.R./A.C. number, or the case name if there's none), opening in a new tab (`target="_blank" rel="noopener"`), with the note "Always check the official text. The app may not have every decision." Offline, the link is replaced by "You're offline. This needs internet." (it switches back by itself when she's online). The app never fetches anything from those sites and never guesses their page addresses. Styles: the shared `btn btn-secondary` (+ `btn-small` for the lighter version, still 44px tall), `.online-lookup`, `.lookup-offline`, `.lookup-note`.
- **Case screen:** "Find the official text online" (small version) in the Source card.
- **Search:** when nothing matches, "Not in the app yet" with a "Look it up online" button (full size) for what she typed.

### Search (home screen, step one of the Library)
A **Search cases and rules** box under the home screen's title (`#search-input`, 17px text so the iPhone doesn't zoom in). It searches only the catalog's `cases` (name + G.R. number) and `rules` (title + number), never full texts, as she types (`showSearchResults` in `app.js`):
- Capital letters, accents and punctuation don't matter, and letters are split from numbers (`searchKey`): "202666", "G.R. No. 202666", "gr 202666" and "GR202666" all find G.R. No. 202666. Partial words count ("viva" → Vivares). Every word typed must be found; a word with letters may also match across punctuation ("gr" in "G.R."), a number only inside a number ("91" doesn't match "07-9-12").
- Best matches first (every word starts a word), then ID order; at most 20 shown ("Showing 20 of N. Type more to narrow it down."), with a "N matches" line.
- Results: cases with `makeCaseCard(case, onTap, subject)` (G.R. number · year · subject + Unverified), rules with `makeRuleCard` ("Rule · number · subject" + Unverified). Tapping opens the case (`openCase(c, "search")`) or rule (`openRule(r, "search")`); their Back returns home with the results still showing (`backToSearch`), also after a reload (the query is saved as `search` in the saved spot).
- Nothing found: "Not in the app yet" card with **Look it up online** (see above) for what she typed.

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
- **Questions and case summaries live in one file per topic:** `data/content/<subject>/<topic>.json`, e.g. `data/content/mercantile-law/communication-law.json` (folder and file names: the exact subject and topic names in lower case, with every run of spaces or punctuation turned into `-`). Each file is `{"subject": "…", "topic": "…", "cases": [ … ], "questions": [ … ]}`; every item in it has that same subject and topic, and sub-topics stay inside their topic's file (all of Special Proceedings is one file). Items are kept in ID order.
- `data/catalog.json`: a small summary of all the content, **built by `python3 tools/build-catalog.py`; never edit it by hand.** Run the builder after any change to a topic file (a new topic just needs its new file; the builder lists it). It holds:
  - `topics`: one per topic file (`subject`, `topic`, `file`), in the order the app shows them (subject order, then by each topic's first question ID), each with `subtopics` in the app's order: `{"name": … or null (no sub-topic), "rule": the source.grNumber all its questions share, or null, "essay": [IDs], "mcq": [IDs], "fillblank": [IDs]}`.
  - `cases`: one line per case: `id`, `name`, `grNumber`, `year`, `subject`, `topic`, `subtopic` (if any), `status`, and `questions` (IDs of the questions whose `caseIds` include it).
  - `rules`: one line per rule in `data/rules.json`: `id`, `title`, `number` (its citation), `status`, and the `subject` / `topic` of its first question (null if none). Rules have no year.
  - The app loads only the topic files listed here. For now it still loads all of them when it opens; the home screen's search uses `cases` and `rules`; `topics` is for a planned step (load a topic only when she opens it). About 1.2 MB (150 KB to download) at 3,000 cases.
- **IDs are unique across all topic files**, not just within one. Deleted IDs (q-0001 to q-0003, the old placeholders) are never reused. `python3 tools/check-content.py` prints the next free IDs.
- `data/case-texts/case-0001.txt` …: the full text of each decision, one plain-text file per case, named by case ID. Loaded only when she taps "Read the full text", then saved on her phone for offline use. Copied from the case's `sourceUrl` (LawPhil), with LawPhil's hidden watermarks (like "1awphi1") removed and nothing else changed. Separate opinions are not included.

- `data/rules.json`: a list of rule documents whose full text she can read (`id` like `rule-0001`, `status`, `title`, `number` = the same text as the items' `source.grNumber`, e.g. `"A.M. No. 07-9-12-SC"` or `"Rules of Court, Rule 91"`, and `sourceUrl`).
- `data/rule-texts/rule-0001.txt` …: the full text of each rule, one plain-text file per rule, loaded only when she taps **📖 Read the full rule**, then saved on her phone for offline use (same as case texts). It runs from the rule's title through its last section (not the resolution approving it, not signatures). Paragraphs are separated by a blank line. A section starts with `SECTION 1.` / `Section 1.` / `SEC. 1.` / `Sec. 1.` (or `ARTICLE`/`Article`/`ART.`/`Art.` + number + period); a heading between sections starts with `PART` / `RULE` / `TITLE` / `CHAPTER` / `BOOK` + a number, with its title on the next line of the same paragraph (e.g. `RULE 91\nEscheats`). Every fill-in-the-blank item's `fullText` from that rule must appear in it word for word.

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
- Blank the legally significant words (required elements, periods/deadlines, standards, who may file, where), not random words. **Never blank the section heading** ("SECTION 1. Petition."): it's the clue (the checker reports it as a PROBLEM).
- **Section headings on their own line** (everywhere a section is shown: Quiz, Show answer, Read, and a rule's full text). `splitSectionHeading` in `app.js` (used by `richText`, so every present and future section gets it automatically) finds the heading at the start of the text: **SECTION / Section / SEC. / Sec. / ARTICLE / Article / ART. / Art. + number + period, then up to the first period that is followed by a dash** (-, – or —, with or without a space). The heading is shown as its own row (`.section-heading`): the label ("SEC. 4.", `.section-label`) and the title ("No Docket Fees", `.section-title`), both bold in the normal text color (`--text`) so the whole heading is one color (the title's final period is kept in the text but not shown), then a thin divider line; the dash and the spaces or blank lines after it are kept but never shown (`.section-sep`), and the content starts on the next line. A text that doesn't start that way is shown as before (the checker gives a CHECK). The heading's words are never picked as blanks, and "X of Y words hidden" counts only the content (`sectionContent`). The label/title split (`SECTION_LABEL`): the label is SECTION/Section/SEC./Sec./ARTICLE/… + number + period, the title is the rest. The shared styles live only in the `.section-heading` / `.section-label` / `.section-title` / `.section-sep` rules in `style.css`. In Quiz, changing the difficulty never redraws heading words (`applyFbLevel` skips them).
  - **Word numbers never change** (her highlights): the hidden dash still counts as a word, as before. Where a dash is glued to the heading's last word ("file.-", "pre-trial.-(a)"), that word keeps its one number and the glued part is shown without a number of its own. The rule screen passes `headingEndsWord` (its numbering always counted the heading's end as a word end, from when it bolded headings with `**`).
- **Names on screen vs internal IDs:** every word she sees for these controls is defined once in `app.js` (the "WORDS SHE SEES" block: `FB_LEVEL_NAMES`, `FB_LEVEL_LABELS`, `FB_TEXT`, put on the page by `showFbLabels`): **Difficulty** (the dropdown), **Warm-up (2–3 blanks)**, **Key Legal Terms (~20%)**, **Steady (~35%)**, **Deep dive (~55%)**, **Word for word (~75%)**, **↻ Shuffle blanks**, **👁 Hold to peek**. The internal level IDs (`light`, `key`, `moderate`, `intensive`, `verbatim`) are saved in her progress and used by the mastery rule (`MASTERY_FB_LEVELS` in progress.js): never rename them; to rename a level, change only its words there. The Today card's mastery line names the first mastery level from that rule ("… Steady or harder").
- **How it's practiced:** a **Difficulty** dropdown above the text picks how much is hidden (more hidden = harder). The blanks written in the content are the "key legal terms":
  - **Warm-up** (internal ID `light`): 2–3 of the key legal terms (up to 3, picked at random among the key terms that have at least one non-filler word; all of them if the item has fewer).
  - **Key Legal Terms** (~20%): all the key legal terms, nothing else.
  - **Filler words (Warm-up and Key Legal Terms only):** inside a key term, the words in `FB_FILLER_WORDS` (one list at the top of the fill-in-the-blank code in `app.js`, meant to be edited: articles, conjunctions, prepositions and words like "any", "shall", "other") are never blanked; they show as plain text (`.fb-shown`) and only the meaningful words get boxes ("docket and other lawful fees" → docket, lawful, fees). Steady, Deep dive and Word for word ignore the list. No key term in the current content is made only of filler words (every one keeps at least one box).
  - **Steady** (~35%), **Deep dive** (~55%), **Word for word** (~75%) (internal IDs `moderate`, `intensive`, `verbatim`): all the key legal terms, plus other words picked at random until about that share of the words is hidden. "SEC."/"Section", list numbers like "(a)", and words without letters are never picked.
  - **↻ Shuffle blanks** (just under the dropdown) hides a different set of words at the same level (never the same set again if any other is possible). What she typed stays in boxes that are still hidden. It's grayed out when it can't change anything: at Key Legal Terms (always all the key terms), at Warm-up when the item has 3 key terms or fewer, after Show answer, or when there's no other word to pick. Tapping it while grayed out (before Show answer) shows a short note saying why.
  - The dropdown starts at the level she used last (saved in `barReviewer.fbLevel.v1`, not part of backups) and can be changed until **Show answer**. A note under the text says "X of Y words hidden (Z%)".
  - Every hidden word is a **text box** she types into (shown words stay plain text). **One box per word:** a key-term blank that stands for several words ("indigent petitioner") gets one box for each word (`blankParts`; box keys "12.0", "12.1" … = word 12 of the prompt, part 0, 1 …; a plain word's box is "12"), each word's punctuation outside its box, each box checked on its own. Boxes grow as she types; an empty box is always the same size, so it doesn't hint at the answer's length. The Return key moves to the next box. What she types is kept if she changes the level (for words still hidden) and after a reload (`fbTyped` in the saved spot).
  - **Live checking (Quiz):** as soon as a box holds the right word (compared like Show answer: capitals, punctuation, spaces and accents don't matter), it turns green (`.fb-right`) and the cursor jumps to the next box that isn't green (`focusNextOpenBox`; none left: the keyboard closes). Punctuation or a space typed right after that word doesn't spill into the next box (`justArrived`). Leaving a box (Return/Next, Tab, tapping elsewhere) with a wrong word turns it red (`.fb-wrong`) without showing the right word; an empty box stays neutral; typing in a red box clears the red at once (`liveCheckBox`). "You typed X of Y blanks correctly" shows in Quiz from the start and updates per word (`updateTypedCount`; the note's first part is kept in `data-base`). After a reload or a level change, boxes with the right word start green (red comes back only when she leaves a box again). The same `.fb-right` / `.fb-wrong` styles as Show answer. Nothing here is saved: ratings and mastery are unchanged.
  - **👁 Hold to peek** (just above Show answer, Quiz only): while she holds it (finger, mouse, or Space/Enter), each box is hidden and its answer shows in its place (dotted underline); letting go, sliding off, or switching apps hides them again. What she typed stays in the boxes. Nothing is scored or saved. It disappears after Show answer and in Read mode.
  - **Show answer** marks each box **green** (right) or **red** (wrong or empty), ignoring capital letters, punctuation, spaces and accents, says "You typed X of Y blanks correctly" (counted per box, so per word), locks the boxes, and reveals the full text with every hidden word bold and underlined, each word marked on its own (`markedAnswer`). The boxes' green/red result is never saved: her score, Review missed, daily count and mastery use only her rating and the level, so one-box-per-word changed none of them. The typed result is not saved to her score; only her own rating is. She then rates **Got it / Missed it**: Missed it goes into Review missed; per subject the app keeps `fbCorrect` of `fbAnswered` ("X of Y correct"). The level picked doesn't affect the score.
- **Quiz / Read switch** at the top of every fill-in-the-blank item. **Read** shows that item's `fullText` as plain reading text (`reading-text` class, justified): no blanks, no boxes, nothing graded (Previous / Next are always available, as on every question). Each item is one section, so sections stay separate (one per screen). Read stays on for the rest of the round (saved as `fbView` in the round); a new round starts in Quiz. Switching back to Quiz finds the quiz exactly as she left it. In Read, everything marked `fb-quiz-only` in `index.html` is hidden by one rule in `style.css`. If a round ends with nothing scored, the results screen says so.
- Each word stays one "word" for highlighting whether it's hidden or not, so her highlights don't move between levels. Changing an item's `prompt` (which words are blanked) can still shift them.
- The Question type picker on the subject screen has **Essay questions / Multiple choice / Fill in the blank / All**.

## Adding a new case (default procedure)
Whenever the builder asks to add a new case, follow this checklist without being reminded. The content rules above still apply to every step.

1. **Announce the IDs first.** Before starting, tell the builder the next free case ID and the question IDs that will be used (the next 8 `q-` numbers). Get them from the "Next free IDs" line of `python3 tools/check-content.py`; never reuse or renumber an ID.
2. **Get the real decision text.** Fetch it from a reliable source (LawPhil, the Supreme Court E-Library, etc.), never from memory. If it can't be fetched, stop and ask the builder to have the text pasted in (content rule 2).
3. **Save the full text** as `data/case-texts/<case-id>.txt` (plain text, UTF-8):
   - Only the main decision: from the court header through the signatures and footnotes. Leave out site menus and the list of separate opinions (those aren't included).
   - Keep the paragraphs (blank line between them), and write footnote numbers as `[1]`, `[2]`… both in the text and at the start of each footnote under a `Footnotes` heading.
   - Remove LawPhil's hidden watermarks (like `1awphi1`, `ℒαwρhi৷`, `1âwphi1`): search for odd tokens and report how many were removed. Change nothing else, typos included.
   - Check every footnote number in the text has a matching footnote, and tell the builder the file's size.
4. **Add the case summary** to the `cases` list of its topic file (`data/content/<subject>/<topic>.json`; a new topic gets a new file plus a line in `data/catalog.json`): `facts`, `issue`, `ruling`, `keyDoctrine` in plain words, faithful to the decision, `status: "draft"`, under the correct subject (one of the 8 exact names above) and topic. Privacy and communication cases go under **Mercantile Law → Communication Law**; reuse an existing topic name when one fits, and say so when creating a new topic. `sourceUrl` is where the text came from.
5. **Write exactly 3 essay questions and 5 multiple-choice questions**, all `status: "draft"`, all with `caseIds` linking the new case:
   - Essays use the ALAC suggested answer (`answer`, `legalBasis`, `application`, `conclusion`) plus `keyPoints`.
   - Multiple choice: exactly 4 choices (A–D), one correct, and an explanation of why it's right and the others wrong.
   - Lawyer-provided samples are inspiration only (content rule 5).
6. **Source excerpts show the reasoning.** Each `source.excerpt` is an exact quote of the decision, long enough to show the Court's actual reasoning, not just a one-line conclusion (especially for "why" or "explain" questions). Skipped stretches are marked with ` … `; footnote numbers are left out. Before finishing, check that every piece of every excerpt appears word for word in the full-text file, and that `source.part` names where it came from.
7. **Follow the text formatting conventions** in all content fields:
   - `**word**` for bold.
   - Numbered points as `(1) … (2) … (3)` (or `(a) (b)`), starting right after a sentence end, colon or semicolon. The app then shows each point on its own line with a bold number. Points written mid-sentence ("between (a) X and (b) Y") stay inline.
8. **Test before committing:** `python3 tools/build-catalog.py` (rebuilds the catalog, so the new case shows up in the home screen's search), then `python3 tools/check-content.py` says "All content OK"; the app loads without errors, the case opens with its summary and full text, all 8 questions show up under the right subject and topic, and "Find in case" finds each question's excerpt in the full text.
9. **Cache version:** bump `CACHE_VERSION` in `sw.js` only if an app file changed (see Technical choices). Adding a case normally changes only data files, so no bump.
10. **Commit and report:** one commit for the case (or one per step if it was split), then tell the builder what was added, the IDs used, the full-text file size, and anything that needs a person to check.

## Adding a new rule (fill-in-the-blank, default procedure)
For a procedural rule or a Rules of Court rule (like the Rule on the Writ of Amparo), memorized as fill-in-the-blank items. Follow this checklist without being reminded; the content rules above still apply to every step.

1. **Announce first.** Tell the builder which rule is being done (name, A.M. or Rule number), the source link, and the next free `q-` ID. Get it from the "Next free IDs" line of `python3 tools/check-content.py`; never reuse or renumber an ID. Do **one rule at a time**: one rule = one commit = one save point.
2. **Get the real text from the source.** Use the link the builder gave, or an official source (LawPhil, the Supreme Court website or E-Library). Never from memory. A third-party site (study sites, blogs) must be cross-checked against an official source; if they differ, use the official text and tell the builder what differed. If the text can't be fetched, stop and ask for it to be pasted (content rule 2).
3. **Confirm the structure before writing anything.** Count the sections and tell the builder the count and the question IDs it will use (one item per section, consecutive). If the rule has several parts (for example, separate writs or remedies in one A.M.), describe how it's organized and ask whether it should be one sub-topic or several before writing.
4. **Clean the text, change nothing else.** Decode the page with its own character set (LawPhil pages are often `windows-1252`) so dashes and quotes come out right. Remove LawPhil's hidden watermarks (like `1awphi1`) and report how many were removed. Keep everything else exactly as published: wording, typos, dashes, capitals. Paragraphs and list items are separated by a blank line. Only the rule's own sections go in, not the resolution that approves it. **Page-break leftovers** from LawPhil's conversion of a PDF (a sentence or word split by a paragraph break, or a printed page header like "Rules of Procedure for Environmental Cases" pasted mid-sentence) are repaired by rejoining the sentence with a single space; report each one to the builder, item by item.
5. **One `fillblank` item per section**, in order, all `status: "draft"`:
   - `subject` / `topic` / `subtopic`: where the builder asked (e.g. Remedial Law → Special Proceedings → the rule's own sub-topic). Add the new sub-topic to "Topics so far" above, with its ID range.
   - `fullText`: the whole section exactly, starting with its heading ("Section 3. Where to file petition. - …").
   - `prompt`: the same text with the legally significant words blanked (`____`), following the fill-in-the-blank rules above: required elements, periods/deadlines, standards, who may file, where, what is or isn't allowed. Never two blanks with only spaces between them.
   - `caseIds: []`. `source`: `caseTitle` = the rule's official title, `grNumber` = the A.M. number or "Rules of Court, Rule 91", `url` = the source link, `part` = "Section N (Heading)", `excerpt` = the whole section text (same as `fullText`).
6. **Save the whole rule for "Read the full rule".** Add an entry to `data/rules.json` (next free `rule-` ID; `number` exactly equal to the items' `source.grNumber`) and save the cleaned text as `data/rule-texts/<rule-id>.txt` in the format described under Content format. Tell the builder the file's size. Any sub-topic whose items all come from this one rule then shows the button automatically; nothing else needs setting up.
7. **Check before committing:** `python3 tools/build-catalog.py` (rebuilds the catalog, so the new rule shows up in the home screen's search), then `python3 tools/check-content.py` says "All content OK" (it checks most of what follows); every `fullText` appears word for word in the cleaned source text and in the rule's text file; every `prompt` lines up with its `fullText` (same text outside the blanks, so Show answer bolds the right words); the IDs are consecutive and unused; the JSON is valid.
8. **Test in the app:** the sub-topic shows up under the right subject and topic with the right item count; Quiz, Read, the Difficulty levels and Show answer work on a few items; **📖 Read the full rule** opens the whole rule, one card per section.
9. **Cache version:** data-only changes need no bump (see Technical choices).
10. **Commit and report:** one commit for the rule, then tell the builder the section count, the IDs used, the source, how many watermarks were removed, and anything a person should check (for example, odd wording in the source).

## Content checker (run before every commit that touches data/)
Before committing content: **`python3 tools/build-catalog.py`** (rebuilds `data/catalog.json`), then **`python3 tools/check-content.py`**.

`python3 tools/check-content.py` (from the project folder) reads every content file and lists anything wrong, then prints the next free IDs. It never changes a file, and it isn't part of the app (no cache bump, not in `APP_FILES`).
- **PROBLEM** = must be fixed before committing; the script then ends with "Found N problem(s)" (exit code 1). **CHECK** = worth a look, not an error (e.g. placeholder content). "All content OK" = nothing to fix.
- It checks: valid JSON; the catalog and topic files match (every topic file listed once, each file's and each item's subject and topic match its catalog line, no unlisted `.json` in `data/content/`, and the catalog is exactly what `build-catalog.py` would build now, otherwise "out of date"); topic file names follow the usual pattern (CHECK); IDs in the right form and never used twice (across all files); `status` is `draft`/`verified`; subject is one of the exact names (`SUBJECTS` / `MISC_SUBJECTS` in `tools/build-catalog.py`, used by both scripts, must match `app.js`); topic present; each question type's required parts (essay ALAC + key points; MCQ exactly A–D, one correct letter, explanation; fill in the blank: blanks present, none side by side, no `**`, prompt lines up with `fullText`, no blank in the section heading, and a CHECK if `fullText` has no heading the app can find); every source has caseTitle, grNumber, part, excerpt; `caseIds` point to real cases whose G.R. number matches the source; every piece of an excerpt (split at " … ") appears word for word in the case's full text, and a fill-in-the-blank `fullText` and excerpt in its rule's text (ignoring `**`, footnote numbers like [3], spacing, and straight vs curly quotes); every case and rule has its text file; no LawPhil watermarks left; every footnote number has its footnote.
- Long lists show the first 50 lines; `--all` shows every line.
- When a new content field or rule is added to this guide, add a check for it here too.

### Previous / Next (question screen)
Every question type has **‹ Previous** and **Next ›** side by side under the answer area (`.question-nav`, the shared `btn btn-secondary` / `btn btn-primary`), always visible and tappable, answered or not. Previous is greyed out on the first question; on the last, Next says **Finish** and opens the results. "Question X of Y" always matches.
- **Skipping counts as nothing:** only an actual answer or rating is recorded (MCQ submit, essay / fill-in-the-blank rating); moving around never touches today's count, the streak, mastery, Review missed or the round's scores.
- Each visited question's state is kept in the round (`session.states`, by position; `goToQuestion` saves the current one before moving). Going back redraws it exactly as she left it with `putBackCurrent` (her pick and its result, her essay rating and key points, her typed blanks, level and rating), which never counts anything again; answers and ratings stay locked, so going back can't change a saved result. A question she never touched opens fresh.
- `states` is saved with the round in the saved spot, so a reload puts her back on the same question, and earlier questions still show what she did.
- Mac / iPad keyboard: ← / → = Previous / Next on the question screen, except while she's typing (a blank, a note, any text box or dropdown) or a menu or panel is open; → never finishes the round (only a tap on Finish does).

## Reset (redo a topic, case or rule from scratch)
A small, quiet **Reset** text button (`.reset-btn`, in a `.reset-row`) at the very bottom of: a topic or sub-topic screen (**Reset this topic**: every question in it, all types; not on Review missed / Bookmarked / Tagged), a case screen (**Reset this case**: the questions whose `caseIds` include it; hidden on a case opened from the middle of a question, so an open round is never changed), and the Read the full rule screen (**Reset this rule**: its fill-in-the-blank items, matched by `source.grNumber`). Hidden when there's nothing in scope. One function does all three (`resetScope` in `app.js`).
- **Always asks first** with the shared in-app dialog (`askConfirm(title, text, action)`, `#confirm-backdrop`; Cancel is focused first; Esc or tapping outside cancels): "Reset 'Name'? This clears your answers for N questions. Your notes and highlights stay."
- **Clears**, for those questions only (`resetQuestions` in progress.js): `results` (latest answer and "right in a row", so they're no longer mastered) and `review` (Review missed). The Today card's Mastery updates at once.
- **Keeps**: notes, highlights, tags, bookmarks, `daily` (Today and history), the streaks, and the per-subject running totals in `subjects` (those count every attempt and aren't stored per question, so they can't be split by topic). Typed blanks are only ever kept inside an open round, so there's nothing more to clear.
- **Undo** for about 10 seconds with the shared message bar (`showUndo(text, onUndo)`, `#toast`): `undoReset` puts back exactly what was removed, in its original order (`putBackInOrder`).
- Resets live in her normal progress, so backups and restores include them; nothing new is stored.

## Study Schedule
Her own plan, day by day: **📅 Study Schedule** on the home screen and in the sidebar / ☰ menu (`#screen-schedule`, `openSchedule` in `app.js`; Back goes home; a reload reopens it).
- **Views:** a **Month / Week** switch (the shared `.seg-switch` / `.seg-btn` look, the same as the Quiz/Read switch). Month = a calendar (each day a button: number, Day off, and on screens 700px+ up to 3 task titles, on narrower ones "done/total"); tapping a day shows it below. Week = the 7 days of the week as a list (the default on phones; her last choice is remembered on this device in `barReviewer.scheduleView.v1`, not backed up). ‹ / › move a month or a week; **Today** comes back. Weeks start on Sunday (`WEEK_STARTS_ON`).
- **Top:** "N days until exam (date)" from Settings' exam date, or a **Set your exam date in Settings ›** link if there's none; a bar with "X / Y tasks done this week / in <month>".
- **Saved** in `progress.schedule` (so it's in backups), a day only if it has something, with short keys (`k` tasks, `t` title, `m` minutes, `d` done, `s` subject, `l` link, `off` Day off); `cleanSchedule` (progress.js) drops anything it doesn't understand, on load, in backups and on restore. Read and write only through `scheduleDay(date)` / `setScheduleDay(date, tasks, off)`.
- Nothing is ever planned automatically, and there's no drag and drop.

## Settings
A **Settings** screen (`#screen-settings`), reached from the ⚙️ button on the home screen (phones, next to ☰), the **Settings** entry in the sidebar / ☰ menu, or the Today card's "Daily goal" line. **‹ Back** returns to exactly where she was (`settingsCameFrom`; the screen she left is only hidden meanwhile, so a question keeps its state). Settings is never saved as her spot, so a reload there puts her back where she was before it (an open practice round is never lost).
- **Study:** **Daily goal** (10 / 20 / 30 / 50, default 20, `settings.dailyGoal`) and **Exam date** (optional, empty until she picks one, `settings.examDate` as "YYYY-MM-DD", with a Clear button; "Used later for the study schedule").
- **Data:** **Back up my progress** and **Restore progress** (same code as before: `#backup-btn`, `#restore-input`, `#backup-message`), each with a one-line explanation. After a restore, the Settings controls show the restored values (`fillSettings`).
- There's no "Display" group yet: it appears with its first setting.
- Every setting is one shared **setting row** (`.setting-row`: `.setting-text` with `.setting-label` + `.setting-desc`, then `.setting-control`; `.setting-control-wide` for a full-width button), inside a `.settings-card` under a `.settings-group` heading.
- Values live in `progress.settings`, so they're in every backup. `cleanSettings` (progress.js) keeps only known settings with valid values, on load, in backups and on restore (`restoreProgress` cleans them too); read them only through `settingsObject()` and a getter with a default (`dailyGoal()`, `examDate()`), so missing or old values never crash anything.

### Adding a new setting (checklist)
1. **Pick its group** (Study, Data, Display…; a new group = a new `<h2 class="label settings-group">` + `<section class="card settings-card">` in `#screen-settings`).
2. **Add one `.setting-row`** in `index.html`: a `.setting-label` (a `<label for>` the control), a one-line `.setting-desc`, and the control in `.setting-control` (a `<select>`, `<input>` or button; text-like controls 16px or more so the iPhone doesn't zoom).
3. **Store it in `progress.settings`** (progress.js): add a line to `cleanSettings` that keeps it only if valid, a getter that returns a sensible default when it's missing (always via `settingsObject()`), and a setter that calls `saveProgress()`.
4. **Wire it up** in `app.js`: show the saved value in `fillSettings()`, and a `change` listener that calls the setter (and refreshes anything that shows it).
5. Update the `settings:` line at the top of progress.js and this section of CLAUDE.md.
6. **Test:** change it, reload (it stays), back up and restore (it comes back), an old backup without it (the default, no crash), offline, light and dark mode.
7. Bump `CACHE_VERSION` (app files changed).

## Her progress (saved only on her phone)
- Saved in the phone's browser storage (`localStorage`). Nothing is sent anywhere, and there are no accounts.
- Remember: **score per subject**, **questions she missed**, and **bookmarked questions**.
- **Her notes** on cases and rules (not on questions): `notes` in her progress, by case or rule ID (`{"case-0002": {"html": "…", "text": "…", "updated": ISO date}}`), part of backups (older backups restore with no notes). `html` may only contain `<b>`, `<i>`, `<u>`, `<br>` and text; `text` is the same note as plain text (for the My notes list). Notes saved before formatting existed have only `text` and are turned into `html` on load (their characters stay literal text, never formatting).
  - **Safety:** `cleanNoteHtml` (in `progress.js`) rebuilds any HTML from scratch keeping only those four things: every attribute is dropped, other tags keep only their text, and scripts, styles, pictures, frames etc. are dropped entirely (it reads the HTML with DOMParser, which never runs anything). It runs when a note is saved, on paste and drop (before the content goes into the box), when progress loads, and on restore. Never put a note into the page without it.
  - **The box:** an editable area (`<div class="notes-box" contenteditable>`) with a **B / I / U** toolbar above it (`<div class="notes-toolbar" data-for="<box id>">`, buttons `data-cmd="bold|italic|underline"`) and a status line (box id + `-status`). The buttons apply the style to the selection (tap again to remove it) and show as pressed when the cursor is in text with that style. They cancel `mousedown`/`pointerdown`/`touchstart` so the box keeps the focus: on an iPhone the keyboard stays open and the selection stays. On a computer, **Cmd+B / Cmd+I / Cmd+U** (Mac) or **Ctrl+B / Ctrl+I / Ctrl+U** (Windows and others; on a Mac, Ctrl+B is left alone because it moves the cursor back) do the same thing through the same `applyNoteFormat`, so the buttons light up the same way; the browser's own action for those keys is cancelled. The cleaner accepts every way browsers write these styles (`<b>`/`<strong>`/`font-weight` bold, bolder or 600–900; `<i>`/`<em>`/`font-style` italic or oblique; `<u>`/`text-decoration(-line)` underline) and saves them as `<b>`, `<i>`, `<u>`. `showNotesBox(box, id)` loads a note. It saves by itself half a second after she stops typing, and immediately when the box loses focus, when any screen changes (`showScreen` calls `saveAllNotes`), and when the app is hidden. A note cleared to blank is removed. The box grows with the text (no scrolling inside it) and uses 17px text so the iPhone doesn't zoom in. Boxes: on the case screen after Key doctrine (`case-notes`), and on the rule screen under the title (`rule-notes`), so every rule, including ones added later, has one.
  - **📝 My notes** (home screen, under the Today card, with a count) opens the My notes screen: one card per case or rule with a note, newest first, showing its name (cases via `caseTitle`), the start of the note, "Case/Rule · date" and the Unverified label (`cardDetail`). Tapping one opens that case or rule (`openCase(c, "notes")` / `openRule(r, "notes")`), whose Back returns to the list. Notes on a case or rule no longer in the content are kept but not listed. The box grows with the text (no scrolling inside it) and uses 17px text so the iPhone doesn't zoom in.
- **Daily count and each question's latest result** (for her streak, daily goal and mastery; recorded since v55, not shown on screen yet):
  - `daily`: questions finished per day, by her phone's local date (`{"2026-11-17": 12}`), last 400 days kept. A question counts once each time she finishes it: a multiple-choice answer submitted, or an essay / fill-in-the-blank rated (any difficulty). Read mode, Peek and just opening a question don't count. A **streak day** = a day with at least one.
  - `results`: per question ID, `{ "last": "right"|"wrong"|"got"|"partly"|"missed", "on": date, "inARow": n, "level": difficulty level ID (fill in the blank only) }`.
  - `inARow` (right answers in a row): **+1** for a correct multiple-choice answer, an essay Got it, or a fill-in-the-blank Got it at **Steady, Deep dive or Word for word**; **reset to 0** by a wrong answer, Partly or Missed it (any level); **unchanged** by a fill-in-the-blank Got it at Warm-up or Key Legal Terms (still counts for the day). It goes up **at most once per day**: `countedOn` is the day it last went up, and another right answer that same day leaves it unchanged (after a reset, the first right answer starts it at 1 again, even the same day). So **mastered = `inARow` of 2 or more = right on two different days in a row, with nothing wrong in between.**
  - Both are part of backups and are cleaned on load / restore; backups made before v55 simply have none.
- **Today card** (home screen, above the subjects): 🔥 streak (consecutive days with at least one finished question; if she hasn't studied yet today, the streak up to yesterday still shows, with "Answer a question today to keep your N-day streak"), her best streak (`streakBest`, saved because `daily` only keeps 400 days), "Today X / goal" with a bar (green once reached), a one-line nudge, and a **Daily goal: N questions ›** line that opens Settings (the goal is changed there; 10 / 20 / 30 / 50, default 20, saved in `settings.dailyGoal`). It refreshes whenever she comes to the home screen, when she returns to the app, and after a restore. `settings` and `streakBest` are part of backups.
- **Mastery** (`isMastered` / `masteryOf` in `progress.js`, `MASTERY_IN_A_ROW = 2`): the Today card shows **⭐ Mastery X / Y** with a bar, where Y = every question currently in the content (all topic files) and X = those mastered; each subject's "Your progress" box shows **"X of Y mastered"** for that subject. Questions added later raise Y automatically; removed ones stop counting.
- **Color tags:** on the question screen, three dots under Bookmark (green, yellow, red) let her tag any question; tapping the color it already has removes the tag. What each color means is up to her; the app doesn't interpret them. Saved in `tags` in her progress (`{"q-0007": "red"}`) and included in backups. The subject screen's "Your lists" has **Review missed / Bookmarked / Tagged**. **Tagged** opens a list screen of every tagged question in that subject (of the picked question type), grouped green → yellow → red, each card with its color dot; tap one to practice just it, or **Start practice** for all. Question cards in any list are built with `makeQuestionCard(question, onTap)` in `app.js`. The tag colors' look lives only in the tag rules in `style.css` (`[data-tag=…]`, `.tag-dot`, `.tag-mark`).
- **Load order warning:** `progress.js` loads her progress at startup (`let progress = loadProgress()`). Anything `loadProgress` uses that is a `const` (like `TAG_COLORS`, `HIGHLIGHT_COLORS`) must be defined **above** that line, or loading fails and the app starts with empty progress.
- Also remember her **highlighted words** (tap a word to highlight it): stored by question ID, or by case ID + part (e.g. `case-0002:facts`, or `case-0002:fulltext` for the full decision text), as a list of word positions. If a question's prompt text is edited later, her saved highlights may land on different words.
  - **Highlighter colors (full decision text only):** a pinned row of 4 swatches: green = Facts, pink = Issue, yellow = Important ruling, yellow-green = Doctrine. The color of each highlighted word is saved in `highlightColors` (e.g. `{"case-0002:fulltext": {"15": "facts"}}`); a highlighted word with no saved color is yellow. A rule's full text (`rule-0001:fulltext`) uses the same 4-color highlighter, with its words numbered across the whole rule (all section cards together); highlights never join across two cards. Questions and case summaries keep the single yellow highlighter. Editing a case's full-text file can likewise shift her highlights there.
- **Where she is right now** (screen, subject/topic, and any practice round in progress: question order, position, answers and ratings so far) is saved in its own slot (`barReviewer.currentSpot.v1`), so a reload puts her back there. It is **not** part of backups. It is cleared when she returns to the home screen or finishes a round (results screen).
- Counting: a multiple-choice question is "missed" if answered wrong. An essay rated **Partly** or **Missed it** goes into her review list.
- iPhone note: she should use Safari's **Add to Home Screen**. iPhones can clear saved data for websites that haven't been opened in a while, but apps added to the home screen are better protected. **Settings → Data** has **Back up my progress** (saves a file via the Share menu → Save to Files) and **Restore progress** (loads that file back).

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
- **Wide screens** (rules at the end of `style.css`; phones under 800px never see them, and the reading column stays at most 640px):
  - **1024px and up (iPad in landscape, Mac): a dark sidebar on the left** (`<nav id="sidebar">` in `index.html`, fixed, 240px = `--sidebar-width`; colors `--sidebar-*`, dark in both light and dark mode). It has Home, Search (goes home and puts the cursor in the search box), the subjects (built by `buildSidebar` from `SUBJECTS` + `MISC_SUBJECTS`), and My notes. `updateSidebar` (called by `showScreen`) marks the current section with `aria-current="page"`: the subject she's in (also on its topics, questions, results and cases), My notes (also a case or rule opened from it), Search (a case or rule opened from search), or Home. Leaving a round from the sidebar works like the question screen's Back. **Below 1024px (phones, iPads in portrait) the same sidebar is the ☰ menu:** a ☰ button (`#menu-btn`, 44×44px, top-right of every screen, scrolls with the page; the question screen's "Question 1 of 48" sits left of it) opens it sliding in from the left over a dimmed page (`body.menu-open`, `#menu-backdrop`; `openMenu` / `closeMenu` in `app.js`). It closes when she picks a section, taps ✕ (`#sidebar-close`), taps the dimmed page, or presses Esc, and when the screen gets wide enough for the fixed sidebar. Wide screens have no ☰ / ✕ / backdrop. Apart from the ☰ (and the question screen's count moving left), phone screens look exactly as before. **Planned:** each missing section (all-subject Review missed, Tagged, Performance, Library, Study Schedule) gets a sidebar link when its screen is built.
  - **800px and up:** home screen subject cards in 2 columns; **1280px and up:** 3 columns. (The side-panel layouts below start at 1280px, not 1100px, because the sidebar takes 240px from 1024px up.)
  - **1280px and up, case screen:** her notes and "Questions linked to this case" move into a side panel on the right that stays in view while she scrolls (`placeCaseSide` in `app.js` moves the two blocks there and back, using markers, when the width changes).
  - **1280px and up, Find in case:** opens as a panel on the right next to the question (the question shifts left, nothing is dimmed, swipe-to-close is off); phones keep the slide-up panel.
  - `body[data-screen]` (set in `showScreen`) tells the CSS which screen is showing.
  - When changing layout, check phones didn't change: full-page screenshots at 390px before and after should be pixel-identical.
- **Works offline** after the first visit (using a "service worker", a small script that saves the app's files on the phone).
  - **Cache version rule:** whenever any app file changes (`index.html`, `style.css`, `app.js`, `progress.js`, `find-in-case.js`, `manifest.webmanifest`, icons), or a file is added to or removed from the `APP_FILES` list, bump `CACHE_VERSION` in `sw.js` (v1 → v2 …) in the same commit, and tell the builder it was bumped. Editing only content (`data/catalog.json`, `data/rules.json`, the topic files in `data/content/`, or files in `data/case-texts/` and `data/rule-texts/`) does not need a bump: they are fetched fresh whenever she's online.
  - Topic files are kept on the phone in their own cache (`bar-reviewer-content`), like case and rule texts (`bar-reviewer-case-texts`), so an app update never erases them. When a new version installs, it also downloads every topic file listed in the catalog, so everything works offline from the first visit.
  - Every new app file must be added to `APP_FILES` in `sw.js`, or it won't work offline.
  - Use relative paths only (no leading `/`), so the app works at `username.github.io/bar-reviewer/`.
- **Hosting:** GitHub Pages (free). It gives one web link to open on her iPhone and add to the home screen.
- **Running it on the Mac:** open the project folder in VS Code and use a simple local web server (instructions will be given when first needed).
- Bad or missing content in the JSON files must not crash the app. Show a clear message instead.
- **Case titles have one shared style.** Every case name shown as a label uses the `case-title` class, and its look lives only in the `.case-title` rule in `style.css`. In code, build case names with `caseTitle(name)` and case-list cards with `makeCaseCard(theCase, onTap)` (both in `app.js`); the case screen heading has `class="case-title"` in `index.html`; the parties' caption at the top of a full decision gets it automatically (`markCaption`). Any new screen that shows a case name must use these, never its own styling.
- **The "Unverified" label has one shared style too.** Anything whose `status` isn't `"verified"` shows a red **Unverified** label (the `--missed` red), **except rule text**: fill-in-the-blank items and rules (IDs starting with `rule-`) are the section's own wording, so they never show it, anywhere (question screen, Show answer, Read, Read the full rule, search, My notes, question lists). One shared rule decides this: `showsUnverified(item)` / `isRuleText(item)` in `app.js`; every place that shows the label must use it. Their `status` in the data stays as it is (still `"draft"` until a person checks it); only the label is hidden. Its look lives only in the `.status-unverified` rule in `style.css`; build it with `unverifiedLabel()`, or a card's detail line with `cardDetail(text, verified)` (both in `app.js`). Any new screen that shows a question or case must use these.
- **The accent color lives in shared variables** (in `:root` at the top of `style.css`, with dark-mode values below them). Never use a color of your own for the accent:
  - `--primary` (#6666FF): backgrounds of buttons and the selected tab, borders, focus rings and progress bars. **Never the color of small text** (too light for that).
  - `--on-primary` (white): the text on a `--primary` background. White on #6666FF is only 4.27:1, so it must always be **bold (700) or large**.
  - `--primary-text` (#5555E0): any small colored text (Back, subject labels, links, "Find in case", captions, secondary buttons' text, the ☰ icon).
  - `--primary-soft` (#CCCCFF): **only as a background behind dark text** (`--text`): answer words under Full text, peeked answers, the inside of blank boxes. Never as a text color.
  - `--primary-edge` (#A9A9FF): borders of cards (`.card`, `.subject-card`, `.choice`), inputs (search, Daily goal, notes box and toolbar) and the blank boxes.
  - After a color change, check every screen in light and dark mode: other text needs a contrast of at least 4.5:1 with what's behind it (3:1 if large or bold), no text in the soft tint, no small text in `--primary`, and every white label on `--primary` bold.
- **Reading text has one shared style too.** Every block of question or case text she reads (question prompts, explanations, suggested answers, case facts/issue/ruling/doctrine, the full decision text, the revealed fill-in-the-blank text) has the `reading-text` class, and its look (justified, with hyphens) lives only in the `.reading-text` rule in `style.css`. Any new screen or question type that shows reading text adds that class; never style a screen's text by its id. Reading text that contains typing boxes (fill in the blank) is justified too; it only gets a little more line spacing (`.reading-text:has(input)`). Don't add exceptions that switch justify off for one kind of text without asking the builder first. Short labels, citations (the case's Source line), multiple-choice options and key-point checkboxes aren't reading text.

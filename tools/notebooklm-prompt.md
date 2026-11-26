# Prompt to paste into NotebookLM

How to use it:
1. Open your notebook in NotebookLM.
2. Copy everything in the box below into the chat.
3. Replace the three things in [square brackets] (subject, topic, how many questions).
4. When NotebookLM answers, copy its whole answer (it should start with `[` and end with `]`).
5. In VS Code, make a new file in `imports/notebooklm/inbox/` (any name ending in `.json`, for example `labor-2026-11-20.json`) and paste it in. Save.
6. In Claude Code, say: **import my NotebookLM questions**.

The subject must be one of these, spelled exactly like this:
Political Law · Labor Law and Social Legislation · Civil Law · Taxation Law · Mercantile Law · Criminal Law · Remedial Law · Legal and Judicial Ethics

---

```text
Write [10] Philippine Bar Exam review questions for the subject "[Remedial Law]", topic "[Special Proceedings]", from the sources in this notebook.

Mix the types: about half "essay" (fact patterns, like the Bar), the rest "mcq" (multiple choice), and at most a few "fillblank" (only for exact wording of a law or rule that must be memorized).

Rules:
- Write every question, choice and answer in your OWN words. Never copy more than 6 words in a row from any source (codal text in a "fillblank" is the only exception, and must then be the official wording exactly).
- Every answer must rest on a specific Philippine law, rule or Supreme Court decision. Name it in "basis": the law and section (e.g. "Rules of Court, Rule 102, Sec. 3") or the case with its G.R. number and date (e.g. "Vivares v. St. Theresa's College, G.R. No. 202666, September 29, 2014"). Never invent a case, G.R. number or section. If you are not sure of one, leave the question out.
- If a rule was amended or the point is disputed, say so in the answer.
- No section numbers or hints of the answer inside the question itself.
- Write like the real Philippine Bar Exam. If this notebook has past Bar questions, follow how they tell the facts, what they ask and the traps they set, but with new facts and your own wording (never copy or reword a past question). If it has none, just write clear bar-style fact patterns and don't claim they copy the Bar.
- Each question may have one fair trap (an exception that looks like the rule, one fact that changes the result, a deadline that matters). There must still be one clear right answer, and the explanation (essay: the conclusion) must say "**Bar trap:**" and how to avoid it.

Answer with ONLY a JSON array (no text before or after it, no ``` marks). Each item is one of these three shapes:

{"type": "essay", "subject": "...", "topic": "...", "subtopic": "optional, or leave it out",
 "prompt": "the fact pattern and question",
 "suggestedAnswer": {"answer": "direct answer", "legalBasis": "the rule", "application": "how it applies to these facts", "conclusion": "final conclusion"},
 "keyPoints": ["point 1", "point 2", "point 3"],
 "basis": "the exact law/section or case (G.R. No., date)", "sourceNote": "which source in this notebook it came from"}

{"type": "mcq", "subject": "...", "topic": "...", "subtopic": "optional",
 "prompt": "the question",
 "choices": {"A": "...", "B": "...", "C": "...", "D": "..."},
 "correct": "B",
 "explanation": "**B is correct.** why. **A is wrong:** why. **C is wrong:** why. **D is wrong:** why.",
 "basis": "...", "sourceNote": "..."}

{"type": "fillblank", "subject": "...", "topic": "...", "subtopic": "optional",
 "prompt": "the exact text of the provision with the key words replaced by ____ (four underscores)",
 "fullText": "the same exact text with nothing blanked",
 "explanation": "why those words matter",
 "basis": "...", "sourceNote": "..."}

Exactly 4 choices A to D and one correct letter for every mcq. In fillblank, everything outside the blanks must be identical to fullText, and two blanks must never be side by side.
```

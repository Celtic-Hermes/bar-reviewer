#!/usr/bin/env python3
"""
Content checker for Bar Reviewer.

Reads every content file in data/ (the catalog, every topic file it lists, rules.json,
and the full texts) and lists anything wrong, in plain words.
It only READS files: it never changes anything.

How to run it (in VS Code's terminal, from the project folder):

    python3 tools/check-content.py

At the end it says either "All content OK" or how many problems it found.
Long lists show the first 50 lines; add --all to see every line.
  - PROBLEM  = must be fixed before committing (it breaks the app or a content rule).
  - CHECK    = not necessarily wrong, but a person should look at it.
"""

import importlib.util
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")

# The catalog builder (tools/build-catalog.py): used to check the catalog is up to date.
_spec = importlib.util.spec_from_file_location("build_catalog", os.path.join(ROOT, "tools", "build-catalog.py"))
builder = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(builder)

# The progress builder (tools/build-progress.py): used to check data/content-progress.json.
_pspec = importlib.util.spec_from_file_location("build_progress", os.path.join(ROOT, "tools", "build-progress.py"))
progress_builder = importlib.util.module_from_spec(_pspec)
_pspec.loader.exec_module(progress_builder)

# The 8 bar subjects and MISC_SUBJECTS: one list, in build-catalog.py (must match app.js).
SUBJECTS = builder.SUBJECTS
MISC_SUBJECTS = builder.MISC_SUBJECTS
STATUSES = ["draft", "verified"]
BLANK = re.compile(r"_{4,}")
# A section's heading, same rule as splitSectionHeading in app.js: "SECTION 1. Petition. – …"
# = SECTION/Section/SEC./Sec./ARTICLE/Article/ART./Art. + number + period, up to the first
# period followed by a dash.
SECTION_HEADING = re.compile(r"^((?:SECTION|Section|SEC\.|Sec\.|ARTICLE|Article|ART\.|Art\.)\s+\d+\s*\.[^\n*]{0,200}?\.)(\s?[-–—]+\s*)")
# LawPhil's hidden watermarks, like "1awphi1", "ℒαwρhi৷", "1âwphi1".
WATERMARK = re.compile(r"[1lℒ][aâα][wω][pρ]h[i1৷]", re.IGNORECASE)
PLACEHOLDER = "[PLACEHOLDER]"

problems = []
checks = []


def problem(where, message):
    problems.append(where + ": " + message)


def check(where, message):
    checks.append(where + ": " + message)


# ---------- Small helpers ----------

def load_json(name, shape=list):
    """Load <name> (a path inside the project, like data/rules.json).
    Returns its content, or None if it can't be read or isn't a list (or an object, if shape=dict)."""
    path = os.path.join(ROOT, name)
    if not os.path.exists(path):
        problem(name, "file is missing.")
        return None
    try:
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
    except json.JSONDecodeError as e:
        problem(name, "isn't valid JSON (a typo near line %d, column %d: %s)." % (e.lineno, e.colno, e.msg))
        return None
    if not isinstance(data, shape):
        problem(name, "should be a %s, but isn't." % ("list (starting with [ )" if shape is list else "{ … } object"))
        return None
    return data


def load_content():
    """Read data/catalog.json and every topic file it lists.
    Returns (questions, cases) as lists of (file name, item), or (None, None) if the catalog can't be read."""
    catalog = load_json("data/catalog.json", dict)
    if catalog is None:
        return None, None
    topics = catalog.get("topics")
    if not isinstance(topics, list):
        problem("data/catalog.json", "needs a \"topics\" list.")
        return None, None
    questions, cases = [], []
    files_seen, places_seen = set(), set()
    for n, entry in enumerate(topics, start=1):
        where = "data/catalog.json, topic %d" % n
        if not isinstance(entry, dict) or not all(filled(entry.get(k)) for k in ["subject", "topic", "file"]):
            problem(where, "needs a subject, a topic and a file.")
            continue
        file_name, place = entry["file"], (entry["subject"], entry["topic"])
        if not file_name.startswith("data/content/") or not file_name.endswith(".json"):
            problem(where, "file %r should be data/content/<subject>/<topic>.json." % file_name)
            continue
        if file_name in files_seen:
            problem(where, "%s is listed twice." % file_name)
            continue
        if place in places_seen:
            problem(where, "%s → %s is listed twice; one topic = one file." % place)
        files_seen.add(file_name)
        places_seen.add(place)
        if entry["subject"] not in SUBJECTS + MISC_SUBJECTS:
            problem(where, "subject %r isn't one of the 8 exact subject names." % entry["subject"])
        data = load_json(file_name, dict)
        if data is None:
            continue
        if (data.get("subject"), data.get("topic")) != place:
            problem(file_name, "says it is %r → %r, but the catalog lists it as %s → %s."
                    % (data.get("subject"), data.get("topic"), place[0], place[1]))
        for key, bucket in [("questions", questions), ("cases", cases)]:
            items = data.get(key, [])
            if not isinstance(items, list):
                problem(file_name, "'%s' should be a list (use [] if none)." % key)
                continue
            for item in items:
                bucket.append((file_name, item))
                if isinstance(item, dict) and (item.get("subject"), item.get("topic")) != place \
                        and item.get("subject") in SUBJECTS + MISC_SUBJECTS:
                    problem(str(item.get("id")), "is %r → %r, but it's in the file for %s → %s."
                            % (item.get("subject"), item.get("topic"), place[0], place[1]))
    # Topic files the catalog doesn't list (the app would never load them).
    content_dir = os.path.join(DATA, "content")
    for folder, _, names in os.walk(content_dir):
        for name in sorted(names):
            rel = os.path.relpath(os.path.join(folder, name), ROOT).replace(os.sep, "/")
            if name.endswith(".json") and rel not in files_seen:
                problem(rel, "isn't listed in data/catalog.json, so the app never loads it "
                             "(run: python3 tools/build-catalog.py).")
    # The catalog must be exactly what build-catalog.py makes from the topic files now.
    expected, errors = builder.build_catalog()
    if not errors:
        with open(os.path.join(DATA, "catalog.json"), encoding="utf-8") as f:
            if f.read() != builder.catalog_text(expected):
                problem("data/catalog.json", "is out of date (a topic file changed since it was built). "
                                             "Run: python3 tools/build-catalog.py")
        for rel, data in builder.read_topic_files()[0]:
            wanted = "data/content/%s/%s.json" % (slug(data["subject"]), slug(data["topic"]))
            if rel != wanted:
                check(rel, "for %s → %s, the usual file name is %s." % (data["subject"], data["topic"], wanted))
    return questions, cases


def slug(name):
    """'Legal and Judicial Ethics' → 'legal-and-judicial-ethics'."""
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


def read_text(path):
    try:
        with open(path, encoding="utf-8") as f:
            return f.read()
    except FileNotFoundError:
        return None
    except UnicodeDecodeError:
        problem(os.path.relpath(path, ROOT), "isn't saved as UTF-8 text.")
        return ""


def filled(value):
    """True for a non-empty piece of text."""
    return isinstance(value, str) and value.strip() != ""


def need_text(where, item, field, label=None):
    if not filled(item.get(field)):
        problem(where, "'%s' is missing or empty." % (label or field))
        return False
    return True


def comparable(text):
    """Text ready for an 'appears word for word' check: no ** bold marks,
    no footnote numbers like [3], curly quotes treated like straight ones (’ = '),
    and every run of spaces/line breaks as one space."""
    text = text.replace("**", "")
    text = re.sub("[‘’]", "'", text)
    text = re.sub("[“”]", '"', text)
    text = re.sub(r"\[\d+\]", "", text)
    return re.sub(r"\s+", " ", text).strip()


def check_ids(pairs, prefix):
    """pairs = [(file name, item), …]. Every item has an ID like q-0001, and no ID is used
    twice (in any file). Returns {id: item}."""
    pattern = re.compile("^" + prefix + r"-\d{4,}$")
    by_id, file_of = {}, {}
    counts = {}
    for file_name, item in pairs:
        counts[file_name] = counts.get(file_name, 0) + 1
        where = "%s, %s item %d" % (file_name, prefix, counts[file_name])
        if not isinstance(item, dict):
            problem(where, "isn't an object ({ … }).")
            continue
        item_id = item.get("id")
        if not isinstance(item_id, str) or not pattern.match(item_id):
            problem(where, "ID %r should look like %s-0001." % (item_id, prefix))
            continue
        if item_id in by_id:
            same = "in %s" % file_name if file_of[item_id] == file_name else "in %s and %s" % (file_of[item_id], file_name)
            problem(item_id, "this ID is used more than once (%s)." % same)
            continue
        by_id[item_id] = item
        file_of[item_id] = file_name
    return by_id


def check_place(where, item):
    """Subject, topic, and (optional) sub-topic."""
    subject = item.get("subject")
    if subject not in SUBJECTS + MISC_SUBJECTS:
        problem(where, "subject %r isn't one of the 8 exact subject names." % subject)
    need_text(where, item, "topic")
    if "subtopic" in item and not filled(item.get("subtopic")):
        problem(where, "'subtopic' is there but empty (leave it out instead).")


def check_status(where, item):
    if item.get("status") not in STATUSES:
        problem(where, "status is %r; it must be \"draft\" or \"verified\"." % item.get("status"))


# ---------- Cases ----------

def check_cases(cases):
    by_id = check_ids(cases, "case")
    gr_seen = {}
    for case_id, c in by_id.items():
        check_status(case_id, c)
        check_place(case_id, c)
        for field in ["name", "grNumber", "facts", "issue", "ruling", "keyDoctrine", "sourceUrl"]:
            need_text(case_id, c, field)
        year = c.get("year")
        if not isinstance(year, int) or not (1900 <= year <= 2100):
            problem(case_id, "'year' should be a number like 2020 (it is %r)." % year)
        gr = c.get("grNumber")
        if filled(gr):
            if gr in gr_seen:
                check(case_id, "same G.R. number as %s (%s). Is it the same case twice?" % (gr_seen[gr], gr))
            gr_seen.setdefault(gr, case_id)
        # Its full text.
        path = os.path.join(DATA, "case-texts", case_id + ".txt")
        text = read_text(path)
        if text is None:
            problem(case_id, "has no full-text file (data/case-texts/%s.txt)." % case_id)
        else:
            check_full_text("data/case-texts/%s.txt" % case_id, text, footnotes=True)
            if "syllabusIds" in c:
                check_not_cut_off("data/case-texts/%s.txt" % case_id, text.split("\nFootnotes\n")[0])
        check_reference(case_id, c, "case")
    return by_id


def check_full_text(where, text, footnotes):
    if not text.strip():
        problem(where, "is empty.")
        return
    marks = WATERMARK.findall(text)
    if marks:
        problem(where, "still has %d LawPhil watermark(s), like %r." % (len(marks), marks[0]))
    if footnotes:
        # Every footnote number in the text should have a footnote, after the "Footnotes" heading.
        parts = re.split(r"\n\s*Footnotes\s*\n", text, maxsplit=1)
        if len(parts) == 2:
            body, notes = parts
            # A footnote number is glued to the word before it ("Certiorari[1]"); a bracketed number after a
            # space (like "one hundred eighty [180] days" in Steelcase) is the decision's own wording.
            used = set(re.findall(r"(?<=\S)\[(\d+)\]", body))
            have = set(re.findall(r"^\s*\[(\d+)\]", notes, flags=re.MULTILINE))
            missing = sorted(used - have, key=int)
            if missing:
                problem(where, "footnote(s) %s are used in the text but missing under Footnotes."
                        % ", ".join("[" + m + "]" for m in missing))
        elif re.search(r"\[\d+\]", text):
            check(where, "has footnote numbers but no 'Footnotes' heading.")


# ---------- Reference content (rules and cases linked to the 2027 syllabus) ----------
# Every rule or case that lists "syllabusIds" is reference content and must record where it
# came from: sourceUrl, "retrieved" (the date), and "crossCheck" = the second source it was
# compared with ({"url", "retrieved", "result"}). Rules also need "currency": how it was
# confirmed to be the version in force as of the syllabus cutoff (June 30, 2026).
DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
SECTION_START = re.compile(r"^(?:SECTION|Section|SEC\.|Sec\.|ARTICLE|Article|ART\.|Art\.)\s+(\d+)(-?[A-Z])?\s*\.")
DIVISION_START = re.compile(r"^(?:PART|RULE|TITLE|CHAPTER|BOOK)\s+[\dIVXLC]+\b")
older_without_second_source = []


def syllabus_ids():
    try:
        with open(os.path.join(DATA, "syllabus-2027.json"), encoding="utf-8") as f:
            data = json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return None
    ids = set()

    def walk(nodes):
        for n in nodes or []:
            if isinstance(n, dict) and isinstance(n.get("id"), str):
                ids.add(n["id"])
                walk(n.get("children"))
    for subj in data.get("subjects", []):
        walk(subj.get("topics"))
    return ids


SYLLABUS_IDS = syllabus_ids()


def good_date(value):
    return isinstance(value, str) and bool(DATE.match(value)) and value <= __import__("datetime").date.today().isoformat()


def check_reference(where, item, kind):
    """Sources and syllabus links of a rule or case. Older items without syllabusIds are only counted."""
    if "syllabusIds" not in item:
        if not isinstance(item.get("crossCheck"), dict):
            older_without_second_source.append(where)
        return
    ids = item.get("syllabusIds")
    if not isinstance(ids, list) or not ids:
        problem(where, "'syllabusIds' should be a list of syllabus topic IDs (at least one).")
    elif SYLLABUS_IDS is not None:
        unknown = [i for i in ids if i not in SYLLABUS_IDS]
        if unknown:
            problem(where, "links to syllabus topic(s) that don't exist: %s." % ", ".join(map(str, unknown[:5])))
    url = item.get("sourceUrl")
    if not (isinstance(url, str) and url.startswith("https://")):
        problem(where, "needs 'sourceUrl' (the web address of the official text).")
    if not good_date(item.get("retrieved")):
        problem(where, "needs 'retrieved': the date the text was copied (YYYY-MM-DD, not in the future).")
    cross = item.get("crossCheck")
    if not isinstance(cross, dict):
        problem(where, "needs 'crossCheck': the second source it was compared with ({url, retrieved, result}).")
    else:
        if not (isinstance(cross.get("url"), str) and cross["url"].startswith("https://")):
            problem(where, "'crossCheck.url' should be the second source's web address.")
        elif cross["url"] == url:
            problem(where, "'crossCheck.url' must be a different source from 'sourceUrl'.")
        if not good_date(cross.get("retrieved")):
            problem(where, "'crossCheck.retrieved' should be a date (YYYY-MM-DD).")
        need_text(where, cross, "result", "crossCheck.result")
    if kind == "rule":
        need_text(where, item, "currency")


def check_sections(where, text, gaps):
    """Section numbers run 1, 2, 3 … with no gap or repeat, starting again after each RULE/PART/…
    heading. A gap is allowed only if 'sectionGaps' explains it: {"RULE 41": {"4": "why"}}
    ("" for text without such headings)."""
    gaps = gaps if isinstance(gaps, dict) else {}
    division, expected = "", 1
    for block in re.split(r"\n\s*\n", text):
        block = block.strip()
        if not block:
            continue
        if DIVISION_START.match(block):
            division = block.split("\n")[0].strip()
            expected = 1
            continue
        m = SECTION_START.match(block)
        if not m or m.group(2):
            continue
        number = int(m.group(1))
        explained = gaps.get(division, {}) if isinstance(gaps.get(division, {}), dict) else {}
        while number > expected and str(expected) in explained:
            expected += 1
        if number != expected:
            label = (division + ", " if division else "") + "Section %d" % number
            problem(where, "section numbers jump or repeat at %s (expected Section %d); explain a real gap in 'sectionGaps'." % (label, expected))
            expected = number
        expected += 1


def check_not_cut_off(where, text):
    body = text.strip()
    if not body:
        problem(where, "is empty.")
        return
    if body[-1] not in ".)\"'”’:;]":
        problem(where, "looks cut off: it ends with %r instead of the end of a sentence." % body[-30:])


# ---------- Rules ----------

def check_rules(rules):
    by_id = check_ids([("data/rules.json", r) for r in rules], "rule")
    by_number = {}
    for rule_id, r in by_id.items():
        check_status(rule_id, r)
        for field in ["title", "number", "sourceUrl"]:
            need_text(rule_id, r, field)
        number = r.get("number")
        if filled(number):
            if number in by_number:
                problem(rule_id, "same number as %s (%s); each rule should be listed once." % (by_number[number][0], number))
        path = os.path.join(DATA, "rule-texts", rule_id + ".txt")
        text = read_text(path)
        if text is None:
            problem(rule_id, "has no full-text file (data/rule-texts/%s.txt)." % rule_id)
            text = ""
        else:
            check_full_text("data/rule-texts/%s.txt" % rule_id, text, footnotes=False)
            if "syllabusIds" in r:
                check_not_cut_off("data/rule-texts/%s.txt" % rule_id, text)
                check_sections("data/rule-texts/%s.txt" % rule_id, text, r.get("sectionGaps"))
        check_reference(rule_id, r, "rule")
        if filled(number) and number not in by_number:
            by_number[number] = (rule_id, comparable(text))
    return by_id, by_number


# ---------- Questions ----------

def check_question(q_id, q, cases_by_id, case_texts, rules_by_number):
    check_status(q_id, q)
    check_place(q_id, q)
    q_type = q.get("type")
    if q_type not in ["essay", "mcq", "fillblank"]:
        problem(q_id, "type is %r; it must be \"essay\", \"mcq\" or \"fillblank\"." % q_type)
        return
    need_text(q_id, q, "prompt")

    placeholder = PLACEHOLDER in json.dumps(q, ensure_ascii=False)

    # Linked cases.
    case_ids = q.get("caseIds")
    if not isinstance(case_ids, list):
        problem(q_id, "'caseIds' should be a list (use [] if none).")
        case_ids = []
    for case_id in case_ids:
        if case_id not in cases_by_id:
            problem(q_id, "links to %r, but there's no such case in any topic file." % case_id)

    check_type_parts(q_id, q, q_type)

    # Source.
    source = q.get("source")
    if not isinstance(source, dict):
        problem(q_id, "'source' is missing.")
        return
    for field in ["caseTitle", "grNumber", "part", "excerpt"]:
        need_text(q_id, source, field, "source." + field)
    if placeholder:
        check(q_id, "is placeholder content ([PLACEHOLDER]); its source can't be checked.")
        return

    excerpt = source.get("excerpt")
    gr = source.get("grNumber")
    if not filled(excerpt) or not filled(gr):
        return

    if q_type == "fillblank":
        if rules_by_number is None:
            return  # rules.json couldn't be read (already reported once)
        rule = rules_by_number.get(gr)
        if rule is None:
            check(q_id, "no rule in rules.json has the number %r, so 'Read the full rule' won't show." % gr)
            return
        rule_id, rule_text = rule
        if filled(q.get("fullText")) and comparable(q["fullText"]) not in rule_text:
            problem(q_id, "its fullText isn't found word for word in %s's text file." % rule_id)
        if comparable(excerpt) not in rule_text:
            problem(q_id, "its source excerpt isn't found word for word in %s's text file." % rule_id)
        return

    # Essay / multiple choice: the excerpt should be in the linked case's full text.
    matches = [cid for cid in case_ids if cid in cases_by_id and cases_by_id[cid].get("grNumber") == gr]
    if not matches:
        if case_ids:
            problem(q_id, "its source G.R. number %r doesn't match any case it links to." % gr)
        else:
            check(q_id, "links to no case, so its excerpt can't be checked against a full text.")
        return
    text = case_texts.get(matches[0])
    if not text:
        return  # missing text file is already reported under the case
    where_now = 0
    for piece in excerpt.split("…"):
        piece = comparable(piece)
        if not piece:
            continue
        if piece not in text:
            shown = piece if len(piece) <= 70 else piece[:67] + "..."
            problem(q_id, "this part of the excerpt isn't found word for word in %s's full text: \"%s\""
                    % (matches[0], shown))
            continue
        found = text.find(piece, where_now)
        if found < 0:
            shown = piece if len(piece) <= 70 else piece[:67] + "..."
            problem(q_id, "the excerpt's pieces aren't in the same order as in %s's full text (Find in case would not highlight it); "
                    "this one comes earlier in the decision: \"%s\"" % (matches[0], shown))
        else:
            where_now = found + len(piece)


def check_type_parts(q_id, q, q_type):
    """The parts each question type needs (essay ALAC + key points; MCQ A-D; fill in the blank)."""
    if q_type == "essay":
        answer = q.get("suggestedAnswer")
        if not isinstance(answer, dict):
            problem(q_id, "'suggestedAnswer' is missing.")
        else:
            for part in ["answer", "legalBasis", "application", "conclusion"]:
                if not filled(answer.get(part)):
                    problem(q_id, "suggested answer is missing its '%s' part." % part)
        points = q.get("keyPoints")
        if not isinstance(points, list) or not points or not all(filled(p) for p in points):
            problem(q_id, "'keyPoints' should be a list of at least one point, none empty.")

    elif q_type == "mcq":
        choices = q.get("choices")
        if not isinstance(choices, dict) or sorted(choices.keys()) != ["A", "B", "C", "D"]:
            problem(q_id, "needs exactly 4 choices, A, B, C and D.")
        else:
            for letter, text in choices.items():
                if not filled(text):
                    problem(q_id, "choice %s is empty." % letter)
            texts = [comparable(t) for t in choices.values() if filled(t)]
            if len(set(texts)) != len(texts):
                problem(q_id, "two choices have the same text.")
        if q.get("correct") not in ["A", "B", "C", "D"]:
            problem(q_id, "'correct' is %r; it must be one letter, A–D." % q.get("correct"))
        need_text(q_id, q, "explanation")

    elif q_type == "fillblank":
        check_fillblank(q_id, q)


def check_fillblank(q_id, q):
    prompt = q.get("prompt")
    full = q.get("fullText")
    if not need_text(q_id, q, "fullText") or not filled(prompt):
        return
    if "**" in prompt or "**" in full:
        problem(q_id, "uses ** in the prompt or fullText (not allowed in fill in the blank).")
    pieces = BLANK.split(prompt)
    if len(pieces) < 2:
        problem(q_id, "the prompt has no blanks (____).")
        return
    for between in pieces[1:-1]:
        if between.strip() == "":
            problem(q_id, "two blanks are right next to each other (only spaces between them).")
            break
    # The heading ("SECTION 1. Petition.") is shown on its own line and is never blanked.
    heading = SECTION_HEADING.match(full)
    if not heading:
        check(q_id, "fullText doesn't start with a section heading the app can find (like "
                    "\"SECTION 1. Title. – …\"), so it's shown without a separate heading line.")
    elif not prompt.startswith(heading.group(1)):
        problem(q_id, "has a blank inside the section heading (\"%s\"); the heading must stay visible."
                % heading.group(1))
    # Everything outside the blanks must match fullText exactly, in order.
    pattern = "^" + "(.+?)".join(re.escape(p) for p in pieces) + "$"
    if not re.match(pattern, full, flags=re.DOTALL):
        problem(q_id, "the prompt doesn't line up with fullText (the text outside the blanks "
                      "must be exactly the same), so Show answer would bold the wrong words.")


def check_questions(questions, cases_by_id, rules_by_number):
    by_id = check_ids(questions, "q")
    case_texts = {}
    for case_id in cases_by_id:
        text = read_text(os.path.join(DATA, "case-texts", case_id + ".txt"))
        if text:
            case_texts[case_id] = comparable(text)
    for q_id, q in by_id.items():
        check_question(q_id, q, cases_by_id, case_texts, rules_by_number)
    return by_id


def check_quotes(quotes):
    """data/quotes.json (the home screen's Quote of the day). Each entry has an ID like quote-0001
    (used once), a "kind", text and a status. A "quote" needs an author and a source a person can
    check (plus a short source line, "sourceShort", without a web address, for the screen). A
    "reminder" (a line written for the app) needs text and nothing else: no author, role or source."""
    by_id = check_ids([("data/quotes.json", q) for q in quotes], "quote")
    for q_id, q in by_id.items():
        kind = q.get("kind")
        need_text(q_id, q, "text")
        check_status(q_id, q)
        if kind == "quote":
            need_text(q_id, q, "author")
            need_text(q_id, q, "source")
            short = q.get("sourceShort")
            if not filled(short):
                check(q_id, "has no 'sourceShort' (the short source line shown on the screen: the case name or the work's title).")
            elif re.search(r"https?:|www\.|\b[\w-]+\.(?:net|com|org|gov|ph|edu)\b|/", short):
                problem(q_id, "'sourceShort' should be just the case name or the work's title, with no web address.")
        elif kind == "reminder":
            for field in ["author", "role", "source", "sourceShort"]:
                if filled(q.get(field)):
                    problem(q_id, "a reminder has no '%s' (it is a line written for the app, with no attribution)." % field)
        else:
            problem(q_id, "'kind' is %r; it must be \"quote\" or \"reminder\"." % kind)
        if isinstance(q.get("text"), str) and q["text"].strip().upper().startswith("TEST DATA"):
            check(q_id, "is test data (a placeholder). Replace it with a real entry before real use.")
    return by_id


def check_leftover_files(folder, known_ids):
    """Text files whose case or rule isn't in the JSON (harmless, but probably a mistake)."""
    path = os.path.join(DATA, folder)
    if not os.path.isdir(path):
        return
    for name in sorted(os.listdir(path)):
        if name.endswith(".txt") and name[:-4] not in known_ids:
            check("data/%s/%s" % (folder, name), "no case or rule in the JSON uses this file.")


# ---------- Run everything ----------

SHOW_AT_MOST = 50


def check_ids_unchanged(questions_by_id, cases_by_id, rules_by_id):
    """No ID that was in the last save point (git HEAD's catalog) has disappeared or been renamed."""
    import subprocess
    try:
        old = subprocess.run(["git", "show", "HEAD:data/catalog.json"], cwd=ROOT, capture_output=True, text=True, timeout=20)
    except (OSError, subprocess.SubprocessError):
        check("IDs", "couldn't compare with the last save point (git not available).")
        return
    if old.returncode != 0:
        return
    try:
        cat = json.loads(old.stdout)
    except json.JSONDecodeError:
        return
    before = set()
    for t in cat.get("topics", []):
        for s in t.get("subtopics", []):
            for kind in ("essay", "mcq", "fillblank"):
                before.update(s.get(kind, []))
    before.update(c.get("id") for c in cat.get("cases", []))
    before.update(r.get("id") for r in cat.get("rules", []))
    now = set(questions_by_id) | set(cases_by_id) | set(rules_by_id)
    gone = sorted(i for i in before - now if isinstance(i, str))
    if gone:
        problem("IDs", "these IDs were in the last save point but are gone now (IDs never change or disappear): %s." % ", ".join(gone[:10]))


def check_progress():
    """data/content-progress.json is valid and exactly what tools/build-progress.py builds now."""
    path = os.path.join(DATA, "content-progress.json")
    if not os.path.exists(path):
        return
    try:
        with open(path, encoding="utf-8") as f:
            current = json.load(f)
    except json.JSONDecodeError as e:
        problem("data/content-progress.json", "isn't valid JSON (line %d)." % e.lineno)
        return
    for nid, e in (current.get("topics") or {}).items():
        if e.get("status") not in ("todo", "done", "skipped"):
            problem("data/content-progress.json", "%s has status %r." % (nid, e.get("status")))
        if e.get("status") == "skipped" and not filled(e.get("reason")):
            problem("data/content-progress.json", "%s is skipped without a reason." % nid)
    if progress_builder.text_of(progress_builder.build(current)) != open(path, encoding="utf-8").read():
        problem("data/content-progress.json", "is out of date: run python3 tools/build-progress.py.")


# IDs that were used and then removed: they are never used again.
RETIRED_IDS = {"quote": [4, 5, 6, 10, 11, 12, 13, 14, 15, 16, 17]}


def next_id(by_id, prefix):
    """The ID after the highest one in use, like q-0256 (IDs are never reused, even removed ones)."""
    highest = max([int(i.split("-")[1]) for i in by_id] + RETIRED_IDS.get(prefix, []) or [0])
    return "%s-%04d" % (prefix, highest + 1)


def print_list(lines, show_all):
    """Print the list; if it's very long, only the first 50 (run with --all to see every line)."""
    shown = lines if show_all else lines[:SHOW_AT_MOST]
    for line in shown:
        print("  - " + line)
    if len(shown) < len(lines):
        print("  … and %d more (run: python3 tools/check-content.py --all)" % (len(lines) - len(shown)))
    print()


# ---------- Privacy: private class notes never go into git ----------
# notes/ (her private class notes, and notes/private-content/ = everything generated from them)
# is git-ignored and must never be committed or published. This check fails if:
#   - any file under notes/ is staged for commit or already tracked by git;
#   - .gitignore no longer ignores notes/ or notes/private-content/;
#   - sw.js mentions notes/ (the offline lists must never include private files);
#   - the lines being committed (or a commit message) contain 12 or more words in a row
#     that also appear in the private content (a quote from the notes), except in
#     data/class-notes.json, the published class-notes questions (QUOTE_ALLOWED).
# It never prints the private text itself, only where the match is.
PRIVATE_DIRS = ["notes/"]
PRIVATE_CONTENT = os.path.join(ROOT, "notes", "private-content")
QUOTE_WORDS = 12
QUOTE_ALLOWED = {"data/class-notes.json"}  # the only committed file allowed to quote the notes


def _git(*args):
    import subprocess
    try:
        r = subprocess.run(["git"] + list(args), cwd=ROOT, capture_output=True, text=True, timeout=30)
    except (OSError, subprocess.SubprocessError):
        return None
    return r


def _words(text):
    return re.findall(r"[a-z0-9]+", text.lower())


def _windows(words):
    return {" ".join(words[i:i + QUOTE_WORDS]) for i in range(len(words) - QUOTE_WORDS + 1)}


def private_fingerprints():
    """Every run of 12 words from the private content (kept in memory only, never printed)."""
    found = set()
    if not os.path.isdir(PRIVATE_CONTENT):
        return found

    def strings(value):
        if isinstance(value, str):
            yield value
        elif isinstance(value, dict):
            for v in value.values():
                yield from strings(v)
        elif isinstance(value, list):
            for v in value:
                yield from strings(v)

    for folder, _, files in os.walk(PRIVATE_CONTENT):
        for name in files:
            if not name.endswith((".json", ".txt", ".md")):
                continue
            path = os.path.join(folder, name)
            try:
                with open(path, encoding="utf-8") as f:
                    raw = f.read()
            except (OSError, UnicodeDecodeError):
                continue
            texts = [raw]
            if name.endswith(".json"):
                try:
                    texts = list(strings(json.loads(raw)))
                except json.JSONDecodeError:
                    pass
            for t in texts:
                found |= _windows(_words(t))
    return found


def check_privacy(message_file=None):
    where = "PRIVACY"
    git_ok = _git("rev-parse", "--git-dir")
    if git_ok is None or git_ok.returncode != 0:
        check(where, "couldn't run git, so the private-notes check was skipped.")
        return
    # 1. Nothing under notes/ is staged or tracked.
    staged = (_git("diff", "--cached", "--name-only", "-z").stdout or "").split("\0")
    tracked = (_git("ls-files", "-z", "--", *PRIVATE_DIRS).stdout or "").split("\0")
    for path in sorted({p for p in staged + tracked if p and any(p.startswith(d) for d in PRIVATE_DIRS)}):
        problem(where, "%s is private (notes/) and must never be committed. Unstage it with: git rm --cached \"%s\"" % (path, path))
    # 2. .gitignore still hides the private folders.
    for probe in ("notes/x.pdf", "notes/private-content/x.json"):
        if _git("check-ignore", "-q", probe).returncode != 0:
            problem(where, ".gitignore no longer ignores %s/; put the line notes/ back." % probe.rsplit("/", 1)[0])
    # 3. The offline lists never include private files.
    sw = read_text(os.path.join(ROOT, "sw.js")) or ""
    if "notes/" in sw:
        problem(where, "sw.js mentions notes/: private files must never be in APP_FILES or DATA_FILES.")
    # 4. No quote from the private content in what's being committed (or in the commit message).
    prints = private_fingerprints()
    if not prints:
        return
    diff = _git("diff", "--cached", "-U0", "--no-color", "--no-ext-diff").stdout or ""
    added, current = {}, None
    for line in diff.splitlines():
        if line.startswith("+++ "):
            current = line[6:] if line.startswith("+++ b/") else None
        elif line.startswith("+") and current:
            added.setdefault(current, []).append(line[1:])
    for path, lines in sorted(added.items()):
        if path in QUOTE_ALLOWED:
            continue  # the published class-notes questions quote the notes on purpose
        if _windows(_words(" ".join(lines))) & prints:
            problem(where, "%s (staged) contains %d+ words in a row from your private notes. Remove them, "
                    "or, if that text is really from an official source, check it carefully before committing." % (path, QUOTE_WORDS))
    if message_file:
        text = read_text(message_file) or ""
        if _windows(_words(text)) & prints:
            problem(where, "the commit message contains %d+ words in a row from your private notes." % QUOTE_WORDS)


CLASS_NOTES = os.path.join(DATA, "class-notes.json")


def check_class_notes(official_ids):
    """data/class-notes.json (questions made from class notes; public, labeled "From class notes").
    Checks the same parts as official questions, plus: IDs are pq-0001 …, used once, never removed
    (compared with the last save point, and with notes/private-content/ids-issued.txt when it's on
    this computer), the source names the class notes, and, when the private cleaned notes text
    (notes/private-content/notes-text.txt) is on this computer, every excerpt piece and fullText
    appears in it word for word. Returns the IDs, or None if there's no file."""
    path = CLASS_NOTES
    if not os.path.exists(path):
        return None
    where = "data/class-notes.json"
    try:
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
    except (json.JSONDecodeError, UnicodeDecodeError) as e:
        problem(where, "isn't valid JSON (%s)." % e)
        return {}
    questions = data.get("questions") if isinstance(data, dict) else None
    if not isinstance(questions, list):
        problem(where, "has no \"questions\" list.")
        return {}
    notes_text = read_text(os.path.join(PRIVATE_CONTENT, "notes-text.txt")) or ""
    notes_text = comparable(re.sub(r"\[Page \d+\]", " ", notes_text))
    if not notes_text:
        check(where, "the private notes text isn't on this computer, so the quotes weren't compared with the notes.")
    by_id = {}
    for q in questions:
        q_id = q.get("id") if isinstance(q, dict) else None
        if not isinstance(q_id, str) or not re.fullmatch(r"pq-\d{4}", q_id):
            problem(where, "an item has the ID %r; class-notes IDs look like pq-0001." % (q_id,))
            continue
        if q_id in by_id:
            problem(q_id, "this ID is used twice.")
            continue
        by_id[q_id] = q
        check_status(q_id, q)
        if q.get("status") == "verified":
            check(q_id, "is marked verified: only a person sets that.")
        check_place(q_id, q)
        q_type = q.get("type")
        if q_type not in ["essay", "mcq", "fillblank"]:
            problem(q_id, "type is %r." % q_type)
            continue
        need_text(q_id, q, "prompt")
        before = len(checks)
        check_type_parts(q_id, q, q_type)
        # Notes sections have no "SECTION 1. Title. –" heading; that CHECK isn't useful here.
        checks[before:] = [c for c in checks[before:] if "section heading the app can find" not in c]
        if q.get("caseIds") not in ([], None):
            problem(q_id, "class-notes questions link to no case ('caseIds' should be []).")
        source = q.get("source")
        if not isinstance(source, dict):
            problem(q_id, "'source' is missing.")
            continue
        for field in ["caseTitle", "file", "part", "excerpt"]:
            need_text(q_id, source, field, "source." + field)
        if source.get("caseTitle") != "Class notes":
            problem(q_id, "source.caseTitle should be \"Class notes\".")
        if not notes_text:
            continue
        pieces = [p for p in str(source.get("excerpt", "")).split("…") if comparable(p)]
        if q_type == "fillblank" and filled(q.get("fullText")):
            pieces.append(q["fullText"])
        for piece in pieces:
            if comparable(piece) not in notes_text:
                shown = comparable(piece)[:60]
                problem(q_id, "this isn't found word for word in notes-text.txt: \"%s…\"" % shown)
    clash = sorted(set(by_id) & set(official_ids))
    if clash:
        problem(where, "IDs also used by official content: %s." % ", ".join(clash))
    issued = set((read_text(os.path.join(PRIVATE_CONTENT, "ids-issued.txt")) or "").split())
    old = _git("show", "HEAD:data/class-notes.json")
    if old is not None and old.returncode == 0:
        try:
            issued |= {q.get("id") for q in json.loads(old.stdout).get("questions", []) if isinstance(q, dict)}
        except (json.JSONDecodeError, AttributeError):
            pass
    if issued:
        gone = sorted(i for i in issued - set(by_id) if isinstance(i, str))
        if gone:
            problem(where, "these IDs were given out before but are gone now (IDs never change or disappear): %s."
                    % ", ".join(gone[:10]))
    return by_id


def privacy_only():
    """python3 tools/check-content.py --privacy [--message FILE]: only the private-notes check (used by the git hooks)."""
    msg = sys.argv[sys.argv.index("--message") + 1] if "--message" in sys.argv[:-1] else None
    check_privacy(msg)
    if problems:
        print("Private-notes check FAILED — nothing was committed:")
        print_list(problems, True)
        return 1
    print("Private-notes check OK.")
    return 0


def main():
    if "--privacy" in sys.argv:
        return privacy_only()
    check_privacy()
    questions, cases = load_content()
    rules = load_json("data/rules.json")

    cases_by_id = check_cases(cases) if cases is not None else {}
    rules_by_id, rules_by_number = check_rules(rules) if rules is not None else ({}, None)
    questions_by_id = check_questions(questions, cases_by_id, rules_by_number) if questions is not None else {}
    check_leftover_files("case-texts", cases_by_id)
    if rules is not None:
        check_leftover_files("rule-texts", rules_by_id)

    check_ids_unchanged(questions_by_id, cases_by_id, rules_by_id)
    check_progress()
    if older_without_second_source:
        check("older content", "%d item(s) made before the syllabus work have no second source recorded "
              "(%s…); add one when they are linked to the syllabus." % (len(older_without_second_source), ", ".join(older_without_second_source[:4])))

    quotes = load_json("data/quotes.json")
    quotes_by_id = check_quotes(quotes) if quotes is not None else {}
    private_by_id = check_class_notes(questions_by_id)
    print("Checked %d questions, %d cases, %d rules, %d quotes." % (len(questions_by_id), len(cases_by_id), len(rules_by_id), len(quotes_by_id)))
    print("Next free IDs: %s, %s, %s, %s" % (next_id(questions_by_id, "q"), next_id(cases_by_id, "case"),
                                             next_id(rules_by_id, "rule"), next_id(quotes_by_id, "quote")))
    if private_by_id is not None:
        ledger = (read_text(os.path.join(PRIVATE_CONTENT, "ids-issued.txt")) or "").split()
        print("Class notes (data/class-notes.json): %d questions; next free ID %s"
              % (len(private_by_id), next_id({i: 1 for i in set(private_by_id) | set(ledger)}, "pq")))
    print()
    show_all = "--all" in sys.argv
    if checks:
        print("CHECK (%d) — worth a look, but not errors:" % len(checks))
        print_list(checks, show_all)
    if problems:
        print("PROBLEM (%d) — fix these before committing:" % len(problems))
        print_list(problems, show_all)
        print("Found %d problem(s)." % len(problems))
        return 1
    print("All content OK.")
    return 0


if __name__ == "__main__":
    sys.exit(main())

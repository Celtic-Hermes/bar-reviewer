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
            used = set(re.findall(r"\[(\d+)\]", body))
            have = set(re.findall(r"^\s*\[(\d+)\]", notes, flags=re.MULTILINE))
            missing = sorted(used - have, key=int)
            if missing:
                problem(where, "footnote(s) %s are used in the text but missing under Footnotes."
                        % ", ".join("[" + m + "]" for m in missing))
        elif re.search(r"\[\d+\]", text):
            check(where, "has footnote numbers but no 'Footnotes' heading.")


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
    for piece in excerpt.split("…"):
        piece = comparable(piece)
        if piece and piece not in text:
            shown = piece if len(piece) <= 70 else piece[:67] + "..."
            problem(q_id, "this part of the excerpt isn't found word for word in %s's full text: \"%s\""
                    % (matches[0], shown))


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


def next_id(by_id, prefix):
    """The ID after the highest one in use, like q-0256 (IDs are never reused)."""
    highest = max([int(i.split("-")[1]) for i in by_id] or [0])
    return "%s-%04d" % (prefix, highest + 1)


def print_list(lines, show_all):
    """Print the list; if it's very long, only the first 50 (run with --all to see every line)."""
    shown = lines if show_all else lines[:SHOW_AT_MOST]
    for line in shown:
        print("  - " + line)
    if len(shown) < len(lines):
        print("  … and %d more (run: python3 tools/check-content.py --all)" % (len(lines) - len(shown)))
    print()


def main():
    questions, cases = load_content()
    rules = load_json("data/rules.json")

    cases_by_id = check_cases(cases) if cases is not None else {}
    rules_by_id, rules_by_number = check_rules(rules) if rules is not None else ({}, None)
    questions_by_id = check_questions(questions, cases_by_id, rules_by_number) if questions is not None else {}
    check_leftover_files("case-texts", cases_by_id)
    if rules is not None:
        check_leftover_files("rule-texts", rules_by_id)

    print("Checked %d questions, %d cases, %d rules." % (len(questions_by_id), len(cases_by_id), len(rules_by_id)))
    print("Next free IDs: %s, %s, %s" % (next_id(questions_by_id, "q"), next_id(cases_by_id, "case"),
                                         next_id(rules_by_id, "rule")))
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

#!/usr/bin/env python3
"""
Builds data/catalog.json from the topic files in data/content/.

The catalog is a small summary of all the content, so the app can show menus, counts,
Mastery and search without loading every topic file. Never edit it by hand: change the
topic files, then run this (in VS Code's terminal, from the project folder):

    python3 tools/build-catalog.py

Then run the checker (python3 tools/check-content.py), which also tells you if the
catalog is out of date.

What's in the catalog:
  "topics": one entry per topic file, in the order the app shows them (the 8 subjects'
    order, then topics in the order their first question appears, by ID). Each has its
    "subtopics" (same order; "name": null = content with no sub-topic), and each of those
    has its question IDs by type ("essay", "mcq", "fillblank") and "rule": the
    source.grNumber all its questions share (for "Read the full rule"), or null.
  "cases": one line per case: id, name, grNumber, year, subject, topic, subtopic (if any),
    status, and "questions": the IDs of the questions linked to it (their caseIds).
  "rules": one line per rule in data/rules.json: id, title, number (its citation), status,
    and the subject and topic its questions are filed under (null if no question uses it).
    Rules have no year in their data, so none is listed.
The search on the home screen looks through "cases" and "rules".
"""

import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CONTENT = os.path.join(ROOT, "data", "content")
CATALOG = os.path.join(ROOT, "data", "catalog.json")
RULES = os.path.join(ROOT, "data", "rules.json")

# The 8 bar subjects in the app's order (must match SUBJECTS in app.js), then MISC_SUBJECTS.
SUBJECTS = [
    "Political Law",
    "Labor Law and Social Legislation",
    "Civil Law",
    "Taxation Law",
    "Mercantile Law",
    "Criminal Law",
    "Remedial Law",
    "Legal and Judicial Ethics",
]
MISC_SUBJECTS = []
TYPES = ["essay", "mcq", "fillblank"]


def id_number(item_id):
    """'q-0012' → 12 (anything odd sorts last)."""
    found = re.search(r"\d+$", str(item_id))
    return int(found.group()) if found else 10 ** 9


def subtopic_of(item):
    value = item.get("subtopic")
    return value.strip() if isinstance(value, str) and value.strip() else None


def type_of(question):
    """Same as the app: anything that isn't mcq or fillblank counts as an essay."""
    return question.get("type") if question.get("type") in ("mcq", "fillblank") else "essay"


def read_topic_files():
    """Every .json file in data/content/. Returns (list of (path, data), list of errors)."""
    found, errors = [], []
    for folder, _, names in sorted(os.walk(CONTENT)):
        for name in sorted(names):
            if not name.endswith(".json"):
                continue
            full = os.path.join(folder, name)
            rel = os.path.relpath(full, ROOT).replace(os.sep, "/")
            try:
                with open(full, encoding="utf-8") as f:
                    data = json.load(f)
            except json.JSONDecodeError as e:
                errors.append("%s isn't valid JSON (near line %d, column %d: %s)." % (rel, e.lineno, e.colno, e.msg))
                continue
            if not isinstance(data, dict) or not isinstance(data.get("subject"), str) or not isinstance(data.get("topic"), str):
                errors.append("%s needs a \"subject\" and a \"topic\"." % rel)
                continue
            found.append((rel, data))
    return found, errors


def items(data, key):
    value = data.get(key)
    if not isinstance(value, list):
        return []
    return sorted([x for x in value if isinstance(x, dict) and isinstance(x.get("id"), str)],
                  key=lambda x: id_number(x["id"]))


def build_catalog():
    """Returns (catalog, errors)."""
    files, errors = read_topic_files()
    order = SUBJECTS + MISC_SUBJECTS
    topics, all_cases, links = [], [], {}
    rule_place = {}  # rule number → (question ID number, subject, topic) of its first question

    for rel, data in files:
        questions, cases = items(data, "questions"), items(data, "cases")
        # Sub-topics in the order they first appear: questions (by ID), then cases.
        groups = {}
        for item in questions + cases:
            name = subtopic_of(item)
            if name not in groups:
                groups[name] = {"name": name, "questions": []}
        for q in questions:
            groups[subtopic_of(q)]["questions"].append(q)
            number = (q.get("source") or {}).get("grNumber")
            if isinstance(number, str):
                place = (id_number(q["id"]), data["subject"], data["topic"])
                if number not in rule_place or place < rule_place[number]:
                    rule_place[number] = place
            for case_id in q.get("caseIds") or []:
                links.setdefault(case_id, []).append(q["id"])
        subtopics = []
        for g in groups.values():
            numbers = set((q.get("source") or {}).get("grNumber") for q in g["questions"])
            entry = {"name": g["name"]}
            entry["rule"] = numbers.pop() if len(numbers) == 1 and None not in numbers else None
            for t in TYPES:
                entry[t] = [q["id"] for q in g["questions"] if type_of(q) == t]
            subtopics.append(entry)
        first = min([id_number(q["id"]) for q in questions] or [10 ** 9])
        first_case = min([id_number(c["id"]) for c in cases] or [10 ** 9])
        subject_place = order.index(data["subject"]) if data["subject"] in order else len(order)
        topics.append(((subject_place, first, first_case, data["topic"]), {
            "subject": data["subject"],
            "topic": data["topic"],
            "file": rel,
            "subtopics": subtopics,
        }))
        for c in cases:
            entry = {"id": c["id"], "name": c.get("name"), "grNumber": c.get("grNumber"), "year": c.get("year"),
                     "subject": data["subject"], "topic": data["topic"]}
            if subtopic_of(c):
                entry["subtopic"] = subtopic_of(c)
            entry["status"] = c.get("status")
            all_cases.append(entry)

    for c in all_cases:
        c["questions"] = sorted(set(links.get(c["id"], [])), key=id_number)
    all_cases.sort(key=lambda c: id_number(c["id"]))
    topics.sort(key=lambda pair: pair[0])

    all_rules = []
    rules, rule_error = read_rules()
    if rule_error:
        errors.append(rule_error)
    for r in rules:
        place = rule_place.get(r.get("number"))
        all_rules.append({"id": r["id"], "title": r.get("title"), "number": r.get("number"), "status": r.get("status"),
                          "subject": place[1] if place else None, "topic": place[2] if place else None})
    all_rules.sort(key=lambda r: id_number(r["id"]))
    return {"topics": [t for _, t in topics], "cases": all_cases, "rules": all_rules}, errors


def read_rules():
    """data/rules.json as a list of rules (each with an id). Returns (list, error or None)."""
    try:
        with open(RULES, encoding="utf-8") as f:
            data = json.load(f)
    except FileNotFoundError:
        return [], None
    except json.JSONDecodeError as e:
        return [], "data/rules.json isn't valid JSON (near line %d, column %d: %s)." % (e.lineno, e.colno, e.msg)
    if not isinstance(data, list):
        return [], "data/rules.json should be a list."
    return [r for r in data if isinstance(r, dict) and isinstance(r.get("id"), str)], None


def catalog_text(catalog):
    """The catalog as text: readable, but one line per sub-topic and per case so it stays short."""
    def one_line(value):
        return json.dumps(value, ensure_ascii=False)
    lines = ["{", '  "topics": [']
    for n, t in enumerate(catalog["topics"]):
        lines.append("    {")
        lines.append('      "subject": %s,' % one_line(t["subject"]))
        lines.append('      "topic": %s,' % one_line(t["topic"]))
        lines.append('      "file": %s,' % one_line(t["file"]))
        lines.append('      "subtopics": [')
        for m, s in enumerate(t["subtopics"]):
            lines.append("        " + one_line(s) + ("," if m < len(t["subtopics"]) - 1 else ""))
        lines.append("      ]")
        lines.append("    }" + ("," if n < len(catalog["topics"]) - 1 else ""))
    lines.append("  ],")
    for key in ["cases", "rules"]:
        lines.append('  "%s": [' % key)
        for n, c in enumerate(catalog[key]):
            lines.append("    " + one_line(c) + ("," if n < len(catalog[key]) - 1 else ""))
        lines.append("  ]" + ("," if key == "cases" else ""))
    lines.append("}")
    return "\n".join(lines) + "\n"


def main():
    catalog, errors = build_catalog()
    if errors:
        print("Couldn't build the catalog; fix these first:")
        for e in errors:
            print("  - " + e)
        return 1
    text = catalog_text(catalog)
    json.loads(text)  # make sure it's valid JSON before saving
    old = None
    if os.path.exists(CATALOG):
        with open(CATALOG, encoding="utf-8") as f:
            old = f.read()
    questions = sum(len(s[t]) for topic in catalog["topics"] for s in topic["subtopics"] for t in TYPES)
    summary = "%d topics, %d questions, %d cases, %d rules (%.1f KB)" % (
        len(catalog["topics"]), questions, len(catalog["cases"]), len(catalog["rules"]), len(text.encode("utf-8")) / 1024)
    if old == text:
        print("Catalog already up to date: " + summary + ".")
        return 0
    with open(CATALOG, "w", encoding="utf-8") as f:
        f.write(text)
    print("Catalog updated: " + summary + ".")
    return 0


if __name__ == "__main__":
    sys.exit(main())

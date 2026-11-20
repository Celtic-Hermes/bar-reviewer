#!/usr/bin/env python3
"""
Brings questions from NotebookLM into the app, in two steps, with a check against the
official text in between (done by the notebooklm-agent agent, or by hand).

    python3 tools/import-notebooklm.py            # 1. stage: read the inbox, check the shape, give IDs
    python3 tools/import-notebooklm.py --status   #    show what is waiting
    python3 tools/import-notebooklm.py --publish  # 2. publish the confirmed ones, hold back the rest

Folders (all under imports/notebooklm/, git-ignored, this Mac only):
    inbox/          paste NotebookLM's JSON answers here (any name ending in .json)
    done/           inbox files go here once they are staged
    staged.json     questions waiting for the official-text check
    held.json       questions held back (not confirmed), with the reason
    ids-issued.txt  every nq- ID ever given out (never reused)

Published questions go to data/notebooklm.json (public): IDs nq-0001 …, always "draft",
labeled "From NotebookLM", each answer ending with a **Basis:** line and the official link.

How a staged question is marked (in staged.json, its "review" part):
    "state": "pending"    not looked at yet (the default)
    "state": "confirmed"  checked against the official text; also needs "urls": ["https://…"]
    "state": "held"       not confirmed; also needs "reason": "why"
"""

import importlib.util
import json
import os
import re
import shutil
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BOX = os.path.join(ROOT, "imports", "notebooklm")
INBOX = os.path.join(BOX, "inbox")
DONE = os.path.join(BOX, "done")
STAGED = os.path.join(BOX, "staged.json")
HELD = os.path.join(BOX, "held.json")
ISSUED = os.path.join(BOX, "ids-issued.txt")
PUBLIC = os.path.join(ROOT, "data", "notebooklm.json")
PRIVATE_TEXTS = [os.path.join(ROOT, "notes", "private-content", "notes-text.txt"),
                 os.path.join(ROOT, "notes", "private-content", "review-questions.md")]
REVIEWERS = os.path.join(ROOT, "notes", "reviewers")  # optional: reviewer text (.txt) to check copying against
NOTE = ("Questions imported from NotebookLM (not an official source), labeled \"From NotebookLM\". "
        "Each answer was checked against the official text named in its Basis line. Built by "
        "tools/import-notebooklm.py; don't edit by hand.")
COPY_WORDS = 8

# The content checker's own checks (same rules as every other question).
_spec = importlib.util.spec_from_file_location("check_content", os.path.join(ROOT, "tools", "check-content.py"))
checker = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(checker)

KEEP = {
    "essay": ["prompt", "suggestedAnswer", "keyPoints"],
    "mcq": ["prompt", "choices", "correct", "explanation"],
    "fillblank": ["prompt", "fullText", "explanation"],
}


def read_json(path, default):
    if not os.path.exists(path):
        return default
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def write_json(path, value):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(value, f, ensure_ascii=False, indent=2)
        f.write("\n")
    os.replace(tmp, path)


def issued_ids():
    ids = set()
    if os.path.exists(ISSUED):
        ids |= set(open(ISSUED, encoding="utf-8").read().split())
    for q in read_json(PUBLIC, {}).get("questions", []):
        ids.add(q.get("id"))
    for entry in read_json(STAGED, []) + read_json(HELD, []):
        ids.add(entry.get("item", {}).get("id"))
    return {i for i in ids if isinstance(i, str) and re.fullmatch(r"nq-\d{4}", i)}


def next_number(ids):
    return max([int(i[3:]) for i in ids] or [0]) + 1


# ---------- the copy check (never prints the private text) ----------

def grams(text):
    words = re.findall(r"[a-z0-9]+", text.lower())
    return {" ".join(words[i:i + COPY_WORDS]) for i in range(len(words) - COPY_WORDS + 1)}


def source_grams():
    found = set()
    paths = [p for p in PRIVATE_TEXTS if os.path.exists(p)]
    if os.path.isdir(REVIEWERS):
        paths += [os.path.join(REVIEWERS, n) for n in sorted(os.listdir(REVIEWERS)) if n.endswith((".txt", ".md"))]
    for p in paths:
        try:
            found |= grams(open(p, encoding="utf-8").read())
        except (OSError, UnicodeDecodeError):
            pass
    return found


def shown_texts(q):
    """Everything she will read, except a fill-in-the-blank's codal text (that must be the official wording)."""
    out = [q.get("prompt", "") if q.get("type") != "fillblank" else "", q.get("explanation", "")]
    out += list((q.get("choices") or {}).values())
    out += list((q.get("suggestedAnswer") or {}).values())
    out += list(q.get("keyPoints") or [])
    return [t for t in out if isinstance(t, str)]


def copies_source(q, prints):
    return bool(prints) and any(grams(t) & prints for t in shown_texts(q))


# ---------- shape check, with the content checker's rules ----------

def shape_problems(q):
    before_p, before_c = len(checker.problems), len(checker.checks)
    where = "item"
    q_type = q.get("type")
    if q_type not in KEEP:
        checker.problem(where, "type is %r; it must be essay, mcq or fillblank." % (q_type,))
    else:
        checker.check_place(where, q)
        checker.need_text(where, q, "prompt")
        checker.check_type_parts(where, q, q_type)
        if q_type == "fillblank":
            checker.need_text(where, q, "explanation")
    if not checker.filled(q.get("basis")):
        checker.problem(where, "'basis' is missing (the law, section or case the answer rests on).")
    found = [p.split(": ", 1)[1] for p in checker.problems[before_p:]]
    del checker.problems[before_p:]
    del checker.checks[before_c:]
    return found


def clean_item(raw, qid):
    q = {"id": qid, "type": raw["type"], "status": "draft", "notebooklm": True,
         "subject": raw["subject"], "topic": raw["topic"].strip()}
    if checker.filled(raw.get("subtopic")):
        q["subtopic"] = raw["subtopic"].strip()
    q["caseIds"] = []
    q["source"] = {"caseTitle": "NotebookLM"}
    for field in KEEP[raw["type"]]:
        q[field] = raw[field]
    if raw["type"] == "mcq":
        q["choices"] = {k: raw["choices"][k] for k in "ABCD"}
    return q


# ---------- 1. stage ----------

def stage():
    os.makedirs(INBOX, exist_ok=True)
    files = sorted(n for n in os.listdir(INBOX) if n.lower().endswith(".json"))
    if not files:
        print("The inbox is empty: paste NotebookLM's answer into a .json file in imports/notebooklm/inbox/ first.")
        return 0
    ids = issued_ids()
    number = next_number(ids)
    staged = read_json(STAGED, [])
    prints = source_grams()
    new_ids, skipped = [], []
    for name in files:
        path = os.path.join(INBOX, name)
        try:
            text = open(path, encoding="utf-8").read().strip()
            text = re.sub(r"^```(?:json)?\s*|\s*```$", "", text)  # in case the ``` marks came along
            data = json.loads(text)
        except (json.JSONDecodeError, UnicodeDecodeError) as e:
            print("SKIPPED %s: it isn't valid JSON (%s). Fix it or paste NotebookLM's answer again; it stays in the inbox." % (name, e))
            continue
        if isinstance(data, dict) and isinstance(data.get("questions"), list):
            data = data["questions"]
        if not isinstance(data, list):
            print("SKIPPED %s: it should be a list of questions ([ … ]). It stays in the inbox." % name)
            continue
        for n, raw in enumerate(data, 1):
            if not isinstance(raw, dict):
                skipped.append("%s item %d: isn't a question ({ … })." % (name, n))
                continue
            found = shape_problems(raw)
            if found:
                skipped.append("%s item %d: %s" % (name, n, " ".join(found)))
                continue
            qid = "nq-%04d" % number
            number += 1
            item = clean_item(raw, qid)
            review = {"state": "pending"}
            if copies_source(item, prints):
                review["copyWarning"] = "repeats %d+ words in a row from the notes or a reviewer: rewrite it before publishing." % COPY_WORDS
            staged.append({"item": item, "basis": raw["basis"].strip(), "sourceNote": str(raw.get("sourceNote", "")).strip(),
                           "fromFile": name, "review": review})
            new_ids.append(qid)
        os.makedirs(DONE, exist_ok=True)
        shutil.move(path, os.path.join(DONE, name))
    write_json(STAGED, staged)
    with open(ISSUED, "a", encoding="utf-8") as f:
        for qid in new_ids:
            f.write(qid + "\n")
    print("Staged %d question(s)%s." % (len(new_ids), " (%s to %s)" % (new_ids[0], new_ids[-1]) if new_ids else ""))
    if skipped:
        print("Left out %d item(s) that aren't in the right shape:" % len(skipped))
        for s in skipped:
            print("  - " + s)
    warned = [e["item"]["id"] for e in staged if e["review"].get("copyWarning")]
    if warned:
        print("Copies a source too closely (rewrite before publishing): " + ", ".join(warned))
    print("Next: check each one against the official text (the notebooklm-agent agent does this), then run --publish.")
    return 0


# ---------- --status ----------

def status():
    staged = read_json(STAGED, [])
    if not staged:
        print("Nothing staged.")
    for e in staged:
        r = e["review"]
        print("%s  %-9s %-9s %s | basis: %s%s" % (e["item"]["id"], e["item"]["type"], r.get("state"),
              e["item"]["topic"], e["basis"], "  [COPY WARNING]" if r.get("copyWarning") else ""))
    print("Published: %d · Held back: %d" % (len(read_json(PUBLIC, {}).get("questions", [])), len(read_json(HELD, []))))
    return 0


# ---------- 2. publish ----------

def with_basis(item, basis, urls):
    line = "**Basis:** %s. Checked against the official text: %s." % (basis.rstrip(". "), ", ".join(urls))
    q = json.loads(json.dumps(item))
    if q["type"] == "essay":
        c = re.sub(r"\s*\*\*Basis:\*\*.*$", "", q["suggestedAnswer"]["conclusion"], flags=re.S)
        q["suggestedAnswer"]["conclusion"] = c.rstrip() + "\n\n" + line
    else:
        e = re.sub(r"\s*\*\*Basis:\*\*.*$", "", q["explanation"], flags=re.S)
        q["explanation"] = e.rstrip() + "\n\n" + line
    return q


def publish():
    staged = read_json(STAGED, [])
    public = read_json(PUBLIC, {"note": NOTE, "questions": []})
    public["note"] = NOTE
    held = read_json(HELD, [])
    prints = source_grams()
    keep, added, now_held, refused = [], [], [], []
    for e in staged:
        r, qid = e["review"], e["item"]["id"]
        state = r.get("state")
        if state == "held":
            if not checker.filled(r.get("reason")):
                refused.append("%s: held, but no 'reason' given." % qid)
                keep.append(e)
                continue
            held.append(e)
            now_held.append(qid)
            continue
        if state != "confirmed":
            keep.append(e)
            continue
        urls = [u for u in r.get("urls", []) if isinstance(u, str) and u.startswith("https://")]
        found = shape_problems(dict(e["item"], basis=e["basis"]))
        if not urls:
            refused.append("%s: confirmed, but no https link to the official text in 'urls'." % qid)
        elif found:
            refused.append("%s: %s" % (qid, " ".join(found)))
        elif copies_source(e["item"], prints):
            refused.append("%s: still repeats %d+ words in a row from the notes or a reviewer." % (qid, COPY_WORDS))
        else:
            q = with_basis(e["item"], e.get("basisLine") or e["basis"], urls)
            q["status"] = "draft"  # always: only a person marks anything verified
            public["questions"].append(q)
            added.append(qid)
            continue
        keep.append(e)
    public["questions"].sort(key=lambda q: q["id"])
    write_json(PUBLIC, public)
    write_json(HELD, held)
    write_json(STAGED, keep)
    print("Published %d: %s" % (len(added), ", ".join(added) or "none"))
    print("Held back %d: %s" % (len(now_held), ", ".join(now_held) or "none"))
    if refused:
        print("Not published (fix and run --publish again):")
        for s in refused:
            print("  - " + s)
    print("Still waiting: %d. data/notebooklm.json now has %d question(s)." % (len(keep) - len(refused), len(public["questions"])))
    return 1 if refused else 0


if __name__ == "__main__":
    if "--publish" in sys.argv:
        sys.exit(publish())
    if "--status" in sys.argv:
        sys.exit(status())
    sys.exit(stage())

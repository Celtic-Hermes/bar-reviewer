#!/usr/bin/env python3
"""
Builds data/content-progress.json: the reference-content progress for the 2027 Bar syllabus.

For every topic ID in data/syllabus-2027.json it records:
  "status":     "todo", "done" or "skipped"
  "reason":     why it was skipped (only for "skipped")
  "contentIds": the IDs of the reference content saved for it (rules and cases whose
                "syllabusIds" list this topic). A topic with sub-topics but no content of its
                own lists the content of its sub-topics, and counts as done once every
                sub-topic is done or skipped and at least one is done.

Content is linked to topics in the content itself (the "syllabusIds" of each rule in
data/rules.json and each case in data/content/...), so this file can always be rebuilt.
Skip decisions are the only thing kept from the old file. Never edit this file by hand;
use the commands below (from the project folder):

    python3 tools/build-progress.py                       rebuild (after adding content)
    python3 tools/build-progress.py --skip ID "reason"    mark a topic (and its sub-topics
                                                          that have no content) as skipped
    python3 tools/build-progress.py --unskip ID           undo a skip
    python3 tools/build-progress.py --next                show the next topics to work on

The checker (tools/check-content.py) tells you if this file is out of date.
"""

import json
import os
import sys
from datetime import date

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SYLLABUS = os.path.join(ROOT, "data", "syllabus-2027.json")
PROGRESS = os.path.join(ROOT, "data", "content-progress.json")
RULES = os.path.join(ROOT, "data", "rules.json")
CONTENT = os.path.join(ROOT, "data", "content")

# Work order: by exam weight, then syllabus order (as the builder asked).
ORDER = ["s6", "s2", "s3", "s1", "s4", "s5"]


def load(path, default):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return default


def syllabus_nodes():
    """[(id, node, parent id, subject id)] in work order (subjects by ORDER, then syllabus order)."""
    data = load(SYLLABUS, {})
    subjects = {s["id"]: s for s in data.get("subjects", []) if isinstance(s, dict) and "id" in s}
    out = []

    def walk(nodes, parent, sid):
        for n in nodes or []:
            if isinstance(n, dict) and isinstance(n.get("id"), str):
                out.append((n["id"], n, parent, sid))
                walk(n.get("children"), n["id"], sid)

    for sid in ORDER + [s for s in subjects if s not in ORDER]:
        if sid in subjects:
            walk(subjects[sid].get("topics"), None, sid)
    return out


def content_links():
    """{syllabus ID: [content IDs]} from rules.json and every topic file's cases."""
    links = {}

    def add(item):
        for sid in item.get("syllabusIds") or []:
            if isinstance(sid, str):
                links.setdefault(sid, [])
                if item["id"] not in links[sid]:
                    links[sid].append(item["id"])

    for r in load(RULES, []):
        if isinstance(r, dict) and isinstance(r.get("id"), str):
            add(r)
    for folder, _, names in os.walk(CONTENT):
        for name in sorted(names):
            if name.endswith(".json"):
                data = load(os.path.join(folder, name), {})
                for c in data.get("cases", []) if isinstance(data, dict) else []:
                    if isinstance(c, dict) and isinstance(c.get("id"), str):
                        add(c)
    return links


def id_key(item_id):
    head, _, num = item_id.rpartition("-")
    return (head, int(num) if num.isdigit() else 0)


def build(old):
    nodes = syllabus_nodes()
    links = content_links()
    old_topics = old.get("topics", {}) if isinstance(old, dict) else {}
    children = {}
    for nid, _, parent, _ in nodes:
        if parent:
            children.setdefault(parent, []).append(nid)
    result = {}

    def decide(nid):
        if nid in result:
            return result[nid]
        own = sorted(links.get(nid, []), key=id_key)
        kids = [decide(k) for k in children.get(nid, [])]
        prev = old_topics.get(nid, {})
        if own:
            entry = {"status": "done", "contentIds": own}
        elif prev.get("status") == "skipped" and prev.get("reason"):
            entry = {"status": "skipped", "reason": prev["reason"], "contentIds": []}
        elif kids and all(k["status"] in ("done", "skipped") for k in kids) and any(k["status"] == "done" for k in kids):
            union = sorted({i for k in kids for i in k["contentIds"]}, key=id_key)
            entry = {"status": "done", "contentIds": union, "note": "covered by its sub-topics"}
        else:
            entry = {"status": "todo", "contentIds": []}
        result[nid] = entry
        return entry

    for nid, _, _, _ in nodes:
        decide(nid)
    counts = {"todo": 0, "done": 0, "skipped": 0}
    for e in result.values():
        counts[e["status"]] += 1
    return {
        "about": "Reference-content progress for the 2027 Bar syllabus. Built by tools/build-progress.py; never edit by hand.",
        "syllabus": "data/syllabus-2027.json",
        "order": ORDER,
        "counts": counts,
        "topics": {nid: result[nid] for nid, _, _, _ in nodes},
    }


def text_of(progress):
    return json.dumps(progress, ensure_ascii=False, indent=1) + "\n"


def main():
    args = sys.argv[1:]
    old = load(PROGRESS, {})
    if args[:1] == ["--skip"] and len(args) >= 3:
        nid, reason = args[1], " ".join(args[2:]).strip()
        ids = [n for n, _, _, _ in syllabus_nodes()]
        if nid not in ids or not reason:
            print("Unknown topic ID or empty reason.")
            return 1
        # Skip the topic and, with the same reason, its sub-topics that have nothing yet.
        topics = old.setdefault("topics", {})
        stack = [nid]
        kids = {}
        for n, _, parent, _ in syllabus_nodes():
            if parent:
                kids.setdefault(parent, []).append(n)
        while stack:
            cur = stack.pop()
            entry = topics.get(cur, {})
            if entry.get("status") != "done" or cur == nid:
                topics[cur] = {"status": "skipped", "reason": reason + " (logged %s)" % date.today().isoformat(), "contentIds": []}
            stack.extend(kids.get(cur, []))
    elif args[:1] == ["--unskip"] and len(args) == 2:
        old.get("topics", {}).pop(args[1], None)
    new = build(old)
    if args[:1] == ["--next"]:
        todo = [nid for nid, e in new["topics"].items() if e["status"] == "todo"]
        print("%(done)d done, %(skipped)d skipped, %(todo)d to do." % new["counts"])
        print("Next:", ", ".join(todo[:15]) if todo else "nothing left")
        return 0
    text = text_of(new)
    with open(PROGRESS, "w", encoding="utf-8") as f:
        f.write(text)
    print("Progress: %(done)d done, %(skipped)d skipped, %(todo)d to do." % new["counts"])
    return 0


if __name__ == "__main__":
    sys.exit(main())

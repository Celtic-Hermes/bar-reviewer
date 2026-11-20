#!/usr/bin/env python3
"""Privacy guard: can anyone on the internet see the private notes?

Run from the project folder:
    python3 tools/check-public.py            everything, including GitHub and the live website
    python3 tools/check-public.py --offline  only the checks on this Mac (no internet needed)
    python3 tools/check-public.py --push     what the pre-push hook runs: --offline, plus the
                                             commits about to be pushed (read from the hook's input)

It never changes a file and never prints any text from the notes, only where a match is.
It reuses the fingerprints of tools/check-content.py: any 12 words in a row from
notes/private-content/notes-text.txt or review-questions.md count as a quote from the notes.

Checks:
  1. .gitignore still hides notes/, sources/ and .claude/.
  2. No commit (any branch, also GitHub's copy) ever contained a file under those folders.
  3. No file tracked today contains a quote from the notes.
  4. No commit in the history ever added a quote from the notes (file contents or message).
  5. GitHub's copy (after a read-only "git fetch") passes 2–4 too.
  6. The live website and GitHub's raw file server answer "not found" for every private file,
     and the files the website really serves contain no quote from the notes.
  7. Whether the GitHub repository is public (information only).
Ends with "Nothing private is visible publicly." or "Found N problem(s)." (exit code 1).
"""

import importlib.util
import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_spec = importlib.util.spec_from_file_location("check_content", os.path.join(ROOT, "tools", "check-content.py"))
cc = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(cc)

PRIVATE_FOLDERS = ["notes/", "sources/", ".claude/"]
SITE = "https://celtic-hermes.github.io/bar-reviewer/"
RAW = "https://raw.githubusercontent.com/Celtic-Hermes/bar-reviewer/main/"
REPO_API = "https://api.github.com/repos/Celtic-Hermes/bar-reviewer"
USER_AGENT = "bar-reviewer-privacy-guard"

problems, checks, oks = [], [], []


def problem(where, message):
    problems.append("%s: %s" % (where, message))


def check(where, message):
    checks.append("%s: %s" % (where, message))


def ok(message):
    oks.append(message)


def run_git(*args):
    """Runs git; returns (exit code, output as text). Odd bytes (pictures) never crash it."""
    import subprocess
    try:
        r = subprocess.run(["git"] + list(args), cwd=ROOT, capture_output=True, timeout=120)
    except (OSError, subprocess.SubprocessError):
        return None, ""
    return r.returncode, r.stdout.decode("utf-8", "replace")


def git(*args):
    code, out = run_git(*args)
    return out if code == 0 else None


def is_private(path):
    return any(path.startswith(d) for d in PRIVATE_FOLDERS)


def quotes_notes(text, prints):
    return bool(cc._windows(cc._words(text)) & prints)


# 1. Ignore rules ---------------------------------------------------------------------------
def check_ignore_rules():
    bad = [d for d in PRIVATE_FOLDERS if run_git("check-ignore", "-q", d + "x")[0] != 0]
    for d in bad:
        problem(".gitignore", "no longer hides %s — put the line %s back." % (d, d))
    if not bad:
        ok(".gitignore hides notes/, sources/ and .claude/.")


# 2. Private files in any commit ------------------------------------------------------------
def check_history_paths(refs, label):
    out = git("log", *refs, "--name-only", "--format=@@%h", "--", *PRIVATE_FOLDERS)
    if out is None:
        check(label, "couldn't read the Git history.")
        return
    found, commit = {}, None
    for line in out.splitlines():
        if line.startswith("@@"):
            commit = line[2:]
        elif line.strip() and is_private(line):
            found.setdefault(line, commit)
    for path, commit in sorted(found.items()):
        problem(label, "%s is saved in commit %s. Deleting the file now isn't enough: it stays in the "
                       "history. Stop and ask Claude for help removing it from the history." % (path, commit))
    if not found:
        ok("%s: no commit ever contained a file from notes/, sources/ or .claude/." % label)


# 3. Tracked files today --------------------------------------------------------------------
def check_tracked_files(ref, label, prints):
    names = git("ls-tree", "-r", "--name-only", "-z", ref)
    if names is None:
        check(label, "couldn't list the files in %s." % ref)
        return
    hits = []
    for path in [p for p in names.split("\0") if p]:
        if is_private(path):
            hits.append(path)
            problem(label, "%s is a private file and is in %s." % (path, ref))
            continue
        if not prints or path in cc.QUOTE_ALLOWED:
            continue
        code, text = run_git("show", "%s:%s" % (ref, path))
        if code != 0 or "\0" in text[:1000] or "\ufffd" in text[:1000]:
            continue  # binary file (pictures) or unreadable
        if quotes_notes(text, prints):
            hits.append(path)
            problem(label, "%s contains %d+ words in a row from the private notes." % (path, cc.QUOTE_WORDS))
    if not hits:
        ok("%s: none of its files is private or quotes the notes." % label)


# 4. Quotes added anywhere in the history ---------------------------------------------------
def check_history_quotes(revs, label, prints):
    if not prints:
        return
    out = git("log", *revs, "-p", "-U0", "--no-color", "--no-ext-diff", "--format=@@%h%n%B%n@@end")
    if out is None:
        check(label, "couldn't read the Git history.")
        return
    added, messages, commit, current, in_msg, msg = {}, {}, None, None, False, []
    for line in out.splitlines():
        if line.startswith("@@") and not line.startswith("@@ ") and line != "@@end":
            commit, in_msg, msg, current = line[2:], True, [], None
        elif in_msg:
            if line == "@@end":
                in_msg = False
                messages[commit] = "\n".join(msg)
            else:
                msg.append(line)
        elif line.startswith("+++ "):
            current = line[6:] if line.startswith("+++ b/") else None
        elif line.startswith("+") and current and current not in cc.QUOTE_ALLOWED:
            added.setdefault((current, commit), []).append(line[1:])
    found = 0
    by_file = {}
    for (path, commit), lines in added.items():
        if quotes_notes(" ".join(lines), prints):
            by_file.setdefault(path, []).append(commit)
    for path, commits in sorted(by_file.items()):
        found += 1
        problem(label, "an older version of %s (commit %s) has %d+ words in a row from the private notes. "
                       "Anyone can still read old versions on GitHub, even if today's file is clean."
                % (path, ", ".join(commits[:5]) + (" …" if len(commits) > 5 else ""), cc.QUOTE_WORDS))
    for commit, text in sorted(messages.items()):
        if quotes_notes(text, prints):
            found += 1
            problem(label, "the message of commit %s has %d+ words in a row from the private notes." % (commit, cc.QUOTE_WORDS))
    if not found:
        ok("%s: no commit ever added a quote from the notes (files or messages)." % label)


# 6. Live website ---------------------------------------------------------------------------
def fetch(url):
    """(status code, text) — status None if there's no internet."""
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Cache-Control": "no-cache"})
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return r.status, r.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        return e.code, ""
    except (urllib.error.URLError, OSError):
        return None, ""


def fetch_all(urls):
    """fetch() for many addresses at once (the answers come back in the same order)."""
    from concurrent.futures import ThreadPoolExecutor
    with ThreadPoolExecutor(max_workers=6) as pool:
        answers = list(pool.map(fetch, urls))
    for i, (code, _) in enumerate(answers):
        if code is None or code == 429 or code >= 500:  # busy or dropped: ask once more, one at a time
            answers[i] = fetch(urls[i])
    return answers


def private_paths_on_this_mac():
    paths = []
    for d in PRIVATE_FOLDERS:
        base = os.path.join(ROOT, d)
        for folder, _, files in os.walk(base):
            for name in files:
                if name == ".DS_Store":
                    continue
                paths.append(os.path.relpath(os.path.join(folder, name), ROOT).replace(os.sep, "/"))
        paths.append(d)  # the folder itself (a folder listing)
    return sorted(paths)


def check_live(prints):
    status, _ = fetch(SITE)
    if status is None:
        check("live website", "no internet, so the website wasn't checked. Run this again when online.")
        return
    paths = private_paths_on_this_mac()
    urls = [(host + urllib.parse.quote(path), name) for host, name in ((SITE, "website"), (RAW, "GitHub raw files")) for path in paths]
    visible, lost = [], False
    for (url, name), (code, _) in zip(urls, fetch_all([u for u, _ in urls])):
        if code is None or code == 429 or code >= 500:
            lost = True  # the server was busy, so this path couldn't be checked (not a leak)
        elif code != 404:
            visible.append(url)
            problem(name, "%s answers %s instead of \"not found\": it may be visible to anyone." % (url, code))
    if lost:
        check("live website", "some private paths couldn't be checked (the server was busy or the connection dropped). Run this again.")
    if not visible and not lost:
        ok("The website and GitHub's raw files answer \"not found\" for all %d private paths." % len(private_paths_on_this_mac()))

    # The files the website actually serves today.
    sw = fetch(SITE + "sw.js")[1]
    files = set(re.findall(r'"((?:data/)?[\w./-]+\.(?:js|css|html|json|webmanifest))"', sw)) | {"index.html", "sw.js"}
    catalog = fetch(SITE + "data/catalog.json")[1]
    try:
        files |= {t["file"] if t["file"].startswith("data/") else "data/" + t["file"]
                  for t in json.loads(catalog).get("topics", []) if isinstance(t.get("file"), str)}
    except (ValueError, AttributeError, TypeError):
        check("live website", "couldn't read data/catalog.json on the website.")
    leaked, missed = [], 0
    files = sorted(files)
    for path, (code, text) in zip(files, fetch_all([SITE + f for f in files])):
        missed += code is None
        if code == 200 and prints and path not in cc.QUOTE_ALLOWED and quotes_notes(text, prints):
            leaked.append(path)
            problem("live website", "%s%s contains %d+ words in a row from the private notes." % (SITE, path, cc.QUOTE_WORDS))
    if missed:
        check("live website", "%d served file(s) couldn't be downloaded, so they weren't checked. Run this again." % missed)
    if not leaked and not missed:
        ok("The %d files the website serves (app, questions, quotes, syllabus) contain no quote from the notes." % len(files))


def check_visibility():
    code, text = fetch(REPO_API)
    if code == 200:
        try:
            private = json.loads(text).get("private")
        except ValueError:
            private = None
        if private is False:
            check("GitHub", "the repository is PUBLIC: anyone can read every file and every old version in it. "
                            "That's fine as long as the checks above pass.")
        elif private:
            ok("The GitHub repository is private.")
    elif code == 404:
        ok("The GitHub repository can't be seen without signing in (private).")


# --push: the commits about to be pushed ----------------------------------------------------
def pushed_ranges():
    """The pre-push hook gets lines: <local ref> <local sha> <remote ref> <remote sha>."""
    revs = []
    for line in sys.stdin.read().splitlines():
        parts = line.split()
        if len(parts) != 4 or set(parts[1]) == {"0"}:
            continue  # a branch being deleted
        local, remote = parts[1], parts[3]
        revs.append(local if set(remote) == {"0"} else "%s..%s" % (remote, local))
    return revs


def main():
    offline = "--offline" in sys.argv or "--push" in sys.argv
    if run_git("rev-parse", "--git-dir")[0] != 0:
        print("Couldn't run git.")
        return 1
    prints = cc.private_fingerprints()
    if not prints:
        check("notes", "notes/private-content/notes-text.txt isn't on this computer, so quotes couldn't be looked for.")

    check_ignore_rules()
    if "--push" in sys.argv:
        # Only what this push would upload, so something already on GitHub doesn't block every push.
        revs = pushed_ranges()
        if revs:
            check_history_paths(revs, "commits being pushed")
            check_history_quotes(revs, "commits being pushed", prints)
        check_tracked_files("HEAD", "files in the latest commit", prints)
    else:
        check_history_paths(["--all"], "Git history")
        check_tracked_files("HEAD", "files in the latest commit", prints)
        check_history_quotes(["--all"], "Git history", prints)
    if not offline:
        if run_git("fetch", "--quiet", "origin")[0] != 0:
            check("GitHub", "couldn't get GitHub's copy (no internet?), so it wasn't checked.")
        else:
            check_history_paths(["origin/main"], "GitHub's copy")
            check_tracked_files("origin/main", "GitHub's copy", prints)
            check_history_quotes(["origin/main"], "GitHub's copy", prints)
        check_live(prints)
        check_visibility()

    print("Privacy guard%s" % (" (this Mac only, no internet checks)" if offline else ""))
    for line in oks:
        print("  OK     " + line)
    for line in checks:
        print("  CHECK  " + line)
    for line in problems:
        print("  PROBLEM " + line)
    print()
    if problems:
        print("Found %d problem(s)." % len(problems))
        return 1
    print("Nothing private is visible publicly.")
    return 0


if __name__ == "__main__":
    sys.exit(main())

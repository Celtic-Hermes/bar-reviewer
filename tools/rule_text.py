#!/usr/bin/env python3
"""
Helpers for turning an official rules page (LawPhil) into the app's rule-text format, and for
cross-checking it word for word against a second source. Used while adding reference content
(see "Reference content from the 2027 syllabus" in CLAUDE.md). It never changes data files by
itself; the person (or Claude) running it saves what it returns.

    from rule_text import page_paragraphs, rule_block, compare_words
    paras = page_paragraphs("page.html")              # every paragraph, cleaned
    text  = rule_block(paras, 2)                       # "RULE 2\nCAUSE OF ACTION\n\nSection 1. ..."
    diffs = compare_words(text, other_text)            # [] when the wording is the same

Cleaning (reported by the caller): LawPhil watermarks removed, spaces normalized, nothing else.
"""

import difflib
import html
import re

WATERMARK = re.compile(r"[1lℒ]\s?[aâα][vwω]{1,2}[pρ]h[i1৷l]\S?|ᇈWᑭHIL|1a⍵⍴h!1", re.IGNORECASE)
CHANROBLES_MARKS = re.compile(r"chan\s?robles\s?virtual\s?law\s?library|chanroblesvirtuallawlibrary|chanrobles\.com|"
                              r"red\s*law\s*library|cralaw|virtual\s+law\s+library|chanrobles", re.IGNORECASE)


def read_page(path):
    raw = open(path, "rb").read()
    m = re.search(rb'charset=["\']?([\w-]+)', raw[:3000])
    enc = m.group(1).decode() if m else "utf-8"
    try:
        return raw.decode(enc, errors="replace"), enc
    except LookupError:
        return raw.decode("utf-8", errors="replace"), "utf-8"


def page_paragraphs(path, keep_align=False):
    """The page's paragraphs (<p>, list items, table cells) as cleaned text. A <br> inside a
    paragraph becomes a line break (RULE headings: "RULE 2\\nCAUSE OF ACTION")."""
    text, _ = read_page(path)
    text = re.sub(r"(?is)<(script|style)\b.*?</\1>", " ", text)
    text = re.sub(r"(?i)<br\s*/?>", "\n", text)
    pieces = re.split(r"(?i)<p\b([^>]*)>|</p>|<li\b[^>]*>|</li>|<dir>|</dir>|<blockquote[^>]*>|</blockquote>|<td\b[^>]*>|</td>|<div\b[^>]*>|</div>|<h\d[^>]*>|</h\d>", text)
    out = []
    align = ""
    for i, piece in enumerate(pieces):
        if piece is None:
            continue
        if i % 2 == 1:  # captured <p ...> attributes
            m = re.search(r'align\s*=\s*"?(\w+)', piece, re.I)
            align = m.group(1).lower() if m else ""
            continue
        clean = html.unescape(re.sub(r"<[^>]+>", "", piece)).replace("\xa0", " ")
        clean = WATERMARK.sub("", clean)
        lines = [re.sub(r"[ \t\r\f\v]+", " ", line).strip() for line in clean.split("\n")]
        clean = "\n".join(line for line in lines if line)
        if clean:
            out.append((clean, align) if keep_align else clean)
        align = ""
    return out


RULE_HEAD = re.compile(r"^RULE\s+(\d+)\b", re.I)


def rule_block(paras, number, stop_words=()):
    """The paragraphs of RULE <number>, from its heading up to the next RULE heading (or a
    paragraph that starts with one of stop_words), as the app's text: paragraphs separated
    by a blank line. Short heading paragraphs that come after the rule's last section (the
    next part's title, like "Provisional Remedies") are left out. Returns None if not found."""
    plain = [p[0] if isinstance(p, tuple) else p for p in paras]
    start = None
    for i, p in enumerate(plain):
        m = RULE_HEAD.match(p)
        if m and int(m.group(1)) == number and "\n" in p:
            start = i
            break
        if m and int(m.group(1)) == number and i + 1 < len(plain) and not plain[i + 1].lower().startswith("section"):
            start = i
            break
    if start is None:
        return None
    end = len(plain)
    for j in range(start + 1, len(plain)):
        if RULE_HEAD.match(plain[j]) or any(plain[j].startswith(w) for w in stop_words):
            end = j
            break
    block = plain[start:end]
    # A heading written as two paragraphs ("RULE 2" then "CAUSE OF ACTION") becomes one.
    if "\n" not in block[0] and len(block) > 1 and not re.match(r"(?i)^sec", block[1]):
        block = [block[0] + "\n" + block[1]] + block[2:]
    # Drop trailing part titles after the last section (short, no sentence end).
    while len(block) > 1 and len(block[-1]) < 80 and not re.search(r"[.;:)]$", block[-1]):
        block.pop()
    return "\n\n".join(block) + "\n"


def words(text):
    text = CHANROBLES_MARKS.sub(" ", text)
    text = text.lower()
    # Apostrophes are written differently from site to site ("party's", "party´s", "party s"):
    # drop them, so "party's" and "partys" compare equal.
    text = re.sub(r"(?<=[a-z])[^a-z0-9\s]+(?=s\b)", "", text)
    text = re.sub(r"[^a-z0-9]+", " ", text)
    return text.split()


# The small source notes at the end of a section or paragraph, like "(2a)", "(n)", "(1a, R2)",
# "(16a, 17a)": editorial references to the old rules, not part of the rule's wording.
SOURCE_NOTE = re.compile(r"\(\s*(?:n|[0-9]+[a-z]*|[Rr][0-9]+[a-z]*|Rule\s*[0-9]+[a-z]*|Sec\.?\s*[0-9]+[a-z]*)"
                         r"(?:\s*[,;]?\s*(?:n|[0-9]+[a-z]*|[Rr][0-9]+[a-z]*|Rule\s*[0-9]+[a-z]*|Sec\.?\s*[0-9]+[a-z]*))*\s*\)"
                         r"(?=\s*(?:\n|$))")


def without_source_notes(text):
    return SOURCE_NOTE.sub(" ", text)


def compare_words(a, b, context=6):
    """Compares the wording of a and b. Returns (wording, spacing, notes):
    wording = places where the words really differ (punctuation, capitals, ChanRobles' own marks
              and the end-of-paragraph source notes ignored) -> [] means the same wording;
    spacing = places that differ only by a space ("withregard" vs "with regard");
    notes   = True if the end-of-paragraph source notes differ."""
    wa, wb = words(without_source_notes(a)), words(without_source_notes(b))
    wording, spacing = [], []
    sm = difflib.SequenceMatcher(None, wa, wb, autojunk=False)
    for tag, i1, i2, j1, j2 in sm.get_opcodes():
        if tag == "equal":
            continue
        where = " ".join(wa[max(0, i1 - context):i1])
        item = "%s: [%s] vs [%s] near \"%s\"" % (tag, " ".join(wa[i1:i2]), " ".join(wb[j1:j2]), where)
        (spacing if "".join(wa[i1:i2]) == "".join(wb[j1:j2]) else wording).append(item)
    notes = words(a) != words(b) and not wording and not spacing or (
        [w for w in words(a)] != [w for w in words(b)] and len(wording) + len(spacing) < len(
            [1 for t in difflib.SequenceMatcher(None, words(a), words(b), autojunk=False).get_opcodes() if t[0] != "equal"]))
    return wording, spacing, notes

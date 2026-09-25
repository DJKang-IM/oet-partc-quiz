# -*- coding: utf-8 -*-
"""
Validate one OET Reading test file (Part A / B / C) against the format rules in
GENERATION_GUIDE.md.

    python tools/validate.py data/tests/05/partC.json
    python tools/validate.py data/tests/05/*.json
    python tools/validate.py --all          # every file under data/tests

Exit code 0 = all files pass (warnings allowed). 1 = at least one ERROR.
Output is written to stdout AND to tools/last_validation.txt (UTF-8) so that
Windows consoles with cp949 encoding never lose non-ASCII characters.
"""
import glob
import json
import os
import re
import sys
from collections import Counter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WORD_NUM = {"one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6,
            "seven": 7, "eight": 8, "nine": 9, "ten": 10, "eleven": 11, "twelve": 12}


def words(s):
    return len(re.findall(r"\S+", s or ""))


def sentences(s):
    return [x.strip() for x in re.split(r"(?<=[.!?])\s+", s or "") if len(x.strip()) > 0]


def norm(s):
    return re.sub(r"\s+", " ", (s or "").lower()).strip()


class Report:
    def __init__(self, path):
        self.path = path
        self.errors = []
        self.warnings = []

    def err(self, msg):
        self.errors.append(msg)

    def warn(self, msg):
        self.warnings.append(msg)

    def ok(self):
        return not self.errors

    def text(self):
        out = [f"== {self.path}"]
        for e in self.errors:
            out.append(f"  ERROR   {e}")
        for w in self.warnings:
            out.append(f"  warning {w}")
        out.append(f"  -> {'PASS' if self.ok() else 'FAIL'} ({len(self.errors)} errors, {len(self.warnings)} warnings)")
        return "\n".join(out)


def check_common(s, r, part):
    m = re.fullmatch(part + r"-(\d\d)", str(s.get("id", "")))
    if not m:
        r.err(f"id must look like '{part}-05', got {s.get('id')!r}")
    elif s.get("setNum") != int(m.group(1)):
        r.err(f"setNum {s.get('setNum')!r} must equal the number in id {s.get('id')}")
    if s.get("part") != part:
        r.err(f"part must be '{part}'")
    if not s.get("title"):
        r.err("title missing")
    vocab = s.get("vocab") or []
    if len(vocab) < 3:
        r.err("vocab needs >= 3 entries {term, gloss}")
    for v in vocab:
        if not v.get("term") or not v.get("gloss"):
            r.err(f"vocab entry incomplete: {v}")
        elif not re.search(r"[\uac00-\ud7a3]", v["gloss"]):
            r.warn(f"vocab gloss for '{v['term']}' has no Korean (expected 한국어 뜻)")
    if not s.get("gist"):
        r.warn("gist list empty")


def check_answer_spread(answers, letters, r, label):
    c = Counter(answers)
    for L in letters:
        if c[L] == 0:
            r.err(f"{label}: answer letter {L} never used ({''.join(answers)})")
    for i in range(len(answers) - 2):
        if answers[i] == answers[i + 1] == answers[i + 2]:
            r.err(f"{label}: three identical answers in a row at Q{i+1} ({''.join(answers)})")
            break
    top = c.most_common(1)[0]
    if top[1] > max(2, len(answers) // 2):
        r.err(f"{label}: letter {top[0]} used {top[1]}/{len(answers)} times — spread answers")


def check_options(q, keys, r, label):
    opts = q.get("options") or []
    if [o.get("key") for o in opts] != keys:
        r.err(f"{label}: options keys must be exactly {keys}")
        return None
    texts = [norm(o.get("text")) for o in opts]
    if len(set(texts)) != len(texts):
        r.err(f"{label}: duplicate option texts")
    if any(not t for t in texts):
        r.err(f"{label}: empty option text")
    if q.get("answer") not in keys:
        r.err(f"{label}: answer must be one of {keys}")
        return None
    lens = {o["key"]: words(o["text"]) for o in opts}
    correct_len = lens[q["answer"]]
    longest = max(lens.values())
    shortest = min(lens.values())
    is_longest = correct_len == longest and list(lens.values()).count(longest) == 1
    if shortest and longest / shortest > 2.5:
        r.warn(f"{label}: option lengths very uneven ({shortest}–{longest} words) — distractors should be similar length")
    return is_longest


def check_no_filler(chunks, r, label, min_words=8):
    c = Counter()
    for ch in chunks:
        for snt in sentences(ch):
            if words(snt) >= min_words:
                c[norm(snt)] += 1
    for snt, n in c.items():
        if n > 1:
            r.err(f"{label}: sentence repeated {n}x (filler/padding is not allowed): \"{snt[:70]}…\"")


# ---------------------------------------------------------------- Part A
def validate_A(s, r):
    check_common(s, r, "A")
    texts = s.get("texts") or []
    if [t.get("label") for t in texts] != ["A", "B", "C", "D"]:
        r.err("texts must be exactly 4 with labels A, B, C, D")
    total = 0
    for t in texts:
        if not t.get("heading"):
            r.err(f"Text {t.get('label')}: heading missing")
        w = words(t.get("body"))
        total += w
        if w < 80 or w > 220:
            r.err(f"Text {t.get('label')}: {w} words (each text 80–220)")
    if texts and (total < 420 or total > 700):
        r.err(f"Texts A–D total {total} words (target 450–650, hard limit 420–700)")
    check_no_filler([t.get("body", "") for t in texts], r, "texts")
    body_all = norm(" ".join(t.get("body", "") for t in texts))

    qs = s.get("questions") or []
    if [q.get("id") for q in qs] != list(range(1, 21)):
        r.err("questions must have ids 1..20 in order")
        return
    which = []
    for q in qs:
        i = q["id"]
        stem = q.get("stem") or ""
        if not stem:
            r.err(f"Q{i}: stem missing")
        if i <= 7:
            if q.get("type") != "whichText":
                r.err(f"Q{i}: type must be 'whichText'")
            if q.get("answer") not in list("ABCD"):
                r.err(f"Q{i}: answer must be A–D")
            else:
                which.append(q["answer"])
            if q.get("options") and [o.get("key") for o in q["options"]] != list("ABCD"):
                r.err(f"Q{i}: whichText options, if present, must be keys A–D")
            if not stem.rstrip().endswith("?"):
                r.warn(f"Q{i}: whichText stem should end with '?' (it completes 'In which text can you find information about …?')")
        else:
            want = "shortAnswer" if i <= 15 else "gapFill"
            if q.get("type") != want:
                r.err(f"Q{i}: type must be '{want}'")
            ans = (q.get("answer") or "").strip()
            if not ans:
                r.err(f"Q{i}: answer missing")
                continue
            if words(ans) > 4:
                r.err(f"Q{i}: answer '{ans}' is {words(ans)} words — max 3 words and/or a number")
            acc = q.get("accept") or []
            if not isinstance(acc, list) or ans not in acc:
                r.err(f"Q{i}: accept must be a list that includes the exact answer")
            variants = [norm(ans)] + [norm(a) for a in acc]
            if not any(v and v in body_all for v in variants):
                r.err(f"Q{i}: neither answer nor any accept variant appears verbatim in Texts A–D ('{ans}')")
            if i >= 16 and not re.search(r"…{2,}|_{3,}|\.{4,}", stem):
                r.err(f"Q{i}: gapFill stem must contain a visible gap (…………… or _____)")
            if i <= 15 and not stem.rstrip().endswith("?"):
                r.warn(f"Q{i}: shortAnswer stem should be a question ending with '?'")
        if not q.get("explain"):
            r.warn(f"Q{i}: explain missing (which text / where the answer is)")
    if len(which) == 7:
        check_answer_spread(which, "ABCD", r, "Q1–7")
        if "".join(which).startswith("ABCD"):
            r.err("Q1–7 answers start with A,B,C,D in order — shuffle question order")
    if not s.get("sharedWhichPrompt"):
        r.warn("sharedWhichPrompt missing (default 'In which text can you find information about')")


# ---------------------------------------------------------------- Part B
def validate_B(s, r):
    check_common(s, r, "B")
    items = s.get("items") or []
    if [it.get("id") for it in items] != list(range(1, 7)):
        r.err("items must have ids 1..6 in order")
        return
    answers, longest_count = [], 0
    for it in items:
        lab = f"Extract {it['id']}"
        ex = it.get("extract") or ""
        w = words(ex)
        if w < 100 or w > 175:
            r.err(f"{lab}: {w} words (100–170 required)")
        if "\n" not in ex.strip():
            r.warn(f"{lab}: extract should start with a source line (e.g. 'Memo from …:') followed by a blank line")
        if not it.get("stem"):
            r.err(f"{lab}: stem missing")
        is_longest = check_options(it, ["A", "B", "C"], r, lab)
        if is_longest:
            longest_count += 1
        if it.get("answer") in "ABC":
            answers.append(it["answer"])
        fp = it.get("focusPhrases") or []
        if not (1 <= len(fp) <= 4):
            r.err(f"{lab}: focusPhrases needs 1–4 phrases that appear in the extract")
        for p in fp:
            if norm(p) not in norm(ex):
                r.err(f"{lab}: focus phrase '{p}' not found in extract")
        if not it.get("explain"):
            r.warn(f"{lab}: explain missing")
    check_no_filler([it.get("extract", "") for it in items], r, "extracts")
    if len(answers) == 6:
        check_answer_spread(answers, "ABC", r, "Q1–6")
    if longest_count > 3:
        r.err(f"correct option is the single longest option in {longest_count}/6 items — rewrite distractors to similar length")


# ---------------------------------------------------------------- Part C
def validate_C(s, r):
    check_common(s, r, "C")
    texts = s.get("texts") or []
    if [t.get("label") for t in texts] != ["Text 1", "Text 2"]:
        r.err("texts must be exactly 2 with labels 'Text 1' and 'Text 2'")
        return
    all_answers = []
    all_paras = []
    for t in texts:
        lab = t["label"]
        if not t.get("title"):
            r.err(f"{lab}: title missing")
        paras = t.get("paragraphs") or []
        all_paras.extend(paras)
        if len(paras) < 6 or len(paras) > 12:
            r.err(f"{lab}: {len(paras)} paragraphs (6–12 required)")
        w = sum(words(p) for p in paras)
        if w < 680 or w > 880:
            r.err(f"{lab}: {w} words (700–850 required; hard limit 680–880)")
        for i, p in enumerate(paras):
            if words(p) < 40:
                r.warn(f"{lab} paragraph {i+1}: only {words(p)} words")
        body = norm(" ".join(paras))
        qs = t.get("questions") or []
        if [q.get("id") for q in qs] != list(range(1, 9)):
            r.err(f"{lab}: questions must have ids 1..8 in order")
            continue
        answers, longest_count = [], 0
        for q in qs:
            ql = f"{lab} Q{q['id']}"
            stem = q.get("stem") or ""
            if not stem:
                r.err(f"{ql}: stem missing")
            is_longest = check_options(q, ["A", "B", "C", "D"], r, ql)
            if is_longest:
                longest_count += 1
            if q.get("answer") in "ABCD":
                answers.append(q["answer"])
            focus = q.get("focus") or ""
            if not focus:
                r.err(f"{ql}: focus missing (a phrase copied verbatim from the passage that the question targets)")
            else:
                hits = [i + 1 for i, p in enumerate(paras) if norm(focus) in norm(p)]
                if not hits:
                    r.err(f"{ql}: focus '{focus}' not found verbatim in {lab}")
                else:
                    m = re.search(r"paragraph (\w+)", stem, re.I)
                    if m and m.group(1).lower() in WORD_NUM:
                        n = WORD_NUM[m.group(1).lower()]
                        if n not in hits:
                            r.err(f"{ql}: stem says paragraph {n} but focus is in paragraph(s) {hits}")
                    if re.search(r"final paragraph|last paragraph", stem, re.I) and len(paras) not in hits:
                        r.err(f"{ql}: stem says final paragraph but focus is in paragraph(s) {hits}, last = {len(paras)}")
                    if re.search(r"paragraph one|opening paragraph|first paragraph", stem, re.I) and 1 not in hits:
                        r.err(f"{ql}: stem says paragraph one but focus is in paragraph(s) {hits}")
            if not q.get("explain"):
                r.warn(f"{ql}: explain missing")
        if len(answers) == 8:
            check_answer_spread(answers, "ABCD", r, f"{lab} Q1–8")
            all_answers.extend(answers)
        if longest_count > 4:
            r.err(f"{lab}: correct option is the single longest in {longest_count}/8 questions — equalise option lengths")
        fp = t.get("focusPhrases")
        if fp:
            for p in fp:
                if norm(p) not in body:
                    r.err(f"{lab}: focusPhrases entry '{p}' not in text")
    check_no_filler(all_paras, r, "paragraphs")
    if len(all_answers) == 16:
        c = Counter(all_answers)
        if c.most_common(1)[0][1] > 6:
            r.err(f"answer letter {c.most_common(1)[0][0]} used {c.most_common(1)[0][1]}/16 — max 6")


def validate_file(path):
    r = Report(os.path.relpath(path, ROOT))
    try:
        with open(path, encoding="utf-8") as f:
            s = json.load(f)
    except Exception as e:  # noqa
        r.err(f"invalid JSON: {e}")
        return r
    if isinstance(s, dict) and "sets" in s:
        r.err("file must contain ONE set object, not {'sets': [...]} (that is the built bundle format)")
        return r
    part = s.get("part")
    if part == "A":
        validate_A(s, r)
    elif part == "B":
        validate_B(s, r)
    elif part == "C":
        validate_C(s, r)
    else:
        r.err("part must be 'A', 'B' or 'C'")
    return r


def main(argv):
    if not argv or argv == ["--all"]:
        paths = sorted(glob.glob(os.path.join(ROOT, "data", "tests", "*", "part*.json")))
    else:
        paths = []
        for a in argv:
            paths.extend(sorted(glob.glob(a)) or [a])
    reports = [validate_file(p) for p in paths]
    out = "\n".join(r.text() for r in reports)
    n_fail = sum(1 for r in reports if not r.ok())
    out += f"\n\n{len(reports) - n_fail}/{len(reports)} files PASS"
    with open(os.path.join(ROOT, "tools", "last_validation.txt"), "w", encoding="utf-8") as f:
        f.write(out + "\n")
    try:
        print(out)
    except UnicodeEncodeError:
        print(out.encode("ascii", "replace").decode())
    return 1 if n_fail else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))

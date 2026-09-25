# -*- coding: utf-8 -*-
"""
Create skeleton files for a new test number so an author (human or model)
only has to fill in content.

    python tools/scaffold.py 07            # creates data/tests/07/partA.json, partB.json, partC.json
    python tools/scaffold.py 07 C          # only partC.json

Existing files are never overwritten.
"""
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def skel_A(n):
    return {
        "id": f"A-{n}", "part": "A", "setNum": int(n),
        "title": "TODO clinical topic (e.g. Acute kidney injury)",
        "type": "partA-full",
        "instruction": "Look at Texts A–D. Questions 1–7: which text? Questions 8–15: word/short phrase from the texts. Questions 16–20: complete the sentence. Spelling matters. Target: 15 minutes.",
        "sharedWhichPrompt": "In which text can you find information about",
        "texts": [
            {"label": L, "heading": "TODO heading", "body": "TODO 110–160 words. Use line breaks (\\n) and bullets (•) for lists/tables."}
            for L in "ABCD"
        ],
        "questions":
            [{"id": i, "type": "whichText", "stem": "TODO … ?", "answer": "A", "explain": "Text A — …"} for i in range(1, 8)] +
            [{"id": i, "type": "shortAnswer", "stem": "TODO question ending with ?", "answer": "TODO", "accept": ["TODO"], "explain": "Text A"} for i in range(8, 16)] +
            [{"id": i, "type": "gapFill", "stem": "TODO sentence with a gap …………………………………… .", "answer": "TODO", "accept": ["TODO"], "explain": "Text A"} for i in range(16, 21)],
        "gist": ["Q1–7 = which text (scan headings + unique markers).", "Q8–15 = lift exact words/numbers from the texts.", "Q16–20 = gap-fill with short phrases from the texts."],
        "vocab": [{"term": "TODO", "gloss": "TODO 한국어 뜻"} for _ in range(4)],
    }


def skel_B(n):
    return {
        "id": f"B-{n}", "part": "B", "setNum": int(n),
        "type": "workplace",
        "title": "TODO e.g. Theatre & consent extracts",
        "instruction": "Six workplace extracts. Choose A, B or C. Focus phrases highlighted.",
        "items": [
            {"id": i, "extract": "TODO Source line (e.g. Memo from the pharmacy lead):\n\nTODO 100–170 words of a policy / memo / guideline / email / handover note.",
             "stem": "TODO e.g. The memo mainly tells staff to", "options": [{"key": k, "text": "TODO"} for k in "ABC"],
             "answer": "A", "explain": "TODO", "focusPhrases": ["TODO"]}
            for i in range(1, 7)
        ],
        "gist": ["Part B = purpose/main point of a short workplace text; watch must / do not / unless."],
        "vocab": [{"term": "TODO", "gloss": "TODO 한국어 뜻"} for _ in range(3)],
    }


def skel_C(n):
    def text(label):
        return {
            "label": label, "title": "TODO title of the article",
            "paragraphs": ["TODO paragraph"] * 8,
            "questions": [
                {"id": i, "stem": "TODO", "options": [{"key": k, "text": "TODO"} for k in "ABCD"],
                 "answer": "A", "focus": "TODO phrase copied verbatim from the paragraph", "explain": "TODO"}
                for i in range(1, 9)
            ],
        }
    return {
        "id": f"C-{n}", "part": "C", "setNum": int(n),
        "type": "dual-text",
        "title": "TODO Topic 1 & Topic 2",
        "instruction": "Official-style Part C: two texts, 8 questions each (16 total). Focus phrases are highlighted in the passages.",
        "texts": [text("Text 1"), text("Text 2")],
        "gist": ["TODO one-line takeaway for Text 1", "TODO one-line takeaway for Text 2"],
        "vocab": [{"term": "TODO", "gloss": "TODO 한국어 뜻"} for _ in range(4)],
    }


def main(argv):
    if not argv:
        print(__doc__)
        return 1
    n = argv[0].zfill(2)
    parts = [p.upper() for p in argv[1:]] or ["A", "B", "C"]
    d = os.path.join(ROOT, "data", "tests", n)
    os.makedirs(d, exist_ok=True)
    for p in parts:
        fp = os.path.join(d, f"part{p}.json")
        if os.path.exists(fp):
            print(f"skip (exists): {os.path.relpath(fp, ROOT)}")
            continue
        skel = {"A": skel_A, "B": skel_B, "C": skel_C}[p](n)
        with open(fp, "w", encoding="utf-8") as f:
            json.dump(skel, f, ensure_ascii=False, indent=2)
        print(f"created {os.path.relpath(fp, ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))

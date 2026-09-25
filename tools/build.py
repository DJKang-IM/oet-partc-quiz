# -*- coding: utf-8 -*-
"""
Bundle data/tests/NN/part{A,B,C}.json into the three files the app loads
(data/partA.json, data/partB.json, data/partC.json), recompute word counts,
and bump the cache-busting version in app.js / index.html.

    python tools/build.py            # validate everything, then build
    python tools/build.py --force    # build even if validation reports errors
"""
import datetime
import glob
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import validate  # noqa: E402

ROOT = validate.ROOT
TESTS = os.path.join(ROOT, "data", "tests")

NOTES = {
    "A": "Unofficial self-study modelled on real Part A density (4 texts · Q1–20 · matching + short answers). Not affiliated with OET.",
    "B": "Unofficial. Six workplace extracts (100–170 words), three options each.",
    "C": "Unofficial. Two texts (~700–850 words) with 8 questions each, numbered Q7–14 and Q15–22 as in the real paper.",
}
TITLES = {"A": "OET Reading Part A Practice", "B": "OET Reading Part B Practice", "C": "OET Reading Part C Practice"}


def main(argv):
    force = "--force" in argv
    paths = sorted(glob.glob(os.path.join(TESTS, "*", "part*.json")))
    reports = [validate.validate_file(p) for p in paths]
    failed = [r for r in reports if not r.ok()]
    if failed and not force:
        for r in failed:
            print(r.text().encode("ascii", "replace").decode())
        print(f"\nBUILD ABORTED: {len(failed)} file(s) failed validation. Fix them or use --force.")
        return 1

    bundles = {"A": [], "B": [], "C": []}
    for p in paths:
        with open(p, encoding="utf-8") as f:
            s = json.load(f)
        part = s["part"]
        # recompute word counts so authors never have to
        if part == "C":
            for t in s["texts"]:
                t["wordCount"] = sum(validate.words(x) for x in t["paragraphs"])
                t["focusPhrases"] = list(dict.fromkeys(
                    (t.get("focusPhrases") or []) + [q["focus"] for q in t["questions"] if q.get("focus")]
                ))
        if part == "B":
            for it in s["items"]:
                it["wordCount"] = validate.words(it["extract"])
        if part == "A":
            for q in s["questions"]:
                if q["type"] == "whichText" and not q.get("options"):
                    q["options"] = [{"key": k, "text": f"Text {k}"} for k in "ABCD"]
                if q["type"] == "whichText" and not q.get("accept"):
                    q["accept"] = [q["answer"]]
        bundles[part].append(s)

    for part, sets in bundles.items():
        sets.sort(key=lambda s: s["setNum"])
        out = {"title": TITLES[part], "note": NOTES[part], "sets": sets}
        with open(os.path.join(ROOT, "data", f"part{part}.json"), "w", encoding="utf-8") as f:
            json.dump(out, f, ensure_ascii=False, indent=2)
        print(f"data/part{part}.json  <- {len(sets)} set(s): {', '.join(s['id'] for s in sets)}")

    # bump cache-busting version
    ver = datetime.datetime.now().strftime("%Y%m%d%H%M")
    for rel, pat in [
        ("app.js", r'const DATA_V = "[^"]*"'),
        ("index.html", r'(styles\.css|app\.js)\?v=[0-9a-z]+'),
    ]:
        fp = os.path.join(ROOT, rel)
        with open(fp, encoding="utf-8") as f:
            src = f.read()
        if rel == "app.js":
            src = re.sub(pat, f'const DATA_V = "{ver}"', src)
        else:
            src = re.sub(pat, lambda m: f"{m.group(1)}?v={ver}", src)
        with open(fp, "w", encoding="utf-8", newline="\n") as f:
            f.write(src)
    print(f"cache version -> {ver}")
    print("BUILD OK" + (" (forced)" if failed else ""))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))

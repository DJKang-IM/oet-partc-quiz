# -*- coding: utf-8 -*-
import json
import re
from pathlib import Path

ROOT = Path(r"C:\Users\SEJONG_ENDO_3\Desktop\oet-partc-quiz")
SETS = ROOT / "data" / "sets.json"


def focus_from_questions(questions):
    out = []
    seen = set()
    pat = re.compile(r"[‘’'\"]([^‘’'\"]+)[‘’'\"]")
    for q in questions:
        for m in pat.findall(q.get("stem", "")):
            t = m.strip()
            if 2 <= len(t) <= 60 and t.lower() not in seen:
                seen.add(t.lower())
                out.append(t)
    return out


def main():
    d = json.loads(SETS.read_text(encoding="utf-8"))
    for s in d["sets"]:
        s["part"] = "C"
        s["focusPhrases"] = focus_from_questions(s["questions"])
    SETS.write_text(json.dumps(d, ensure_ascii=False, indent=2), encoding="utf-8")
    cl = next(x for x in d["sets"] if "climate" in x["title"].lower())
    print("climate focus:", cl["focusPhrases"])
    print("done", len(d["sets"]))


if __name__ == "__main__":
    main()

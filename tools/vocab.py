"""Pull the words you highlighted in the app (via the sync gist), add context, push glosses back.

  python tools/vocab.py pull   -> vocab_notes/words.json  (every saved word + where + context sentence)
  (write/extend vocab_notes/glosses.json:  {"<setId>|<term lowercase>": {"ko": "...", "note": "..."}})
  python tools/vocab.py push   -> writes each gloss into the gist entry's `def` (shows on every device
                                  after the next sync) and regenerates vocab_notes/VOCAB.md

Needs the GitHub CLI (`gh`) logged in with the `gist` scope. vocab_notes/ is git-ignored (personal).
"""
from __future__ import annotations

import json
import re
import subprocess
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "vocab_notes"
GIST_FILE = "oet-reading-sync.json"


def gh(*args: str, input_path: str | None = None) -> str:
    cmd = ["gh", "api", *args]
    if input_path:
        cmd += ["--input", input_path]
    r = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8")
    if r.returncode != 0:
        sys.exit(f"gh api failed: {r.stderr.strip()}")
    return r.stdout


def find_gist() -> tuple[str, dict]:
    gists = json.loads(gh("/gists?per_page=100"))
    for g in gists:
        if GIST_FILE in (g.get("files") or {}):
            full = json.loads(gh(f"/gists/{g['id']}"))
            return g["id"], json.loads(full["files"][GIST_FILE]["content"] or "{}")
    sys.exit("동기화 Gist가 없습니다. 앱에서 '기기 간 동기화'를 먼저 연결하세요.")


def key(v: dict) -> str:
    return f"{v.get('setId')}|{str(v.get('term', '')).lower()}"


def load_sets() -> dict:
    sets = {}
    for part in "ABC":
        for s in json.loads((ROOT / "data" / f"part{part}.json").read_text(encoding="utf-8"))["sets"]:
            sets[s["id"]] = {**s, "part": part}
    return sets


def blocks(s: dict) -> list[tuple[str, str]]:
    """(location label, text) for every passage block in a set."""
    if s["part"] == "A":
        return [(f"Text {t['label']}", t["body"]) for t in s.get("texts", [])]
    if s["part"] == "B":
        return [(f"Extract {it['id']}", it["extract"]) for it in s.get("items", [])]
    return [(t["label"], "\n".join(t.get("paragraphs", []))) for t in s.get("texts", [])]


def find_context(s: dict, term: str) -> tuple[str, str]:
    pat = re.compile(re.escape(term), re.I)
    for where, text in blocks(s):
        for line in text.split("\n"):
            for sent in re.split(r"(?<=[.!?])\s+", line):
                if pat.search(sent):
                    return where, sent.strip(" •")
    return "", ""


def where_label(v: dict, s: dict | None, loc: str) -> str:
    if not s:
        return v.get("setId", "")
    base = f"Test {s['setNum']:02d} · Part {s['part']}"
    return f"{base} · {loc}" if loc else base


def pull() -> None:
    _, snap = find_gist()
    sets = load_sets()
    words = []
    for v in snap.get("vocab", []):
        s = sets.get(v.get("setId"))
        loc, ctx = find_context(s, v["term"]) if s else ("", "")
        words.append({
            "key": key(v),
            "term": v["term"],
            "setId": v.get("setId"),
            "setTitle": s["title"] if s else v.get("setTitle", ""),
            "where": where_label(v, s, loc),
            "context": v.get("context") or ctx,
            "def": v.get("def", ""),
            "addedAt": v.get("addedAt", ""),
        })
    OUT.mkdir(exist_ok=True)
    (OUT / "words.json").write_text(json.dumps(words, ensure_ascii=False, indent=2), encoding="utf-8")
    glosses = load_glosses()
    todo = [w for w in words if w["key"] not in glosses]
    print(f"{len(words)} words pulled -> vocab_notes/words.json ({len(todo)} without a gloss yet)")


def load_glosses() -> dict:
    p = OUT / "glosses.json"
    return json.loads(p.read_text(encoding="utf-8")) if p.exists() else {}


def def_text(g: dict) -> str:
    return g["ko"] + (f"\n{g['note']}" if g.get("note") else "")


def push() -> None:
    gist_id, snap = find_gist()
    glosses = load_glosses()
    now = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    changed = 0
    for v in snap.get("vocab", []):
        g = glosses.get(key(v))
        if g and v.get("def") != def_text(g):
            v["def"] = def_text(g)
            v["at"] = now  # newer than device copies → wins on merge
            changed += 1
    if changed:
        body = {"files": {GIST_FILE: {"content": json.dumps(snap, ensure_ascii=False)}}}
        with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False, encoding="utf-8") as f:
            json.dump(body, f, ensure_ascii=False)
        gh("-X", "PATCH", f"/gists/{gist_id}", input_path=f.name)
        Path(f.name).unlink()
    write_markdown(glosses)
    print(f"{changed} definitions pushed to the app; vocab_notes/VOCAB.md updated")


def write_markdown(glosses: dict) -> None:
    p = OUT / "words.json"
    words = json.loads(p.read_text(encoding="utf-8")) if p.exists() else []
    by_set: dict[str, list] = {}
    for w in words:
        by_set.setdefault(f"{w['where'].split(' · Text')[0].split(' · Extract')[0]} — {w['setTitle']}", []).append(w)
    lines = ["# OET Reading — 내 단어장 정리", ""]
    for head in sorted(by_set):
        lines += [f"## {head}", ""]
        for w in by_set[head]:
            g = glosses.get(w["key"], {})
            lines.append(f"### {w['term']}")
            if w["context"]:
                ctx = re.sub(re.escape(w["term"]), lambda m: f"**{m.group(0)}**", w["context"], flags=re.I)
                lines.append(f"> {ctx}  \n> — {w['where']}")
            lines.append("")
            lines.append(f"- **뜻:** {g.get('ko', '(아직 정리 안 됨)')}")
            if g.get("note"):
                lines.append(f"- **메모:** {g['note']}")
            lines.append("")
    (OUT / "VOCAB.md").write_text("\n".join(lines), encoding="utf-8")


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else ""
    {"pull": pull, "push": push}.get(cmd, lambda: sys.exit(__doc__))()

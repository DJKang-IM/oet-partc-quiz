# OET Reading Practice (mobile)

Unofficial self-study quiz for iPhone/iPad Safari. Not affiliated with OET.

Live: https://djkang-im.github.io/oet-partc-quiz/

Open the URL, pick Part A / B / C and a test, read, answer, submit for scoring.
Focus phrases asked about in the questions are highlighted in the passages.
Highlight unknown words into the vocab list and look up meanings later.
Progress (완료/미완료 per test) and vocab are stored in the browser.

## Format (modelled on the OET 2.0 sample test)

| Part | Content | Questions |
|---|---|---|
| A | 4 short workplace texts (A–D), one clinical topic | Q1–7 which text · Q8–15 short answer · Q16–20 sentence completion |
| B | 6 workplace extracts, 100–170 words | one 3-option question each (extract + question in one view) |
| C | 2 opinion articles, 700–850 words | 8 four-option questions each, numbered Q7–14 and Q15–22 |

## Adding tests

Source of truth is `data/tests/NN/part{A,B,C}.json` (one set per file).
`data/partA.json`, `partB.json`, `partC.json` are **build outputs** — never edit them.

```bash
python tools/scaffold.py 11            # skeleton files with TODOs
# write content (see GENERATION_GUIDE.md — full spec, usable by any LLM)
python tools/validate.py data/tests/11/*.json   # must PASS
python tools/build.py                  # bundles + bumps cache version
git add -A && git commit -m "Test 11" && git push
```

`GENERATION_GUIDE.md` is written so that a model with no other context can
produce a test that passes `tools/validate.py`; the validator enforces counts,
lengths, answer spread, longest-option bias, verbatim focus phrases, paragraph
references and no repeated (filler) sentences.

## Vocab notes (PC)

With sync connected, `python tools/vocab.py pull` downloads the words highlighted on any device (with their context sentence) to `vocab_notes/words.json`. Write glosses to `vocab_notes/glosses.json` (`{"setId|term": {"ko": ..., "note": ...}}`), then `python tools/vocab.py push` sends them back so each word shows its meaning in the app, and writes `vocab_notes/VOCAB.md`. `vocab_notes/` is git-ignored.

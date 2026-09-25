# OET Reading practice test — generation guide

This document is the complete specification for adding a new practice test to
this app. It is written so that a model with **no other context** can produce
a test that passes `tools/validate.py`. Follow it literally.

Reference: the official *OET 2.0 Reading sample test* (Part A: 4 texts / 20
questions / 15 min; Part B: 6 extracts × 3 options; Part C: 2 texts × 8
questions, 4 options). Everything below is derived from that sample.

---

## 0. Workflow (do this in order)

```bash
python tools/scaffold.py 07          # creates data/tests/07/partA.json, partB.json, partC.json with TODOs
# ... write content into those three files (one JSON object per file, no {"sets": [...]} wrapper)
python tools/validate.py data/tests/07/*.json   # fix EVERY line marked ERROR; warnings are advisory
python tools/build.py                # bundles all tests into data/part{A,B,C}.json and bumps the cache version
```

* `validate.py` writes its full report to `tools/last_validation.txt` (UTF-8) — read that file if the console garbles characters.
* Never edit `data/partA.json`, `data/partB.json`, `data/partC.json` directly; they are build outputs.
* Only one test number per folder. File names are exactly `partA.json`, `partB.json`, `partC.json`.
* Use straight JSON, UTF-8, `ensure_ascii=False`-style (Korean and curly quotes are fine).

## 1. Register and content rules (all parts)

* **Setting:** UK/Australian hospital or community healthcare. British spelling (haemoglobin, anaesthetist, programme, organisation).
* **Voice:** professional, neutral. Part C texts are *magazine/opinion* pieces by a thoughtful clinician-writer; Part A/B are *workplace documents* (guidelines, memos, policies, handover notes).
* **Clinical accuracy matters.** Use real drug names, realistic thresholds and units (mmol/L, g/L, mL/kg). Do not invent implausible numbers. If unsure of a number, choose a different detail rather than guessing.
* **No padding.** Every sentence must be unique across the file. The validator rejects any sentence (≥ 8 words) that appears twice. Do not repeat a "closing" paragraph to reach a word count — write real content.
* **`gist`:** 1–3 one-line takeaways or exam tips for the set (the scaffold shows one placeholder).
* **Korean glosses:** `vocab[].gloss` is a short Korean meaning (e.g. `"melaena": "흑색변: 검은 타르 변"`). 3–6 entries per file, chosen from the words a Korean clinician is least likely to know.
* **Answer distribution is checked:** every letter must be used; no letter three times in a row; no letter more than half the time (Part B: ≤ 3 of 6; Part C: ≤ 4 of 8 per text and ≤ 6 of 16 overall; Part A Q1–7: ≤ 3 of 7). Easiest: decide the letter sequence first (e.g. `C A B A C B`) and write the key into that slot.
* **"Verbatim" means a contiguous substring.** A `focus` / `focusPhrases` entry or a Part A answer must appear in the text as an unbroken character sequence (case-insensitive). `"approved in writing"` does **not** match `"approved the visit in writing"`. Copy-paste from the passage; do not paraphrase or drop words.
* **Length bias is checked:** the correct option must **not** be the single longest option in more than half the questions (Part B: ≤ 3 of 6 is accepted; Part C: ≤ 4 of 8 per text). Aim for 0–2. Write distractors that are as long and as specific as the key. The easiest way: write the key first, then write each distractor to the *same word count ± 2*.
* **Distractor quality:** each distractor must be *plausible to someone who skimmed the text* — a distortion, an overstatement, a detail from the wrong paragraph, or a common misreading. Never write absurd or joke options ("illegal in ICU", "playing sports"). Never make the key the only sensible-sounding option.

## 2. Part A — `partA.json`

**What it is:** four short workplace texts (A–D) on **one** clinical topic (e.g. *acute upper GI bleeding*), each a different document type: a guideline extract, a table/flowchart rendered as bullet lines, a drug-dosing box, a patient-information or audit snippet. Candidates scan for information under time pressure. Density is high: numbers, thresholds, timings, drug names, criteria lists.

**Lengths:** each text 110–160 words (validator: 80–220); total 450–650.

**Text formatting:** plain text with `\n` line breaks. Use `•` bullets for lists, `\n\n` between sections, short bold-style headings as their own line (no markdown). Tables become bullet lines like `• Age ≥ 65 → 1 point`.

**Questions (exactly 20, ids 1–20):**

| ids | `type` | what it is | rules |
|---|---|---|---|
| 1–7 | `whichText` | *"In which text can you find information about …"* + a phrase | `stem` is the phrase ending in `?` (e.g. `"the threshold for restrictive transfusion?"`). `answer` is `"A"`–`"D"`. Every letter used at least once. Do **not** start the sequence with A,B,C,D in order. Each phrase must be findable in exactly one text. |
| 8–15 | `shortAnswer` | direct question answered with a word/number/short phrase **copied from the texts** | `stem` ends with `?`. `answer` ≤ 3 words and/or a number, exactly as it appears in the text (including units). Every space-separated token counts, numbers included: `"≥24 hours"` is 2 tokens (OK); `"≥24 hours after the reaction"` is 5 (fails). Keep a leading `<`/`≥` attached to the number as in the text and add the bare variant to `accept`. `accept` lists the answer plus reasonable variants (`"70 g/L"`, `"<70 g/L"`, `"70"`). The answer or a variant **must occur verbatim** in one of the texts. |
| 16–20 | `gapFill` | sentence with a gap to complete with words from the texts | `stem` contains a visible gap `……………………………………` (or `_____`). Same `answer`/`accept` rules as above. |

Each question object: `{"id", "type", "stem", "answer", "accept", "explain"}`. `explain` says which text and where (e.g. `"Text B, dosing box"`). For `whichText`, `options` and `accept` are optional (build fills them).

Set-level fields: `id` `"A-07"`, `part` `"A"`, `setNum` `7`, `title` (the topic), `type` `"partA-full"`, `instruction`, `sharedWhichPrompt` (`"In which text can you find information about"`), `texts` (4), `questions` (20), `gist` (3 short tips), `vocab` (3–6). Set-level `focusPhrases` is optional — the app highlights the Q8–20 answers and quoted stems automatically.

Topics already used: 01 acute upper GI bleeding · 02 neutropenic sepsis · 03 peri-operative anticoagulation bridging.

## 3. Part B — `partB.json`

**What it is:** six unrelated short workplace texts — policy extract, email/memo, guideline paragraph, handover note, notice, SOP. Each has **one** 3-option question about its **purpose, main point, or what staff must do**.

**Lengths:** 100–170 words each. Extract starts with a one-line source (`"Memo from the pharmacy lead:"`, `"Extract from the falls policy:"`) followed by a blank line (`\n\n`).

**Question stem styles (rotate):** `"The memo mainly tells staff to"`, `"The purpose of this notice is to"`, `"According to the policy, …"`, `"The guideline states that …"`, `"The note indicates that …"`.

**Options:** exactly 3, keys `A`,`B`,`C`, similar length. Key + two distractors that misread a condition (e.g. drop an *unless*), reverse a *must/must not*, or generalise a specific rule.

**`focusPhrases`:** 1–4 short phrases copied verbatim from the extract that carry the answer (e.g. `["Visors alone", "not a substitute"]`). They are highlighted for the learner.

Item object: `{"id", "extract", "stem", "options", "answer", "explain", "focusPhrases"}` (`wordCount` is filled by build — do not hand-write it). Set-level: `id` `"B-07"`, `part` `"B"`, `setNum`, `type` `"workplace"`, `title`, `instruction`, `items` (6), `gist`, `vocab`.

Topics already used: 01 ward & medicines policy · 02 theatre, IPC & governance.

## 4. Part C — `partC.json`

**What it is:** two long opinion/feature articles (**Text 1**, **Text 2**) on different healthcare topics, each followed by 8 four-option questions testing *inference, attitude, reference, and meaning in context*. In the real paper these are numbered **Q7–14 and Q15–22**; in the file you number them **1–8 for each text** and the app renumbers.

**Lengths:** each text **700–850 words**, 7–11 paragraphs of 60–130 words. (Validator-enforced hard limits: 680–880 words, 6–12 paragraphs; the 60–130-word paragraph range is style guidance — only paragraphs under 40 words trigger a warning.) Structure: hook → problem → nuance/counter-argument → examples/evidence → practical implications → conclusion with a memorable phrase. Use a few quotable phrases (`'a rumour with a timestamp'`, `'NBM is a tool, not an identity'`) — those become question targets.

**Questions (8 per text) — mix these types:**

1. *Reference:* `"‘That framing’ in paragraph three refers to …"`
2. *Meaning in context:* `"The phrase ‘game the clock’ in paragraph four means …"`
3. *Writer's purpose / example:* `"The writer mentions the eighty-year-old patient in order to …"`
4. *Detail/inference from a paragraph:* `"According to paragraph five, …"`
5. *Attitude:* `"In the final paragraph, the writer regards X as …"`
6. *Global/main argument:* `"The writer's overall position is that …"`

Every question object **must** include `"focus"`: a phrase copied **verbatim** from the passage that the question targets (2–8 words; the app highlights it). Rules the validator enforces:

* `focus` must occur in the text (case-insensitive, exact spelling/punctuation).
* If the stem says *"paragraph N"* (in words: one…twelve), the `focus` must be in paragraph N.
* If the stem says *"final paragraph"*, the `focus` must be in the last paragraph; *"paragraph one / opening paragraph"* → first paragraph.
* For global questions with no paragraph reference (attitude, main argument), `focus` may be anywhere — pick the phrase that best carries the writer's stance (often in the conclusion).
* 4 options, keys `A`–`D`, answers spread (each letter ≥ 1 per text, none > 6 of 16), key not the single longest option in more than 4 of 8.

Question object: `{"id", "stem", "options", "answer", "focus", "explain"}`. Text object: `{"label": "Text 1", "title", "paragraphs": [...], "questions": [...]}`. Do **not** write `wordCount` or `focusPhrases` — `build.py` inserts them (they appear in older example files only because those were rebuilt). Set-level: `id` `"C-07"`, `part` `"C"`, `setNum`, `type` `"dual-text"`, `title` `"Topic 1 & Topic 2"`, `instruction`, `texts` (2), `gist`, `vocab`.

Topics already used: 01 moral distress / nil-by-mouth · 02 shared decision-making / sepsis pathways · 03 wearables / discharge summaries · 04 vaccine hesitancy / climate medicine.

## 5. Worked mini-examples

**Part A whichText:** `{"id": 3, "type": "whichText", "stem": "when to restart aspirin after endoscopic haemostasis?", "answer": "D", "explain": "Text D — antithrombotic section"}`

**Part A shortAnswer:** `{"id": 9, "type": "shortAnswer", "stem": "What dose of terlipressin is given initially in suspected variceal bleeding?", "answer": "2 mg", "accept": ["2 mg", "2mg", "2 mg IV"], "explain": "Text C dosing box"}`

**Part A gapFill:** `{"id": 17, "type": "gapFill", "stem": "Patients with a Glasgow-Blatchford Score of …………………………………… may be considered for early discharge.", "answer": "0", "accept": ["0", "zero"], "explain": "Text A"}`

**Part B item (abridged):**
```json
{"id": 2, "extract": "Email from the endoscopy lead to all referrers:\n\nPlease stop sending ‘urgent’ booking requests without stating the clinical indication … (100–170 words)",
 "stem": "The lead’s main concern is that",
 "options": [{"key":"A","text":"incomplete referral forms are themselves a source of delay."},
             {"key":"B","text":"referrers are booking stable patients through the on-call endoscopist."},
             {"key":"C","text":"interpreters are not being arranged for urgent procedures."}],
 "answer": "A", "explain": "Incomplete forms are returned → delay.", "focusPhrases": ["Incomplete forms", "delays"]}
```

**Part C question:**
```json
{"id": 3, "stem": "‘Game the clock’ in paragraph four refers to",
 "options": [{"key":"A","text":"recording the time of antibiotics inaccurately."},
             {"key":"B","text":"deliberately delaying antibiotics in order to avoid treating patients who do not need them."},
             {"key":"C","text":"ignoring the sixty-minute target altogether."},
             {"key":"D","text":"satisfying a time target in ways that neglect clinical quality."}],
 "answer": "D", "focus": "game the clock", "explain": "지문의 ‘game the clock’ 부분 참조 → D"}
```

## 6. Self-check before you run the validator

- [ ] Part A: 4 texts, 20 questions, ids in order, types by range, every answer for 8–20 copied from a text.
- [ ] Part B: 6 extracts of 100–170 words, source line + blank line, 3 options each, focus phrases verbatim.
- [ ] Part C: 2 texts of 700–850 words, 8 questions each with `focus` verbatim, paragraph numbers in stems match where the focus sits.
- [ ] Answers spread (no all-B); letter sequence decided in advance.
- [ ] For every question, count words per option: the key is the single longest in at most 2–3 questions per set/text. Lengthen a distractor or trim the key where it is not.
- [ ] No sentence repeated anywhere. No placeholder `TODO` left.
- [ ] `vocab` 3–6 entries with Korean glosses; `gist` filled.
- [ ] Ran `python tools/validate.py data/tests/NN/*.json` → every file `PASS`.

const STATE = {
  data: null,
  view: "home", // home | set | vocab
  part: "C", // A | B | C
  setId: null,
  tab: "passage", // passage | questions | review
  answers: {},
  graded: false,
  result: null,
  wrongOnly: false, // review filter: show only wrong / unanswered
};

const VOCAB_KEY = "oet-partc-vocab-v1";
const PROGRESS_KEY = "oet-reading-progress-v1";

function $(id) {
  return document.getElementById(id);
}

function loadVocab() {
  try {
    return JSON.parse(localStorage.getItem(VOCAB_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveVocab(list) {
  localStorage.setItem(VOCAB_KEY, JSON.stringify(list));
}

function loadProgress() {
  try {
    const map = JSON.parse(localStorage.getItem(PROGRESS_KEY) || "{}");
    // migrate legacy Part C ids (C-P01 → C-01)
    let changed = false;
    for (const k of Object.keys(map)) {
      const m = /^C-P(\d+)$/.exec(k);
      if (m) {
        map[`C-${m[1]}`] = map[k];
        delete map[k];
        changed = true;
      }
    }
    if (changed) localStorage.setItem(PROGRESS_KEY, JSON.stringify(map));
    return map;
  } catch {
    return {};
  }
}

function saveProgress(map) {
  localStorage.setItem(PROGRESS_KEY, JSON.stringify(map));
}

function markSetComplete(setId, score, total, answers) {
  const map = loadProgress();
  map[setId] = {
    done: true,
    score,
    total,
    at: new Date().toISOString(),
    answers: answers || {}, // kept so the set reopens in review mode
  };
  saveProgress(map);
}

function resetSetProgress(setId) {
  const map = loadProgress();
  delete map[setId];
  saveProgress(map);
}

// Was this question answered correctly with the current STATE.answers?
function isQuestionCorrect(q) {
  const chosen = STATE.answers[q.id] ?? "";
  const type = q.type || (q.options ? "mcq" : "shortAnswer");
  if (type === "shortAnswer" || type === "gapFill") return isAnswerCorrect(q, chosen);
  return chosen === q.answer;
}

// Wrong/unanswered questions for a set, evaluated against a saved answer map.
function wrongQuestionsFor(s, answers) {
  const saved = STATE.answers;
  STATE.answers = answers || {};
  const out = questionList(s).filter((q) => !isQuestionCorrect(q));
  STATE.answers = saved;
  return out;
}

function setProgress(setId) {
  return loadProgress()[setId] || null;
}

function toast(msg) {
  let el = document.querySelector(".toast");
  if (!el) {
    el = document.createElement("div");
    el.className = "toast";
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove("show"), 1600);
}

function currentSet() {
  return STATE.data.sets.find((s) => s.id === STATE.setId);
}

function setTitle(t) {
  $("topTitle").textContent = t;
}

function escapeHtml(s) {
  return String(s || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getFocusPhrases(set, extra = []) {
  const fromSet = [
    ...(set.focusPhrases || []),
    ...((set.texts || []).flatMap((t) => t.focusPhrases || [])),
  ];
  const fromQ = [];
  const stems = [];
  for (const q of set.questions || []) {
    stems.push(q.stem);
    if (q.focus) fromQ.push(q.focus);
    // Part A: short answers / gap fills are verbatim lifts from the texts
    if (
      (q.type === "shortAnswer" || q.type === "gapFill") &&
      typeof q.answer === "string" &&
      q.answer.length >= 2
    ) {
      fromQ.push(q.answer);
    }
  }
  for (const t of set.texts || []) {
    for (const q of t.questions || []) {
      stems.push(q.stem);
      if (q.focus) fromQ.push(q.focus);
    }
  }
  if (set.items) {
    for (const it of set.items) {
      stems.push(it.stem);
      if (it.focusPhrases) fromQ.push(...it.focusPhrases);
    }
  }
  // straight + curly quotes in stems
  for (const stem of stems) {
    const s = stem || "";
    // paired quotes
    for (const m of s.matchAll(/[''`‘’‛′]([^'`‘’‛′]+)[''`‘’‛′]/g)) {
      fromQ.push(m[1].trim());
    }
    for (const m of s.matchAll(/["“”„]([^"“”„]+)["“”„]/g)) {
      fromQ.push(m[1].trim());
    }
    // What does X mean/refer
    let m = s.match(
      /what does\s+['"`‘’“”]?([^'"`‘’””?]+?)['"`‘’“”]?\s+(?:mean|refer)/i
    );
    if (m) fromQ.push(m[1].trim());
    m = s.match(
      /['"`‘’“”]([^'"`‘’””]+)['"`‘’“”]\s+(?:in the text|refers|mean)/i
    );
    if (m) fromQ.push(m[1].trim());
  }
  const all = [...fromSet, ...fromQ, ...extra].filter(
    (t) => t && t.length >= 2 && t.length <= 80
  );
  const seen = new Set();
  const out = [];
  for (const t of all) {
    const k = t.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(t);
  }
  return out.sort((a, b) => b.length - a.length);
}

function highlightFocus(text, phrases) {
  let html = escapeHtml(text);
  const slots = [];
  // longest first so a short phrase never splits a longer one
  const ordered = [...phrases].sort((a, b) => (b || "").length - (a || "").length);
  for (const ph of ordered) {
    if (!ph) continue;
    const esc = escapeHtml(ph);
    if (!esc) continue;
    const re = new RegExp(escapeRegExp(esc), "gi");
    html = html.replace(re, (m) => {
      // skip if already inside a mark placeholder region — simple: always slot
      const i = slots.length;
      slots.push(
        `<mark class="focus"><strong><u>${m}</u></strong></mark>`
      );
      return `\uE000${i}\uE001`;
    });
  }
  return html.replace(/\uE000(\d+)\uE001/g, (_, i) => slots[Number(i)]);
}

function focusChipBar(phrases) {
  if (!phrases?.length) return "";
  return `<div class="focus-bar"><span class="focus-bar-label">Focus</span>${phrases
    .map((p) => `<span class="focus-chip">${escapeHtml(p)}</span>`)
    .join("")}</div>`;
}

function normalizeNewlines(text) {
  return escapeHtml(text).replaceAll("\n", "<br/>");
}

function highlightExtract(text, phrases) {
  // highlight on plain text then convert newlines
  const parts = String(text || "").split("\n");
  return parts.map((line) => highlightFocus(line, phrases)).join("<br/>");
}

function render() {
  const back = $("btnBack");
  back.hidden = STATE.view === "home";
  const main = $("main");
  if (STATE.view === "home") {
    setTitle("OET Reading");
    main.innerHTML = renderHome();
    bindHome();
  } else if (STATE.view === "vocab") {
    setTitle("단어장");
    main.innerHTML = renderVocab();
    bindVocab();
  } else if (STATE.view === "wrong") {
    setTitle("오답 노트");
    main.innerHTML = renderWrongNote();
    bindHome(); // reuses [data-set] → openSet
  } else if (STATE.view === "set") {
    const s = currentSet();
    setTitle(
      s ? `Part ${s.part} · ${String(s.setNum).padStart(2, "0")}` : "Set"
    );
    main.innerHTML = renderSet();
    bindSet();
  }
}

function setsForPart(part) {
  return STATE.data.sets.filter((s) => s.part === part);
}

function renderHome() {
  const parts = [
    { id: "A", label: "Part A", blurb: "짧은 텍스트 스캔 · 매칭" },
    { id: "B", label: "Part B", blurb: "발췌 6개 · 각 3지선다 (발췌+문제 한 화면)" },
    { id: "C", label: "Part C", blurb: "긴 지문 2개 · 8문항씩 (Q7–14 / Q15–22)" },
  ];
  const allProgress = loadProgress();
  const totalWrong = STATE.data.sets.reduce((n, s) => {
    const p = allProgress[s.id];
    return p?.done && p.answers ? n + wrongQuestionsFor(s, p.answers).length : n;
  }, 0);
  const doneSets = STATE.data.sets.filter((s) => allProgress[s.id]?.done).length;
  let html = `
    <div class="card">
      <h1>OET Reading Practice</h1>
      <p class="lead">${STATE.data.note}<br/>문제에서 묻는 표현은 지문에 <strong class="focus"><u>굵게+밑줄</u></strong>로 표시됩니다. 모르는 단어는 선택 후 하이라이트 저장 → 단어장.</p>
      <div class="home-tools">
        <button type="button" class="btn secondary" id="wrongNoteBtn">오답 노트 (${totalWrong})</button>
        <span class="home-meta">${doneSets}/${STATE.data.sets.length} 세트 완료</span>
      </div>
    </div>
    <div class="part-tabs">
      ${parts
        .map(
          (p) => `
        <button type="button" class="part-tab ${
          STATE.part === p.id ? "active" : ""
        }" data-part="${p.id}">
          <strong>${p.label}</strong>
          <span>${p.blurb}</span>
        </button>`
        )
        .join("")}
    </div>`;

  const list = setsForPart(STATE.part);
  if (!list.length) {
    html += `<div class="card"><p class="empty">이 Part 세트가 아직 없습니다.</p></div>`;
    return html;
  }

  const progress = loadProgress();
  const doneCount = list.filter((s) => progress[s.id]?.done).length;
  html += `<h3 style="margin:8px 4px 10px">Part ${STATE.part} · ${doneCount}/${list.length} 완료</h3>`;
  for (const s of list) {
    const nQ =
      s.questions?.length ||
      s.items?.length ||
      (s.texts || []).reduce((n, t) => n + (t.questions?.length || 0), 0) ||
      0;
    const pack = "";
    const wcHint = isDual(s)
      ? ` · ${(s.texts || [])
          .map((t, i) => {
            const qs = dualQuestions(s, i);
            return `${t.label} Q${qs[0]?.id}–${qs[qs.length - 1]?.id}`;
          })
          .join(" + ")}`
      : "";
    const prog = progress[s.id];
    const wrongN = prog?.done && prog.answers ? wrongQuestionsFor(s, prog.answers).length : 0;
    const status = prog?.done
      ? `<span class="status done">완료 ${prog.score}/${prog.total}${
          wrongN ? ` · 오답 ${wrongN}` : ""
        }</span>`
      : `<span class="status todo">미완료</span>`;
    html += `
      <button class="set-btn ${prog?.done ? "is-done" : ""}" data-set="${s.id}">
        <div class="set-btn-top">
          <span class="pack-label">${pack}Test ${String(s.setNum).padStart(
      2,
      "0"
    )} · Part ${s.part}</span>
          ${status}
        </div>
        <strong>${escapeHtml(s.title)}</strong>
        <span>${nQ} questions${wcHint}</span>
      </button>`;
  }
  if (doneCount) {
    html += `<div class="actions" style="position:static;margin-top:14px">
      <button class="btn secondary danger" id="resetAllBtn">Part ${STATE.part} 기록 전체 초기화</button>
    </div>`;
  }
  return html;
}

// ---------- 오답 노트: every wrong/unanswered question across completed sets ----------
function optionText(q, key) {
  const o = (q.options || []).find((x) => x.key === key);
  return o ? `${key}. ${o.text}` : key || "";
}

function renderWrongNote() {
  const progress = loadProgress();
  const blocks = [];
  let total = 0;
  for (const s of STATE.data.sets) {
    const p = progress[s.id];
    if (!p?.done || !p.answers) continue;
    const wrong = wrongQuestionsFor(s, p.answers);
    if (!wrong.length) continue;
    total += wrong.length;
    // Part B items carry stem/explain on the item, not on questionList entries
    const items = s.part === "B" ? Object.fromEntries((s.items || []).map((it) => [it.id, it])) : {};
    blocks.push(`
      <div class="card">
        <div class="set-btn-top">
          <span class="pack-label">Test ${String(s.setNum).padStart(2, "0")} · Part ${s.part}</span>
          <span class="status done">${p.score}/${p.total} · 오답 ${wrong.length}</span>
        </div>
        <strong>${escapeHtml(s.title)}</strong>
        ${wrong
          .map((q0) => {
            const q = s.part === "B" ? { ...q0, stem: items[q0.id]?.stem, explain: items[q0.id]?.explain } : q0;
            const mine = p.answers[q.id] ?? "";
            const type = q.type || (q.options ? "mcq" : "shortAnswer");
            const isText = type === "shortAnswer" || type === "gapFill";
            const label = q.textIdx !== undefined ? `Text ${q.textIdx + 1} · ` : "";
            return `
            <div class="wrong-item">
              <div class="q-stem">${label}${q.id}. ${escapeHtml(q.stem || "")}</div>
              <div class="wrong-cmp">
                <div class="mine">내 답: ${mine ? escapeHtml(isText ? mine : optionText(q, mine)) : "<em>미응답</em>"}</div>
                <div class="key">정답: ${escapeHtml(isText ? q.answer : optionText(q, q.answer))}</div>
              </div>
              ${q.focus ? `<div class="wrong-focus">지문 단서: <mark class="focus"><strong><u>${escapeHtml(q.focus)}</u></strong></mark></div>` : ""}
              ${q.explain ? `<div class="explain">${escapeHtml(q.explain)}</div>` : ""}
            </div>`;
          })
          .join("")}
        <div class="actions" style="position:static;margin-top:10px">
          <button class="btn secondary" data-set="${s.id}">세트 열기 (해설)</button>
        </div>
      </div>`);
  }
  if (!blocks.length) {
    return `<div class="card"><p class="empty">아직 오답이 없습니다.<br/>세트를 풀고 채점하면 틀린 문항이 여기에 모입니다.</p></div>`;
  }
  return `<div class="card"><p class="lead">틀렸거나 비워 둔 문항 ${total}개. 내 답과 정답을 비교하고 지문 단서·해설을 확인하세요. 세트를 다시 풀어 채점하면 이 목록도 갱신됩니다.</p></div>${blocks.join("")}`;
}

function passageLabel(s) {
  if (s.part === "A") return "텍스트";
  if (s.part === "B") return "발췌";
  return "지문";
}

function renderSet() {
  const s = currentSet();
  if (!s) return `<p class="empty">세트를 찾을 수 없습니다.</p>`;

  if (isDual(s)) return renderDualSet(s);

  // Part B: each extract is short, so extract + question live in one section
  // (no separate passage tab).
  const passageTab =
    s.part === "B"
      ? ""
      : `<button class="tab ${STATE.tab === "passage" ? "active" : ""}" data-tab="passage">${passageLabel(
          s
        )}</button>`;
  if (s.part === "B" && STATE.tab === "passage") STATE.tab = "questions";

  const tabs = `
    <div class="tabs">
      ${passageTab}
      <button class="tab ${STATE.tab === "questions" ? "active" : ""}" data-tab="questions">${
        s.part === "B" ? "발췌 + 문제" : "문제"
      }</button>
      ${
        STATE.graded
          ? `<button class="tab ${
              STATE.tab === "review" ? "active" : ""
            }" data-tab="review">해설</button>`
          : ""
      }
    </div>`;

  if (STATE.tab === "passage") {
    return tabs + renderPassageView(s);
  }
  if (STATE.tab === "questions") {
    return tabs + renderQuestionsView(s, false);
  }
  return tabs + renderQuestionsView(s, true);
}

// ---------- Part C dual-text paper (Text 1 + Q7–14, Text 2 + Q15–22) ----------
function dualTabs(s) {
  const texts = s.texts || [];
  const tabBtn = (key, label) =>
    `<button class="tab ${STATE.tab === key ? "active" : ""}" data-tab="${key}">${label}</button>`;
  let html = `<div class="tabs">`;
  texts.forEach((t, idx) => {
    const qs = dualQuestions(s, idx);
    const range = qs.length
      ? `Q${qs[0].id}–${qs[qs.length - 1].id}`
      : "";
    html += tabBtn(`text${idx}`, `${escapeHtml(t.label)} · ${range}`);
  });
  if (STATE.graded) html += tabBtn("review", "해설");
  html += `</div>`;
  return html;
}

function renderDualPassage(t, ph) {
  return `
    <div class="text-block partc-text">
      <div class="text-label">${escapeHtml(t.label)} — ${escapeHtml(
        t.title
      )} <span class="wc">${t.wordCount || ""} words</span></div>
      ${focusChipBar(ph)}
      <div class="passage">${(t.paragraphs || [])
        .map((p) => `<p>${highlightFocus(p, ph)}</p>`)
        .join("")}</div>
    </div>`;
}

function renderDualTextView(s, idx) {
  const t = s.texts[idx];
  const qs = dualQuestions(s, idx);
  const ph = getFocusPhrases(
    { questions: t.questions, focusPhrases: t.focusPhrases },
    t.focusPhrases || []
  );
  const isLast = idx === s.texts.length - 1;
  const first = qs[0]?.id;
  const last = qs[qs.length - 1]?.id;
  const nextBtn = isLast
    ? `<button class="btn primary" id="submitBtn">제출 · 채점 (16문항)</button>`
    : `<button class="btn primary" data-tab="text${idx + 1}">${escapeHtml(
        s.texts[idx + 1].label
      )}로 이동</button>`;
  return `
    <p class="hint">${escapeHtml(t.label)}: read the text, then answer Questions ${first}–${last}. 노란 강조 = 문제에서 묻는 focus 표현.</p>
    <div class="card" id="passageBox">${renderDualPassage(t, ph)}</div>
    <div class="card">
      <h2 class="q-group">${escapeHtml(t.label)}: Questions ${first}–${last}</h2>
      ${qs.map((q) => renderQuestion(q, false)).join("")}
    </div>
    <div class="actions">${nextBtn}</div>`;
}

function renderDualReview(s) {
  const texts = s.texts || [];
  const perText = texts.map((t, idx) => {
    const qs = dualQuestions(s, idx);
    const ok = qs.filter((q) => STATE.answers[q.id] === q.answer).length;
    return { t, idx, qs, ok, total: qs.length };
  });
  let html = `
    <div class="card">
      <div class="score">${STATE.result.score} / ${STATE.result.total}</div>
      <p class="lead">${perText
        .map((p) => `${escapeHtml(p.t.label)} ${p.ok}/${p.total}`)
        .join(" · ")}</p>
    </div>`;
  for (const p of perText) {
    const ph = getFocusPhrases(
      { questions: p.t.questions, focusPhrases: p.t.focusPhrases },
      p.t.focusPhrases || []
    );
    html += `
      <div class="card">
        <details>
          <summary class="q-group">${escapeHtml(p.t.label)} — ${escapeHtml(
            p.t.title
          )} (지문 다시 보기)</summary>
          ${renderDualPassage(p.t, ph)}
        </details>
        <h2 class="q-group">${escapeHtml(p.t.label)}: Questions ${p.qs[0]?.id}–${
          p.qs[p.qs.length - 1]?.id
        } · ${p.ok}/${p.total}</h2>
        ${(() => {
          const shown = reviewFilter(p.qs);
          return shown.length
            ? shown.map((q) => renderQuestion(q, true)).join("")
            : emptyWrongNote();
        })()}
      </div>`;
  }
  if (s.gist?.length || s.vocab?.length) {
    html += `<div class="card">`;
    if (s.gist?.length) {
      html += `<h2>Gist</h2><ul>${s.gist
        .map((g) => `<li>${escapeHtml(g)}</li>`)
        .join("")}</ul>`;
    }
    if (s.vocab?.length) {
      html += `<h2 style="margin-top:12px">세트 용어</h2>${s.vocab
        .map(
          (v) =>
            `<div class="vocab-item"><div class="vocab-term">${escapeHtml(
              v.term
            )}</div><div class="vocab-def">${escapeHtml(v.gloss)}</div></div>`
        )
        .join("")}`;
    }
    html += `</div>`;
  }
  html += reviewActions();
  return html;
}

function renderDualSet(s) {
  const tabs = dualTabs(s);
  if (STATE.tab === "review" && STATE.graded) return tabs + renderDualReview(s);
  const m = /^text(\d+)$/.exec(STATE.tab || "");
  const idx = m ? Math.min(Number(m[1]), s.texts.length - 1) : 0;
  return tabs + renderDualTextView(s, idx);
}

function renderPassageView(s) {
  let body = "";
  if (s.part === "A") {
    const phrases = getFocusPhrases(s);
    body =
      focusChipBar(phrases) +
      (s.texts || [])
        .map(
          (t) => `
      <div class="text-block">
        <div class="text-label">Text ${escapeHtml(t.label)} — ${escapeHtml(
            t.heading
          )}</div>
        <div class="text-body">${highlightExtract(t.body, phrases)}</div>
      </div>`
        )
        .join("");
  } else if (s.part === "B") {
    body = (s.items || [])
      .map((it) => {
        const ph = getFocusPhrases(s, it.focusPhrases || []);
        return `
        <div class="text-block">
          <div class="text-label">Extract ${it.id}</div>
          ${focusChipBar(ph)}
          <p>${highlightExtract(it.extract, ph)}</p>
        </div>`;
      })
      .join("");
  } else if (s.texts?.length) {
    // dual-text Part C
    body = s.texts
      .map((t) => {
        const ph = getFocusPhrases(
          { questions: t.questions, focusPhrases: t.focusPhrases },
          t.focusPhrases || []
        );
        return `
        <div class="text-block partc-text">
          <div class="text-label">${escapeHtml(t.label)} — ${escapeHtml(
            t.title
          )} <span class="wc">${t.wordCount || ""} words</span></div>
          ${focusChipBar(ph)}
          <div class="passage">${(t.paragraphs || [])
            .map((p) => `<p>${highlightFocus(p, ph)}</p>`)
            .join("")}</div>
        </div>`;
      })
      .join("");
  } else {
    const phrases = getFocusPhrases(s);
    body = `${focusChipBar(phrases)}<div class="passage" id="passageInner">${(
      s.paragraphs || []
    )
      .map((p) => `<p>${highlightFocus(p, phrases)}</p>`)
      .join("")}</div>`;
  }

  return `
    <p class="hint">${escapeHtml(
      s.instruction ||
        "노란 강조 = 문제에서 묻는 focus 표현. 모르는 단어는 선택 후 ‘하이라이트 저장’."
    )}</p>
    <div class="card" id="passageBox">${body}</div>
    <div class="actions">
      <button class="btn primary" id="goQuestions">문제로 이동</button>
    </div>`;
}

function renderQuestionsView(s, showResult) {
  let sectionHints = "";
  if (s.part === "A" && !showResult) {
    sectionHints = `
      <div class="section-hint"><strong>Questions 1–7</strong><br/>${escapeHtml(
        s.sharedWhichPrompt ||
          "In which text can you find information about"
      )} … (A, B, C or D — letters may be used more than once)</div>
      <div class="section-hint"><strong>Questions 8–15</strong> Answer with a word or short phrase from the texts (words, numbers, or both).</div>
      <div class="section-hint"><strong>Questions 16–20</strong> Complete each sentence with a word or short phrase from the texts.</div>`;
  }
  if (s.part === "C" && s.texts?.length && !showResult) {
    sectionHints = `
      <div class="section-hint"><strong>Text 1</strong> Questions 1–8</div>
      <div class="section-hint"><strong>Text 2</strong> Questions 9–16</div>`;
  }
  let qsHtml = "";
  const filt = showResult ? reviewFilter : (qs) => qs;
  if (s.part === "B") {
    const items = (s.items || []).filter((it) =>
      showResult && STATE.wrongOnly
        ? !isQuestionCorrect({ id: it.id, answer: it.answer, options: it.options })
        : true
    );
    if (!items.length) qsHtml = emptyWrongNote();
    qsHtml += items
      .map((it) => {
        const ph = getFocusPhrases(s, it.focusPhrases || []);
        const q = {
          id: it.id,
          stem: it.stem,
          options: it.options,
          answer: it.answer,
          explain: it.explain,
        };
        return `
          <div class="b-item">
            <div class="extract-mini">${focusChipBar(ph)}${highlightExtract(
              it.extract,
              ph
            )}</div>
            ${renderQuestion(q, showResult)}
          </div>`;
      })
      .join("");
  } else if (s.part === "A") {
    // Group 1-7 / 8-15 / 16-20 like the paper (must run before texts?.length —
    // Part A also has texts A–D, but questions live on the set, not inside each text)
    const qs = filt(s.questions || []);
    const g1 = qs.filter((q) => q.id >= 1 && q.id <= 7);
    const g2 = qs.filter((q) => q.id >= 8 && q.id <= 15);
    const g3 = qs.filter((q) => q.id >= 16 && q.id <= 20);
    if (!qs.length) qsHtml = emptyWrongNote();
    if (g1.length) {
      qsHtml += `
      <h2 class="q-group">Questions 1–7</h2>
      <p class="which-prompt">${escapeHtml(
        s.sharedWhichPrompt || "In which text can you find information about"
      )}</p>
      ${g1.map((q) => renderQuestion(q, showResult, { shortWhich: true })).join("")}`;
    }
    if (g2.length) {
      qsHtml += `<h2 class="q-group">Questions 8–15</h2>
      ${g2.map((q) => renderQuestion(q, showResult)).join("")}`;
    }
    if (g3.length) {
      qsHtml += `<h2 class="q-group">Questions 16–20</h2>
      ${g3.map((q) => renderQuestion(q, showResult)).join("")}`;
    }
  } else if (s.part === "C" && s.texts?.length) {
    qsHtml = s.texts
      .map((t, idx) => {
        const offset = (s.texts || [])
          .slice(0, idx)
          .reduce((n, x) => n + (x.questions?.length || 0), 0);
        const block = (t.questions || [])
          .map((q) =>
            renderQuestion(
              { ...q, id: q.id + offset, _label: t.label },
              showResult
            )
          )
          .join("");
        return `<h2 style="margin-top:14px">${escapeHtml(t.label)} — ${escapeHtml(
          t.title
        )}</h2>${block}`;
      })
      .join("");
  } else {
    const qs = filt(s.questions || []);
    qsHtml = qs.length
      ? qs.map((q) => renderQuestion(q, showResult)).join("")
      : emptyWrongNote();
  }

  let extras = "";
  if (showResult) {
    extras = `
      <div class="score">${STATE.result.score} / ${STATE.result.total}</div>
      <p class="lead">해설을 확인하세요.</p>`;
    if (s.gist?.length) {
      extras += `<h2 style="margin-top:18px">Gist</h2><ul>${s.gist
        .map((g) => `<li>${escapeHtml(g)}</li>`)
        .join("")}</ul>`;
    }
    if (s.vocab?.length) {
      extras += `<h2 style="margin-top:18px">세트 용어</h2>${s.vocab
        .map(
          (v) =>
            `<div class="vocab-item"><div class="vocab-term">${escapeHtml(
              v.term
            )}</div><div class="vocab-def">${escapeHtml(v.gloss)}</div></div>`
        )
        .join("")}`;
    }
  }

  const actions = showResult
    ? reviewActions()
    : `<div class="actions">
        <button class="btn primary" id="submitBtn">제출 · 채점</button>
      </div>`;

  return `<div class="card">${extras}${sectionHints}${qsHtml}</div>${actions}`;
}

// Review-mode helpers -------------------------------------------------------
function reviewFilter(qs) {
  return STATE.wrongOnly ? qs.filter((q) => !isQuestionCorrect(q)) : qs;
}

function reviewActions() {
  const wrongN = questionList(currentSet()).filter((q) => !isQuestionCorrect(q)).length;
  return `
    <div class="actions review-actions">
      <button class="btn secondary" id="wrongToggle">${
        STATE.wrongOnly ? "전체 보기" : `오답만 보기 (${wrongN})`
      }</button>
      <button class="btn secondary" id="retryBtn">다시 풀기</button>
      <button class="btn secondary danger" id="resetBtn">초기화</button>
      <button class="btn primary" id="homeBtn">목록으로</button>
    </div>`;
}

function emptyWrongNote() {
  return `<p class="empty">오답이 없습니다 — 전부 정답!</p>`;
}

function normalizeAnswer(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/×/g, "x")
    .replace(/²/g, "2")
    .replace(/³/g, "3")
    .replace(/⁹/g, "9")
    .replace(/≥/g, ">=")
    .replace(/≤/g, "<=")
    .replace(/–|—/g, "-")
    .replace(/[^a-z0-9./%<> =+-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isAnswerCorrect(q, userRaw) {
  const user = normalizeAnswer(userRaw);
  if (!user) return false;
  const accept = (q.accept && q.accept.length ? q.accept : [q.answer]).map(
    normalizeAnswer
  );
  return accept.some((a) => {
    if (!a) return false;
    if (user === a) return true;
    // allow user typing a bit more (e.g. units)
    if (user.includes(a) || a.includes(user)) return true;
    return false;
  });
}

function ensureWhichOptions(q) {
  if (q.options?.length) return q.options;
  return ["A", "B", "C", "D"].map((k) => ({ key: k, text: `Text ${k}` }));
}

function renderQuestion(q, showResult, opts = {}) {
  const type = q.type || (q.options ? "mcq" : "shortAnswer");
  const chosen = STATE.answers[q.id] ?? "";

  if (type === "shortAnswer" || type === "gapFill") {
    let resultCls = "";
    let explain = "";
    if (showResult) {
      const ok = isAnswerCorrect(q, chosen);
      resultCls = ok ? "sa-ok" : "sa-bad";
      explain = `<div class="explain"><strong>${ok ? "정답" : "오답"} · ${escapeHtml(
        q.answer
      )}</strong><br/>${escapeHtml(q.explain || "")}${
        chosen
          ? `<br/><span>내 답: ${escapeHtml(chosen)}</span>`
          : `<br/><span>미응답</span>`
      }</div>`;
    }
    return `<div class="q">
      <div class="q-stem">${q.id}. ${escapeHtml(q.stem)}</div>
      <input class="sa-input ${resultCls}" data-sa="${q.id}" type="text" autocomplete="off"
        placeholder="word / short phrase / number"
        value="${escapeHtml(chosen)}" ${showResult ? "disabled" : ""} />
      ${explain}
    </div>`;
  }

  // whichText / mcq
  const stemText = opts.shortWhich
    ? `${q.id}. ${escapeHtml(q.stem)}`
    : `${q.id}. ${escapeHtml(q.stem)}`;
  const optsHtml = ensureWhichOptions(q)
    .map((o) => {
      let cls = "opt";
      if (!showResult && chosen === o.key) cls += " selected";
      if (showResult) {
        if (o.key === q.answer) cls += " correct";
        else if (chosen === o.key && chosen !== q.answer) cls += " wrong";
      }
      const label = opts.shortWhich ? o.key : `<strong>${o.key}.</strong> ${escapeHtml(o.text)}`;
      return `<button type="button" class="${cls}${
        opts.shortWhich ? " opt-letter" : ""
      }" data-q="${q.id}" data-key="${o.key}" ${
        showResult ? "disabled" : ""
      }>${label}</button>`;
    })
    .join("");

  let explain = "";
  if (showResult) {
    const ok = chosen === q.answer;
    explain = `<div class="explain"><strong>${ok ? "정답" : "오답"} · ${
      q.answer
    }</strong><br/>${escapeHtml(q.explain || "")}${
      chosen && chosen !== q.answer
        ? `<br/><span>내 답: ${chosen}</span>`
        : !chosen
          ? `<br/><span>미응답</span>`
          : ""
    }</div>`;
  }

  return `<div class="q"><div class="q-stem">${stemText}</div><div class="${
    opts.shortWhich ? "letter-row" : ""
  }">${optsHtml}</div>${explain}</div>`;
}

function renderVocab() {
  const list = loadVocab().slice().reverse();
  if (!list.length) {
    return `<div class="card"><p class="empty">하이라이트한 단어가 없습니다.<br/>지문에서 단어를 선택한 뒤 저장하세요.</p></div>`;
  }
  return `
    <div class="card">
      <p class="lead">하이라이트만 모아 두었다가, 필요할 때 뜻을 찾아보세요.</p>
      ${list
        .map(
          (v, idx) => `
        <div class="vocab-item" data-idx="${list.length - 1 - idx}">
          <div class="vocab-term">${escapeHtml(v.term)}</div>
          <div class="vocab-meta">${escapeHtml(v.setTitle || v.setId || "")} · ${escapeHtml(
            v.addedAt || ""
          )}</div>
          <div class="vocab-def" data-def>${
            v.def
              ? escapeHtml(v.def)
              : "<span style='color:#5c6b7a'>아직 뜻을 찾지 않음</span>"
          }</div>
          <div class="vocab-actions">
            <button type="button" class="mini" data-lookup>뜻 찾기</button>
            <button type="button" class="mini" data-remove>삭제</button>
          </div>
        </div>`
        )
        .join("")}
      <div class="actions" style="position:static;margin-top:12px">
        <button class="btn secondary" id="clearVocab">단어장 비우기</button>
      </div>
    </div>`;
}

function bindHome() {
  $("main").onclick = (e) => {
    const part = e.target.closest("[data-part]");
    if (part) {
      STATE.part = part.dataset.part;
      render();
      return;
    }
    if (e.target.id === "wrongNoteBtn") {
      STATE.view = "wrong";
      render();
      return;
    }
    if (e.target.id === "resetAllBtn") {
      if (confirm(`Part ${STATE.part}의 모든 세트 기록(점수·내 답)을 지울까요?`)) {
        const map = loadProgress();
        for (const s of setsForPart(STATE.part)) delete map[s.id];
        saveProgress(map);
        render();
        toast("초기화했습니다");
      }
      return;
    }
    const btn = e.target.closest("[data-set]");
    if (!btn) return;
    openSet(btn.dataset.set);
  };
}

function openSet(id, opts = {}) {
  STATE.setId = id;
  STATE.view = "set";
  STATE.wrongOnly = false;
  const s = currentSet();
  const prog = loadProgress()[id];
  if (!opts.fresh && prog?.done && prog.answers) {
    // completed before → reopen straight into review with my answers marked
    STATE.answers = { ...prog.answers };
    STATE.graded = true;
    STATE.result = { score: prog.score, total: prog.total };
    STATE.tab = "review";
    render();
    return;
  }
  STATE.tab = s && isDual(s) ? "text0" : s?.part === "B" ? "questions" : "passage";
  STATE.answers = {};
  STATE.graded = false;
  STATE.result = null;
  render();
}

// Part C dual-text paper: Text 1 → Q7–14, Text 2 → Q15–22 (official numbering;
// Part B occupies Q1–6 in the real paper).
const PART_C_FIRST_Q = 7;

function isDual(s) {
  return (
    s.part === "C" &&
    Array.isArray(s.texts) &&
    s.texts.some((t) => (t.questions || []).length > 0)
  );
}

function dualQuestions(s, textIdx) {
  // returns [{...q, id: officialId, textIdx}] for one text (or all if textIdx undefined)
  const out = [];
  let base = PART_C_FIRST_Q;
  (s.texts || []).forEach((t, idx) => {
    const qs = t.questions || [];
    if (textIdx === undefined || textIdx === idx) {
      qs.forEach((q, i) => out.push({ ...q, id: base + i, textIdx: idx }));
    }
    base += qs.length;
  });
  return out;
}

function questionList(s) {
  if (s.part === "B") {
    return (s.items || []).map((it) => ({
      id: it.id,
      answer: it.answer,
      type: "mcq",
      options: it.options,
    }));
  }
  if (isDual(s)) return dualQuestions(s);
  // Part A (texts A–D but questions live on the set) and legacy single-text C
  return s.questions || [];
}

function bindSet() {
  $("main").onclick = async (e) => {
    const tab = e.target.closest("[data-tab]");
    if (tab) {
      collectShortAnswers();
      STATE.tab = tab.dataset.tab;
      render();
      return;
    }
    if (e.target.id === "goQuestions") {
      STATE.tab = "questions";
      render();
      return;
    }
    if (e.target.id === "submitBtn") {
      grade();
      return;
    }
    if (e.target.id === "retryBtn") {
      // fresh attempt; the saved record is replaced when you submit again
      openSet(STATE.setId, { fresh: true });
      const s = currentSet();
      STATE.tab = s && isDual(s) ? "text0" : "questions";
      render();
      return;
    }
    if (e.target.id === "resetBtn") {
      if (confirm("이 세트의 기록(점수·내 답)을 지우고 처음부터 다시 풀까요?")) {
        resetSetProgress(STATE.setId);
        openSet(STATE.setId, { fresh: true });
        toast("기록을 초기화했습니다");
      }
      return;
    }
    if (e.target.id === "wrongToggle") {
      STATE.wrongOnly = !STATE.wrongOnly;
      render();
      return;
    }
    if (e.target.id === "homeBtn") {
      STATE.view = "home";
      render();
      return;
    }
    const opt = e.target.closest(".opt");
    if (opt && !STATE.graded) {
      collectShortAnswers();
      STATE.answers[Number(opt.dataset.q)] = opt.dataset.key;
      render();
      return;
    }
  };

  $("main").oninput = (e) => {
    const sa = e.target.closest("[data-sa]");
    if (sa && !STATE.graded) {
      STATE.answers[Number(sa.dataset.sa)] = sa.value;
    }
  };

  setupPassageHighlight();
}

function collectShortAnswers() {
  document.querySelectorAll("[data-sa]").forEach((el) => {
    STATE.answers[Number(el.dataset.sa)] = el.value.trim();
  });
}

function grade() {
  collectShortAnswers();
  const s = currentSet();
  const qs = questionList(s);
  if (!qs.length) {
    toast("채점할 문항이 없습니다 (데이터 오류)");
    return;
  }
  let score = 0;
  for (const q of qs) {
    const user = STATE.answers[q.id];
    const type = q.type || (q.options ? "mcq" : "shortAnswer");
    if (type === "shortAnswer" || type === "gapFill") {
      if (isAnswerCorrect(q, user)) score += 1;
    } else if (user === q.answer) {
      score += 1;
    }
  }
  STATE.graded = true;
  STATE.result = { score, total: qs.length };
  markSetComplete(s.id, score, qs.length, STATE.answers);
  STATE.tab = "review";
  STATE.view = "set";
  render();
  toast(`채점 완료: ${score}/${qs.length}`);
}

function setupPassageHighlight() {
  const box = $("passageBox");
  if (!box) return;

  let fab = document.getElementById("hlFab");
  if (!fab) {
    fab = document.createElement("button");
    fab.id = "hlFab";
    fab.type = "button";
    fab.textContent = "하이라이트 저장";
    fab.style.cssText =
      "display:none;position:fixed;z-index:40;left:50%;transform:translateX(-50%);bottom:88px;background:#0f6b5c;color:#fff;border:0;border-radius:999px;padding:12px 16px;font:600 0.9rem system-ui;box-shadow:0 8px 24px rgba(0,0,0,.18)";
    document.body.appendChild(fab);
  }

  const hideFab = () => {
    fab.style.display = "none";
  };

  const showFab = () => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) {
      hideFab();
      return;
    }
    if (!box.contains(sel.anchorNode)) {
      hideFab();
      return;
    }
    const term = sel.toString().trim().replace(/\s+/g, " ");
    if (term.length < 2 || term.length > 80) {
      hideFab();
      return;
    }
    fab.style.display = "block";
    fab.onclick = () => {
      addHighlight(term);
      sel.removeAllRanges();
      hideFab();
    };
  };

  document.addEventListener("selectionchange", () => {
    const onPassage =
      STATE.tab === "passage" || /^text\d+$/.test(STATE.tab || "");
    if (STATE.view !== "set" || !onPassage) {
      hideFab();
      return;
    }
    setTimeout(showFab, 50);
  });
}

function addHighlight(term) {
  const s = currentSet();
  const list = loadVocab();
  const key = term.toLowerCase();
  if (list.some((v) => v.term.toLowerCase() === key && v.setId === s.id)) {
    toast("이미 단어장에 있습니다");
    return;
  }
  let def = "";
  if (s.vocab?.length) {
    const hit = s.vocab.find(
      (v) =>
        v.term.toLowerCase() === key ||
        key.includes(v.term.toLowerCase()) ||
        v.term.toLowerCase().includes(key)
    );
    if (hit) def = hit.gloss;
  }
  list.push({
    term,
    setId: s.id,
    setTitle: s.title,
    def,
    addedAt: new Date().toLocaleString(),
  });
  saveVocab(list);
  toast(def ? "저장됨 (세트 뜻 있음)" : "저장됨");
}

function bindVocab() {
  $("main").onclick = async (e) => {
    if (e.target.id === "clearVocab") {
      if (confirm("단어장을 모두 지울까요?")) {
        saveVocab([]);
        render();
      }
      return;
    }
    const item = e.target.closest(".vocab-item");
    if (!item) return;
    const list = loadVocab();
    const idx = Number(item.dataset.idx);
    if (e.target.matches("[data-remove]")) {
      list.splice(idx, 1);
      saveVocab(list);
      render();
      return;
    }
    if (e.target.matches("[data-lookup]")) {
      e.target.textContent = "찾는 중…";
      const def = await lookupWord(list[idx].term, list[idx].setId);
      list[idx].def = def || "뜻을 찾지 못했습니다.";
      saveVocab(list);
      render();
    }
  };
}

async function lookupWord(term, setId) {
  const s = STATE.data.sets.find((x) => x.id === setId);
  if (s?.vocab?.length) {
    const key = term.toLowerCase();
    const hit = s.vocab.find(
      (v) =>
        v.term.toLowerCase() === key ||
        key.includes(v.term.toLowerCase()) ||
        v.term.toLowerCase().includes(key)
    );
    if (hit) return hit.gloss;
  }
  const word = term.replace(/[^\w\s'-]/g, "").trim().split(/\s+/)[0];
  if (!word) return "";
  try {
    const res = await fetch(
      `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`
    );
    if (!res.ok) throw new Error("no");
    const data = await res.json();
    const meanings = data?.[0]?.meanings || [];
    const bits = [];
    for (const m of meanings.slice(0, 2)) {
      const def = m.definitions?.[0]?.definition;
      if (def) bits.push(`(${m.partOfSpeech}) ${def}`);
    }
    return bits.join(" · ") || "";
  } catch {
    return "";
  }
}

async function init() {
  $("btnBack").onclick = () => {
    if (STATE.view !== "home") {
      STATE.view = "home";
      render();
    }
  };
  $("btnVocab").onclick = () => {
    STATE.view = "vocab";
    render();
  };

  const DATA_V = "202609252036"; // bump when data/*.json changes (Safari caches aggressively)
  const [cRes, aRes, bRes] = await Promise.all([
    fetch(`data/partC.json?v=${DATA_V}`, { cache: "no-cache" }),
    fetch(`data/partA.json?v=${DATA_V}`, { cache: "no-cache" }),
    fetch(`data/partB.json?v=${DATA_V}`, { cache: "no-cache" }),
  ]);
  const partC = await cRes.json();
  const partA = await aRes.json();
  const partB = await bRes.json();

  const sets = [];
  for (const s of partA.sets || []) sets.push({ ...s, part: "A" });
  for (const s of partB.sets || []) sets.push({ ...s, part: "B" });
  for (const s of partC.sets || []) sets.push({ ...s, part: "C" });

  STATE.data = {
    note: "Unofficial self-study. Part A: 4 texts · Q1–20 (which text / short answer / sentence completion). Part B: 6 extracts (100–170 words) · 3 options. Part C: 2 texts (~700–800 words) · Q7–14 & Q15–22, 4 options. Not affiliated with OET.",
    sets,
  };
  render();
}

init().catch((err) => {
  $("main").innerHTML = `<div class="card"><p class="empty">데이터 로드 실패: ${escapeHtml(
    String(err)
  )}</p></div>`;
});

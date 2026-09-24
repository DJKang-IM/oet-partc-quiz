const STATE = {
  data: null,
  view: "home", // home | set | result | vocab
  setId: null,
  tab: "passage", // passage | questions | review
  answers: {},
  graded: false,
  result: null,
};

const VOCAB_KEY = "oet-partc-vocab-v1";

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

function render() {
  const back = $("btnBack");
  back.hidden = STATE.view === "home";
  const main = $("main");
  if (STATE.view === "home") {
    setTitle("OET Part C");
    main.innerHTML = renderHome();
  } else if (STATE.view === "vocab") {
    setTitle("단어장");
    main.innerHTML = renderVocab();
    bindVocab();
  } else if (STATE.view === "set") {
    const s = currentSet();
    setTitle(s ? `Set ${String(s.setNum).padStart(2, "0")}` : "Set");
    main.innerHTML = renderSet();
    bindSet();
  } else if (STATE.view === "result") {
    setTitle("결과");
    main.innerHTML = renderResult();
    bindResult();
  }
}

function renderHome() {
  const packs = {};
  for (const s of STATE.data.sets) {
    (packs[s.pack] ||= []).push(s);
  }
  let html = `
    <div class="card">
      <h1>Part C Practice</h1>
      <p class="lead">${STATE.data.note}<br/>지문에서 모르는 단어를 드래그/길게 눌러 하이라이트 → 단어장에서 뜻 확인.</p>
    </div>`;
  for (const [pack, sets] of Object.entries(packs)) {
    html += `<h3 style="margin:18px 4px 8px">${pack} pack</h3>`;
    for (const s of sets) {
      html += `
        <button class="set-btn" data-set="${s.id}">
          <span class="pack-label">${pack} · Set ${String(s.setNum).padStart(2, "0")}</span>
          <strong>${escapeHtml(s.title)}</strong>
          <span>${s.questions.length} questions</span>
        </button>`;
    }
  }
  return html;
}

function renderSet() {
  const s = currentSet();
  if (!s) return `<p class="empty">세트를 찾을 수 없습니다.</p>`;
  const tabs = `
    <div class="tabs">
      <button class="tab ${STATE.tab === "passage" ? "active" : ""}" data-tab="passage">지문</button>
      <button class="tab ${STATE.tab === "questions" ? "active" : ""}" data-tab="questions">문제</button>
      ${STATE.graded ? `<button class="tab ${STATE.tab === "review" ? "active" : ""}" data-tab="review">해설</button>` : ""}
    </div>`;

  if (STATE.tab === "passage") {
    return (
      tabs +
      `<p class="hint">모르는 단어/구를 선택한 뒤 뜨는 ‘하이라이트’를 누르세요. (Safari에서 선택 후 팝업)</p>
       <div class="card passage" id="passageBox">${s.paragraphs
         .map((p) => `<p>${linkifyPassage(p, s.id)}</p>`)
         .join("")}</div>
       <div class="actions">
         <button class="btn primary" id="goQuestions">문제로 이동</button>
       </div>`
    );
  }

  if (STATE.tab === "questions") {
    return (
      tabs +
      `<div class="card">${s.questions.map((q) => renderQuestion(q, false)).join("")}</div>
       <div class="actions">
         <button class="btn primary" id="submitBtn">제출 · 채점</button>
       </div>`
    );
  }

  // review
  return (
    tabs +
    `<div class="card">
      <div class="score">${STATE.result.score} / ${STATE.result.total}</div>
      <p class="lead">틀린 문항은 아래에서 해설을 확인하세요.</p>
      ${s.questions.map((q) => renderQuestion(q, true)).join("")}
      ${s.gist?.length ? `<h2 style="margin-top:18px">Gist</h2><ul>${s.gist
        .map((g) => `<li>${escapeHtml(g)}</li>`)
        .join("")}</ul>` : ""}
      ${s.vocab?.length ? `<h2 style="margin-top:18px">세트 용어</h2>${s.vocab
        .map(
          (v) =>
            `<div class="vocab-item"><div class="vocab-term">${escapeHtml(
              v.term
            )}</div><div class="vocab-def">${escapeHtml(v.gloss)}</div></div>`
        )
        .join("")}` : ""}
    </div>
    <div class="actions">
      <button class="btn secondary" id="retryBtn">다시 풀기</button>
      <button class="btn primary" id="homeBtn">목록으로</button>
    </div>`
  );
}

function renderQuestion(q, showResult) {
  const chosen = STATE.answers[q.id];
  let opts = q.options
    .map((o) => {
      let cls = "opt";
      if (!showResult && chosen === o.key) cls += " selected";
      if (showResult) {
        if (o.key === q.answer) cls += " correct";
        else if (chosen === o.key && chosen !== q.answer) cls += " wrong";
      }
      return `<button type="button" class="${cls}" data-q="${q.id}" data-key="${o.key}" ${
        showResult ? "disabled" : ""
      }><strong>${o.key}.</strong> ${escapeHtml(o.text)}</button>`;
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

  return `<div class="q"><div class="q-stem">${q.id}. ${escapeHtml(
    q.stem
  )}</div>${opts}${explain}</div>`;
}

function renderResult() {
  return renderSet();
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
            v.def ? escapeHtml(v.def) : "<span style='color:#5c6b7a'>아직 뜻을 찾지 않음</span>"
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

function escapeHtml(s) {
  return String(s || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function linkifyPassage(text, setId) {
  // Keep plain text; selection API handles highlight. Escape only.
  return escapeHtml(text);
}

function bindHome() {
  $("main").onclick = (e) => {
    const btn = e.target.closest("[data-set]");
    if (!btn) return;
    openSet(btn.dataset.set);
  };
}

function openSet(id) {
  STATE.setId = id;
  STATE.view = "set";
  STATE.tab = "passage";
  STATE.answers = {};
  STATE.graded = false;
  STATE.result = null;
  render();
}

function bindSet() {
  $("main").onclick = async (e) => {
    const tab = e.target.closest("[data-tab]");
    if (tab) {
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
      openSet(STATE.setId);
      STATE.tab = "questions";
      render();
      return;
    }
    if (e.target.id === "homeBtn") {
      STATE.view = "home";
      render();
      bindHome();
      return;
    }
    const opt = e.target.closest(".opt");
    if (opt && !STATE.graded) {
      STATE.answers[Number(opt.dataset.q)] = opt.dataset.key;
      render();
      return;
    }
  };

  setupPassageHighlight();
}

function bindResult() {
  bindSet();
}

function grade() {
  const s = currentSet();
  let score = 0;
  for (const q of s.questions) {
    if (STATE.answers[q.id] === q.answer) score += 1;
  }
  STATE.graded = true;
  STATE.result = { score, total: s.questions.length };
  STATE.tab = "review";
  STATE.view = "set";
  render();
  toast(`채점 완료: ${score}/${s.questions.length}`);
}

function setupPassageHighlight() {
  const box = $("passageBox");
  if (!box) return;

  // Floating action after selection
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
    if (STATE.view !== "set" || STATE.tab !== "passage") {
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
  // Prefer pack gloss if term matches
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
      const term = list[idx].term;
      e.target.textContent = "찾는 중…";
      const def = await lookupWord(term, list[idx].setId);
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
  // Free Dictionary API (English)
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
    if (STATE.view === "set" || STATE.view === "vocab") {
      STATE.view = "home";
      render();
      bindHome();
    }
  };
  $("btnVocab").onclick = () => {
    STATE.view = "vocab";
    render();
  };

  const res = await fetch("data/sets.json");
  STATE.data = await res.json();
  render();
  bindHome();
}

init().catch((err) => {
  $("main").innerHTML = `<div class="card"><p class="empty">데이터 로드 실패: ${escapeHtml(
    String(err)
  )}</p></div>`;
});

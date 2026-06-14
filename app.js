/* ============================================================
   N5 Flashcards — lógica (vanilla JS)
   ============================================================ */

/* ---------- Conjugación de verbos ---------- */
const GODAN = {
  "う": { i: "い", te: "って" },
  "つ": { i: "ち", te: "って" },
  "る": { i: "り", te: "って" },
  "く": { i: "き", te: "いて" },
  "ぐ": { i: "ぎ", te: "いで" },
  "す": { i: "し", te: "して" },
  "ぬ": { i: "に", te: "んで" },
  "ぶ": { i: "び", te: "んで" },
  "む": { i: "み", te: "んで" },
};

function conjugate(v) {
  const { k, r, type } = v;
  if (type === "irregular") {
    if (r === "くる") return { masuK: "来ます", masuR: "きます", teK: "来て", teR: "きて" };
    if (r === "する") return { masuK: "します", masuR: "します", teK: "して", teR: "して" };
    if (r.endsWith("する")) { // compuesto: 勉強する etc.
      const kb = k.slice(0, -2), rb = r.slice(0, -2);
      return { masuK: kb + "します", masuR: rb + "します", teK: kb + "して", teR: rb + "して" };
    }
  }
  if (type === "ichidan") {
    const ks = k.slice(0, -1), rs = r.slice(0, -1);
    return { masuK: ks + "ます", masuR: rs + "ます", teK: ks + "て", teR: rs + "て" };
  }
  // godan
  const ks = k.slice(0, -1), rs = r.slice(0, -1);
  if (v.exc === "iku") // 行く → 行って (excepción)
    return { masuK: ks + "き" + "ます", masuR: rs + "き" + "ます", teK: ks + "って", teR: rs + "って" };
  const g = GODAN[r.slice(-1)];
  return { masuK: ks + g.i + "ます", masuR: rs + g.i + "ます", teK: ks + g.te, teR: rs + g.te };
}

const TYPE_LABEL = { godan: "五段 · godan", ichidan: "一段 · ichidan", irregular: "不規則 · irregular" };

/* ---------- Estado ---------- */
const DECKS = {
  kanji: { data: KANJI, key: "n5-known-kanji" },
  verbs: { data: VERBS, key: "n5-known-verbs" },
};

const state = {
  deck: "kanji",
  order: [],        // índices dentro del data del mazo actual (ya filtrados/ordenados)
  pos: 0,           // posición dentro de order
  flipped: false,
  reviewOnly: false,
};

/* known sets en memoria por mazo, persistidos en localStorage */
const known = {
  kanji: loadKnown("n5-known-kanji"),
  verbs: loadKnown("n5-known-verbs"),
};

function loadKnown(key) {
  try { return new Set(JSON.parse(localStorage.getItem(key) || "[]")); }
  catch { return new Set(); }
}
function saveKnown(deck) {
  try { localStorage.setItem(DECKS[deck].key, JSON.stringify([...known[deck]])); } catch {}
}

/* id estable de una tarjeta = su forma (k) */
function cardId(deck, idx) { return DECKS[deck].data[idx].k; }

/* ---------- Construcción del orden ---------- */
function buildOrder(preserveCurrentId) {
  const { data } = DECKS[state.deck];
  let idxs = data.map((_, i) => i);
  if (state.reviewOnly) idxs = idxs.filter(i => !known[state.deck].has(cardId(state.deck, i)));
  state.order = idxs;
  // intenta mantener la tarjeta visible
  if (preserveCurrentId) {
    const p = state.order.findIndex(i => cardId(state.deck, i) === preserveCurrentId);
    state.pos = p >= 0 ? p : 0;
  } else {
    state.pos = 0;
  }
  if (state.pos >= state.order.length) state.pos = Math.max(0, state.order.length - 1);
}

function shuffleOrder() {
  // Fisher–Yates sobre el orden actual
  const a = state.order;
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  state.pos = 0;
}

/* ---------- Render ---------- */
const $ = sel => document.querySelector(sel);
const stage = $("#stage");

function currentCard() {
  if (!state.order.length) return null;
  return DECKS[state.deck].data[state.order[state.pos]];
}

function isKnown(card) { return card && known[state.deck].has(card.k); }

function render() {
  const card = currentCard();
  const total = DECKS[state.deck].data.length;
  const knownCount = known[state.deck].size;

  // progreso (siempre sobre el mazo completo)
  $("#barFill").style.width = total ? (knownCount / total * 100) + "%" : "0%";
  $("#count").textContent = state.order.length
    ? `${state.pos + 1} / ${state.order.length}  ·  ✓${knownCount}/${total}`
    : `✓${knownCount}/${total}`;

  if (!card) {
    stage.innerHTML = `<div class="empty"><b>済</b>¡Nada por repasar!<br><small>Todas marcadas como aprendidas.</small></div>`;
    $("#btnKnow").classList.remove("on");
    $("#btnReview").classList.remove("on");
    return;
  }

  const el = document.createElement("div");
  el.className = "card" + (state.flipped ? " flipped" : "") + (isKnown(card) ? " known" : "");
  el.innerHTML = state.deck === "kanji" ? kanjiCard(card) : verbCard(card);
  el.addEventListener("click", flip);
  stage.replaceChildren(el);

  $("#btnKnow").classList.toggle("on", isKnown(card));
  $("#btnReview").classList.toggle("on", !isKnown(card));
}

function kanjiCard(c) {
  return `
    <div class="face front">
      <span class="corner l">漢字</span><span class="corner r">N5</span>
      <div class="glyph">${c.k}</div>
      <div class="hint">toca para ver lectura</div>
    </div>
    <div class="face back">
      <span class="corner l">読み</span><span class="corner r">意味</span>
      <div class="stamp">済</div>
      <div class="rows">
        <div class="row"><span class="lab">On'yomi</span><span class="val">${c.on}</span></div>
        <div class="row"><span class="lab">Kun'yomi</span><span class="val">${c.kun}</span></div>
      </div>
      <div style="height:14px"></div>
      <div class="mean">${c.m}</div>
    </div>`;
}

function verbCard(c) {
  const f = conjugate(c);
  return `
    <div class="face front">
      <span class="corner l">動詞</span><span class="corner r">N5</span>
      <div class="glyph" style="font-size:clamp(54px,16vw,96px)">${c.k}</div>
      <div class="hint">toca para conjugar</div>
    </div>
    <div class="face back">
      <span class="corner l">${c.r}</span><span class="corner r">意味</span>
      <div class="stamp">済</div>
      <div class="mean">${c.m}</div>
      <div class="tag">${TYPE_LABEL[c.type]}</div>
      <div style="height:14px"></div>
      <div class="rows">
        <div class="row"><span class="lab">辞書</span><span class="val">${c.k}<span class="kana">${c.r}</span></span></div>
        <div class="row"><span class="lab">ます</span><span class="val">${f.masuK}<span class="kana">${f.masuR}</span></span></div>
        <div class="row"><span class="lab">て</span><span class="val">${f.teK}<span class="kana">${f.teR}</span></span></div>
      </div>
    </div>`;
}

/* ---------- Acciones ---------- */
function flip() { state.flipped = !state.flipped; const el = stage.querySelector(".card"); if (el) el.classList.toggle("flipped", state.flipped); }

function go(delta) {
  if (!state.order.length) return;
  state.pos = (state.pos + delta + state.order.length) % state.order.length;
  state.flipped = false;
  render();
}

function mark(asKnown) {
  const card = currentCard();
  if (!card) return;
  if (asKnown) known[state.deck].add(card.k); else known[state.deck].delete(card.k);
  saveKnown(state.deck);

  // En modo "por repasar", al marcar como sabida la tarjeta sale de la lista
  if (asKnown && state.reviewOnly) {
    const id = (() => {
      const nextIdx = state.order[(state.pos + 1) % state.order.length];
      return nextIdx != null ? cardId(state.deck, nextIdx) : null;
    })();
    buildOrder(id);
    state.flipped = false;
    render();
  } else {
    render();
    // avanza a la siguiente tarjeta: tras el sello si la sé, enseguida si es para repasar
    setTimeout(() => go(1), asKnown ? 420 : 200);
  }
}

function setDeck(deck) {
  if (deck === state.deck) return;
  state.deck = deck;
  state.flipped = false;
  document.querySelectorAll("#deckToggle button").forEach(b => b.classList.toggle("active", b.dataset.deck === deck));
  buildOrder();
  render();
}

function toggleFilter() {
  const card = currentCard();
  state.reviewOnly = !state.reviewOnly;
  $("#filter").classList.toggle("active", state.reviewOnly);
  $("#filter").textContent = state.reviewOnly ? "● Por repasar" : "Por repasar";
  buildOrder(card ? card.k : null);
  state.flipped = false;
  render();
}

/* ---------- Eventos ---------- */
$("#deckToggle").addEventListener("click", e => { const b = e.target.closest("button"); if (b) setDeck(b.dataset.deck); });
$("#prev").addEventListener("click", () => go(-1));
$("#next").addEventListener("click", () => go(1));
$("#btnKnow").addEventListener("click", () => mark(true));
$("#btnReview").addEventListener("click", () => mark(false));
$("#filter").addEventListener("click", toggleFilter);
$("#shuffle").addEventListener("click", () => { shuffleOrder(); state.flipped = false; render(); });

document.addEventListener("keydown", e => {
  if (e.key === " ") { e.preventDefault(); flip(); }
  else if (e.key === "ArrowLeft") go(-1);
  else if (e.key === "ArrowRight") go(1);
  else if (e.key === "k" || e.key === "K") mark(true);
  else if (e.key === "j" || e.key === "J") mark(false);
});

/* swipe horizontal para navegar (móvil) */
let tx = 0, ty = 0;
stage.addEventListener("touchstart", e => { tx = e.touches[0].clientX; ty = e.touches[0].clientY; }, { passive: true });
stage.addEventListener("touchend", e => {
  const dx = e.changedTouches[0].clientX - tx, dy = e.changedTouches[0].clientY - ty;
  if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) go(dx < 0 ? 1 : -1);
}, { passive: true });

/* ---------- Init ---------- */
buildOrder();
render();

/* service worker para uso offline */
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
}

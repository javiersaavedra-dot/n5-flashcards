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
    if (r.endsWith("する")) {
      const kb = k.slice(0, -2), rb = r.slice(0, -2);
      return { masuK: kb + "します", masuR: rb + "します", teK: kb + "して", teR: rb + "して" };
    }
  }
  if (type === "ichidan") {
    const ks = k.slice(0, -1), rs = r.slice(0, -1);
    return { masuK: ks + "ます", masuR: rs + "ます", teK: ks + "て", teR: rs + "て" };
  }
  const ks = k.slice(0, -1), rs = r.slice(0, -1);
  if (v.exc === "iku")
    return { masuK: ks + "きます", masuR: rs + "きます", teK: ks + "って", teR: rs + "って" };
  const g = GODAN[r.slice(-1)];
  return { masuK: ks + g.i + "ます", masuR: rs + g.i + "ます", teK: ks + g.te, teR: rs + g.te };
}

/* ---------- Conjugación de adjetivos ---------- */
function conjugateAdj(a) {
  const { k, r, type } = a;
  if (type === "i") {
    const isIi = a.exc === "ii";
    const ks = isIi ? "よ" : k.slice(0, -1);
    const rs = isIi ? "よ" : r.slice(0, -1);
    return {
      negK: ks + "くない",      negR: rs + "くない",
      pastK: ks + "かった",     pastR: rs + "かった",
      pastNegK: ks + "くなかった", pastNegR: rs + "くなかった",
    };
  }
  return {
    negK: k + "じゃない",      negR: r + "じゃない",
    pastK: k + "だった",       pastR: r + "だった",
    pastNegK: k + "じゃなかった", pastNegR: r + "じゃなかった",
  };
}

const TYPE_LABEL  = { godan: "五段 · godan", ichidan: "一段 · ichidan", irregular: "不規則 · irregular" };
const ADJ_LABEL   = { i: "い形容詞 · adj-い", na: "な形容詞 · adj-な" };

/* ---------- Estado ---------- */
const DECKS = {
  kanji:      { data: KANJI,      key: "n5-known-kanji" },
  verbs:      { data: VERBS,      key: "n5-known-verbs" },
  adjectives: { data: ADJECTIVES, key: "n5-known-adj"   },
};

const state = {
  deck: "kanji",
  order: [],
  pos: 0,
  flipped: false,
  reviewOnly: false,
  reverse: false,       // modo inverso: español → japonés
  streak: 0,
  exam: false,          // modo examen activo
  examChoices: [],      // array de {text, isCorrect}
  examChoicesFor: null, // card.k para el que se generaron las opciones actuales
  examSelected: null,   // índice seleccionado (null = sin responder)
  examScore: { ok: 0, err: 0 }, // por sesión/mazo
};

const known = {
  kanji:      loadKnown("n5-known-kanji"),
  verbs:      loadKnown("n5-known-verbs"),
  adjectives: loadKnown("n5-known-adj"),
};

function loadKnown(key) {
  try { return new Set(JSON.parse(localStorage.getItem(key) || "[]")); }
  catch { return new Set(); }
}
function saveKnown(deck) {
  try { localStorage.setItem(DECKS[deck].key, JSON.stringify([...known[deck]])); } catch {}
}

function cardId(deck, idx) { return DECKS[deck].data[idx].k; }

/* ---------- Sonido (Web Audio API) ---------- */
let _audioCtx = null;
function getAudioCtx() {
  if (!_audioCtx) _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return _audioCtx;
}

function playSound(type) {
  try {
    const ctx = getAudioCtx();
    if (ctx.state === "suspended") ctx.resume();
    const now = ctx.currentTime;
    if (type === "good") {
      // acorde mayor ascendente
      [[523, 0], [659, 0.1], [784, 0.2]].forEach(([freq, t]) => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.connect(g); g.connect(ctx.destination);
        o.frequency.value = freq;
        o.type = "sine";
        g.gain.setValueAtTime(0.22, now + t);
        g.gain.exponentialRampToValueAtTime(0.001, now + t + 0.45);
        o.start(now + t); o.stop(now + t + 0.5);
      });
    } else {
      // buzz descendente
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      o.type = "sawtooth";
      o.frequency.setValueAtTime(220, now);
      o.frequency.linearRampToValueAtTime(140, now + 0.25);
      g.gain.setValueAtTime(0.18, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
      o.start(now); o.stop(now + 0.35);
    }
  } catch(_) {}
}

/* ---------- Modo examen: generación de opciones ---------- */
function generateChoices(card) {
  const data = DECKS[state.deck].data;
  // Texto de pregunta y respuestas depende de si estamos en modo inverso
  // normal:  pregunta = japonés (card.k), opciones = significados (m)
  // reverse: pregunta = español (card.m), opciones = japonés (k)
  const correctText = state.reverse ? card.k : card.m;

  const pool = data.filter(c => c.k !== card.k);
  // Mezclar pool para no siempre tomar los primeros
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }

  // Tomar 3 distractores con texto único
  const distractors = [];
  const seen = new Set([correctText]);
  for (const c of pool) {
    const t = state.reverse ? c.k : c.m;
    if (!seen.has(t)) { seen.add(t); distractors.push(t); }
    if (distractors.length === 3) break;
  }

  const choices = [
    { text: correctText, isCorrect: true },
    ...distractors.map(t => ({ text: t, isCorrect: false })),
  ];
  // Barajar posición de la correcta
  for (let i = choices.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [choices[i], choices[j]] = [choices[j], choices[i]];
  }
  return choices;
}

/* ---------- Construcción del orden ---------- */
function buildOrder(preserveCurrentId, doShuffle) {
  const { data } = DECKS[state.deck];
  let idxs = data.map((_, i) => i);
  if (state.reviewOnly) idxs = idxs.filter(i => !known[state.deck].has(cardId(state.deck, i)));
  if (doShuffle) {
    for (let i = idxs.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [idxs[i], idxs[j]] = [idxs[j], idxs[i]];
    }
  }
  state.order = idxs;
  if (preserveCurrentId) {
    const p = state.order.findIndex(i => cardId(state.deck, i) === preserveCurrentId);
    state.pos = p >= 0 ? p : 0;
  } else {
    state.pos = 0;
  }
  if (state.pos >= state.order.length) state.pos = Math.max(0, state.order.length - 1);
}

function shuffleOrder() {
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

  $("#barFill").style.width = total ? (knownCount / total * 100) + "%" : "0%";
  const pct = total ? Math.round(knownCount / total * 100) : 0;
  $("#count").textContent = state.order.length
    ? `${state.pos + 1} / ${state.order.length}  ·  ✓${knownCount}/${total} (${pct}%)`
    : `✓${knownCount}/${total} (${pct}%)`;

  const remaining = total - knownCount;
  const fb = $("#filter");
  fb.textContent = (state.reviewOnly ? "● Por repasar" : "Por repasar") + ` (${remaining})`;
  fb.classList.toggle("active", state.reviewOnly);

  $("#reverse").classList.toggle("active", state.reverse);
  $("#examToggle").classList.toggle("active", state.exam);

  // marcador de examen
  const examScoreEl = $("#examScore");
  if (state.exam) {
    const { ok, err } = state.examScore;
    const total = ok + err;
    const pct = total ? Math.round(ok / total * 100) : 0;
    $("#esOk").textContent = `${ok} ✓`;
    $("#esErr").textContent = `${err} ✗`;
    $("#esPct").textContent = `(${pct}%)`;
    examScoreEl.classList.add("visible");
  } else {
    examScoreEl.classList.remove("visible");
  }

  // alternar judge vs choices
  const judgeRow = $("#judgeRow");
  const choicesRow = $("#choicesRow");
  if (state.exam && card) {
    judgeRow.style.display = "none";
    choicesRow.classList.add("visible");
    // Generar opciones solo cuando cambia la tarjeta
    if (state.examChoicesFor !== card.k) {
      state.examChoicesFor = card.k;
      state.examChoices = generateChoices(card);
      state.examSelected = null;
    }
    renderChoices();
  } else {
    judgeRow.style.display = "";
    choicesRow.classList.remove("visible");
  }

  // racha
  const streakEl = $("#streak");
  const streakNum = $("#streakNum");
  streakNum.textContent = state.streak;
  streakEl.classList.toggle("visible", state.streak >= 3);

  if (!card) {
    stage.innerHTML = `<div class="empty"><b>済</b>¡Nada por repasar!<br><small>Todas marcadas como aprendidas.</small></div>`;
    $("#btnKnow").classList.remove("on");
    $("#btnReview").classList.remove("on");
    return;
  }

  const el = document.createElement("div");
  el.className = "card" + (state.flipped ? " flipped" : "") + (isKnown(card) ? " known" : "");

  if (state.deck === "kanji")      el.innerHTML = kanjiCard(card);
  else if (state.deck === "verbs") el.innerHTML = verbCard(card);
  else                              el.innerHTML = adjCard(card);

  el.addEventListener("click", flip);
  stage.replaceChildren(el);

  $("#btnKnow").classList.toggle("on", isKnown(card));
  $("#btnReview").classList.toggle("on", !isKnown(card));
}

/* ---------- Plantillas de tarjeta ---------- */
function kanjiCard(c) {
  if (state.reverse) {
    return `
      <div class="face front">
        <span class="corner l">意味</span><span class="corner r">N5</span>
        <div class="meaning-front">${c.m}</div>
        <div class="sub-front">¿Cómo se escribe?</div>
        <div class="hint">toca para ver</div>
      </div>
      <div class="face back">
        <span class="corner l">漢字</span><span class="corner r">読み</span>
        <div class="stamp">済</div>
        <div class="glyph">${c.k}</div>
        <div class="rows" style="margin-top:10px">
          <div class="row"><span class="lab">On'yomi</span><span class="val">${c.on}</span></div>
          <div class="row"><span class="lab">Kun'yomi</span><span class="val">${c.kun}</span></div>
        </div>
      </div>`;
  }
  return `
    <div class="face front">
      <span class="corner l">漢字</span><span class="corner r">N5</span>
      <div class="glyph">${c.k}</div>
      <div class="hint">${state.exam ? "elige una opción" : "toca para ver lectura"}</div>
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
  if (state.reverse) {
    return `
      <div class="face front">
        <span class="corner l">意味</span><span class="corner r">動詞</span>
        <div class="meaning-front">${c.m}</div>
        <div class="sub-front">¿Cómo se dice en japonés?</div>
        <div class="hint">toca para conjugar</div>
      </div>
      <div class="face back">
        <span class="corner l">${c.r}</span><span class="corner r">意味</span>
        <div class="stamp">済</div>
        <div class="mean">${c.m}</div>
        <div class="tag">${TYPE_LABEL[c.type]}</div>
        <div style="height:10px"></div>
        <div class="rows">
          <div class="row"><span class="lab">辞書</span><span class="val">${c.k}<span class="kana">${c.r}</span></span></div>
          <div class="row"><span class="lab">ます</span><span class="val">${f.masuK}<span class="kana">${f.masuR}</span></span></div>
          <div class="row"><span class="lab">て</span><span class="val">${f.teK}<span class="kana">${f.teR}</span></span></div>
        </div>
      </div>`;
  }
  return `
    <div class="face front">
      <span class="corner l">動詞</span><span class="corner r">N5</span>
      <div class="glyph" style="font-size:clamp(54px,16vw,96px)">${c.k}</div>
      ${c.k !== c.r ? `<div class="reading-front">${c.r}</div>` : ""}
      <div class="hint">${state.exam ? "elige una opción" : "toca para conjugar"}</div>
    </div>
    <div class="face back">
      <span class="corner l">${c.r}</span><span class="corner r">意味</span>
      <div class="stamp">済</div>
      <div class="mean">${c.m}</div>
      <div class="tag">${TYPE_LABEL[c.type]}</div>
      <div style="height:10px"></div>
      <div class="rows">
        <div class="row"><span class="lab">辞書</span><span class="val">${c.k}<span class="kana">${c.r}</span></span></div>
        <div class="row"><span class="lab">ます</span><span class="val">${f.masuK}<span class="kana">${f.masuR}</span></span></div>
        <div class="row"><span class="lab">て</span><span class="val">${f.teK}<span class="kana">${f.teR}</span></span></div>
      </div>
    </div>`;
}

function adjCard(c) {
  const f = conjugateAdj(c);
  const tagClass = c.type === "i" ? "i-tag" : "na-tag";
  if (state.reverse) {
    return `
      <div class="face front">
        <span class="corner l">意味</span><span class="corner r">形容詞</span>
        <div class="meaning-front">${c.m}</div>
        <div class="sub-front">¿Cómo se dice en japonés?</div>
        <div class="hint">toca para ver</div>
      </div>
      <div class="face back">
        <span class="corner l">${c.r}</span><span class="corner r">意味</span>
        <div class="stamp">済</div>
        <div class="mean">${c.m}</div>
        <div class="tag ${tagClass}">${ADJ_LABEL[c.type]}</div>
        <div style="height:10px"></div>
        <div class="rows">
          <div class="row"><span class="lab">形</span><span class="val">${c.k}<span class="kana">${c.k !== c.r ? c.r : ""}</span></span></div>
          <div class="row"><span class="lab">否定</span><span class="val">${f.negK}<span class="kana">${f.negK !== f.negR ? f.negR : ""}</span></span></div>
          <div class="row"><span class="lab">過去</span><span class="val">${f.pastK}<span class="kana">${f.pastK !== f.pastR ? f.pastR : ""}</span></span></div>
        </div>
      </div>`;
  }
  return `
    <div class="face front">
      <span class="corner l">形容詞</span><span class="corner r">N5</span>
      <div class="glyph" style="font-size:clamp(50px,15vw,90px)">${c.k}</div>
      ${c.k !== c.r ? `<div class="reading-front">${c.r}</div>` : ""}
      <div class="hint">${state.exam ? "elige una opción" : "toca para ver significado"}</div>
    </div>
    <div class="face back">
      <span class="corner l">${c.r}</span><span class="corner r">意味</span>
      <div class="stamp">済</div>
      <div class="mean">${c.m}</div>
      <div class="tag ${tagClass}">${ADJ_LABEL[c.type]}</div>
      <div style="height:10px"></div>
      <div class="rows">
        <div class="row"><span class="lab">否定</span><span class="val">${f.negK}<span class="kana">${f.negK !== f.negR ? f.negR : ""}</span></span></div>
        <div class="row"><span class="lab">過去</span><span class="val">${f.pastK}<span class="kana">${f.pastK !== f.pastR ? f.pastR : ""}</span></span></div>
        <div class="row"><span class="lab">過去否定</span><span class="val">${f.pastNegK}<span class="kana">${f.pastNegK !== f.pastNegR ? f.pastNegR : ""}</span></span></div>
      </div>
    </div>`;
}

/* ---------- Opciones del examen ---------- */
function renderChoices() {
  const row = $("#choicesRow");
  row.innerHTML = "";
  state.examChoices.forEach((choice, idx) => {
    const btn = document.createElement("button");
    btn.className = "choice-btn";
    btn.textContent = choice.text;

    if (state.examSelected !== null) {
      btn.disabled = true;
      if (choice.isCorrect)           btn.classList.add("reveal");
      else if (idx === state.examSelected) btn.classList.add("wrong");
    }

    btn.addEventListener("click", () => selectChoice(idx));
    row.appendChild(btn);
  });
}

function selectChoice(idx) {
  if (state.examSelected !== null) return; // ya respondió
  state.examSelected = idx;
  const isCorrect = state.examChoices[idx].isCorrect;

  if (isCorrect) {
    state.examScore.ok++;
    state.streak++;
    known[state.deck].add(currentCard().k);
    saveKnown(state.deck);
    playSound("good");
    checkSuccess();
  } else {
    state.examScore.err++;
    state.streak = 0;
    known[state.deck].delete(currentCard().k);
    saveKnown(state.deck);
    playSound("bad");
  }

  // Actualizar marcador y botones sin regenerar opciones
  const { ok, err } = state.examScore;
  const total = ok + err;
  $("#esOk").textContent  = `${ok} ✓`;
  $("#esErr").textContent = `${err} ✗`;
  $("#esPct").textContent = `(${total ? Math.round(ok/total*100) : 0}%)`;
  const pct = DECKS[state.deck].data.length ? Math.round(known[state.deck].size / DECKS[state.deck].data.length * 100) : 0;
  const knownCount = known[state.deck].size;
  const total2 = DECKS[state.deck].data.length;
  $("#barFill").style.width = total2 ? (knownCount / total2 * 100) + "%" : "0%";
  $("#count").textContent = `${state.pos + 1} / ${state.order.length}  ·  ✓${knownCount}/${total2} (${pct}%)`;
  const streakEl = $("#streak");
  $("#streakNum").textContent = state.streak;
  streakEl.classList.toggle("visible", state.streak >= 3);
  renderChoices();

  // Avanzar automáticamente
  const delay = isCorrect ? 900 : 1500;
  setTimeout(() => { state.examChoicesFor = null; go(1); }, delay);
}

/* ---------- Animación de éxito ---------- */
function checkSuccess() {
  const total = DECKS[state.deck].data.length;
  if (total > 0 && known[state.deck].size === total) {
    showSuccess();
  }
}

function showSuccess() {
  const overlay = document.getElementById("successOverlay");
  const wrap = document.getElementById("confettiWrap");
  const sub = document.getElementById("successSub");
  const total = DECKS[state.deck].data.length;
  sub.textContent = `¡Aprendiste las ${total} tarjetas del mazo!`;
  wrap.innerHTML = "";

  const colors = ["#b3331f","#9a7b3f","#3f6b4d","#4a7ab3","#8b4da3","#c47a2a"];
  for (let i = 0; i < 70; i++) {
    const p = document.createElement("div");
    p.className = "cp";
    const size = 6 + Math.random() * 9;
    p.style.cssText = `
      left:${Math.random()*100}%;
      width:${size}px; height:${size}px;
      background:${colors[Math.floor(Math.random()*colors.length)]};
      border-radius:${Math.random() > .5 ? "50%" : "2px"};
      animation-delay:${Math.random()*1.5}s;
      animation-duration:${2.5 + Math.random()*2}s;
    `;
    wrap.appendChild(p);
  }

  overlay.classList.add("visible");
  playSound("good");
  setTimeout(() => playSound("good"), 300);
}

function hideSuccess() {
  document.getElementById("successOverlay").classList.remove("visible");
}

/* ---------- Acciones ---------- */
function flip() {
  if (state.exam) return; // en examen la respuesta la dan los botones
  state.flipped = !state.flipped;
  const el = stage.querySelector(".card");
  if (el) el.classList.toggle("flipped", state.flipped);
}

function go(delta) {
  if (!state.order.length) return;
  state.pos = (state.pos + delta + state.order.length) % state.order.length;
  state.flipped = false;
  render();
}

function mark(asKnown) {
  const card = currentCard();
  if (!card) return;

  if (asKnown) {
    known[state.deck].add(card.k);
    state.streak++;
  } else {
    known[state.deck].delete(card.k);
    state.streak = 0;
  }
  saveKnown(state.deck);
  playSound(asKnown ? "good" : "bad");

  if (asKnown) checkSuccess();

  if (asKnown && state.reviewOnly) {
    const nextId = (() => {
      const nextIdx = state.order[(state.pos + 1) % state.order.length];
      return nextIdx != null ? cardId(state.deck, nextIdx) : null;
    })();
    buildOrder(nextId, false);
    state.flipped = false;
    render();
  } else {
    render();
    setTimeout(() => go(1), asKnown ? 420 : 200);
  }
}

function setDeck(deck) {
  if (deck === state.deck) return;
  state.deck = deck;
  state.flipped = false;
  state.streak = 0;
  state.examChoicesFor = null;
  state.examSelected = null;
  if (state.exam) state.examScore = { ok: 0, err: 0 };
  document.querySelectorAll("#deckToggle button").forEach(b => b.classList.toggle("active", b.dataset.deck === deck));
  buildOrder(null, true);
  render();
}

function toggleFilter() {
  const card = currentCard();
  state.reviewOnly = !state.reviewOnly;
  // No reorganizar aleatoriamente: solo reconstruir con el mismo orden para que el contador sea estable
  buildOrder(card ? card.k : null, false);
  state.flipped = false;
  render();
}

function toggleReverse() {
  state.reverse = !state.reverse;
  state.flipped = false;
  state.examChoicesFor = null; // regenerar opciones al cambiar dirección
  render();
}

function toggleExam() {
  state.exam = !state.exam;
  state.examChoicesFor = null;
  state.examSelected = null;
  if (state.exam) state.examScore = { ok: 0, err: 0 };
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
$("#reverse").addEventListener("click", toggleReverse);
$("#examToggle").addEventListener("click", toggleExam);
$("#successBtn").addEventListener("click", hideSuccess);

document.addEventListener("keydown", e => {
  if (e.key === "Escape") { hideSuccess(); return; }
  if (state.exam) return; // en examen solo se responde con el mouse/tap
  if (e.key === " ") { e.preventDefault(); flip(); }
  else if (e.key === "ArrowLeft") go(-1);
  else if (e.key === "ArrowRight") go(1);
  else if (e.key === "k" || e.key === "K") mark(true);
  else if (e.key === "j" || e.key === "J") mark(false);
  else if (e.key === "i" || e.key === "I") toggleReverse();
});

/* swipe horizontal */
let tx = 0, ty = 0;
stage.addEventListener("touchstart", e => { tx = e.touches[0].clientX; ty = e.touches[0].clientY; }, { passive: true });
stage.addEventListener("touchend", e => {
  const dx = e.changedTouches[0].clientX - tx, dy = e.changedTouches[0].clientY - ty;
  if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) go(dx < 0 ? 1 : -1);
}, { passive: true });

/* ---------- Init ---------- */
buildOrder(null, true);
render();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
}

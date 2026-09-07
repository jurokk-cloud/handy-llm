import { prebuiltAppConfig, CreateWebWorkerMLCEngine, hasModelInCache } from "./vendor/web-llm.js";

const $ = (id) => document.getElementById(id);
const on = (node, ev, fn) => node && node.addEventListener(ev, fn);

/* ═══════════════════════ Texte ═══════════════════════
   Alles, was erklärt wird, steht hier an einer Stelle -
   damit die Erklärungen zusammenpassen und pflegbar bleiben. */

const TIPS = {
  route: ["Wer soll rechnen?", `
    <p><b>Automatisch</b> ist für fast alle richtig: Läuft dein PC, übernimmt er
    die Arbeit. Ist er aus, rechnet dein Handy weiter.</p>
    <p>Du merkst den Wechsel nur daran, dass die Antworten schneller und besser
    werden. Umschalten musst du nie.</p>`],

  phone: ["Dein Handy als Rechner", `
    <p>Die KI läuft komplett <b>auf deinem Gerät</b>. Kein Server, kein Konto,
    keine Internetverbindung nötig — auch im Flugzeug oder Keller.</p>
    <p>Dafür ist ein Telefon nun mal klein: Die Antworten kommen langsamer und
    sind einfacher als bei den großen Diensten. Für Fragen, Ideen und Texte
    reicht das trotzdem gut.</p>`],

  model: ["Was ist ein Modell?", `
    <p>Das Modell ist das <b>Gehirn</b> der KI — eine große Datei, die einmal
    heruntergeladen wird und danach auf dem Handy bleibt.</p>
    <p><b>Größer = klüger, aber langsamer</b> und mehr Speicherbedarf. Die
    Angabe in GB zeigt, wie viel Arbeitsspeicher es braucht.</p>
    <p>Fang klein an. Wenn Antworten abbrechen oder die App abstürzt, nimm das
    nächstkleinere.</p>`],

  pc: ["Dein PC als Turbo", `
    <p>Auf deinem Rechner passen viel größere Modelle — die Antworten werden
    spürbar besser und schneller.</p>
    <p>Du brauchst dafür <b>Ollama</b> auf dem PC (kostenlos). Die genaue
    Anleitung liegt im Projekt unter <code>pc/</code>.</p>
    <p>Der PC muss nicht immer laufen. Ist er aus, merkt die App das und
    rechnet einfach auf dem Handy weiter.</p>`],

  pcurl: ["Welche Adresse?", `
    <p>Die Adresse, unter der dein PC erreichbar ist. Das Startskript auf dem PC
    zeigt sie dir an.</p>
    <p><b>Wichtig:</b> Sie muss mit <code>https://</code> beginnen. Eine Adresse
    wie <code>http://192.168.1.50</code> blockiert dein Browser aus
    Sicherheitsgründen — das lässt sich nicht umgehen.</p>
    <p>Deshalb empfiehlt die Anleitung <b>Tailscale</b>: Das macht aus deinem
    PC eine echte <code>https</code>-Adresse, gratis und nur für deine eigenen
    Geräte sichtbar.</p>`],

  system: ["So soll die KI antworten", `
    <p>Eine Dauer-Anweisung, die bei jeder Frage automatisch mitgeschickt wird.
    Du musst sie nicht jedes Mal wiederholen.</p>
    <p>Beispiele: <i>„Antworte immer auf Deutsch."</i> · <i>„Fasse dich kurz,
    maximal drei Sätze."</i> · <i>„Erkläre wie für ein Kind."</i></p>`],

  webgpu: ["Warum geht das nicht?", `
    <p>Damit die KI auf dem Handy rechnen kann, braucht der Browser
    <b>WebGPU</b> — den Zugriff auf den Grafikchip.</p>
    <p><b>Android:</b> Chrome benutzen (Version 121 oder neuer).<br>
    <b>iPhone:</b> Safari ab iOS 26.<br>
    Firefox auf Android kann es noch nicht.</p>
    <p>Der PC-Modus funktioniert auch ohne WebGPU.</p>`],

  status_phone: ["Dein Handy rechnet", `
    <p>Die Antworten entstehen gerade <b>auf diesem Gerät</b>. Nichts wird
    verschickt, alles bleibt hier.</p>
    <p>Wenn du deinen PC einrichtest, übernimmt der automatisch, sobald er
    läuft — und die Antworten werden besser.</p>`],

  status_pc: ["Dein PC rechnet", `
    <p>Die App hat deinen PC gefunden und nutzt ihn. Das Handy schont dabei
    seinen Akku.</p>
    <p>Schaltest du den PC aus, wechselt die App von selbst zurück aufs
    Handy — mitten im Gespräch, ohne dass du etwas tust.</p>`],

  status_none: ["Noch kein Modell geladen", `
    <p>Damit dein Handy rechnen kann, muss das Modell einmal heruntergeladen
    werden — etwa 1 GB, danach nie wieder.</p>
    <p>Tippe auf das Zahnrad oben rechts und dann auf
    <b>„Modell herunterladen“</b>. Am besten im WLAN.</p>`],
};

const FAQ = [
  ["Kostet das etwas?",
   `<p>Nein. Die App läuft auf deinem eigenen Gerät, es gibt keinen Anbieter,
    der etwas abrechnen könnte. Kein Abo, kein Konto, keine Anmeldung.</p>`],

  ["Sieht jemand meine Fragen?",
   `<p>Nein. Im Handy-Modus verlässt kein Wort dein Gerät. Im PC-Modus gehen die
    Fragen an deinen eigenen Rechner — auch das bleibt bei dir zu Hause.</p>
    <p>Einmalig geladen wird nur das Modell selbst. Danach ist die App offline
    nutzbar.</p>`],

  ["Warum antwortet mein Handy so langsam?",
   `<p>Weil ein Telefon kein Rechenzentrum ist. Ein paar Wörter pro Sekunde sind
    normal.</p>
    <p>Schneller wird es mit einem kleineren Modell (Zahnrad → Modell) oder mit
    deinem PC als Turbo.</p>`],

  ["Wie viel Speicher braucht das?",
   `<p>So viel wie das gewählte Modell — meist 0,5 bis 2 GB. Das Modell liegt
    danach dauerhaft im Browser-Speicher.</p>
    <p>Löschen kannst du es über die Browsereinstellungen deines Handys
    („Websitedaten löschen").</p>`],

  ["Antworten brechen ab oder die App stürzt ab",
   `<p>Dann ist das Modell zu groß für dein Gerät. Zahnrad → Modell → das
    nächstkleinere wählen und neu laden.</p>`],

  ["Kann die KI ins Internet?",
   `<p>Nein. Sie kennt nur, was sie beim Training gelernt hat — aktuelle
    Nachrichten, Wetter oder deine Termine kann sie nicht wissen.</p>
    <p>Bei Fakten also lieber gegenprüfen. Für Ideen, Texte und Erklärungen ist
    sie gut.</p>`],

  ["Wie hänge ich meinen PC an?",
   `<p>Auf dem PC <b>Ollama</b> installieren und das Startskript aus dem Projekt
    ausführen (Ordner <code>pc/</code>). Es zeigt dir eine Adresse an.</p>
    <p>Die trägst du hier unter Zahnrad → Dein PC ein und tippst auf
    „Verbindung testen".</p>`],
];

const STARTERS = [
  "Erklär mir Zinseszins",
  "Schreib eine kurze Absage",
  "3 Ideen fürs Abendessen",
  "Was ist ein Hash?",
];

/* ═══════════════════════ Einstellungen ═══════════════════════ */

const DEFAULT_MODEL = "Llama-3.2-1B-Instruct-q4f16_1-MLC";
const CFG_KEY = "handy-llm.cfg";
const LOG_KEY = "handy-llm.log";
const SEEN_KEY = "handy-llm.seen";

const defaults = {
  route: "auto",
  pcUrl: "",
  pcModel: "",
  phoneModel: DEFAULT_MODEL,
  allModels: false,
  system: "Antworte kurz, klar und auf Deutsch.",
};

function load(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? { ...fallback, ...JSON.parse(raw) } : structuredClone(fallback);
  } catch { return structuredClone(fallback); }
}
function save(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* privater Modus */ }
}

const cfg = load(CFG_KEY, defaults);
let history = (() => {
  try { return JSON.parse(localStorage.getItem(LOG_KEY)) || []; } catch { return []; }
})();
const saveHistory = () => save(LOG_KEY, history.slice(-40));

/* ═══════════════════════ Modell-Katalog ═══════════════════════ */

const PHONE_PICKS = [
  "SmolLM2-360M-Instruct-q4f16_1-MLC",
  "Qwen3-0.6B-q4f16_1-MLC",
  "Qwen3.5-0.8B-q4f16_1-MLC",
  "Llama-3.2-1B-Instruct-q4f16_1-MLC",
  "Qwen2.5-1.5B-Instruct-q4f16_1-MLC",
  "SmolLM2-1.7B-Instruct-q4f16_1-MLC",
  "Qwen3-1.7B-q4f16_1-MLC",
  "Qwen3.5-2B-q4f16_1-MLC",
  "Llama-3.2-3B-Instruct-q4f16_1-MLC",
];

const catalog = prebuiltAppConfig.model_list.filter((m) => m.model_type !== 2);
const byId = new Map(catalog.map((m) => [m.model_id, m]));
const bySize = (a, b) => (a.vram_required_MB || 0) - (b.vram_required_MB || 0);
const gb = (mb) => (mb ? (mb / 1024).toFixed(1).replace(".", ",") + " GB" : "?");

// "Llama-3.2-1B-Instruct-q4f16_1-MLC" -> "Llama 3.2 1B"
function prettyName(id) {
  return id.replace(/-q4f(16|32)_1-MLC(-1k)?$/, "")
           .replace(/-Instruct$/, "")
           .replace(/-/g, " ");
}

const phoneOptions = () =>
  (cfg.allModels ? [...catalog] : PHONE_PICKS.filter((i) => byId.has(i)).map((i) => byId.get(i)))
    .sort(bySize);

/* ═══════════════════════ PC-Verbindung ═══════════════════════ */

const pc = { online: false, models: [], error: "" };
const trimUrl = (u) => (u || "").trim().replace(/\/+$/, "");

function mixedContent(url = cfg.pcUrl) {
  const u = trimUrl(url);
  return location.protocol === "https:" && u.startsWith("http://")
      && !/^https?:\/\/(localhost|127\.0\.0\.1)/.test(u);
}

async function probePC({ url = cfg.pcUrl } = {}) {
  const base = trimUrl(url);
  if (!base) { pc.online = false; pc.error = ""; return false; }
  if (mixedContent(base)) {
    pc.online = false;
    pc.error = "Die Adresse muss mit https:// beginnen";
    return false;
  }
  try {
    const res = await fetch(base + "/v1/models", { signal: AbortSignal.timeout(4000) });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    pc.models = (data.data || []).map((m) => m.id).sort();
    pc.online = true;
    pc.error = "";
    if (!cfg.pcModel || !pc.models.includes(cfg.pcModel)) cfg.pcModel = pc.models[0] || "";
    return true;
  } catch (err) {
    pc.online = false;
    pc.error = err.name === "TimeoutError"
      ? "Keine Antwort — läuft der PC gerade?"
      : "Nicht erreichbar";
    return false;
  }
}

async function* streamFromPC(messages, signal) {
  const res = await fetch(trimUrl(cfg.pcUrl) + "/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: cfg.pcModel, messages, stream: true, temperature: 0.7 }),
    signal,
  });
  if (!res.ok || !res.body) throw new Error("Der PC antwortet mit Fehler " + res.status);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop();
    for (const line of lines) {
      const t = line.trim();
      if (!t.startsWith("data:")) continue;
      const payload = t.slice(5).trim();
      if (payload === "[DONE]") return;
      try {
        const delta = JSON.parse(payload).choices?.[0]?.delta?.content;
        if (delta) yield delta;
      } catch { /* Keepalive */ }
    }
  }
}

/* ═══════════════════════ Handy-Motor ═══════════════════════ */

const phone = { engine: null, loaded: null, busy: false };
const noWebGPU = () => !navigator.gpu;

let dlStart = 0;
function showLoad(frac, note) {
  const bar = $("loadbar");
  bar.hidden = false;
  const pct = Math.round((frac || 0) * 100);
  $("loadbar-pct").textContent = pct + " %";
  $("loadbar-fill").style.width = pct + "%";

  // Restzeit erst schätzen, wenn genug Fortschritt für eine sinnvolle Zahl da ist
  let sub = note || "Das passiert nur dieses eine Mal.";
  if (!note && frac > 0.04 && dlStart) {
    const elapsed = (Date.now() - dlStart) / 1000;
    const left = Math.round(elapsed / frac - elapsed);
    if (left > 3 && left < 3600) {
      sub = left > 90 ? `noch etwa ${Math.ceil(left / 60)} Minuten`
                      : `noch etwa ${Math.max(5, Math.round(left / 5) * 5)} Sekunden`;
    }
  }
  $("loadbar-sub").textContent = sub;
}
const hideLoad = () => { $("loadbar").hidden = true; dlStart = 0; };

async function ensureEngine(modelId) {
  if (phone.engine && phone.loaded === modelId) return phone.engine;
  if (phone.busy) throw new Error("Das Modell lädt gerade schon.");
  if (noWebGPU()) { const e = new Error("WEBGPU"); e.code = "WEBGPU"; throw e; }

  phone.busy = true;
  dlStart = Date.now();
  $("loadbar-title").textContent = "Modell wird geladen";
  try {
    const cached = await hasModelInCache(modelId).catch(() => false);
    if (cached) $("loadbar-title").textContent = "Modell wird gestartet";
    showLoad(0, cached ? "Schon gespeichert — geht gleich." : "Das passiert nur dieses eine Mal.");

    const onProgress = (r) => showLoad(r.progress, cached ? "Gleich fertig…" : undefined);
    if (!phone.engine) {
      const worker = new Worker(new URL("./worker.js", import.meta.url), { type: "module" });
      phone.engine = await CreateWebWorkerMLCEngine(worker, modelId, { initProgressCallback: onProgress });
    } else {
      await phone.engine.reload(modelId);
    }
    phone.loaded = modelId;
    return phone.engine;
  } finally {
    phone.busy = false;
    hideLoad();
    paintStatus();
  }
}

async function* streamFromPhone(messages, signal) {
  const engine = await ensureEngine(cfg.phoneModel);
  signal.addEventListener("abort", () => engine.interruptGenerate(), { once: true });
  const chunks = await engine.chat.completions.create({ messages, stream: true, temperature: 0.7 });
  for await (const chunk of chunks) {
    const delta = chunk.choices?.[0]?.delta?.content;
    if (delta) yield delta;
  }
}

/* ═══════════════════════ Fehler in Klartext ═══════════════════════ */

function explainError(err, where) {
  const msg = String(err?.message || err);
  if (err?.code === "WEBGPU" || /webgpu/i.test(msg)) {
    return { title: "Dein Browser kann das nicht",
             text: "Für den Handy-Modus braucht es WebGPU.",
             tip: "webgpu" };
  }
  if (/failed to fetch|networkerror|load failed/i.test(msg)) {
    return where === "pc"
      ? { title: "PC nicht erreichbar",
          text: "Läuft der Rechner noch? Und bist du im selben Netz?",
          action: ["Verbindung prüfen", () => openSettings()] }
      : { title: "Download unterbrochen",
          text: "Das Modell muss beim ersten Mal geladen werden — dafür fehlt gerade die Verbindung.",
          action: ["Nochmal versuchen", () => startDownload()] };
  }
  if (/quota|storage|space/i.test(msg)) {
    return { title: "Zu wenig Speicher",
             text: "Auf dem Gerät ist kein Platz mehr für dieses Modell.",
             action: ["Kleineres Modell wählen", () => openSettings()] };
  }
  if (/out of memory|oom|device lost/i.test(msg)) {
    return { title: "Modell zu groß fürs Gerät",
             text: "Dem Handy ist der Arbeitsspeicher ausgegangen.",
             action: ["Kleineres Modell wählen", () => openSettings()] };
  }
  return { title: "Da ist etwas schiefgegangen", text: msg };
}

/* ═══════════════════════ Status ═══════════════════════ */

const routeTarget = () =>
  cfg.route === "pc" ? "pc" : cfg.route === "phone" ? "phone" : (pc.online ? "pc" : "phone");

let modelReady = false;   // liegt das Handy-Modell im Speicher?

function paintStatus() {
  const box = $("status"), title = $("status-title"), sub = $("status-sub");
  const target = routeTarget();
  box.classList.remove("is-phone", "is-pc", "is-bad");

  if (target === "pc" && pc.online) {
    box.classList.add("is-pc");
    title.textContent = "PC rechnet";
    sub.textContent = cfg.pcModel || "verbunden";
    box.dataset.tip = "status_pc";
  } else if (target === "pc") {
    box.classList.add("is-bad");
    title.textContent = "PC ist aus";
    sub.textContent = cfg.route === "pc" ? "auf Automatisch stellen?" : (pc.error || "");
    box.dataset.tip = "status_none";
  } else if (noWebGPU()) {
    box.classList.add("is-bad");
    title.textContent = "Handy kann nicht rechnen";
    sub.textContent = "Browser ohne WebGPU";
    box.dataset.tip = "webgpu";
  } else if (!modelReady && !phone.loaded) {
    box.classList.add("is-bad");
    title.textContent = "Kein Modell geladen";
    sub.textContent = "Einmal herunterladen";
    box.dataset.tip = "status_none";
  } else {
    box.classList.add("is-phone");
    title.textContent = "Handy rechnet";
    sub.textContent = prettyName(cfg.phoneModel) + (cfg.pcUrl && cfg.route === "auto" ? " · PC aus" : "");
    box.dataset.tip = "status_phone";
  }
  paintBanner();
}

function paintBanner() {
  const b = $("banner");
  let html = "";

  if (!window.isSecureContext) {
    html = `<b>Unsichere Verbindung</b>Diese Seite läuft ohne <code>https</code>.
            Der Browser gibt den Grafikchip dann nicht frei — der Handy-Modus bleibt aus.`;
  } else if (noWebGPU()) {
    html = `<b>Handy-Modus nicht möglich</b>Dieser Browser unterstützt kein WebGPU.
            <button class="btn" data-tip-btn="webgpu">Was heißt das?</button>`;
  } else if (mixedContent()) {
    html = `<b>PC-Adresse funktioniert so nicht</b>Sie beginnt mit <code>http://</code>,
            das blockiert der Browser.
            <button class="btn" data-tip-btn="pcurl">Wie mache ich das richtig?</button>`;
  } else if (!modelReady && !phone.loaded && !phone.busy && !pc.online) {
    html = `<b>Noch kein Modell auf dem Handy</b>Einmal laden — danach läuft alles offline.
            <button class="btn" id="banner-dl">Jetzt herunterladen</button>`;
  }

  b.innerHTML = html;
  b.hidden = !html;
  const dl = $("banner-dl");
  if (dl) on(dl, "click", startDownload);
}

/* ═══════════════════════ Chat ═══════════════════════ */

function bubble(kind, text = "") {
  $("welcome").hidden = true;
  const div = document.createElement("div");
  div.className = "msg msg-" + kind;
  div.textContent = text;
  $("chat").appendChild(div);
  toBottom();
  return div;
}

function errorBubble(info) {
  $("welcome").hidden = true;
  const div = document.createElement("div");
  div.className = "msg msg-err";
  div.innerHTML = `<b></b><span></span>`;
  div.querySelector("b").textContent = info.title;
  div.querySelector("span").textContent = info.text;
  if (info.tip) {
    const btn = Object.assign(document.createElement("button"),
      { className: "btn", textContent: "Mehr dazu" });
    on(btn, "click", () => showTip(info.tip));
    div.appendChild(btn);
  }
  if (info.action) {
    const btn = Object.assign(document.createElement("button"),
      { className: "btn", textContent: info.action[0] });
    on(btn, "click", info.action[1]);
    div.appendChild(btn);
  }
  $("chat").appendChild(div);
  toBottom();
  return div;
}

const toBottom = () => { const c = $("chat"); c.scrollTop = c.scrollHeight; };

function renderHistory() {
  $("chat").querySelectorAll(".msg").forEach((n) => n.remove());
  for (const m of history) bubble(m.role === "user" ? "user" : "bot", m.content);
  $("welcome").hidden = history.length > 0;
}

// Reasoning-Modelle (Qwen3 & Co.) schicken <think>…</think> mit - nicht anzeigen.
function stripThinking(raw) {
  const open = raw.indexOf("<think>");
  if (open === -1) return { text: raw, thinking: false };
  const close = raw.indexOf("</think>", open);
  if (close === -1) return { text: raw.slice(0, open), thinking: true };
  return { text: (raw.slice(0, open) + raw.slice(close + 8)).trimStart(), thinking: false };
}

let inFlight = null;

async function ask(question) {
  if (inFlight) return;

  history.push({ role: "user", content: question });
  bubble("user", question);
  saveHistory();

  const box = bubble("bot");
  box.innerHTML = `<span class="dots3"><i></i><i></i><i></i></span>`;

  const controller = new AbortController();
  inFlight = controller;
  $("send").hidden = true;
  $("stop").hidden = false;

  const messages = [
    ...(cfg.system.trim() ? [{ role: "system", content: cfg.system.trim() }] : []),
    ...history.slice(-12),
  ];

  const target = routeTarget();
  let raw = "";
  const t0 = performance.now();

  try {
    const stream = target === "pc"
      ? streamFromPC(messages, controller.signal)
      : streamFromPhone(messages, controller.signal);

    for await (const delta of stream) {
      raw += delta;
      const { text, thinking } = stripThinking(raw);
      if (thinking && !text) continue;              // Denkphase: Punkte stehen lassen
      box.textContent = text;
      toBottom();
    }

    const { text } = stripThinking(raw);
    box.textContent = text.trim() || "(Da kam nichts zurück — probier die Frage nochmal.)";
    history.push({ role: "assistant", content: box.textContent });
    saveHistory();

    const secs = ((performance.now() - t0) / 1000).toFixed(1);
    const stamp = document.createElement("div");
    stamp.className = "stamp";
    stamp.innerHTML = `<span class="pill ${target}">${target === "pc" ? "PC" : "Handy"}</span> ${secs} s`;
    box.appendChild(stamp);
  } catch (err) {
    if (controller.signal.aborted) {
      const { text } = stripThinking(raw);
      box.textContent = text.trim() || "(angehalten)";
    } else {
      box.remove();
      errorBubble(explainError(err, target));
      if (target === "pc") { pc.online = false; probePC().then(paintStatus); }
    }
  } finally {
    inFlight = null;
    $("send").hidden = false;
    $("stop").hidden = true;
    toBottom();
    paintStatus();
  }
}

/* ═══════════════════════ Erklär-Blatt ═══════════════════════ */

function showTip(key) {
  const t = TIPS[key];
  if (!t) return;
  $("tip-title").textContent = t[0];
  $("tip-text").innerHTML = t[1];
  $("tip").showModal();
}

document.addEventListener("click", (e) => {
  const q = e.target.closest("[data-tip], [data-tip-btn]");
  if (!q) return;
  showTip(q.dataset.tip || q.dataset.tipBtn);
});
on($("tip-ok"), "click", () => $("tip").close());

// Auf jedem Blatt: Schließen-Kreuz und Tippen auf den Hintergrund
document.querySelectorAll("dialog.sheet").forEach((dlg) => {
  dlg.querySelectorAll("[data-close]").forEach((b) => on(b, "click", () => dlg.close()));
  on(dlg, "click", (e) => { if (e.target === dlg) dlg.close(); });
});

/* ═══════════════════════ Begrüssung ═══════════════════════ */

let step = 1;

function paintIntro() {
  document.querySelectorAll(".slide").forEach((s) => s.classList.toggle("on", +s.dataset.slide === step));
  document.querySelectorAll(".dot").forEach((d, i) => d.classList.toggle("on", i === step - 1));
  $("intro-next").textContent = step === 3 ? "Jetzt herunterladen" : "Weiter";
  $("intro-skip").textContent = step === 3 ? "Später herunterladen" : "Überspringen";
}

function startIntro() {
  const m = byId.get(cfg.phoneModel) || byId.get(DEFAULT_MODEL);
  $("intro-model-name").textContent = prettyName(cfg.phoneModel);
  $("intro-model-size").textContent = "ca. " + gb(m?.vram_required_MB);
  step = 1;
  paintIntro();
  $("intro").hidden = false;
  $("app").hidden = true;
}

function endIntro(download) {
  save(SEEN_KEY, true);
  $("intro").hidden = true;
  $("app").hidden = false;
  paintStatus();
  if (download) startDownload();
}

on($("intro-next"), "click", () => {
  if (step < 3) { step++; paintIntro(); }
  else endIntro(true);
});
on($("intro-skip"), "click", () => endIntro(false));

/* ═══════════════════════ Download ═══════════════════════ */

async function startDownload() {
  if ($("settings").open) $("settings").close();
  if (noWebGPU()) { errorBubble(explainError({ code: "WEBGPU" })); return; }
  try {
    await ensureEngine(cfg.phoneModel);
    modelReady = true;
    paintStatus();
    refreshModelState();
  } catch (err) {
    errorBubble(explainError(err, "phone"));
  }
}

/* ═══════════════════════ Einstellungen ═══════════════════════ */

function fillPhoneModels() {
  const sel = $("set-phonemodel");
  sel.innerHTML = "";
  for (const m of phoneOptions()) {
    sel.append(new Option(`${prettyName(m.model_id)} · ${gb(m.vram_required_MB)}`, m.model_id));
  }
  if (!byId.has(cfg.phoneModel)) cfg.phoneModel = DEFAULT_MODEL;
  sel.value = cfg.phoneModel;
  if (!sel.value && sel.options.length) sel.value = sel.options[0].value;
}

function fillPCModels() {
  const sel = $("set-pcmodel");
  sel.innerHTML = "";
  for (const id of pc.models) sel.append(new Option(id, id));
  sel.value = cfg.pcModel || pc.models[0] || "";
  $("pcmodel-field").hidden = pc.models.length === 0;
}

function setState(el, cls, text) {
  el.className = "state-line" + (cls ? " " + cls : "");
  el.textContent = text;
  el.hidden = !text;
}

async function refreshModelState() {
  const id = $("set-phonemodel").value;
  const el = $("model-state");
  const btn = $("btn-download");
  if (!id) return;
  const cached = await hasModelInCache(id).catch(() => false);
  if (cached) {
    setState(el, "ok", "✓ Auf dem Gerät gespeichert");
    btn.textContent = "Neu laden";
    btn.className = "btn btn-big";
    modelReady = true;
  } else {
    const m = byId.get(id);
    setState(el, "", `Noch nicht geladen · ${gb(m?.vram_required_MB)} · am besten im WLAN`);
    btn.textContent = "Modell herunterladen";
    btn.className = "btn btn-big btn-primary";
  }
  paintStatus();
}

function openSettings() {
  document.querySelectorAll("#seg-route .seg-btn")
    .forEach((b) => b.classList.toggle("on", b.dataset.val === cfg.route));
  paintRouteNote();
  $("set-pcurl").value = cfg.pcUrl;
  $("set-system").value = cfg.system;
  $("set-allmodels").checked = cfg.allModels;
  fillPhoneModels();
  fillPCModels();
  setState($("pc-state"), pc.online ? "ok" : cfg.pcUrl ? "bad" : "",
    pc.online ? `✓ Verbunden · ${pc.models.length} Modell(e)`
              : cfg.pcUrl ? "✕ " + (pc.error || "Nicht erreichbar") : "");
  refreshModelState();
  $("settings").showModal();
}

function paintRouteNote() {
  const notes = {
    auto: "Empfohlen: nimmt den PC, wenn er läuft — sonst dein Handy.",
    pc: "Nur der PC. Ist er aus, kommt keine Antwort.",
    phone: "Nur dein Handy. Der PC bleibt außen vor, auch wenn er läuft.",
  };
  $("route-note").textContent = notes[cfg.route];
}

on($("btn-settings"), "click", openSettings);
on($("btn-help"), "click", () => $("help").showModal());

document.querySelectorAll("#seg-route .seg-btn").forEach((b) =>
  on(b, "click", () => {
    document.querySelectorAll("#seg-route .seg-btn").forEach((x) => x.classList.remove("on"));
    b.classList.add("on");
    cfg.route = b.dataset.val;
    paintRouteNote();
  }));

on($("set-allmodels"), "change", (e) => { cfg.allModels = e.target.checked; fillPhoneModels(); refreshModelState(); });
on($("set-phonemodel"), "change", refreshModelState);
on($("btn-download"), "click", () => { cfg.phoneModel = $("set-phonemodel").value; save(CFG_KEY, cfg); startDownload(); });

on($("btn-testpc"), "click", async () => {
  const el = $("pc-state");
  const url = trimUrl($("set-pcurl").value);
  if (!url) { setState(el, "bad", "Bitte erst eine Adresse eintragen"); return; }
  setState(el, "busy", "Prüfe…");
  cfg.pcUrl = url;
  const ok = await probePC({ url });
  setState(el, ok ? "ok" : "bad",
    ok ? `✓ Verbunden · ${pc.models.length} Modell(e) gefunden` : "✕ " + pc.error);
  fillPCModels();
  paintStatus();
});

on($("btn-reset"), "click", () => {
  if (history.length && !confirm("Den ganzen Verlauf löschen?")) return;
  history = [];
  saveHistory();
  renderHistory();
  $("settings").close();
});

on($("btn-save"), "click", () => {
  cfg.pcUrl = trimUrl($("set-pcurl").value);
  cfg.pcModel = $("set-pcmodel").value;
  cfg.system = $("set-system").value;
  const picked = $("set-phonemodel").value;
  if (picked && picked !== cfg.phoneModel) {
    cfg.phoneModel = picked;
    if (phone.engine) phone.loaded = null;      // beim nächsten Zug neu laden
    modelReady = false;
  }
  save(CFG_KEY, cfg);
  $("settings").close();
  probePC().then(paintStatus);
  paintStatus();
});

on($("btn-replay"), "click", () => { $("help").close(); startIntro(); });

/* ═══════════════════════ Eingabe ═══════════════════════ */

on($("composer"), "submit", (e) => {
  e.preventDefault();
  const text = $("input").value.trim();
  if (!text || inFlight) return;
  $("input").value = "";
  $("input").style.height = "auto";
  ask(text);
});

on($("input"), "input", () => {
  const el = $("input");
  el.style.height = "auto";
  el.style.height = Math.min(el.scrollHeight, 132) + "px";
});

on($("input"), "keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
    e.preventDefault();
    $("composer").requestSubmit();
  }
});

on($("stop"), "click", () => inFlight?.abort());

/* ═══════════════════════ Aufbau ═══════════════════════ */

for (const text of STARTERS) {
  const chip = Object.assign(document.createElement("button"),
    { className: "chip", type: "button", textContent: text });
  on(chip, "click", () => ask(text));
  $("starters").appendChild(chip);
}

for (const [q, a] of FAQ) {
  const d = document.createElement("details");
  d.innerHTML = `<summary></summary><div class="answer">${a}</div>`;
  d.querySelector("summary").textContent = q;
  $("help-list").appendChild(d);
}

renderHistory();

(async () => {
  modelReady = await hasModelInCache(cfg.phoneModel).catch(() => false);

  if (!localStorage.getItem(SEEN_KEY)) {
    startIntro();
  } else {
    $("app").hidden = false;
  }
  paintStatus();

  await probePC();
  paintStatus();
})();

setInterval(() => { if (!inFlight && cfg.pcUrl) probePC().then(paintStatus); }, 25000);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden && cfg.pcUrl && !inFlight) probePC().then(paintStatus);
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(() => {}));
}

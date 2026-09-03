import { prebuiltAppConfig, CreateWebWorkerMLCEngine, hasModelInCache } from "./vendor/web-llm.js";

/* ------------------------------------------------------------------ *
 * Zwei Rechenwege, eine Oberflaeche:
 *   PC     - irgendein OpenAI-kompatibler Server (Ollama, LM Studio, llama.cpp)
 *   Handy  - web-llm auf WebGPU, laeuft offline im Browser
 * Im Modus "auto" gewinnt der PC, sobald er antwortet.
 * ------------------------------------------------------------------ */

const $ = (id) => document.getElementById(id);
const el = {
  chat: $("chat"), empty: $("empty"), notice: $("notice"), input: $("input"),
  send: $("send"), stop: $("stop"), badge: $("badge"), sub: $("who-sub"),
  progress: $("progress"), progressText: $("progress-text"), progressFill: $("progress-fill"),
  settings: $("settings"),
};

/* ---------------------------- Einstellungen ---------------------------- */

const DEFAULT_PHONE_MODEL = "Llama-3.2-1B-Instruct-q4f16_1-MLC";
const CFG_KEY = "handy-llm.cfg";
const LOG_KEY = "handy-llm.log";

const defaults = {
  route: "auto",
  pcUrl: "",
  pcModel: "",
  phoneModel: DEFAULT_PHONE_MODEL,
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

/* ------------------------- Modelle fuers Handy ------------------------- */

// Klein genug, dass ein Telefon sie wirklich traegt - grob nach Groesse.
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

const allModels = prebuiltAppConfig.model_list.filter((m) => m.model_type !== 2); // 2 = Embedding
const byId = new Map(allModels.map((m) => [m.model_id, m]));
const gb = (mb) => (mb ? (mb / 1024).toFixed(1).replace(".", ",") + " GB" : "?");

function phoneModelOptions() {
  if (cfg.allModels) {
    return [...allModels].sort((a, b) => (a.vram_required_MB || 0) - (b.vram_required_MB || 0));
  }
  return PHONE_PICKS.filter((id) => byId.has(id)).map((id) => byId.get(id))
    .sort((a, b) => (a.vram_required_MB || 0) - (b.vram_required_MB || 0));
}

/* ------------------------------ PC-Backend ----------------------------- */

const pc = { online: false, models: [], error: "" };

const trimUrl = (u) => (u || "").trim().replace(/\/+$/, "");

// https-Seite darf kein http-Ziel abrufen - der Browser blockt das lautlos.
function mixedContentProblem() {
  const u = trimUrl(cfg.pcUrl);
  return location.protocol === "https:" && u.startsWith("http://") && !/^https?:\/\/(localhost|127\.0\.0\.1)/.test(u);
}

async function probePC({ quiet = true } = {}) {
  const base = trimUrl(cfg.pcUrl);
  if (!base) { pc.online = false; pc.error = "Keine Adresse hinterlegt."; return false; }
  if (mixedContentProblem()) {
    pc.online = false;
    pc.error = "Diese Seite läuft über https, der PC über http. Das blockiert der Browser.";
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
    pc.error = err.name === "TimeoutError" ? "Keine Antwort (PC aus oder anderes Netz?)."
             : err.name === "AbortError"   ? "Abgebrochen."
             : "Nicht erreichbar — läuft der Server, und ist CORS erlaubt?";
    if (!quiet) console.warn("PC-Test:", err);
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
  if (!res.ok || !res.body) throw new Error("PC antwortet mit HTTP " + res.status);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop();                       // letzte Zeile kann halb sein
    for (const line of lines) {
      const t = line.trim();
      if (!t.startsWith("data:")) continue;
      const payload = t.slice(5).trim();
      if (payload === "[DONE]") return;
      try {
        const delta = JSON.parse(payload).choices?.[0]?.delta?.content;
        if (delta) yield delta;
      } catch { /* Keepalive-Zeilen ignorieren */ }
    }
  }
}

/* ---------------------------- Handy-Backend ---------------------------- */

const phone = { engine: null, loaded: null, loading: false };

const webgpuMissing = () => !navigator.gpu;

function showProgress(text, frac) {
  el.progress.hidden = false;
  el.progressText.textContent = text;
  el.progressFill.style.width = Math.round((frac || 0) * 100) + "%";
}
const hideProgress = () => { el.progress.hidden = true; };

function friendlyLoadError(err) {
  const msg = String(err?.message || err);
  if (/failed to fetch|networkerror|load failed/i.test(msg)) {
    return "Das Modell muss beim ersten Mal heruntergeladen werden — dafür fehlt gerade die Verbindung. Im WLAN nochmal versuchen.";
  }
  if (/quota|storage|space/i.test(msg)) {
    return "Zu wenig freier Speicher auf dem Gerät für dieses Modell. Zahnrad → kleineres Modell wählen.";
  }
  if (/out of memory|oom|device lost/i.test(msg)) {
    return "Dem Gerät ist der Arbeitsspeicher ausgegangen. Zahnrad → kleineres Modell wählen.";
  }
  return "Modell konnte nicht geladen werden: " + msg;
}

async function ensurePhoneEngine(modelId) {
  if (phone.engine && phone.loaded === modelId) return phone.engine;
  if (phone.loading) throw new Error("Das Modell lädt gerade schon.");
  if (webgpuMissing()) throw new Error("Dieser Browser kann WebGPU nicht — siehe Hinweis oben.");

  phone.loading = true;
  try {
    const onProgress = (r) => showProgress(r.text || "Modell wird geladen…", r.progress);
    if (!phone.engine) {
      const worker = new Worker(new URL("./worker.js", import.meta.url), { type: "module" });
      phone.engine = await CreateWebWorkerMLCEngine(worker, modelId, { initProgressCallback: onProgress });
    } else {
      await phone.engine.reload(modelId);      // Modellwechsel im laufenden Worker
    }
    phone.loaded = modelId;
    return phone.engine;
  } finally {
    phone.loading = false;
    hideProgress();
  }
}

async function* streamFromPhone(messages, signal) {
  const engine = await ensurePhoneEngine(cfg.phoneModel);
  signal.addEventListener("abort", () => engine.interruptGenerate(), { once: true });
  const chunks = await engine.chat.completions.create({
    messages, stream: true, temperature: 0.7,
  });
  for await (const chunk of chunks) {
    const delta = chunk.choices?.[0]?.delta?.content;
    if (delta) yield delta;
  }
}

/* ------------------------------- Routing ------------------------------- */

function chooseBackend() {
  if (cfg.route === "pc") return "pc";
  if (cfg.route === "phone") return "phone";
  return pc.online ? "pc" : "phone";
}

function shortHost(url) {
  try { return new URL(url).hostname; } catch { return url; }
}

function paintStatus() {
  const target = chooseBackend();
  if (target === "pc" && pc.online) {
    el.badge.className = "badge badge-pc";
    el.badge.textContent = "PC";
    el.sub.textContent = (cfg.pcModel || "kein Modell") + " · " + shortHost(cfg.pcUrl);
  } else if (target === "pc") {
    el.badge.className = "badge badge-err";
    el.badge.textContent = "PC offline";
    el.sub.textContent = pc.error || "nicht erreichbar";
  } else {
    el.badge.className = webgpuMissing() ? "badge badge-err" : "badge badge-phone";
    el.badge.textContent = webgpuMissing() ? "kein WebGPU" : "Handy";
    const name = cfg.phoneModel.replace(/-q4f16_1-MLC.*$/, "").replace(/-Instruct$/, "");
    el.sub.textContent = cfg.route === "auto" && cfg.pcUrl ? name + " · PC ist aus" : name;
  }
}

/* ---------------------------- Hinweisleiste ---------------------------- */

function paintNotice() {
  const parts = [];
  if (!window.isSecureContext) {
    parts.push("Diese Seite läuft nicht über <code>https</code>. Ohne https gibt der Browser WebGPU nicht frei — der Handy-Modus bleibt aus.");
  } else if (webgpuMissing()) {
    parts.push("Dieser Browser unterstützt kein WebGPU. Auf Android: <b>Chrome</b>. Auf dem iPhone: <b>Safari, iOS 26 oder neuer</b>. Der PC-Modus funktioniert trotzdem.");
  }
  if (mixedContentProblem()) {
    parts.push("Die PC-Adresse beginnt mit <code>http://</code>, diese Seite läuft über <code>https</code>. Der Browser blockiert das. Lösung steht in der README (Tailscale).");
  }
  el.notice.innerHTML = parts.join("<br><br>");
  el.notice.hidden = parts.length === 0;
}

/* ----------------------------- Nachrichten ----------------------------- */

function addBubble(role, text = "") {
  el.empty.hidden = true;
  const div = document.createElement("div");
  div.className = "msg msg-" + role;
  div.textContent = text;
  el.chat.appendChild(div);
  scrollDown();
  return div;
}

function scrollDown() {
  el.chat.scrollTop = el.chat.scrollHeight;
}

function renderHistory() {
  el.chat.querySelectorAll(".msg").forEach((n) => n.remove());
  for (const m of history) addBubble(m.role === "user" ? "user" : "bot", m.content);
  el.empty.hidden = history.length > 0;
}

// Reasoning-Modelle (Qwen3 &co) senden <think>…</think> mit. Nicht anzeigen.
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
  addBubble("user", question);
  saveHistory();

  const bubble = addBubble("bot", "");
  bubble.classList.add("cursor");

  const controller = new AbortController();
  inFlight = controller;
  el.send.hidden = true;
  el.stop.hidden = false;

  const messages = [
    ...(cfg.system.trim() ? [{ role: "system", content: cfg.system.trim() }] : []),
    ...history.slice(-12),
  ];

  const target = chooseBackend();
  let raw = "";
  const started = performance.now();

  try {
    const stream = target === "pc"
      ? streamFromPC(messages, controller.signal)
      : streamFromPhone(messages, controller.signal);

    for await (const delta of stream) {
      raw += delta;
      const { text, thinking } = stripThinking(raw);
      bubble.textContent = thinking && !text ? "denkt nach…" : text;
      scrollDown();
    }

    const { text } = stripThinking(raw);
    bubble.textContent = text.trim() || "(leere Antwort)";
    history.push({ role: "assistant", content: bubble.textContent });
    saveHistory();

    const secs = ((performance.now() - started) / 1000).toFixed(1);
    const meta = document.createElement("div");
    meta.className = "meta";
    meta.textContent = (target === "pc" ? "PC" : "Handy") + " · " + secs + " s";
    bubble.appendChild(meta);
  } catch (err) {
    if (controller.signal.aborted) {
      const { text } = stripThinking(raw);
      bubble.textContent = (text.trim() || "(abgebrochen)");
    } else {
      bubble.className = "msg msg-err";
      bubble.textContent = target === "phone"
        ? friendlyLoadError(err)
        : "PC nicht erreichbar: " + (err?.message || err);
      // PC weggebrochen? Beim naechsten Zug wieder pruefen.
      if (target === "pc") { pc.online = false; probePC().then(paintStatus); }
    }
  } finally {
    bubble.classList.remove("cursor");
    inFlight = null;
    el.send.hidden = false;
    el.stop.hidden = true;
    scrollDown();
    paintStatus();
  }
}

/* ------------------------------ Bedienung ------------------------------ */

$("composer").addEventListener("submit", (e) => {
  e.preventDefault();
  const text = el.input.value.trim();
  if (!text || inFlight) return;
  el.input.value = "";
  el.input.style.height = "auto";
  ask(text);
});

el.input.addEventListener("input", () => {
  el.input.style.height = "auto";
  el.input.style.height = Math.min(el.input.scrollHeight, 140) + "px";
});

el.input.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
    e.preventDefault();
    $("composer").requestSubmit();
  }
});

el.stop.addEventListener("click", () => inFlight?.abort());

$("btn-menu").addEventListener("click", () => {
  if (history.length && !confirm("Verlauf löschen?")) return;
  history = [];
  saveHistory();
  renderHistory();
});

/* --------------------------- Einstellungen-UI -------------------------- */

function fillPhoneModels() {
  const sel = $("set-phonemodel");
  sel.innerHTML = "";
  for (const m of phoneModelOptions()) {
    const opt = document.createElement("option");
    opt.value = m.model_id;
    opt.textContent = m.model_id.replace(/-q4f16_1-MLC.*$/, "").replace(/-q4f32_1-MLC.*$/, "")
      + " · " + gb(m.vram_required_MB);
    sel.appendChild(opt);
  }
  if (!byId.has(cfg.phoneModel)) cfg.phoneModel = DEFAULT_PHONE_MODEL;
  sel.value = cfg.phoneModel;
  if (!sel.value && sel.options.length) sel.value = sel.options[0].value;
}

function fillPCModels() {
  const sel = $("set-pcmodel");
  sel.innerHTML = "";
  if (!pc.models.length) {
    sel.innerHTML = '<option value="">— PC nicht erreichbar —</option>';
    return;
  }
  for (const id of pc.models) {
    const opt = document.createElement("option");
    opt.value = id; opt.textContent = id;
    sel.appendChild(opt);
  }
  sel.value = cfg.pcModel || pc.models[0];
}

async function refreshCacheStatus() {
  const hint = $("cache-status");
  const id = $("set-phonemodel").value;
  if (!id) { hint.textContent = ""; return; }
  try {
    const cached = await hasModelInCache(id);
    hint.className = "hint" + (cached ? " ok" : "");
    hint.textContent = cached ? "Bereits auf dem Handy gespeichert." : "Noch nicht geladen (einmalig, im WLAN laden).";
  } catch { hint.textContent = ""; }
}

$("btn-settings").addEventListener("click", () => {
  $("set-route").value = cfg.route;
  $("set-pcurl").value = cfg.pcUrl;
  $("set-system").value = cfg.system;
  $("set-allmodels").checked = cfg.allModels;
  fillPhoneModels();
  fillPCModels();
  $("pc-status").className = "hint" + (pc.online ? " ok" : pc.error ? " err" : "");
  $("pc-status").textContent = pc.online ? "Erreichbar." : (pc.error || "");
  refreshCacheStatus();
  el.settings.showModal();
});

$("set-allmodels").addEventListener("change", (e) => {
  cfg.allModels = e.target.checked;
  fillPhoneModels();
});

$("set-phonemodel").addEventListener("change", refreshCacheStatus);

$("btn-testpc").addEventListener("click", async () => {
  const hint = $("pc-status");
  cfg.pcUrl = trimUrl($("set-pcurl").value);
  hint.className = "hint";
  hint.textContent = "prüfe…";
  const ok = await probePC({ quiet: false });
  hint.className = "hint" + (ok ? " ok" : " err");
  hint.textContent = ok ? "Erreichbar — " + pc.models.length + " Modell(e)." : pc.error;
  fillPCModels();
  paintStatus();
  paintNotice();
});

$("btn-preload").addEventListener("click", async () => {
  const id = $("set-phonemodel").value;
  const hint = $("cache-status");
  if (!id) return;
  cfg.phoneModel = id;
  el.settings.close();
  try {
    await ensurePhoneEngine(id);
    hint.className = "hint ok";
    hint.textContent = "Fertig geladen.";
    paintStatus();
  } catch (err) {
    addBubble("err", friendlyLoadError(err));
  }
});

el.settings.addEventListener("close", () => {
  if (el.settings.returnValue !== "save") return;
  cfg.route = $("set-route").value;
  cfg.pcUrl = trimUrl($("set-pcurl").value);
  cfg.pcModel = $("set-pcmodel").value;
  cfg.system = $("set-system").value;
  const picked = $("set-phonemodel").value;
  const changed = picked && picked !== cfg.phoneModel;
  cfg.phoneModel = picked || cfg.phoneModel;
  save(CFG_KEY, cfg);
  if (changed && phone.engine) phone.loaded = null;   // beim naechsten Zug neu laden
  probePC().then(() => { paintStatus(); paintNotice(); });
  paintStatus();
  paintNotice();
});

/* -------------------------------- Start -------------------------------- */

renderHistory();
paintNotice();
paintStatus();

probePC().then(() => { paintStatus(); paintNotice(); });
setInterval(() => { if (!inFlight && cfg.pcUrl) probePC().then(paintStatus); }, 25000);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden && cfg.pcUrl && !inFlight) probePC().then(paintStatus);
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(() => {}));
}

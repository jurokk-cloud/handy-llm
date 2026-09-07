# Handy-LLM

KI-Chat, der **auf dem Handy selbst rechnet**. Kein Konto, kein Server, keine
Daten nach draußen. Läuft der PC, übernimmt er — sonst rechnet das Telefon
weiter, auch offline.

| | Handy-Modus | PC-Modus |
|---|---|---|
| Rechnet auf | dem Telefon (WebGPU) | deinem Rechner (Ollama) |
| Modellgröße | ~0,3 – 2 GB | so groß wie deine Grafikkarte trägt |
| Tempo | langsam, reicht | schnell |
| Braucht Netz | nur beim ersten Laden | ja, PC muss an sein |

Die App wählt automatisch: PC wenn erreichbar, sonst Handy.

---

## 0. Einmalig: Pages einschalten

Repo → **Settings** → **Pages** → unter *Build and deployment* die Quelle auf
**GitHub Actions** stellen.

Der Workflow versucht das selbst (`enablement: true`), scheitert aber am
Standard-Token: *„Resource not accessible by integration"*. Pages anzulegen
darf ein Workflow-Token nicht — danach läuft alles automatisch, jeder Push auf
`main` veröffentlicht neu.

---

## 1. Auf dem Handy einrichten

1. Seite öffnen: **https://jurokk-cloud.github.io/handy-llm/**
2. Zum Startbildschirm hinzufügen
   - **Android/Chrome:** Menü `⋮` → *Zum Startbildschirm hinzufügen*
   - **iPhone/Safari:** Teilen-Symbol → *Zum Home-Bildschirm*
3. App öffnen — eine kurze Einführung führt dich durch den Rest

Beim ersten Start erklärt die App in drei Schritten, was sie tut, und bietet
den Modell-Download direkt an. Jeder Fachbegriff hat ein **?** daneben, das ihn
in Alltagssprache erklärt; unter **?** oben links liegen die häufigen Fragen.

Das Modell wird einmal heruntergeladen (~0,9 GB bei der Voreinstellung) und
bleibt danach auf dem Gerät. Ab dann läuft der Handy-Modus ohne Internet.

**Voraussetzung:** WebGPU.
- Android: Chrome 121 oder neuer — passt bei jedem aktuellen Gerät
- iPhone: Safari ab **iOS 26**
- Firefox auf Android kann es noch nicht → nur PC-Modus

---

## 2. PC als Turbo dazuschalten

**Auf dem PC:**

```bash
# 1. Ollama installieren:  https://ollama.com/download
# 2. Ein Modell holen (8B passt ab ~8 GB Grafikspeicher):
ollama pull qwen3:8b

# 3. Server starten - Linux/macOS:
./pc/start-pc-llm.sh --tailscale
```

```powershell
# Windows (PowerShell):
.\pc\start-pc-llm.ps1 -Tailscale
```

Das Skript gibt eine Adresse aus, etwa `https://pc-name.tailnet-xyz.ts.net`.

**Auf dem Handy:** Zahnrad → Adresse eintragen → *Jetzt testen* → Speichern.

Fertig. Ist der PC an, steht oben **PC**. Ist er aus, steht dort **Handy** —
ohne dass du etwas umstellen musst.

---

## 3. Warum Tailscale?

Die kurze Antwort: **Browser verbieten es, von einer `https`-Seite aus einen
`http`-Server aufzurufen.** Dein PC im WLAN spricht `http://192.168.…` — die
Anfrage würde stillschweigend blockiert.

Tailscale löst das in einem Schritt: `tailscale serve` legt eine echte
`https`-Adresse mit gültigem Zertifikat über deinen lokalen Ollama.

- kostenlos für den Eigenbedarf
- **nicht öffentlich** — nur deine eigenen Geräte sehen den Server
- im selben WLAN läuft die Verbindung direkt, also mit vollem Tempo
- unterwegs funktioniert es dann auch, ohne weiteres Zutun

Einrichtung: [tailscale.com/download](https://tailscale.com/download) auf PC
**und** Handy installieren, auf beiden mit demselben Konto anmelden.

> Nur zum Ausprobieren geht auch `cloudflared tunnel --url http://localhost:11434`.
> Das macht deinen Server allerdings für **jeden** erreichbar, der die zufällige
> URL kennt — nicht dauerhaft nutzen.

---

## 4. Wenn etwas klemmt

| Symptom | Ursache | Lösung |
|---|---|---|
| Badge bleibt auf „PC offline" | Ollama läuft nicht, oder CORS fehlt | Skript aus Schritt 2 benutzen — es setzt `OLLAMA_ORIGINS` |
| „kein WebGPU" | Browser zu alt oder Firefox Android | Chrome (Android) bzw. iOS 26+ (iPhone) |
| Hinweis „https / http" | PC-Adresse ist `http://` | Tailscale-Adresse eintragen (Schritt 2) |
| Modell lädt ewig | ~0,9 GB über Mobilfunk | im WLAN laden, einmalig |
| Handy-Antwort bricht ab | zu wenig Arbeitsspeicher | Zahnrad → kleineres Modell (z. B. Qwen3-0.6B) |

---

## Oberfläche

Gebaut für ein Telefon in einer Hand, und für Köpfe, die sich nicht durch
Menüs wühlen wollen:

- **Geführter erster Start** statt leerem Bildschirm
- **Antippbare Erklärungen** an jedem Fachbegriff — Tap, kein Hover
- **Hilfe-Bereich** mit den Fragen, die wirklich aufkommen
- **Fehler in Klartext**, jeweils mit dem Knopf, der sie behebt
- **Statusanzeige sagt, wer gerade rechnet** — antippbar für den Grund
- Alle Tippziele mindestens 44 px, hell und dunkel, `prefers-reduced-motion`

## Technik

- [web-llm](https://github.com/mlc-ai/web-llm) `0.2.84`, mitgeliefert unter
  `vendor/` — kein Build-Schritt, kein npm, kein CDN zur Laufzeit
- Modellgewichte holt web-llm beim ersten Start von Hugging Face und legt sie
  im Cache Storage des Browsers ab
- Generierung läuft in einem Web Worker, damit die Oberfläche flüssig bleibt
- PC-Seite spricht die OpenAI-kompatible API — also auch LM Studio,
  llama.cpp-Server oder vLLM statt Ollama
- Service Worker hält die App selbst offline verfügbar
- Verlauf und Einstellungen: `localStorage`, nur auf dem Gerät

## Lizenz

Dieses Projekt: MIT. Mitgeliefertes web-llm: Apache-2.0, siehe
`vendor/LICENSE-web-llm`.

#!/usr/bin/env bash
# Startet Ollama so, dass das Handy ihn erreichen darf, und veroeffentlicht
# ihn per Tailscale unter einer https-Adresse.
#
#   ./start-pc-llm.sh                      # nur Ollama, lokal
#   ./start-pc-llm.sh --tailscale          # zusaetzlich https-Adresse fuers Handy
#
set -euo pipefail

ORIGIN="${HANDY_LLM_ORIGIN:-https://jurokk-cloud.github.io}"
PORT="${OLLAMA_PORT:-11434}"
USE_TS=0
[[ "${1:-}" == "--tailscale" ]] && USE_TS=1

command -v ollama >/dev/null || {
  echo "Ollama fehlt. Installieren: https://ollama.com/download" >&2
  exit 1
}

# Ohne die zweite Zeile blockt der Browser jede Anfrage von der Chat-Seite.
export OLLAMA_HOST="0.0.0.0:${PORT}"
export OLLAMA_ORIGINS="${ORIGIN},http://localhost:*,https://*.ts.net"

pkill -f "ollama serve" 2>/dev/null || true
sleep 1
ollama serve >/tmp/ollama.log 2>&1 &
OLLAMA_PID=$!
sleep 2

if ! kill -0 "$OLLAMA_PID" 2>/dev/null; then
  echo "Ollama ist nicht gestartet. Log:" >&2
  tail -20 /tmp/ollama.log >&2
  exit 1
fi

echo "Ollama laeuft auf Port ${PORT} (PID ${OLLAMA_PID})."
echo "Erlaubte Herkunft: ${OLLAMA_ORIGINS}"
echo
echo "Installierte Modelle:"
ollama list 2>/dev/null | tail -n +2 | sed 's/^/  /' || echo "  (noch keine - z.B.: ollama pull qwen3:8b)"
echo

if [[ $USE_TS -eq 1 ]]; then
  command -v tailscale >/dev/null || {
    echo "Tailscale fehlt. Installieren: https://tailscale.com/download" >&2
    exit 1
  }
  tailscale serve --bg --https=443 "http://127.0.0.1:${PORT}" >/dev/null
  HOSTNAME_TS="$(tailscale status --json | grep -o '"DNSName": *"[^"]*"' | head -1 | cut -d'"' -f4 | sed 's/\.$//')"
  echo "Diese Adresse gehoert in die App-Einstellungen:"
  echo "    https://${HOSTNAME_TS}"
  echo
  echo "Abschalten spaeter mit:  tailscale serve --https=443 off"
else
  echo "Nur im lokalen Netz erreichbar:  http://$(hostname -I 2>/dev/null | awk '{print $1}'):${PORT}"
  echo "Achtung: eine https-Seite darf http nicht aufrufen. Fuer das Handy"
  echo "diesen Befehl mit  --tailscale  starten."
fi

echo
echo "Laeuft. Beenden mit Strg+C."
wait "$OLLAMA_PID"

# Startet Ollama so, dass das Handy ihn erreichen darf, und veroeffentlicht
# ihn per Tailscale unter einer https-Adresse.
#
#   .\start-pc-llm.ps1                 # nur Ollama
#   .\start-pc-llm.ps1 -Tailscale      # zusaetzlich https-Adresse fuers Handy
#
param(
  [switch]$Tailscale,
  [string]$Origin = "https://jurokk-cloud.github.io",
  [int]$Port = 11434
)
$ErrorActionPreference = "Stop"

if (-not (Get-Command ollama -ErrorAction SilentlyContinue)) {
  Write-Error "Ollama fehlt. Installieren: https://ollama.com/download"
  exit 1
}

# Dauerhaft fuer den Benutzer setzen - ohne OLLAMA_ORIGINS blockt der Browser.
$origins = "$Origin,http://localhost:*,https://*.ts.net"
[Environment]::SetEnvironmentVariable("OLLAMA_HOST", "0.0.0.0:$Port", "User")
[Environment]::SetEnvironmentVariable("OLLAMA_ORIGINS", $origins, "User")
$env:OLLAMA_HOST = "0.0.0.0:$Port"
$env:OLLAMA_ORIGINS = $origins

# Die Hintergrund-App laeuft noch mit den alten Variablen - neu starten.
Get-Process ollama, "ollama app" -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 1
Start-Process -FilePath "ollama" -ArgumentList "serve" -WindowStyle Hidden
Start-Sleep -Seconds 2

try {
  $tags = Invoke-RestMethod "http://127.0.0.1:$Port/api/tags" -TimeoutSec 5
  Write-Host "Ollama laeuft auf Port $Port." -ForegroundColor Green
  Write-Host "Erlaubte Herkunft: $origins"
  Write-Host ""
  Write-Host "Installierte Modelle:"
  if ($tags.models.Count -eq 0) { Write-Host "  (noch keine - z.B.: ollama pull qwen3:8b)" }
  else { $tags.models | ForEach-Object { Write-Host "  $($_.name)" } }
} catch {
  Write-Error "Ollama antwortet nicht auf Port $Port."
  exit 1
}

Write-Host ""
if ($Tailscale) {
  if (-not (Get-Command tailscale -ErrorAction SilentlyContinue)) {
    Write-Error "Tailscale fehlt. Installieren: https://tailscale.com/download"
    exit 1
  }
  tailscale serve --bg --https=443 "http://127.0.0.1:$Port" | Out-Null
  $dns = (tailscale status --json | ConvertFrom-Json).Self.DNSName.TrimEnd('.')
  Write-Host "Diese Adresse gehoert in die App-Einstellungen:" -ForegroundColor Cyan
  Write-Host "    https://$dns"
  Write-Host ""
  Write-Host "Abschalten spaeter mit:  tailscale serve --https=443 off"
} else {
  $ip = (Get-NetIPAddress -AddressFamily IPv4 |
         Where-Object { $_.IPAddress -notlike "127.*" -and $_.IPAddress -notlike "169.254.*" } |
         Select-Object -First 1).IPAddress
  Write-Host "Nur im lokalen Netz erreichbar:  http://${ip}:$Port"
  Write-Host "Achtung: eine https-Seite darf http nicht aufrufen. Fuer das Handy"
  Write-Host "dieses Skript mit  -Tailscale  starten."
}

# scripts/dev-demo.ps1
#
# One-command demo bring-up:
#   1. Launches the API and dashboard in new PowerShell windows
#   2. Starts a Cloudflare quick-tunnel to localhost:3001
#   3. Rewrites API_BASE_URL in root .env with the fresh tunnel URL
#   4. Runs `pnpm vapi:deploy` to push the new URLs to Vapi
#   5. Prints the ready banner and keeps the tunnel attached to this console
#
# Stopping: Ctrl+C in this window stops the tunnel. The API and dashboard
# windows are independent -- close them manually.

$ErrorActionPreference = 'Stop'
$Repo = Split-Path -Parent $PSScriptRoot
Set-Location $Repo

function Write-Step($msg) { Write-Host "==> $msg" -ForegroundColor Cyan }
function Write-Ok($msg)   { Write-Host "==> $msg" -ForegroundColor Green }
function Write-Warn2($msg){ Write-Host "==> $msg" -ForegroundColor Yellow }

# ---------- Locate cloudflared ----------
$cf = $null
$cmd = Get-Command cloudflared -ErrorAction SilentlyContinue
if ($cmd) { $cf = $cmd.Source }
elseif (Test-Path "C:\Program Files (x86)\cloudflared\cloudflared.exe") {
    $cf = "C:\Program Files (x86)\cloudflared\cloudflared.exe"
} elseif (Test-Path "C:\Program Files\cloudflared\cloudflared.exe") {
    $cf = "C:\Program Files\cloudflared\cloudflared.exe"
}
if (-not $cf) {
    Write-Error "cloudflared not found. Install with: winget install Cloudflare.cloudflared"
    exit 1
}

# ---------- Sanity-check .env ----------
$envPath = Join-Path $Repo ".env"
if (-not (Test-Path $envPath)) {
    Write-Error "Root .env not found at $envPath. Copy .env.example to .env first."
    exit 1
}

# Capture the original API_BASE_URL so we can restore it (and re-point Vapi
# at production) when this script exits. Without this, a local-dev session
# leaves Vapi pointed at the now-dead tunnel and the deployed app silently
# breaks until the user remembers to run `pnpm vapi:deploy`.
$originalContent = Get-Content $envPath -Raw
$originalUrlMatch = [regex]::Match($originalContent, '(?m)^API_BASE_URL=(.+)$')
$originalUrl = if ($originalUrlMatch.Success) { $originalUrlMatch.Groups[1].Value.Trim() } else { $null }
if ($originalUrl) {
    Write-Ok "Captured original API_BASE_URL: $originalUrl (will restore on exit)"
} else {
    Write-Warn2 "No existing API_BASE_URL in .env -- nothing to restore on exit. You'll need to set it + run 'pnpm vapi:deploy' manually after stopping the script."
}

# ---------- Start API and dashboard in new windows ----------
Write-Step "Starting API (port 3001) in a new window..."
Start-Process powershell -ArgumentList @(
    '-NoExit', '-Command',
    "Set-Location '$Repo'; Write-Host '[API] starting...' -ForegroundColor Cyan; pnpm --filter @medspa/api dev"
) | Out-Null

Write-Step "Starting dashboard (port 3000) in a new window..."
Start-Process powershell -ArgumentList @(
    '-NoExit', '-Command',
    "Set-Location '$Repo'; Write-Host '[DASH] starting...' -ForegroundColor Cyan; pnpm --filter @medspa/dashboard dev"
) | Out-Null

# ---------- Start tunnel ----------
$tunnelLog = Join-Path $env:TEMP "cf-tunnel.log"
if (Test-Path $tunnelLog) { Remove-Item $tunnelLog -Force -ErrorAction SilentlyContinue }

Write-Step "Starting Cloudflare quick tunnel..."
$tunnel = Start-Process $cf `
    -ArgumentList @('tunnel', '--url', 'http://localhost:3001', '--logfile', $tunnelLog) `
    -PassThru -WindowStyle Hidden

# ---------- Poll for tunnel URL ----------
$url = $null
for ($i = 0; $i -lt 60; $i++) {
    Start-Sleep -Milliseconds 800
    if (Test-Path $tunnelLog) {
        $hit = Select-String -Path $tunnelLog -Pattern 'https://[a-z0-9-]+\.trycloudflare\.com' -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($hit) { $url = $hit.Matches.Value; break }
    }
}
if (-not $url) {
    Write-Error "Tunnel did not produce a URL within ~50s. Check $tunnelLog."
    Stop-Process -Id $tunnel.Id -Force -ErrorAction SilentlyContinue
    exit 1
}
Write-Ok "Tunnel: $url"

# ---------- Rewrite API_BASE_URL in .env ----------
$content = Get-Content $envPath -Raw
if ($content -match '(?m)^API_BASE_URL=') {
    $content = [regex]::Replace($content, '(?m)^API_BASE_URL=.*$', "API_BASE_URL=$url")
} else {
    if ($content -and -not $content.EndsWith("`n")) { $content += "`n" }
    $content += "API_BASE_URL=$url`n"
}
Set-Content -Path $envPath -Value $content -NoNewline -Encoding utf8
Write-Ok "Updated API_BASE_URL in .env"

# ---------- Wait for API to come up ----------
Write-Step "Waiting for API on :3001..."
$apiUp = $false
for ($i = 0; $i -lt 60; $i++) {
    try {
        $r = Invoke-WebRequest -Uri 'http://localhost:3001/healthz' -TimeoutSec 2 -UseBasicParsing -ErrorAction Stop
        if ($r.StatusCode -eq 200) { $apiUp = $true; break }
    } catch { }
    Start-Sleep -Milliseconds 800
}
if ($apiUp) { Write-Ok "API healthy" } else { Write-Warn2 "API not responding yet on :3001 -- continuing anyway." }

# ---------- Push assistant config to Vapi ----------
Write-Step "Pushing assistant config to Vapi (pnpm vapi:deploy)..."
pnpm vapi:deploy
if ($LASTEXITCODE -ne 0) {
    Write-Warn2 "vapi:deploy returned non-zero. Check VAPI_API_KEY, VAPI_ASSISTANT_ID, VAPI_WEBHOOK_SECRET."
}

# ---------- Ready banner ----------
Write-Host ""
Write-Host "================================================" -ForegroundColor Green
Write-Host " Demo ready"                                       -ForegroundColor Green
Write-Host "   Frontend : http://localhost:3000/live"
Write-Host "   API      : http://localhost:3001"
Write-Host "   Tunnel   : $url"
Write-Host "================================================" -ForegroundColor Green
Write-Host ""
Write-Host "Press Ctrl+C in this window to stop the tunnel."
Write-Host "Close the API and dashboard windows manually when done."

# ---------- Keep tunnel attached; clean up on exit ----------
try {
    Wait-Process -Id $tunnel.Id
} finally {
    Write-Warn2 "Stopping tunnel..."
    Stop-Process -Id $tunnel.Id -Force -ErrorAction SilentlyContinue

    # Restore .env and re-point Vapi at production so the deployed app
    # keeps working after this local session ends.
    if ($originalUrl -and $originalUrl -ne $url) {
        Write-Step "Restoring API_BASE_URL to $originalUrl in .env ..."
        $restoreContent = Get-Content $envPath -Raw
        $restoreContent = [regex]::Replace($restoreContent, '(?m)^API_BASE_URL=.*$', "API_BASE_URL=$originalUrl")
        Set-Content -Path $envPath -Value $restoreContent -NoNewline -Encoding utf8

        Write-Step "Re-pointing Vapi at $originalUrl (pnpm vapi:deploy)..."
        pnpm vapi:deploy
        if ($LASTEXITCODE -eq 0) {
            Write-Ok "Vapi restored to $originalUrl -- deployed app is live again."
        } else {
            Write-Warn2 "vapi:deploy failed during restore. Run it manually: pnpm vapi:deploy"
        }
    } elseif (-not $originalUrl) {
        Write-Warn2 "Vapi is still pointed at the (now-dead) tunnel URL."
        Write-Warn2 "Set API_BASE_URL in .env to your production URL and run: pnpm vapi:deploy"
    }
}

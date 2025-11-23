# PowerShell script to run Next.js dev server with proper path handling
$scriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location -LiteralPath $scriptPath

$nextCmd = Join-Path $scriptPath "node_modules\.bin\next.cmd"
if (Test-Path $nextCmd) {
    Write-Host "Starting Next.js dev server..." -ForegroundColor Green
    & $nextCmd dev
} else {
    Write-Host "Error: Next.js not found at $nextCmd" -ForegroundColor Red
    Write-Host "Running npm install..." -ForegroundColor Yellow
    npm install
    $nextCmd = Join-Path $scriptPath "node_modules\.bin\next.cmd"
    if (Test-Path $nextCmd) {
        & $nextCmd dev
    } else {
        Write-Host "Error: Next.js still not found after npm install" -ForegroundColor Red
    }
}


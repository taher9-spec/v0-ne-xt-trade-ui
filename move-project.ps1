# Script to move project to a clean path
$sourcePath = "C:\Users\taher\Desktop\Work & Business\v0-ne-xt-trade-ui\v0-ne-xt-trade-ui-main"
$destPath = "C:\dev\nexttrade-ui"

Write-Host "Creating destination directory..."
New-Item -ItemType Directory -Force -Path "C:\dev" | Out-Null

Write-Host "Moving project from:"
Write-Host "  $sourcePath"
Write-Host "To:"
Write-Host "  $destPath"
Write-Host ""

# Check if source exists
if (-not (Test-Path $sourcePath)) {
    Write-Host "ERROR: Source path does not exist!" -ForegroundColor Red
    exit 1
}

# Check if destination already exists
if (Test-Path $destPath) {
    Write-Host "WARNING: Destination already exists!" -ForegroundColor Yellow
    $response = Read-Host "Do you want to overwrite it? (y/n)"
    if ($response -ne "y") {
        Write-Host "Cancelled." -ForegroundColor Yellow
        exit 0
    }
    Remove-Item -Recurse -Force $destPath
}

Write-Host "Copying files (this may take a moment)..."
Copy-Item -Recurse -Force $sourcePath $destPath

Write-Host ""
Write-Host "SUCCESS! Project moved to: $destPath" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:"
Write-Host "1. Close Cursor"
Write-Host "2. Open Cursor and select folder: $destPath"
Write-Host "3. Run: npm install"
Write-Host "4. Run: npm run dev"
Write-Host ""


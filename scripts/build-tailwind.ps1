# Build Tailwind CSS without Node.js (standalone CLI).
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$tools = Join-Path $root "tools"
$exe = Join-Path $tools "tailwindcss.exe"
$inputCss = Join-Path $root "assets\css\tailwind.src.css"
$outputCss = Join-Path $root "assets\css\tailwind.min.css"

New-Item -ItemType Directory -Force -Path $tools | Out-Null

if (-not (Test-Path $exe)) {
    Write-Host "Downloading Tailwind standalone CLI..."
    $url = "https://github.com/tailwindlabs/tailwindcss/releases/latest/download/tailwindcss-windows-x64.exe"
    Invoke-WebRequest -Uri $url -OutFile $exe -UseBasicParsing
}

Push-Location $root
try {
    & $exe -i $inputCss -o $outputCss --minify
    Write-Host "Built $outputCss"
} finally {
    Pop-Location
}

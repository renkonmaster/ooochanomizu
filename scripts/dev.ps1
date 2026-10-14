# Use a suitable installed Node.js, or the runtime bundled with Codex on this PC.
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$nodeCommand = Get-Command node -ErrorAction SilentlyContinue
$nodePath = if ($nodeCommand) { $nodeCommand.Source } else { $null }
$nodeVersion = if ($nodePath) { [version]((& $nodePath --version).TrimStart('v').Split('-')[0]) } else { [version]'0.0.0' }
if ($nodeVersion -lt [version]'22.15.0') {
    $bundledNode = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
    if (Test-Path -LiteralPath $bundledNode) {
        $nodePath = $bundledNode
        $nodeVersion = [version]((& $nodePath --version).TrimStart('v').Split('-')[0])
    }
}
if (-not $nodePath -or $nodeVersion -lt [version]'22.15.0') {
    throw 'Node.js 22.15 or newer is required. Install Node.js 24 LTS and retry.'
}
Push-Location -LiteralPath $projectRoot
try {
    Write-Host "Using Node.js $nodeVersion"
    if (-not (Test-Path -LiteralPath 'node_modules\vite\bin\vite.js')) {
        $npmCommand = Get-Command npm.cmd -ErrorAction Stop
        $npmCli = Join-Path (Split-Path -Parent $npmCommand.Source) 'node_modules\npm\bin\npm-cli.js'
        & $nodePath $npmCli ci
        if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed.' }
    }
    & $nodePath 'scripts\prepare-assets.mjs'
    if ($LASTEXITCODE -ne 0) { throw 'Hand-tracking asset preparation failed.' }
    & $nodePath 'node_modules\vite\bin\vite.js' --host 127.0.0.1
    if ($LASTEXITCODE -ne 0) { throw 'Development server failed.' }
} finally {
    Pop-Location
}

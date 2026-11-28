$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

# Official VibeSane Foxy bootstrap. Installs only a published package from the
# official npm registry, then runs the consent-first, project-scoped installer.
$PackageName = '@vibesane/foxy'
$Registry = 'https://registry.npmjs.org'
$Channel = 'beta'
$AllowedAgents = @('auto', 'claude', 'codex', 'cursor', 'gemini', 'roo', 'copilot')
$Agent = if ([string]::IsNullOrWhiteSpace($env:FOXY_INSTALL_AGENT)) { 'auto' } else { $env:FOXY_INSTALL_AGENT.Trim().ToLowerInvariant() }

if ($AllowedAgents -notcontains $Agent) {
  throw "Unsupported FOXY_INSTALL_AGENT '$Agent'. Use: $($AllowedAgents -join ', ')."
}

foreach ($CommandName in @('node', 'git')) {
  if (-not (Get-Command $CommandName -ErrorAction SilentlyContinue)) {
    throw "Required command '$CommandName' was not found. Install Node.js 24.15+ and Git, then retry."
  }
}
$NpmCommand = Get-Command 'npm.cmd' -ErrorAction SilentlyContinue
if (-not $NpmCommand) {
  throw "npm.cmd was not found. Repair or reinstall Node.js with npm, then retry."
}
$NpmPath = $NpmCommand.Source

$NodeVersionText = (& node -p "process.versions.node")
if ($LASTEXITCODE -ne 0) { throw 'Could not read the Node.js runtime version.' }
try { $NodeVersion = [version]$NodeVersionText.Trim() } catch { throw "Could not parse Node.js version '$NodeVersionText'." }
if ($NodeVersion -lt [version]'24.15.0') {
  throw "Foxy requires Node.js 24.15.0 or newer. Current: $NodeVersionText"
}

# Resolve the beta tag once, validate it, then install that exact version.
$PublishedVersionJson = & $NpmPath view "$PackageName@$Channel" version --registry=$Registry --json
if ($LASTEXITCODE -ne 0) {
  throw "$PackageName@$Channel is not available on the official npm registry yet. Foxy's beta is not published; no package was installed."
}
try {
  $PublishedVersion = [string](ConvertFrom-Json -InputObject ($PublishedVersionJson -join [Environment]::NewLine))
} catch {
  throw "The official npm registry returned an invalid version for $PackageName@$Channel; no package was installed."
}
$SemverPattern = '^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$'
if ($PublishedVersion -notmatch $SemverPattern) {
  throw "The official npm registry returned an invalid version for $PackageName@$Channel; no package was installed."
}

Write-Host "Installing $PackageName@$PublishedVersion from the official npm registry…"
& $NpmPath install --global --ignore-scripts --no-audit --no-fund --registry=$Registry "$PackageName@$PublishedVersion"
if ($LASTEXITCODE -ne 0) { throw 'npm global installation failed.' }

$NpmPrefix = (& $NpmPath prefix --global).Trim()
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($NpmPrefix)) {
  throw 'Could not resolve the npm global prefix.'
}
$FoxyCommand = Join-Path $NpmPrefix 'foxy.cmd'
if (-not (Test-Path -LiteralPath $FoxyCommand -PathType Leaf)) {
  $Resolved = Get-Command foxy -ErrorAction SilentlyContinue
  if (-not $Resolved) { throw "Foxy was installed, but '$FoxyCommand' was not found." }
  $FoxyCommand = $Resolved.Source
}

Write-Host 'Starting the project-scoped, consent-first Foxy installer…'
& $FoxyCommand install --agent $Agent
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

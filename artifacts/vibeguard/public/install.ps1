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

foreach ($CommandName in @('node', 'npm', 'git')) {
  if (-not (Get-Command $CommandName -ErrorAction SilentlyContinue)) {
    throw "Required command '$CommandName' was not found. Install Node.js 24.15+ (including npm) and Git, then retry."
  }
}

$NodeVersionText = (& node -p "process.versions.node")
if ($LASTEXITCODE -ne 0) { throw 'Could not read the Node.js runtime version.' }
try { $NodeVersion = [version]$NodeVersionText.Trim() } catch { throw "Could not parse Node.js version '$NodeVersionText'." }
if ($NodeVersion -lt [version]'24.15.0') {
  throw "Foxy requires Node.js 24.15.0 or newer. Current: $NodeVersionText"
}

& npm view "$PackageName@$Channel" version --registry=$Registry --json *> $null
if ($LASTEXITCODE -ne 0) {
  throw "$PackageName@$Channel is not available on the official npm registry yet. Foxy's beta is not published; no package was installed."
}

Write-Host "Installing $PackageName@$Channel from the official npm registry…"
& npm install --global --ignore-scripts --no-audit --no-fund --registry=$Registry "$PackageName@$Channel"
if ($LASTEXITCODE -ne 0) { throw 'npm global installation failed.' }

$NpmPrefix = (& npm prefix --global).Trim()
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

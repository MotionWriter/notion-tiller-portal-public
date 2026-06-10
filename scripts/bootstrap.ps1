$ErrorActionPreference = "Stop"

$Package = "github:MotionWriter/notion-tiller-portal-public#main"

function Write-Step($Message) {
	Write-Host ""
	Write-Host $Message
}

function Test-Command($Name) {
	$null -ne (Get-Command $Name -ErrorAction SilentlyContinue)
}

function Get-MajorVersion($Command, $CommandArgs) {
	$output = & $Command @CommandArgs 2>$null
	if ($LASTEXITCODE -ne 0 -or -not $output) {
		return $null
	}
	$match = [regex]::Match(($output | Select-Object -First 1), "\d+")
	if (-not $match.Success) {
		return $null
	}
	return [int]$match.Value
}

Write-Host "Notion Tiller Portal bootstrap"
Write-Host ""
Write-Host "This gets your terminal ready, then starts the guided installer."
Write-Host "Daily render work happens in Notion after setup."
Write-Host ""

if (-not (Test-Command "node") -or -not (Test-Command "npm")) {
	Write-Host "Node.js and npm are required."
	Write-Host "Install Node.js 22+ from https://nodejs.org, then rerun this command."
	Write-Host ""
	Write-Host "After installing Node, rerun:"
	Write-Host "  irm https://raw.githubusercontent.com/MotionWriter/notion-tiller-portal-public/main/scripts/bootstrap.ps1 | iex"
	exit 1
}

$nodeMajor = Get-MajorVersion "node" @("--version")
if ($null -eq $nodeMajor -or $nodeMajor -lt 22) {
	Write-Host "Node.js 22+ is required. Found: $(node --version)"
	Write-Host "Update Node.js from https://nodejs.org, then rerun this command."
	exit 1
}

$npmMajor = Get-MajorVersion "npm" @("--version")
if ($null -eq $npmMajor -or $npmMajor -lt 10) {
	Write-Host "npm 10+ is required. Found: $(npm --version)"
	Write-Host "Update Node.js from https://nodejs.org, then rerun this command."
	exit 1
}

Write-Host "node: $(node --version)"
Write-Host "npm: $(npm --version)"

if (-not (Test-Command "ntn")) {
	Write-Step "Installing Notion CLI with npm..."
	npm install --global ntn
}

Write-Host "ntn: $(ntn --version)"

Write-Step "Checking Notion CLI login..."
ntn api v1/users/me *> $null
if ($LASTEXITCODE -ne 0) {
	ntn login
	Write-Host ""
	Write-Host "After confirming in the browser, run:"
	Write-Host "  ntn login poll"
	Write-Host ""
	Write-Host "Then rerun this bootstrap command:"
	Write-Host "  irm https://raw.githubusercontent.com/MotionWriter/notion-tiller-portal-public/main/scripts/bootstrap.ps1 | iex"
	exit 0
}

Write-Host ""
npm exec --yes "--package=$Package" -- notion-tiller-portal install

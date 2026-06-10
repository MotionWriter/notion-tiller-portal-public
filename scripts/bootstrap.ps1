$ErrorActionPreference = "Stop"

$Package = "github:MotionWriter/notion-tiller-portal-public#main"

function Write-Step($Message) {
	Write-Host ""
	Write-Host $Message
}

function Test-Command($Name) {
	$null -ne (Get-Command $Name -ErrorAction SilentlyContinue)
}

function Add-NpmGlobalPath {
	$prefix = npm prefix --global 2>$null
	if ($LASTEXITCODE -ne 0 -or -not $prefix) {
		return
	}
	$prefix = ($prefix | Select-Object -First 1).Trim()
	if ((Test-Path $prefix) -and (($env:Path -split ";") -notcontains $prefix)) {
		$env:Path = "$prefix;$env:Path"
	}
}

function Get-NtnCommand {
	$cmd = Get-Command "ntn.cmd" -ErrorAction SilentlyContinue
	if ($cmd) {
		return $cmd.Source
	}
	$cmd = Get-Command "ntn" -ErrorAction SilentlyContinue
	if ($cmd) {
		return $cmd.Source
	}
	return $null
}

function Invoke-Ntn($CommandArgs) {
	$ntn = Get-NtnCommand
	if (-not $ntn) {
		throw "Notion CLI command ntn was not found on PATH."
	}
	& $ntn @CommandArgs
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

Add-NpmGlobalPath

if (-not (Get-NtnCommand)) {
	Write-Step "Installing Notion CLI with npm..."
	npm install --global ntn
	Add-NpmGlobalPath
}

$ntnCommand = Get-NtnCommand
if (-not $ntnCommand) {
	Write-Host "Notion CLI installed, but ntn is not available in this PowerShell session."
	Write-Host "Close and reopen PowerShell, then rerun:"
	Write-Host "  irm https://raw.githubusercontent.com/MotionWriter/notion-tiller-portal-public/main/scripts/bootstrap.ps1 | iex"
	exit 1
}

Write-Host "ntn: $(& $ntnCommand --version)"

Write-Step "Checking Notion CLI login..."
Invoke-Ntn -CommandArgs @("api", "v1/users/me") *> $null
if ($LASTEXITCODE -ne 0) {
	Invoke-Ntn -CommandArgs @("login")
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

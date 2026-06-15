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

function Write-NodeManualInstallHelp {
	Write-Host "Open this page to install Node.js 22+ LTS:"
	Write-Host "  https://nodejs.org"
	Write-Host ""
	Write-Host "npm is included with Node.js."
	Write-Host ""
	Write-Host "After installing Node, close and reopen PowerShell, then rerun:"
	Write-Host "  irm https://raw.githubusercontent.com/MotionWriter/notion-tiller-portal-public/main/scripts/bootstrap.ps1 | iex"
}

function Resolve-NodeRequirement($Reason) {
	Write-Host $Reason
	Write-Host ""
	Write-Host "Node.js 22+ and npm are required to move forward."
	Write-Host ""

	if (Test-Command "winget") {
		Write-Host "You can install Node.js from:"
		Write-Host "  https://nodejs.org"
		Write-Host ""
		$answer = Read-Host "Or install Node.js 22 LTS now with winget? [y/N]"
		if ($answer -match "^(y|yes)$") {
			Write-Step "Installing Node.js 22 LTS with winget..."
			winget install --id OpenJS.NodeJS.LTS -e --accept-package-agreements --accept-source-agreements
			if ($LASTEXITCODE -eq 0) {
				Write-Host ""
				Write-Host "Node.js install finished."
				Write-Host "Close and reopen PowerShell, then rerun:"
				Write-Host "  irm https://raw.githubusercontent.com/MotionWriter/notion-tiller-portal-public/main/scripts/bootstrap.ps1 | iex"
				return
			}
			Write-Host ""
			Write-Host "winget install did not complete successfully."
		}
	} else {
		Write-Host "winget is not available in this PowerShell session."
	}

	Write-NodeManualInstallHelp
}

Write-Host "Notion Tiller Portal bootstrap"
Write-Host ""
Write-Host "This gets your terminal ready, then starts the guided installer."
Write-Host "Daily render work happens in Notion after setup."
Write-Host ""

if (-not (Test-Command "node") -or -not (Test-Command "npm")) {
	Resolve-NodeRequirement "Node.js or npm was not found."
	exit 1
}

$nodeMajor = Get-MajorVersion "node" @("--version")
if ($null -eq $nodeMajor -or $nodeMajor -lt 22) {
	Resolve-NodeRequirement "Node.js 22+ is required. Found: $(node --version)"
	exit 1
}

$npmMajor = Get-MajorVersion "npm" @("--version")
if ($null -eq $npmMajor -or $npmMajor -lt 10) {
	Resolve-NodeRequirement "npm 10+ is required. Found: $(npm --version)"
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

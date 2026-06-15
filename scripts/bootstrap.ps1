$ErrorActionPreference = "Stop"

$Package = "github:MotionWriter/notion-tiller-portal-public#main"

function Write-Step($Message) {
	Write-Host ""
	Write-Host $Message
}

function Write-ActionNeeded($Message) {
	Write-Host ""
	Write-Host ">>> ACTION NEEDED <<<" -ForegroundColor Yellow
	Write-Host $Message -ForegroundColor Yellow
}

function Test-Command($Name) {
	$null -ne (Get-Command $Name -ErrorAction SilentlyContinue)
}

function Get-NpmCommand {
	$cmd = Get-Command "npm.cmd" -ErrorAction SilentlyContinue
	if ($cmd) {
		return $cmd.Source
	}
	$cmd = Get-Command "npm" -ErrorAction SilentlyContinue
	if ($cmd) {
		return $cmd.Source
	}
	return $null
}

function Get-GitCommand {
	$cmd = Get-Command "git.exe" -ErrorAction SilentlyContinue
	if ($cmd) {
		return $cmd.Source
	}
	$cmd = Get-Command "git" -ErrorAction SilentlyContinue
	if ($cmd) {
		return $cmd.Source
	}
	return $null
}

function Invoke-Npm($CommandArgs) {
	$npm = Get-NpmCommand
	if (-not $npm) {
		throw "npm command was not found on PATH."
	}
	& $npm @CommandArgs
}

function Add-NpmGlobalPath {
	$npm = Get-NpmCommand
	if (-not $npm) {
		return
	}
	$prefix = & $npm prefix --global 2>$null
	if ($LASTEXITCODE -ne 0 -or -not $prefix) {
		return
	}
	$prefix = ($prefix | Select-Object -First 1).Trim()
	if ((Test-Path $prefix) -and (($env:Path -split ";") -notcontains $prefix)) {
		$env:Path = "$prefix;$env:Path"
	}
}

function Write-GitManualInstallHelp {
	Write-Host "Open this page to install Git for Windows:"
	Write-Host "  https://git-scm.com/download/win"
	Write-Host ""
	Write-Host "Git is required because npm fetches this installer from GitHub."
	Write-ActionNeeded "After Git installs, do NOT run a login poll command yet."
	Write-Host "Close and reopen PowerShell, then rerun this bootstrap command:"
	Write-Host "  irm https://raw.githubusercontent.com/MotionWriter/notion-tiller-portal-public/main/scripts/bootstrap.ps1 | iex"
}

function Resolve-GitRequirement {
	Write-Host "Git was not found on PATH."
	Write-Host ""
	Write-Host "Git is required because npm fetches this installer from GitHub."
	Write-Host ""

	if (Test-Command "winget") {
		Write-Host "You can install Git from:"
		Write-Host "  https://git-scm.com/download/win"
		Write-Host ""
		$answer = Read-Host "Or install Git for Windows now with winget? [y/N]"
		if ($answer -match "^(y|yes)$") {
			Write-Step "Installing Git for Windows with winget..."
			winget install --id Git.Git -e --accept-package-agreements --accept-source-agreements
			if ($LASTEXITCODE -eq 0) {
				Write-Host ""
				Write-Host "Git install finished."
				Write-ActionNeeded "Do NOT run a login poll command yet."
				Write-Host "Close and reopen PowerShell, then rerun this bootstrap command:"
				Write-Host "  irm https://raw.githubusercontent.com/MotionWriter/notion-tiller-portal-public/main/scripts/bootstrap.ps1 | iex"
				return
			}
			Write-Host ""
			Write-Host "winget install did not complete successfully."
		}
	} else {
		Write-Host "winget is not available in this PowerShell session."
	}

	Write-GitManualInstallHelp
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

function Invoke-NativeQuiet($Command, [string[]]$CommandArgs) {
	$oldErrorActionPreference = $ErrorActionPreference
	$ErrorActionPreference = "Continue"
	try {
		& $Command @CommandArgs 1>$null 2>$null
		return $LASTEXITCODE
	} catch {
		return 1
	} finally {
		$ErrorActionPreference = $oldErrorActionPreference
	}
}

function Test-NtnAuth {
	$ntn = Get-NtnCommand
	if (-not $ntn) {
		return $false
	}
	$status = Invoke-NativeQuiet -Command $ntn -CommandArgs @("api", "v1/users/me")
	return $status -eq 0
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
	Write-ActionNeeded "After Node installs, do NOT run a login poll command yet."
	Write-Host "Close and reopen PowerShell, then rerun this bootstrap command:"
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
				Write-ActionNeeded "Do NOT run a login poll command yet."
				Write-Host "Close and reopen PowerShell, then rerun this bootstrap command:"
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

if (-not (Test-Command "node") -or -not (Get-NpmCommand)) {
	Resolve-NodeRequirement "Node.js or npm was not found."
	exit 1
}

$nodeMajor = Get-MajorVersion "node" @("--version")
if ($null -eq $nodeMajor -or $nodeMajor -lt 22) {
	Resolve-NodeRequirement "Node.js 22+ is required. Found: $(node --version)"
	exit 1
}

$npmCommand = Get-NpmCommand
$npmMajor = Get-MajorVersion $npmCommand @("--version")
if ($null -eq $npmMajor -or $npmMajor -lt 10) {
	Resolve-NodeRequirement "npm 10+ is required. Found: $(& $npmCommand --version)"
	exit 1
}

Write-Host "node: $(node --version)"
Write-Host "npm: $(& $npmCommand --version)"

$gitCommand = Get-GitCommand
if (-not $gitCommand) {
	Resolve-GitRequirement
	exit 1
}

Write-Host "git: $(& $gitCommand --version)"

Add-NpmGlobalPath

if (-not (Get-NtnCommand)) {
	Write-Step "Installing Notion CLI with npm..."
	Invoke-Npm -CommandArgs @("install", "--global", "ntn")
	Add-NpmGlobalPath
}

$ntnCommand = Get-NtnCommand
if (-not $ntnCommand) {
	Write-Host "Notion CLI installed, but ntn is not available in this PowerShell session."
	Write-ActionNeeded "Close and reopen PowerShell, then rerun this bootstrap command:"
	Write-Host "  irm https://raw.githubusercontent.com/MotionWriter/notion-tiller-portal-public/main/scripts/bootstrap.ps1 | iex"
	exit 1
}

Write-Host "ntn: $(& $ntnCommand --version)"
$env:NOTION_TILLER_NTN_COMMAND = $ntnCommand

Write-Step "Checking Notion CLI login..."
if (-not (Test-NtnAuth)) {
	Invoke-Ntn -CommandArgs @("login")
	Write-ActionNeeded "Only now should you run ntn.cmd login poll."
	Write-Host "After confirming the browser code, run:"
	Write-Host "  ntn.cmd login poll"
	Write-Host ""
	Write-Host "Then rerun this bootstrap command:"
	Write-Host "  irm https://raw.githubusercontent.com/MotionWriter/notion-tiller-portal-public/main/scripts/bootstrap.ps1 | iex"
	exit 0
}

Write-Host ""
Invoke-Npm -CommandArgs @("exec", "--yes", "--package=$Package", "--", "notion-tiller-portal", "install")

# 01 Quick Start

## Table of Contents

- Setup requirements
- Install command
- First run checklist

## Setup Requirements

You need:

- Notion workspace with Workers enabled
- One blank Notion setup page
- Notion internal integration token
- Tiller email/password
- Node.js 22+ and npm

## Install Command

Windows PowerShell:

```powershell
irm https://raw.githubusercontent.com/MotionWriter/notion-tiller-portal-public/main/scripts/bootstrap.ps1 | iex
```

macOS/Linux:

```shell
curl -fsSL https://raw.githubusercontent.com/MotionWriter/notion-tiller-portal-public/main/scripts/bootstrap.sh | bash
```

If bootstrap just installed Node, stop there. Close and reopen Terminal or PowerShell, then rerun bootstrap. Do not run a login poll command yet.

If bootstrap pauses after Notion login, run the command for your computer.

macOS/Linux:

```shell
"$HOME/.local/bin/ntn" login poll
```

Windows:

```powershell
ntn.cmd login poll
```

Then rerun bootstrap or run:

```shell
npm exec --yes --package=github:MotionWriter/notion-tiller-portal-public#main -- notion-tiller-portal install
```

Notion CLI install note: Windows uses `npm install --global ntn`; macOS/Linux can use the Notion install script.

## First Run Checklist

| Done | Item |
| --- | --- |
|  | Create setup page. |
|  | Share setup page with Notion integration. |
|  | Run installer. |
|  | Confirm webhook URLs appear in Settings. |
|  | Create Notion automations. |
|  | Run `doctor`. |

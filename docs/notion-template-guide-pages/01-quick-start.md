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

```shell
curl -fsSL https://raw.githubusercontent.com/MotionWriter/notion-tiller-portal-public/main/scripts/bootstrap.sh | bash
```

If bootstrap pauses after Notion login, run:

```shell
ntn login poll
```

Then rerun bootstrap or run:

```shell
npm exec --yes --package=github:MotionWriter/notion-tiller-portal-public#main -- notion-tiller-portal install
```

## First Run Checklist

| Done | Item |
| --- | --- |
|  | Create setup page. |
|  | Share setup page with Notion integration. |
|  | Run installer. |
|  | Save webhook URLs to Settings when prompted. |
|  | Create Notion automations. |
|  | Run `doctor`. |

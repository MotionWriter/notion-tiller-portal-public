# 02 Credentials

## Table of Contents

- Credential model
- Commands
- Google Drive setup

## Credential Model

Secrets stay in Worker env. Do not paste passwords or API secrets into Notion database fields.

| Command | Use It For |
| --- | --- |
| `credentials` | Tiller email/password, Notion token, Tiller API base. |
| `google-drive` | Google Drive API key, OAuth values, max Drive download size. |
| `secrets` | Review set/missing Worker env values or delete old values. |
| `doctor` | Check setup and auth. |

## Commands

Use `npm` on macOS/Linux. Use `npm.cmd` on Windows PowerShell.

```shell
npm exec --yes --package=github:MotionWriter/notion-tiller-portal-public#main -- notion-tiller-portal credentials
```

```shell
npm exec --yes --package=github:MotionWriter/notion-tiller-portal-public#main -- notion-tiller-portal google-drive
```

```shell
npm exec --yes --package=github:MotionWriter/notion-tiller-portal-public#main -- notion-tiller-portal secrets
```

```shell
npm exec --yes --package=github:MotionWriter/notion-tiller-portal-public#main -- notion-tiller-portal doctor
```

## Google Drive Setup

Use the separate Google Drive setup page for API links, scopes, and AI helper prompt:

[Google Drive API Setup for Tiller Portal](https://app.notion.com/p/379159ce78f881609406cd89425a84ce)

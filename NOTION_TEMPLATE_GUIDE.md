# Tiller Portal Template Guide

Use this as the customer-facing guide for installing and operating Tiller Portal.

Start with Quick Start, then jump into the specific page you need.

## Table of Contents

- [01 Quick Start](docs/notion-template-guide-pages/01-quick-start.md)
- [02 Credentials](docs/notion-template-guide-pages/02-credentials.md)
- [Google Drive API Setup for Tiller Portal](docs/notion-template-guide-pages/google-drive-api-setup.md)
- [03 Notion Automations](docs/notion-template-guide-pages/03-notion-automations.md)
- [04 Template Workflow](docs/notion-template-guide-pages/04-template-workflow.md)
- [05 Campaign Render Workflow](docs/notion-template-guide-pages/05-campaign-render-workflow.md)
- [06 Outputs](docs/notion-template-guide-pages/06-outputs.md)
- [07 Troubleshooting](docs/notion-template-guide-pages/07-troubleshooting.md)

## Best First Path

1. Open Quick Start.
2. Run the installer.
3. Open Credentials only if auth or Drive setup is needed.
4. Open Notion Automations to connect database actions.
5. Use Template Workflow to add first Template.
6. Use Campaign Render Workflow to build CSV and submit renders.
7. Use Troubleshooting when stuck.

## Shareable Notion Pages

- [Tiller Portal Template Guide](https://app.notion.com/p/379159ce78f881559769c793f1c0a75f)
- [Google Drive API Setup for Tiller Portal](https://app.notion.com/p/379159ce78f881609406cd89425a84ce)

## Support Commands

```shell
npm exec --yes --package=github:MotionWriter/notion-tiller-portal-public#main -- notion-tiller-portal doctor
```

```shell
npm exec --yes --package=github:MotionWriter/notion-tiller-portal-public#main -- notion-tiller-portal credentials
```

```shell
npm exec --yes --package=github:MotionWriter/notion-tiller-portal-public#main -- notion-tiller-portal google-drive
```

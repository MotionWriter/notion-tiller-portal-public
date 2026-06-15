# Tiller Portal Demo Onboarding

Use this walkthrough when helping someone set up the Notion Tiller Portal for the first time.

## Goal

By the end, they will have:

- A Notion portal page
- How to Use page with workflow SOP and Mermaid flow chart
- Resources page that stores grouped database pages out of the main portal view
- Settings page
- Templates, Work Orders, Campaigns, Template Data Tables, Render Outputs, Uploads, and Config databases
- Focused views like `Add New Template` and `Start Workorder`
- A Notion Worker deployed in their workspace
- Webhook URLs for Notion automations
- A setup checklist written into their Notion setup page

Daily render work happens in Notion. Terminal is only for setup and maintenance.

## Before The Call

Ask them to have:

- A Notion workspace where Workers are enabled
- Tiller email/password
- Terminal on macOS/Linux or PowerShell on Windows
- Node.js 22+ if possible

If Node is missing, the bootstrap offers an in-terminal install path when possible: Homebrew on macOS, `winget` on Windows. If the user says no, or the package manager is not available, it prints the Node download page.

## Step 1: Create The Setup Page

In Notion:

1. Create a blank page.
2. Name it something like `Tiller Portal Setup`.
3. Copy the page URL.

Tell them: this is not the portal itself. The installer creates the portal under this page and writes a setup checklist here.

## Step 2: Create The Notion Integration Token

Open:

```text
https://www.notion.so/profile/integrations/internal
```

Have them:

1. Create or open an internal integration.
2. Copy the integration token.
3. Share the setup page with that integration.

The installer also prints this link when it asks for the token.

## Step 3: Run The Bootstrap

On macOS/Linux, run:

```sh
curl -fsSL https://raw.githubusercontent.com/MotionWriter/notion-tiller-portal-public/main/scripts/bootstrap.sh | bash
```

On Windows PowerShell, run:

```powershell
irm https://raw.githubusercontent.com/MotionWriter/notion-tiller-portal-public/main/scripts/bootstrap.ps1 | iex
```

What they should see:

- Node/npm check
- Notion CLI install if missing
- Notion CLI login if needed
- Guided installer prompts

If Notion CLI login is needed, the bootstrap stops after printing a browser login URL.

Do this in order:

- Open the URL printed in Terminal.
- Confirm the browser code matches the Terminal code.
- Run the command for their computer:

```sh
"$HOME/.local/bin/ntn" login poll
```

```powershell
ntn login poll
```

- Rerun bootstrap for their computer:

```sh
curl -fsSL https://raw.githubusercontent.com/MotionWriter/notion-tiller-portal-public/main/scripts/bootstrap.sh | bash
```

```powershell
irm https://raw.githubusercontent.com/MotionWriter/notion-tiller-portal-public/main/scripts/bootstrap.ps1 | iex
```

If Node is missing, choose whether to let bootstrap install Node with Homebrew on macOS or `winget` on Windows. After Node installs, close and reopen Terminal or PowerShell, then rerun bootstrap.

## Step 4: Answer Installer Prompts

The installer asks for:

- Setup checklist Notion page URL
- Notion internal integration token
- Portal page name
- Database name prefix
- Tiller email
- Tiller password

Recommended demo values:

```text
Portal page name: Tiller Portal
Database name prefix: Tiller
```

For client/studio demos, use a prefix like `Acme` so databases become `Acme Campaigns`, `Acme Work Orders`, etc.

The installer warns that Worker secrets may briefly appear in the local process list while Notion CLI saves them. Confirm if they are comfortable continuing.

## Step 5: Store Webhooks In Settings

At the end, the installer automatically saves webhook URLs in two places:

- The backend `Tiller Portal Config` database
- A plain `Webhook URLs` section directly on the generated Settings page

Then open Notion and show:

- Setup checklist page
- Generated portal page
- Settings page
- `Webhook URLs` section on Settings

## Step 6: Add Notion Automations

This is the main manual step.

Create these Notion database automations:

| Database | Trigger | Send webhook URL |
| --- | --- | --- |
| Templates | `Action` is set to `Add to Tiller`, `Push Update`, `Check Status`, or `Sync Data Table` | `templateAction` |
| Work Orders | `Action` is set to `Submit to Tiller`, `Check Status`, or `Download Results` | `workOrderAction` |
| Campaigns | `Action` is set to `Validate`, `Build CSV`, or `Submit Render` | `campaignAction` |

For each `Send webhook` action:

- URL: paste the matching Worker webhook URL
- Custom headers: leave empty
- Content: check `Select all existing properties`

No custom JSON is needed. Notion sends the page event. The Worker reads the page ID from that event and loads the full page through the Notion API.

## Step 7: Run Doctor

Run:

```sh
npm exec --yes --package=github:MotionWriter/notion-tiller-portal-public#main -- notion-tiller-portal doctor
```

Doctor checks:

- local installer state
- Notion CLI auth
- Worker config
- Tiller auth
- webhook availability

Doctor also prints the manual automation checklist because Notion automation wiring is not reliably inspectable through the API.

## What To Demo In Notion

Open the generated portal and show:

- `Add New Template`
- `Start Workorder`
- `Active Campaigns`
- `Recent Outputs`
- Settings page with webhook information
- Setup checklist page

Point out:

- Users work from browser-based Notion after setup.
- Progress fields show action feedback.
- Render outputs come back as one output row per file.
- Secrets are stored on the Worker, not in Notion database fields.

## Maintenance Commands

Change credentials:

```sh
npm exec --yes --package=github:MotionWriter/notion-tiller-portal-public#main -- notion-tiller-portal credentials
```

Reprint onboarding:

```sh
npm exec --yes --package=github:MotionWriter/notion-tiller-portal-public#main -- notion-tiller-portal onboarding
```

## Common Issues

- `Could not find page`: share setup page with the Notion integration.
- `Workers enabled`: enable Workers in Notion workspace settings.
- `Missing NOTION_API_TOKEN`: rerun installer and update the Notion token when asked.
- `Tiller auth failed`: run `credentials` and update Tiller credentials.
- Node missing or old: let bootstrap install Node with Homebrew on macOS or `winget` on Windows, or install from the Node website, then rerun bootstrap.

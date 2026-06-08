# Notion Tiller Portal

Portable Notion + Tiller portal scaffold.

## Fast Start

Create one blank Notion setup page, then run:

```sh
curl -fsSL https://raw.githubusercontent.com/MotionWriter/notion-tiller-portal-public/main/scripts/bootstrap.sh | bash
```

The bootstrap checks Node/npm, installs the Notion CLI if needed, logs into Notion, shows onboarding, then starts install. If Node is missing or too old, it stops and prints a copy/paste install command.

## What Users Need

- A Notion workspace with Workers enabled
- One blank Notion setup checklist page
- A Notion internal integration token
- Tiller email/password
- Node.js 22+ installed locally
- Optional Google Drive API key for public asset folder links
- Optional Google Drive OAuth credentials for private folders or Drive output uploads

Create the Notion token at [Notion internal integrations](https://www.notion.so/profile/integrations/internal), then share the setup page with that integration.

## What Install Creates

- Portal page under the setup page
- How to Use page with workflow SOP and Mermaid flow chart
- Resources page that stores grouped database pages out of the main portal view
- Settings page
- Templates, Work Orders, Campaigns, Template Data Tables, Render Outputs, Uploads, and Config databases
- Focused views like `Add New Template` and `Start Work Order`
- Setup checklist on the setup page
- Notion Worker and webhook URLs

The database prefix controls names like `Tiller Campaigns`; use a client or studio name if you do not want everything named `Tiller`.

## Manual Commands

Onboarding:

```sh
npm exec --yes --package=github:MotionWriter/notion-tiller-portal-public#main -- notion-tiller-portal onboarding
```

Install:

```sh
npm exec --yes --package=github:MotionWriter/notion-tiller-portal-public#main -- notion-tiller-portal install
```

Doctor:

```sh
npm exec --yes --package=github:MotionWriter/notion-tiller-portal-public#main -- notion-tiller-portal doctor
```

Change credentials:

```sh
npm exec --yes --package=github:MotionWriter/notion-tiller-portal-public#main -- notion-tiller-portal credentials
```

Set up Google Drive:

```sh
npm exec --yes --package=github:MotionWriter/notion-tiller-portal-public#main -- notion-tiller-portal google-drive
```

Review or delete stored Worker secrets:

```sh
npm exec --yes --package=github:MotionWriter/notion-tiller-portal-public#main -- notion-tiller-portal secrets
```

## Google Drive Assets

Templates and Work Orders can use `Template Assets URL` as a Google Drive folder link.

- Public folder links use `GOOGLE_DRIVE_API_KEY`.
- Private folder links use Google Drive OAuth env values.
- Notion file uploads still work for smaller asset sets.
- Mixed Notion uploads plus Google Drive folders are supported; Notion attachments win per Upload row, Drive fills rows without attachments.

Google OAuth is manual today. The installer asks for client ID, client secret, and refresh token; it does not open a Google consent popup yet.

Run `google-drive` to add or update these values.

## After Install

Add Notion database automations:

- Templates `Action` changes -> `templateAction`
- Work Orders `Action` changes -> `workOrderAction`
- Campaigns `Action` changes -> `campaignAction`
- Cavalry script destination -> `cavalryWorkOrderStarted`

For each Notion `Send webhook` action:

- URL: paste matching webhook URL
- Custom headers: none
- Content: `Select all existing properties`

No custom JSON is needed. The Worker reads the Notion page ID from the webhook event and retrieves the full page.

## Notes

Tiller password and Notion API token are set on Notion Worker env. They are not stored in Notion pages or installer state.

Notion Workers and Notion CLI are beta. Workspace settings must allow Workers and Worker webhooks.

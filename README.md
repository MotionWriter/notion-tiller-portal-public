# Notion Tiller Portal

Portable Notion + Tiller portal scaffold.

## Fast Start

Create one blank Notion setup page, then run the command for your computer.

Windows PowerShell:

```powershell
irm https://raw.githubusercontent.com/MotionWriter/notion-tiller-portal-public/main/scripts/bootstrap.ps1 | iex
```

macOS/Linux:

```sh
curl -fsSL https://raw.githubusercontent.com/MotionWriter/notion-tiller-portal-public/main/scripts/bootstrap.sh | bash
```

The bootstrap checks Node/npm, installs the Notion CLI if needed, checks Notion login, then starts the guided installer. If Node is missing or too old, it stops and prints the install/update instruction.

Notion CLI install note: Windows uses `npm install --global ntn`; macOS/Linux can use the Notion install script.

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
- The Worker validates all pending Upload rows before uploading. Missing or mismatched files are shown in the Uploads database `Last Error` field.
- Blocked Campaign rows get `Missing Uploads` and `Missing Uploads URL` filled so users can jump straight to files that need attention.

Google OAuth is manual today. The installer asks for client ID, client secret, and refresh token; it does not open a Google consent popup yet.

Run `google-drive` to add or update these values.

Useful Google links:

- Create or restrict API keys: https://console.cloud.google.com/apis/credentials
- Enable Google Drive API: https://console.cloud.google.com/apis/library/drive.googleapis.com
- Google Drive scopes reference: https://developers.google.com/workspace/drive/api/guides/api-specific-auth
- OAuth Playground for refresh tokens: https://developers.google.com/oauthplayground

Minimum setup:

- Public Drive folders: `GOOGLE_DRIVE_API_KEY`; no OAuth scope.
- Private Drive folder reads: OAuth scope `https://www.googleapis.com/auth/drive.readonly`.
- Drive output uploads: OAuth scope `https://www.googleapis.com/auth/drive.file`.

AI helper prompt:

```text
Help me create Google Drive API credentials for Notion Tiller Portal.
Purpose: allow my Notion Worker to read asset folders from Google Drive and optionally upload finished render outputs to Google Drive.
I need:
1. Google Drive API enabled in Google Cloud.
2. An API key restricted to the Google Drive API for public folder links.
3. If I need private folders or Drive output uploads, an OAuth 2.0 client ID, client secret, and refresh token.
Scopes needed:
- For private folder reads: https://www.googleapis.com/auth/drive.readonly
- For output uploads: https://www.googleapis.com/auth/drive.file
Do not ask me to paste secrets into Notion. These values will be saved through the CLI command `notion-tiller-portal google-drive`.
Walk me step by step through Google Cloud Console and OAuth Playground.
```

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

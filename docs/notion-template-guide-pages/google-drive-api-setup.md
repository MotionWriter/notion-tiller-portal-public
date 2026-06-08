# Google Drive API Setup for Tiller Portal

## Table of Contents

- Start here
- What credentials are needed
- Where these go
- AI helper prompt

## Start Here

| Need | Link |
| --- | --- |
| Create or restrict API keys | https://console.cloud.google.com/apis/credentials |
| Enable Google Drive API | https://console.cloud.google.com/apis/library/drive.googleapis.com |
| Google Drive OAuth scopes | https://developers.google.com/workspace/drive/api/guides/api-specific-auth |
| OAuth Playground for refresh tokens | https://developers.google.com/oauthplayground |

## What Credentials Are Needed

| Use Case | Required Value | Scope |
| --- | --- | --- |
| Public Google Drive folders | `GOOGLE_DRIVE_API_KEY` | None |
| Private Google Drive folder reads | OAuth client ID, client secret, refresh token | `https://www.googleapis.com/auth/drive.readonly` |
| Google Drive output uploads | OAuth client ID, client secret, refresh token | `https://www.googleapis.com/auth/drive.file` |

## Where These Go

Do not paste Google secrets into Notion database fields.

After credentials are created, save them to the Notion Worker from Terminal:

```shell
npm exec --yes --package=github:MotionWriter/notion-tiller-portal-public#main -- notion-tiller-portal google-drive
```

## AI Helper Prompt

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

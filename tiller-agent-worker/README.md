# Tiller Agent Worker

Notion Worker used by the Notion Tiller Portal.

This Worker receives Notion database automation webhooks and runs Tiller actions for:

- Templates
- Work Orders
- Campaigns
- Cavalry work-order-started callbacks

## Deploy

Normal users should use the guided installer from the repo root. It copies this Worker into:

```sh
$HOME/.notion-tiller-portal/worker
```

Then it deploys with:

```sh
ntn workers deploy --no-git --name tiller-agent-worker
```

## Required Worker Env

Set by installer:

- `NOTION_API_TOKEN`
- `TILLER_EMAIL`
- `TILLER_PASSWORD`
- `TILLER_PORTAL_CONFIG_DATA_SOURCE_ID`

Optional:

- `TILLER_API_BASE`
- `GOOGLE_DRIVE_API_KEY`
- `GOOGLE_DRIVE_CLIENT_ID`
- `GOOGLE_DRIVE_CLIENT_SECRET`
- `GOOGLE_DRIVE_REFRESH_TOKEN`
- `MAX_DRIVE_DOWNLOAD_BYTES`
- `CAMPAIGN_CSV_COLUMNS`

Use the CLI helper to update credentials:

```sh
npm exec --yes --package=github:MotionWriter/notion-tiller-portal-public#main -- notion-tiller-portal credentials
```

## Webhooks

After deploy:

```sh
ntn workers webhooks list --workers-config-file "$HOME/.notion-tiller-portal/worker/workers.json"
```

Use these in Notion automations:

- `templateAction`
- `workOrderAction`
- `campaignAction`

Use this as a Cavalry destination when needed:

- `cavalryWorkOrderStarted`

Treat webhook URLs as secrets. Anyone with a full URL can send events to that webhook.

## User-Facing Behavior

The Worker should write short, helpful Notion updates:

- `_Progress`
- `_Milestone`
- `_Progress Note`
- `Last Error`
- `Tiller Response`

Do not write raw JSON or internal debug details into normal user-facing fields.

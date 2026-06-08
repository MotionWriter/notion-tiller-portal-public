# 03 Notion Automations

## Table of Contents

- Automation map
- Send webhook settings
- What gets sent

## Automation Map

Create Notion database automations that watch each `Action` field.

| Database | Trigger Values | Webhook |
| --- | --- | --- |
| Templates | `Add to Tiller`, `Push Update`, `Check Status`, `Sync Data Table` | `templateAction` |
| Campaigns | `Validate`, `Build CSV`, `Submit Render` | `campaignAction` |
| Work Orders | `Submit to Tiller`, `Check Status`, `Download Results` | `workOrderAction` |

## Send Webhook Settings

| Setting | Value |
| --- | --- |
| URL | Matching URL from Settings > Webhook URLs. |
| Custom headers | Leave empty. |
| Content | Select all existing properties. |

## What Gets Sent

No custom JSON needed. Notion includes the page ID in the webhook payload. Worker uses that ID to load full page data from Notion.

# 06 Outputs

## Table of Contents

- Output database
- Download/result behavior
- Google Drive output path

## Output Database

Render Outputs stores one finished file per row.

| Field | Meaning |
| --- | --- |
| `Output File` | Finished render attached in Notion. |
| `Campaign` | Campaign that produced output. |
| `Work Order` | Tiller Work Order. |
| `Template` | Template used. |
| `Status` | Output availability/failure. |

## Download / Result Behavior

End user should not need raw Tiller JSON or expiring Tiller result URLs. Worker should attach finished files into Render Outputs.

## Google Drive Output Path

If configured, Worker can upload outputs to Drive. Use `google-drive` command to set OAuth values.

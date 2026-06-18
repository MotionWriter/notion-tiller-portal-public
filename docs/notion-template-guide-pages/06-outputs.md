# 06 Outputs

## Table of Contents

- Output database
- Download/result behavior
- Google Drive output path
- How to send outputs to Google Drive

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

Google Drive output uploads require OAuth credentials with this scope:

```text
https://www.googleapis.com/auth/drive.file
```

Public folder links are enough for reading asset folders, but they are not enough for uploading finished renders. Uploading outputs requires OAuth.

## How to Send Outputs to Google Drive

1. Run the Google Drive setup command:

```shell
npm exec --yes --package=github:MotionWriter/notion-tiller-portal-public#main -- notion-tiller-portal google-drive
```

2. Add OAuth client ID, client secret, and refresh token with the Drive file scope.
3. In the Work Order row, paste the target Google Drive folder URL into `Download Renders Here`.
4. Submit the render or run `Download Results`.
5. Finished files still attach to Render Outputs in Notion. If Drive upload succeeds, copies are also placed in the Google Drive folder.

If Google Drive upload fails, the Worker still attaches the output file in Notion and writes the Drive issue to the Render Output `Last Error` field.

Use `Template Assets URL` for input assets. Use `Download Renders Here` for output folders.

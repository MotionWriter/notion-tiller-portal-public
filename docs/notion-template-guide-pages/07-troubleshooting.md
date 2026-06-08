# 07 Troubleshooting

## Table of Contents

- Common fixes
- Auth fixes
- Upload fixes

## Common Fixes

| Problem | Fix |
| --- | --- |
| Template does not submit | Confirm `Cav File` attached and `Action` is `Add to Tiller`. |
| Template pending assets | Add assets through Upload rows or `Template Assets URL`, then use `Push Update`. |
| Campaign cannot build CSV | Confirm Template data table exists, rows link `_Campaign`, and `_Include in Render` is checked. |
| Render does not start | Check Campaign `Last Error`, `_Milestone`, `_Progress Note`, then run `doctor`. |
| Outputs do not attach | Open Work Orders and use `Check Status` or `Download Results`. |

## Auth Fixes

Tiller auth failed:

```shell
npm exec --yes --package=github:MotionWriter/notion-tiller-portal-public#main -- notion-tiller-portal credentials
```

Check setup:

```shell
npm exec --yes --package=github:MotionWriter/notion-tiller-portal-public#main -- notion-tiller-portal doctor
```

## Upload Fixes

Google Drive assets fail:

```shell
npm exec --yes --package=github:MotionWriter/notion-tiller-portal-public#main -- notion-tiller-portal google-drive
```

Filename mismatch: attach file whose filename matches expected `Tiller Path` basename, or fix Drive file name.

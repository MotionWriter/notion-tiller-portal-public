# 04 Template Workflow

## Table of Contents

- Add template
- Pending assets
- Sync data table

## Add Template

1. Open Templates.
2. Create a new row.
3. Attach Cavalry file in `Cav File`.
4. Set `Action` to `Add to Tiller`.
5. Watch `_Milestone`, `_Progress Note`, and `Tiller Response`.

## Pending Assets

If Tiller returns missing assets:

1. Open Uploads > Needs Files.
2. Attach missing files in Upload rows, or paste a Google Drive folder in `Template Assets URL`.
3. Set Template `Action` to `Push Update`.

Worker validates all files before uploading. If one required file is missing or mismatched, it uploads nothing and explains what to fix.

## Sync Data Table

When Template status is Ready, set `Action` to `Sync Data Table`.

This creates a Template-specific data rows database because every Template can have different CSV columns.

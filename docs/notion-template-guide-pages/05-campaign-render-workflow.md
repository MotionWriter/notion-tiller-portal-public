# 05 Campaign Render Workflow

## Table of Contents

- Fill data rows
- Build CSV
- Submit render
- Missing uploads

## Fill Data Rows

Open the Template data table.

Required system fields:

- `_Campaign`: link row to Campaign.
- `_Include in Render`: check rows that should render.

CSV fields must match Tiller Template CSV column names exactly.

## Build CSV

Optional. Set Campaign `Action` to `Build CSV` if user wants preview before rendering.

Worker writes:

- `Generated CSV`
- `CSV Row Count`

## Submit Render

Set Campaign `Action` to `Submit Render`.

Worker automatically:

1. Validates rows.
2. Builds CSV.
3. Saves CSV on Campaign.
4. Creates Tiller Work Order.
5. Uploads parameters/assets.
6. Tracks outputs.

## Missing Uploads

If files are missing:

- Campaign Status becomes `Needs Fix`.
- `Missing Uploads` links exact Upload rows.
- `Missing Uploads URL` links first missing Upload row.

Open Uploads > Needs Files to fix all missing files.

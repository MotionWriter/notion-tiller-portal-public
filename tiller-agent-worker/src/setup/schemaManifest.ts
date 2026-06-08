export type SimplePropertyType =
	| "title"
	| "rich_text"
	| "number"
	| "select"
	| "url"
	| "files"
	| "date"
	| "checkbox"
	| "relation";

export type DatabaseKey =
	| "templates"
	| "workOrders"
	| "campaigns"
	| "templateDataTableIndex"
	| "renderOutputs"
	| "uploads"
	| "config";

export type Placement = "portal" | "settings" | "templateDataTables";

export type PropertySpec = {
	name: string;
	type: SimplePropertyType;
	options?: string[];
	relationTo?: DatabaseKey;
};

export type DatabaseSpec = {
	key: DatabaseKey;
	name: string;
	placement: Placement;
	creatorFacing: boolean;
	properties: PropertySpec[];
};

export const PORTAL_PAGE_TITLE = "Tiller Portal";
export const SETTINGS_PAGE_TITLE = "Settings";
export const CONFIG_ROW_TITLE = "Default Install";

const PROGRESS_MILESTONES = [
	"Idle",
	"Queued",
	"Reading Cav file",
	"Authenticating Tiller",
	"Validating Scene",
	"Checking Status",
	"Reading Template",
	"Checking Rows",
	"Building CSV",
	"Creating Template",
	"Creating Work Order",
	"Uploading Parameters",
	"Uploading Assets",
	"Checking Assets",
	"Waiting on Assets",
	"Waiting on Tiller",
	"Downloading Outputs",
	"CSV Ready",
	"Ready",
	"Done",
	"Needs Fix",
	"Error",
];

export const DATABASE_SPECS: DatabaseSpec[] = [
	{
		key: "templates",
		name: "Tiller Templates",
		placement: "portal",
		creatorFacing: true,
		properties: [
			{ name: "Name", type: "title" },
			{ name: "Cav File", type: "files" },
			{ name: "Template Assets URL", type: "url" },
			{ name: "Status", type: "select", options: ["Draft", "PendingAssets", "Ready", "Failed", "Archived", "Unknown"] },
			{ name: "Action", type: "select", options: ["None", "Add to Tiller", "Push Update", "Check Status", "Sync Data Table"] },
			{ name: "_Milestone", type: "select", options: PROGRESS_MILESTONES },
			{ name: "_Progress Note", type: "rich_text" },
			{ name: "_Progress", type: "number" },
			{ name: "Required Assets", type: "rich_text" },
			{ name: "Data Rows Status", type: "select", options: ["Pending", "Ready", "Needs Sync", "Failed"] },
			{ name: "Data Rows Database URL", type: "url" },
			{ name: "CSV Columns", type: "rich_text" },
			{ name: "Tiller Response", type: "rich_text" },
			{ name: "Last Error", type: "rich_text" },
			{ name: "Tiller Template ID", type: "number" },
			{ name: "Data Rows Database ID", type: "rich_text" },
			{ name: "Template Details", type: "rich_text" },
			{ name: "Parameter File Path", type: "rich_text" },
			{ name: "Smart Folder Parameters", type: "rich_text" },
			{ name: "Render Outputs", type: "relation", relationTo: "renderOutputs" },
			{ name: "Worker Lock", type: "rich_text" },
			{ name: "Lock Expires At", type: "date" },
			{ name: "Last Action ID", type: "rich_text" },
			{ name: "Last Synced At", type: "date" },
		],
	},
	{
		key: "workOrders",
		name: "Tiller Work Orders",
		placement: "portal",
		creatorFacing: true,
		properties: [
			{ name: "Name", type: "title" },
			{ name: "Template", type: "relation", relationTo: "templates" },
			{ name: "Campaign", type: "relation", relationTo: "campaigns" },
			{ name: "Render Count", type: "number" },
			{ name: "Parameter CSV", type: "files" },
			{ name: "Dynamic Assets", type: "files" },
			{ name: "Template Assets URL", type: "url" },
			{ name: "Required Uploads", type: "rich_text" },
			{ name: "Render Status", type: "select", options: ["Draft", "Submit Requested", "Pending Parameters", "Pending Dynamic Assets", "Queued", "Rendering", "Done", "Failed", "Archived"] },
			{ name: "Action", type: "select", options: ["None", "Submit to Tiller", "Check Status", "Download Results"] },
			{ name: "_Milestone", type: "select", options: PROGRESS_MILESTONES },
			{ name: "_Progress Note", type: "rich_text" },
			{ name: "_Progress", type: "number" },
			{ name: "Completed Renders", type: "number" },
			{ name: "Render Outputs", type: "relation", relationTo: "renderOutputs" },
			{ name: "Last Error", type: "rich_text" },
			{ name: "Tiller Template ID", type: "number" },
			{ name: "Tiller Work Order ID", type: "number" },
			{ name: "Worker Lock", type: "rich_text" },
			{ name: "Lock Expires At", type: "date" },
			{ name: "Last Action ID", type: "rich_text" },
			{ name: "Submitted At", type: "date" },
			{ name: "Completed At", type: "date" },
			{ name: "Last Synced At", type: "date" },
		],
	},
	{
		key: "campaigns",
		name: "Tiller Campaigns",
		placement: "portal",
		creatorFacing: true,
		properties: [
			{ name: "Name", type: "title" },
			{ name: "Template", type: "relation", relationTo: "templates" },
			{ name: "Campaign Status", type: "select", options: ["Draft", "Needs Fix", "Ready", "Rendering", "Done", "Failed"] },
			{ name: "CSV Row Count", type: "number" },
			{ name: "Generated CSV", type: "rich_text" },
			{ name: "Action", type: "select", options: ["None", "Validate", "Build CSV", "Submit Render"] },
			{ name: "Work Order", type: "relation", relationTo: "workOrders" },
			{ name: "Missing Uploads", type: "relation", relationTo: "uploads" },
			{ name: "Missing Uploads URL", type: "url" },
			{ name: "Render Outputs", type: "relation", relationTo: "renderOutputs" },
			{ name: "_Milestone", type: "select", options: PROGRESS_MILESTONES },
			{ name: "_Progress Note", type: "rich_text" },
			{ name: "_Progress", type: "number" },
			{ name: "Last Error", type: "rich_text" },
			{ name: "Worker Lock", type: "rich_text" },
			{ name: "Lock Expires At", type: "date" },
			{ name: "Last Action ID", type: "rich_text" },
			{ name: "Last Synced At", type: "date" },
		],
	},
	{
		key: "templateDataTableIndex",
		name: "Tiller Template Data Tables",
		placement: "templateDataTables",
		creatorFacing: true,
		properties: [
			{ name: "Name", type: "title" },
			{ name: "Template", type: "relation", relationTo: "templates" },
			{ name: "Data Rows Database URL", type: "url" },
			{ name: "CSV Columns", type: "rich_text" },
			{ name: "Status", type: "select", options: ["Ready", "Needs Sync", "Failed"] },
			{ name: "Last Synced At", type: "date" },
			{ name: "Last Error", type: "rich_text" },
			{ name: "Data Rows Database ID", type: "rich_text" },
		],
	},
	{
		key: "renderOutputs",
		name: "Tiller Render Outputs",
		placement: "portal",
		creatorFacing: true,
		properties: [
			{ name: "Name", type: "title" },
			{ name: "Output File", type: "files" },
			{ name: "Status", type: "select", options: ["Available", "Failed"] },
			{ name: "Campaign", type: "relation", relationTo: "campaigns" },
			{ name: "Work Order", type: "relation", relationTo: "workOrders" },
			{ name: "Template", type: "relation", relationTo: "templates" },
			{ name: "Output Filename", type: "rich_text" },
			{ name: "Output Index", type: "number" },
			{ name: "File Size Bytes", type: "number" },
			{ name: "Content Type", type: "rich_text" },
			{ name: "Downloaded At", type: "date" },
			{ name: "Last Error", type: "rich_text" },
			{ name: "Tiller Work Order ID", type: "number" },
			{ name: "Tiller Template ID", type: "number" },
		],
	},
	{
		key: "uploads",
		name: "Tiller Uploads",
		placement: "settings",
		creatorFacing: false,
		properties: [
			{ name: "Name", type: "title" },
			{ name: "Phase", type: "select", options: ["template_asset", "parameter", "dynamic_asset"] },
			{ name: "File", type: "files" },
			{ name: "Tiller Path", type: "rich_text" },
			{ name: "Ready", type: "checkbox" },
			{ name: "Parent Template", type: "relation", relationTo: "templates" },
			{ name: "Parent Work Order", type: "relation", relationTo: "workOrders" },
			{ name: "Parent Template Page ID", type: "rich_text" },
			{ name: "Parent Work Order Page ID", type: "rich_text" },
			{ name: "Uploaded At", type: "date" },
			{ name: "Last Error", type: "rich_text" },
		],
	},
	{
		key: "config",
		name: "Tiller Portal Config",
		placement: "settings",
		creatorFacing: false,
		properties: [
			{ name: "Name", type: "title" },
			{ name: "Install Status", type: "select", options: ["Ready", "Needs Repair", "Failed"] },
			{ name: "Parent Page ID", type: "rich_text" },
			{ name: "Portal Page ID", type: "rich_text" },
			{ name: "Settings Page ID", type: "rich_text" },
			{ name: "Template Data Tables Page ID", type: "rich_text" },
			{ name: "Templates Data Source ID", type: "rich_text" },
			{ name: "Work Orders Data Source ID", type: "rich_text" },
			{ name: "Campaigns Data Source ID", type: "rich_text" },
			{ name: "Template Data Table Index Data Source ID", type: "rich_text" },
			{ name: "Render Outputs Data Source ID", type: "rich_text" },
			{ name: "Uploads Data Source ID", type: "rich_text" },
			{ name: "Template Webhook URL", type: "url" },
			{ name: "Work Order Webhook URL", type: "url" },
			{ name: "Campaign Webhook URL", type: "url" },
			{ name: "Cavalry Webhook URL", type: "url" },
			{ name: "Last Setup At", type: "date" },
			{ name: "Last Error", type: "rich_text" },
		],
	},
];

export function getDatabaseSpec(key: DatabaseKey) {
	const spec = DATABASE_SPECS.find((item) => item.key === key);
	if (!spec) throw new Error(`Unknown database key: ${key}`);
	return spec;
}

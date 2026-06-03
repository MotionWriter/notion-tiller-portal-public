import {
	CONFIG_ROW_TITLE,
	DATABASE_SPECS,
	DatabaseKey,
	DatabaseSpec,
	PORTAL_PAGE_TITLE,
	PropertySpec,
	SETTINGS_PAGE_TITLE,
} from "./schemaManifest.js";

type SetupWorkspaceInput = {
	parentPageId: string;
	portalName?: string;
	databasePrefix?: string;
	webhookUrls?: Partial<Record<"templateAction" | "workOrderAction" | "campaignAction" | "cavalryWorkOrderStarted", string>>;
	writeSetupChecklist?: boolean | null;
	mode?: "create_or_repair";
	dryRun?: boolean | null;
};

type DataSourceRef = {
	databaseId: string;
	dataSourceId: string;
	url: string;
};

type SetupWorkspaceResult = {
	ok: boolean;
	dryRun: boolean;
	parentPageId: string;
	portalPageId: string;
	settingsPageId: string;
	configDataSourceId: string;
	dataSources: Record<string, string>;
	nextSteps: string[];
	created: string[];
	repaired: string[];
};

type StarterViewSpec = {
	key: DatabaseKey;
	name: string;
	type: "table" | "gallery" | "board" | "list";
	filter?: Record<string, unknown>;
	sorts?: Array<Record<string, unknown>>;
	visibleProperties?: string[];
	includeCsvProperties?: boolean;
};

const NOTION_VIEWS_API_VERSION = "2026-03-11";

const STARTER_VIEWS: StarterViewSpec[] = [
	{
		key: "campaigns",
		name: "Active Campaigns",
		type: "table",
		filter: { property: "Campaign Status", select: { does_not_equal: "Done" } },
		sorts: [{ property: "Last Synced At", direction: "descending" }],
		visibleProperties: ["Name", "Action", "_Progress", "_Milestone", "_Progress Note", "Campaign Status", "Template", "Work Order", "CSV Row Count", "Last Error"],
	},
	{
		key: "campaigns",
		name: "Needs Fix",
		type: "table",
		filter: { property: "Campaign Status", select: { equals: "Needs Fix" } },
		sorts: [{ property: "Last Synced At", direction: "descending" }],
		visibleProperties: ["Name", "Action", "_Progress", "_Milestone", "Campaign Status", "Template", "CSV Row Count", "Last Error"],
	},
	{
		key: "campaigns",
		name: "Ready to Render",
		type: "table",
		filter: { property: "Campaign Status", select: { equals: "Ready" } },
		sorts: [{ property: "Last Synced At", direction: "descending" }],
		visibleProperties: ["Name", "Action", "_Progress", "_Milestone", "Campaign Status", "Template", "CSV Row Count", "Generated CSV"],
	},
	{
		key: "campaigns",
		name: "Completed",
		type: "table",
		filter: { property: "Campaign Status", select: { equals: "Done" } },
		sorts: [{ property: "Last Synced At", direction: "descending" }],
		visibleProperties: ["Name", "Campaign Status", "Template", "Work Order", "Render Outputs", "CSV Row Count", "Last Synced At"],
	},
	{
		key: "campaignDataRows",
		name: "By Campaign",
		type: "table",
		visibleProperties: ["_Row", "_Campaign", "_Include in Render", "_Row Status", "_Output Name"],
		includeCsvProperties: true,
	},
	{
		key: "campaignDataRows",
		name: "Included Rows",
		type: "table",
		filter: { property: "_Include in Render", checkbox: { equals: true } },
		visibleProperties: ["_Row", "_Campaign", "_Include in Render", "_Row Status", "_Output Name"],
		includeCsvProperties: true,
	},
	{
		key: "templates",
		name: "Add New Template",
		type: "table",
		filter: { property: "Status", select: { does_not_equal: "Archived" } },
		sorts: [{ property: "Last Synced At", direction: "descending" }],
		visibleProperties: ["Name", "Action", "_Progress", "_Milestone", "_Progress Note", "Status", "Cav File", "Template Assets URL", "Tiller Template ID", "Tiller Response", "Last Error"],
	},
	{
		key: "templates",
		name: "Ready Templates",
		type: "gallery",
		filter: { property: "Status", select: { equals: "Ready" } },
		sorts: [{ property: "Last Synced At", direction: "descending" }],
		visibleProperties: ["Name", "Status", "Tiller Template ID", "CSV Columns", "Parameter File Path", "Last Synced At"],
	},
	{
		key: "templates",
		name: "Needs Assets",
		type: "table",
		filter: { property: "Status", select: { equals: "PendingAssets" } },
		sorts: [{ property: "Last Synced At", direction: "descending" }],
		visibleProperties: ["Name", "Action", "_Progress", "_Milestone", "Status", "Template Assets URL", "Required Assets", "Tiller Response", "Last Error"],
	},
	{
		key: "workOrders",
		name: "Start Workorder",
		type: "table",
		filter: { property: "Render Status", select: { does_not_equal: "Archived" } },
		sorts: [{ property: "Last Synced At", direction: "descending" }],
		visibleProperties: ["Name", "Action", "_Progress", "_Milestone", "_Progress Note", "Render Status", "Template", "Campaign", "Tiller Template ID", "Render Count", "Parameter CSV", "Dynamic Assets", "Template Assets URL", "Required Uploads", "Last Error"],
	},
	{
		key: "workOrders",
		name: "Active Work Orders",
		type: "table",
		filter: { property: "Render Status", select: { does_not_equal: "Done" } },
		sorts: [{ property: "Last Synced At", direction: "descending" }],
		visibleProperties: ["Name", "Action", "_Progress", "_Milestone", "Render Status", "Template", "Campaign", "Tiller Work Order ID", "Render Count", "Required Uploads", "Last Error"],
	},
	{
		key: "workOrders",
		name: "Ready to Download",
		type: "table",
		filter: { property: "Render Status", select: { equals: "Done" } },
		sorts: [{ property: "Completed At", direction: "descending" }],
		visibleProperties: ["Name", "Action", "_Progress", "_Milestone", "Render Status", "Completed Renders", "Render Outputs", "Completed At"],
	},
	{
		key: "workOrders",
		name: "Done",
		type: "table",
		filter: { property: "Render Status", select: { equals: "Done" } },
		sorts: [{ property: "Completed At", direction: "descending" }],
		visibleProperties: ["Name", "Render Status", "Template", "Campaign", "Tiller Work Order ID", "Completed Renders", "Render Outputs", "Completed At"],
	},
	{
		key: "renderOutputs",
		name: "Recent Outputs",
		type: "gallery",
		sorts: [{ property: "Downloaded At", direction: "descending" }],
		visibleProperties: ["Name", "Output File", "Status", "Campaign", "Work Order", "Template", "Output Index", "Downloaded At"],
	},
	{
		key: "renderOutputs",
		name: "By Campaign",
		type: "table",
		sorts: [{ property: "Downloaded At", direction: "descending" }],
		visibleProperties: ["Name", "Output File", "Status", "Campaign", "Work Order", "Template", "Output Index", "Downloaded At", "Last Error"],
	},
];

export async function setupWorkspace({
	notion,
	input,
}: {
	notion: any;
	input: SetupWorkspaceInput;
}): Promise<SetupWorkspaceResult> {
	const parentPageId = extractSetupPageId(input.parentPageId);
	if (!parentPageId) throw new Error("setupWorkspace needs parentPageId as a Notion page ID or URL.");
	const dryRun = input.dryRun === true;

	await notion.pages.retrieve({ page_id: parentPageId });
	if (dryRun) {
		return {
			ok: true,
			dryRun,
			parentPageId,
			portalPageId: "",
			settingsPageId: "",
			configDataSourceId: "",
			dataSources: {},
			nextSteps: dryRunNextSteps(),
			created: [],
			repaired: [],
		};
	}

	const created: string[] = [];
	const repaired: string[] = [];
	const portalTitle = cleanName(input.portalName) || PORTAL_PAGE_TITLE;
	const databasePrefix = cleanName(input.databasePrefix) || "Tiller";
	const portalPageId = await findOrCreateChildPage(notion, parentPageId, portalTitle, created);
	const settingsPageId = await findOrCreateChildPage(notion, portalPageId, SETTINGS_PAGE_TITLE, created);

	const refs: Partial<Record<DatabaseKey, DataSourceRef>> = {};
	for (const spec of DATABASE_SPECS) {
		const parentId = spec.placement === "settings" ? settingsPageId : portalPageId;
		refs[spec.key] = await findOrCreateDatabase(notion, parentId, spec, displayDatabaseName(spec, databasePrefix), created);
	}

	for (const spec of DATABASE_SPECS) {
		const ref = refs[spec.key];
		if (!ref) continue;
		await repairDatabaseProperties(notion, ref.dataSourceId, spec, refs, displayDatabaseName(spec, databasePrefix), repaired);
	}
	await ensureStarterViews(notion, refs, created, repaired);

	await upsertConfigRow({
		notion,
		parentPageId,
		portalPageId,
		settingsPageId,
		configDataSourceId: refs.config?.dataSourceId ?? "",
		refs,
		webhookUrls: input.webhookUrls ?? {},
	});
	await appendSetupInstructions(notion, settingsPageId, refs);
	if (input.writeSetupChecklist !== false) {
		await appendSetupChecklist(notion, parentPageId, {
			portalPageId,
			settingsPageId,
			storedWebhookUrls: Boolean(Object.keys(input.webhookUrls ?? {}).length),
		});
	}

	return {
		ok: true,
		dryRun,
		parentPageId,
		portalPageId,
		settingsPageId,
		configDataSourceId: refs.config?.dataSourceId ?? "",
		dataSources: Object.fromEntries(
			Object.entries(refs).map(([key, ref]) => [key, ref?.dataSourceId ?? ""]),
		),
		nextSteps: nextSteps(refs.config?.dataSourceId ?? ""),
		created,
		repaired,
	};
}

async function findOrCreateChildPage(
	notion: any,
	parentPageId: string,
	title: string,
	created: string[],
) {
	const existing = await findChildByTitle(notion, parentPageId, title, "child_page");
	if (existing?.id) return existing.id;
	const page = await notion.pages.create({
		parent: { type: "page_id", page_id: parentPageId },
		properties: {
			title: titleValue(title),
		},
	});
	created.push(`page:${title}`);
	return page.id;
}

async function findOrCreateDatabase(
	notion: any,
	parentPageId: string,
	spec: DatabaseSpec,
	databaseName: string,
	created: string[],
): Promise<DataSourceRef> {
	const existing = await findChildByTitle(notion, parentPageId, databaseName, "child_database");
	if (existing?.id) {
		const database = await notion.databases.retrieve({ database_id: existing.id });
		const dataSourceId = database.data_sources?.[0]?.id;
		if (!dataSourceId) throw new Error(`Database ${databaseName} has no data source.`);
		return { databaseId: existing.id, dataSourceId, url: database.url ?? "" };
	}

	const database = await notion.databases.create({
		parent: { type: "page_id", page_id: parentPageId },
		title: richText(databaseName),
		is_inline: false,
		initial_data_source: {
			properties: propertiesForCreate(spec),
		},
	});
	const dataSourceId = database.data_sources?.[0]?.id;
	if (!dataSourceId) throw new Error(`Created database ${databaseName} has no data source.`);
	created.push(`database:${databaseName}`);
	return { databaseId: database.id, dataSourceId, url: database.url ?? "" };
}

async function repairDatabaseProperties(
	notion: any,
	dataSourceId: string,
	spec: DatabaseSpec,
	refs: Partial<Record<DatabaseKey, DataSourceRef>>,
	databaseName: string,
	repaired: string[],
) {
	const dataSource = await notion.dataSources.retrieve({ data_source_id: dataSourceId });
	const existing = dataSource.properties ?? {};
	const hasTitleProperty = Object.values(existing).some((property: any) => property?.type === "title");
	const missing: Record<string, any> = {};
	for (const property of spec.properties) {
		if (existing[property.name]) continue;
		if (property.type === "title" && hasTitleProperty) continue;
		const request = propertyToRequest(property, refs);
		if (!request) continue;
		missing[property.name] = request;
	}
	if (Object.keys(missing).length === 0) return;
	await notion.dataSources.update({
		data_source_id: dataSourceId,
		properties: missing,
	});
	repaired.push(`properties:${databaseName}:${Object.keys(missing).join(", ")}`);
}

function displayDatabaseName(spec: DatabaseSpec, databasePrefix: string) {
	if (spec.name.startsWith("Tiller ")) return `${databasePrefix} ${spec.name.slice("Tiller ".length)}`;
	return spec.name;
}

function cleanName(value: unknown) {
	return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
}

async function ensureStarterViews(
	notion: any,
	refs: Partial<Record<DatabaseKey, DataSourceRef>>,
	created: string[],
	repaired: string[],
) {
	try {
		for (const [key, views] of groupViewsByDatabase(STARTER_VIEWS)) {
			const ref = refs[key];
			if (!ref) continue;
			const dataSource = await notion.dataSources.retrieve({ data_source_id: ref.dataSourceId });
			const properties = dataSource.properties ?? {};
			const existingViews = await listViews(ref.databaseId);
			for (const view of views) {
				const configuration = buildViewConfiguration(view, properties);
				const existing = existingViews.get(view.name);
				if (existing?.id) {
					await updateView(existing.id, view, configuration);
					repaired.push(`view:${view.key}:${view.name}`);
					continue;
				}
				await createView(ref, view, configuration);
				existingViews.set(view.name, { id: "" });
				created.push(`view:${view.key}:${view.name}`);
			}
		}
	} catch (error) {
		repaired.push(`views:skipped:${(error as Error)?.message ?? String(error)}`);
	}
}

function groupViewsByDatabase(views: StarterViewSpec[]) {
	const grouped = new Map<DatabaseKey, StarterViewSpec[]>();
	for (const view of views) {
		grouped.set(view.key, [...(grouped.get(view.key) ?? []), view]);
	}
	return grouped;
}

async function listViews(databaseId: string) {
	const views = new Map<string, { id: string }>();
	let cursor: string | undefined;
	do {
		const query = new URLSearchParams({ database_id: databaseId });
		if (cursor) query.set("start_cursor", cursor);
		const response = await notionApiRequest(`/v1/views?${query.toString()}`);
		for (const item of response.results ?? []) {
			if (!item?.id) continue;
			const view = await notionApiRequest(`/v1/views/${item.id}`);
			if (view?.name) views.set(view.name, { id: item.id });
		}
		cursor = response.next_cursor ?? undefined;
	} while (cursor);
	return views;
}

function buildViewConfiguration(view: StarterViewSpec, properties: Record<string, unknown>) {
	const visible = new Set(view.visibleProperties ?? []);
	if (view.includeCsvProperties) {
		for (const name of Object.keys(properties)) {
			if (name.startsWith("_")) continue;
			if (["Campaign", "Include in Render", "Row Order", "Row Status", "Output Name"].includes(name)) continue;
			visible.add(name);
		}
	}
	const configuredProperties = Object.keys(properties).map((name) => ({
		property_id: name,
		visible: visible.has(name),
		...(visible.has(name) ? { width: propertyWidth(name) } : {}),
	}));
	return {
		type: view.type,
		properties: configuredProperties,
		...(view.type === "table" ? { wrap_cells: true } : {}),
	};
}

function propertyWidth(name: string) {
	if (name === "Name" || name === "_Row") return 260;
	if (name === "_Progress Note" || name === "Tiller Response" || name === "Last Error") return 320;
	if (name.includes("File") || name.includes("Assets") || name.includes("Upload")) return 240;
	return 180;
}

async function createView(ref: DataSourceRef, view: StarterViewSpec, configuration: Record<string, unknown>) {
	await notionApiRequest("/v1/views", {
		method: "POST",
		body: {
			database_id: ref.databaseId,
			data_source_id: ref.dataSourceId,
			name: view.name,
			type: view.type,
			...(view.filter ? { filter: view.filter } : {}),
			...(view.sorts ? { sorts: view.sorts } : {}),
			configuration,
			position: { type: "end" },
		},
	});
}

async function updateView(viewId: string, view: StarterViewSpec, configuration: Record<string, unknown>) {
	await notionApiRequest(`/v1/views/${viewId}`, {
		method: "PATCH",
		body: {
			...(view.filter ? { filter: view.filter } : {}),
			...(view.sorts ? { sorts: view.sorts } : {}),
			configuration,
		},
	});
}

async function notionApiRequest(path: string, options: { method?: string; body?: unknown } = {}) {
	const token = process.env.NOTION_API_TOKEN;
	if (!token) throw new Error("NOTION_API_TOKEN is required to create Notion views.");
	const response = await fetch(`https://api.notion.com${path}`, {
		method: options.method ?? "GET",
		headers: {
			Authorization: `Bearer ${token}`,
			"Content-Type": "application/json",
			"Notion-Version": NOTION_VIEWS_API_VERSION,
		},
		body: options.body === undefined ? undefined : JSON.stringify(options.body),
	});
	const text = await response.text();
	const data = text ? JSON.parse(text) : {};
	if (!response.ok) {
		throw new Error(`Notion Views API ${response.status}: ${data?.message ?? text}`);
	}
	return data;
}

function propertiesForCreate(spec: DatabaseSpec) {
	const properties: Record<string, any> = {};
	for (const property of spec.properties) {
		if (property.type === "relation") continue;
		properties[property.name] = propertyToRequest(property, {});
	}
	return properties;
}

function propertyToRequest(
	property: PropertySpec,
	refs: Partial<Record<DatabaseKey, DataSourceRef>>,
) {
	if (property.type === "title") return { title: {} };
	if (property.type === "rich_text") return { rich_text: {} };
	if (property.type === "number") return { number: { format: "number" } };
	if (property.type === "url") return { url: {} };
	if (property.type === "files") return { files: {} };
	if (property.type === "date") return { date: {} };
	if (property.type === "checkbox") return { checkbox: {} };
	if (property.type === "select") {
		return {
			select: {
				options: (property.options ?? []).map((name) => ({ name })),
			},
		};
	}
	if (property.type === "relation") {
		if (!property.relationTo) return null;
		const target = refs[property.relationTo]?.dataSourceId;
		if (!target) return null;
		return {
			relation: {
				data_source_id: target,
				type: "single_property",
				single_property: {},
			},
		};
	}
	return null;
}

async function findChildByTitle(notion: any, parentPageId: string, title: string, type: string) {
	let cursor: string | undefined;
	do {
		const response = await notion.blocks.children.list({
			block_id: parentPageId,
			start_cursor: cursor,
			page_size: 100,
		});
		const match = response.results?.find((block: any) => {
			if (block.type !== type) return false;
			if (type === "child_page") return block.child_page?.title === title;
			if (type === "child_database") return block.child_database?.title === title;
			if (type === "heading_2") {
				const text = block.heading_2?.rich_text
					?.map((entry: { plain_text?: string }) => entry.plain_text ?? "")
					.join("");
				return text === title;
			}
			return false;
		});
		if (match) return match;
		cursor = response.next_cursor ?? undefined;
	} while (cursor);
	return null;
}

async function upsertConfigRow({
	notion,
	parentPageId,
	portalPageId,
	settingsPageId,
	configDataSourceId,
	refs,
	webhookUrls,
}: {
	notion: any;
	parentPageId: string;
	portalPageId: string;
	settingsPageId: string;
	configDataSourceId: string;
	refs: Partial<Record<DatabaseKey, DataSourceRef>>;
	webhookUrls: Partial<Record<"templateAction" | "workOrderAction" | "campaignAction" | "cavalryWorkOrderStarted", string>>;
}) {
	if (!configDataSourceId) return;
	const existing = await notion.dataSources.query({
		data_source_id: configDataSourceId,
		page_size: 1,
		filter: {
			property: "Name",
			title: { equals: CONFIG_ROW_TITLE },
		},
	});
	const properties = {
		Name: titleValue(CONFIG_ROW_TITLE),
		"Install Status": { select: { name: "Ready" } },
		"Parent Page ID": richTextValue(parentPageId),
		"Portal Page ID": richTextValue(portalPageId),
		"Settings Page ID": richTextValue(settingsPageId),
		"Templates Data Source ID": richTextValue(refs.templates?.dataSourceId ?? ""),
		"Work Orders Data Source ID": richTextValue(refs.workOrders?.dataSourceId ?? ""),
		"Campaigns Data Source ID": richTextValue(refs.campaigns?.dataSourceId ?? ""),
		"Campaign Data Rows Data Source ID": richTextValue(refs.campaignDataRows?.dataSourceId ?? ""),
		"Render Outputs Data Source ID": richTextValue(refs.renderOutputs?.dataSourceId ?? ""),
		"Uploads Data Source ID": richTextValue(refs.uploads?.dataSourceId ?? ""),
		...(webhookUrls.templateAction ? { "Template Webhook URL": { url: webhookUrls.templateAction } } : {}),
		...(webhookUrls.workOrderAction ? { "Work Order Webhook URL": { url: webhookUrls.workOrderAction } } : {}),
		...(webhookUrls.campaignAction ? { "Campaign Webhook URL": { url: webhookUrls.campaignAction } } : {}),
		...(webhookUrls.cavalryWorkOrderStarted ? { "Cavalry Webhook URL": { url: webhookUrls.cavalryWorkOrderStarted } } : {}),
		"Last Setup At": { date: { start: new Date().toISOString() } },
		"Last Error": richTextValue(""),
	};
	if (existing.results?.[0]?.id) {
		await notion.pages.update({ page_id: existing.results[0].id, properties });
		return;
	}
	await notion.pages.create({
		parent: { type: "data_source_id", data_source_id: configDataSourceId },
		properties,
	});
}

async function appendSetupInstructions(
	notion: any,
	settingsPageId: string,
	refs: Partial<Record<DatabaseKey, DataSourceRef>>,
) {
	const workerSetup = await findChildByTitle(notion, settingsPageId, "Worker setup", "heading_2");
	if (!workerSetup?.id) {
		await notion.blocks.children.append({
			block_id: settingsPageId,
			children: [
				headingBlock("Worker setup"),
				paragraphBlock("Set Tiller secrets on this Worker. Do not store Tiller passwords in Notion."),
				codeBlock(`ntn workers env set TILLER_PORTAL_CONFIG_DATA_SOURCE_ID="${refs.config?.dataSourceId ?? ""}"
ntn workers env set TILLER_EMAIL="you@example.com"
ntn workers env set TILLER_PASSWORD="..."
ntn workers webhooks list`),
				paragraphBlock("Use the installer credentials command to update Worker secrets later."),
			],
		});
	}

	const automationSetup = await findChildByTitle(notion, settingsPageId, "Notion automation setup", "heading_2");
	if (!automationSetup?.id) {
		await notion.blocks.children.append({
			block_id: settingsPageId,
			children: [
				headingBlock("Notion automation setup"),
				paragraphBlock("Use these instructions to connect Notion database actions to the Worker webhooks."),
				paragraphBlock("To print webhook URLs again, run this in Terminal:"),
				codeBlock(`ntn workers webhooks list --workers-config-file "$HOME/.notion-tiller-portal/worker/workers.json"`),
				paragraphBlock("Create these Notion database automations:"),
				paragraphBlock("Tiller Templates: when Action is set to Add to Tiller, Push Update, or Check Status, send webhook to templateAction."),
				paragraphBlock("Tiller Work Orders: when Action is set to Submit to Tiller, Check Status, or Download Results, send webhook to workOrderAction."),
				paragraphBlock("Tiller Campaigns: when Action is set to Validate, Build CSV, or Submit Render, send webhook to campaignAction."),
				paragraphBlock("For each Send webhook action: paste the matching webhook URL, leave custom headers empty, and check Select all existing properties under Content."),
				paragraphBlock("The Worker reads the page ID from Notion's payload and loads the full page through the Notion API. You do not need to build custom JSON."),
				paragraphBlock("Use cavalryWorkOrderStarted as the destination URL for Cavalry scripts."),
			],
		});
	}

	const dataSetup = await findChildByTitle(notion, settingsPageId, "Campaign data setup", "heading_2");
	if (!dataSetup?.id) {
		await notion.blocks.children.append({
			block_id: settingsPageId,
			children: [
				headingBlock("Campaign data setup"),
				paragraphBlock("Campaign Data Rows use underscore fields for portal control: _Row, _Campaign, _Include in Render, _Row Status, and _Output Name. Your CSV columns should be exact template field names like Name, Title, Background, or any other Tiller CSV column."),
				paragraphBlock("Templates, Work Orders, and Campaigns have _Progress, _Milestone, and _Progress Note fields for live action feedback. Keep these near Action in your views."),
			],
		});
	}
}

async function appendSetupChecklist(
	notion: any,
	parentPageId: string,
	{
		portalPageId,
		settingsPageId,
		storedWebhookUrls,
	}: {
		portalPageId: string;
		settingsPageId: string;
		storedWebhookUrls: boolean;
	},
) {
	const existing = await findChildByTitle(notion, parentPageId, "Tiller Portal setup checklist", "heading_2");
	if (existing?.id) return;
	await notion.blocks.children.append({
		block_id: parentPageId,
		children: [
			headingBlock("Tiller Portal setup checklist"),
			paragraphBlock("Use this checklist to finish setup. Daily render work happens in Notion after this is complete."),
			toDoBlock("Create setup page and share it with the Notion integration", true),
			toDoBlock("Run the CLI installer", true),
			toDoBlock("Deploy Notion Worker", true),
			toDoBlock("Create portal databases and focused views", true),
			toDoBlock("Save Worker secrets", true),
			toDoBlock("Store webhook URLs in Settings", storedWebhookUrls),
			toDoBlock("Create Notion automations for Templates, Work Orders, and Campaigns", false),
			toDoBlock("Run `notion-tiller-portal doctor`", false),
			toDoBlock("Use Add New Template or Start Workorder for daily input", false),
			paragraphBlock(`Portal page ID: ${portalPageId}`),
			paragraphBlock(`Settings page ID: ${settingsPageId}`),
		],
	});
}

function nextSteps(configDataSourceId: string) {
	return [
		`Set TILLER_PORTAL_CONFIG_DATA_SOURCE_ID=${configDataSourceId}`,
		"Set TILLER_EMAIL and TILLER_PASSWORD as Worker env vars.",
		"Run ntn workers webhooks list.",
		"Add Notion database automations for templateAction, workOrderAction, and campaignAction.",
		"Use cavalryWorkOrderStarted as the Cavalry destination when needed.",
	];
}

function dryRunNextSteps() {
	return [
		"Dry run validated parent page access.",
		"Run setupWorkspace without dryRun to create the portal scaffold.",
	];
}

function extractSetupPageId(value: string) {
	if (!value) return "";
	if (/^[0-9a-f]{32}$/i.test(value) || /^[0-9a-f-]{36}$/i.test(value)) return value;
	const match = value.match(/[0-9a-f]{32}/i);
	return match ? match[0] : "";
}

function richText(content: string) {
	return [{ type: "text", text: { content } }];
}

function titleValue(content: string) {
	return { title: richText(content) };
}

function richTextValue(content: string) {
	return content ? { rich_text: richText(content) } : { rich_text: [] };
}

function paragraphBlock(content: string) {
	return {
		object: "block",
		type: "paragraph",
		paragraph: { rich_text: richText(content) },
	};
}

function headingBlock(content: string) {
	return {
		object: "block",
		type: "heading_2",
		heading_2: { rich_text: richText(content) },
	};
}

function toDoBlock(content: string, checked: boolean) {
	return {
		object: "block",
		type: "to_do",
		to_do: {
			rich_text: richText(content),
			checked,
		},
	};
}

function codeBlock(content: string) {
	return {
		object: "block",
		type: "code",
		code: {
			language: "shell",
			rich_text: richText(content),
		},
	};
}

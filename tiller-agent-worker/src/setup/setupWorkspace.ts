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
	resourcePageId: string;
	howToUsePageId: string;
	settingsPageId: string;
	templateDataTablesPageId: string;
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
const CLI_COMMAND = "npm exec --yes --package=github:MotionWriter/notion-tiller-portal-public#main -- notion-tiller-portal";

const STARTER_VIEWS: StarterViewSpec[] = [
	{
		key: "campaigns",
		name: "Open Campaigns",
		type: "table",
		filter: { property: "Campaign Status", select: { does_not_equal: "Done" } },
		sorts: [{ property: "Last Synced At", direction: "descending" }],
		visibleProperties: ["Name", "Template", "Campaign Status", "CSV Row Count", "Generated CSV", "Action", "Work Order", "Missing Uploads", "Missing Uploads URL", "Render Outputs", "_Milestone", "_Progress Note", "Last Error"],
	},
	{
		key: "campaigns",
		name: "Needs Fix",
		type: "table",
		filter: { property: "Campaign Status", select: { equals: "Needs Fix" } },
		sorts: [{ property: "Last Synced At", direction: "descending" }],
		visibleProperties: ["Name", "Template", "Campaign Status", "CSV Row Count", "Action", "Missing Uploads", "Missing Uploads URL", "_Milestone", "_Progress Note", "Last Error"],
	},
	{
		key: "campaigns",
		name: "Ready - Submit Render",
		type: "table",
		filter: { property: "Campaign Status", select: { equals: "Ready" } },
		sorts: [{ property: "Last Synced At", direction: "descending" }],
		visibleProperties: ["Name", "Template", "Campaign Status", "CSV Row Count", "Generated CSV", "Action", "_Milestone", "_Progress Note", "Last Error"],
	},
	{
		key: "campaigns",
		name: "Completed",
		type: "table",
		filter: { property: "Campaign Status", select: { equals: "Done" } },
		sorts: [{ property: "Last Synced At", direction: "descending" }],
		visibleProperties: ["Name", "Render Outputs", "Work Order", "Template", "CSV Row Count", "Campaign Status", "Last Synced At"],
	},
	{
		key: "templates",
		name: "Add New Template",
		type: "table",
		filter: { property: "Status", select: { does_not_equal: "Archived" } },
		sorts: [{ property: "Last Synced At", direction: "descending" }],
		visibleProperties: ["Name", "Cav File", "Template Assets URL", "Status", "Action", "_Milestone", "_Progress Note", "Required Assets", "Data Rows Status", "Data Rows Database URL", "Last Error"],
	},
	{
		key: "templates",
		name: "Ready Templates",
		type: "gallery",
		filter: { property: "Status", select: { equals: "Ready" } },
		sorts: [{ property: "Last Synced At", direction: "descending" }],
		visibleProperties: ["Name", "Status", "CSV Columns", "Data Rows Status", "Data Rows Database URL", "Tiller Template ID", "Last Synced At"],
	},
	{
		key: "templates",
		name: "Needs Assets",
		type: "table",
		filter: { property: "Status", select: { equals: "PendingAssets" } },
		sorts: [{ property: "Last Synced At", direction: "descending" }],
		visibleProperties: ["Name", "Template Assets URL", "Required Assets", "Status", "Action", "_Milestone", "_Progress Note", "Last Error"],
	},
	{
		key: "workOrders",
		name: "Start Work Order",
		type: "table",
		filter: { property: "Render Status", select: { does_not_equal: "Archived" } },
		sorts: [{ property: "Last Synced At", direction: "descending" }],
		visibleProperties: ["Name", "Template", "Campaign", "Render Count", "Parameter CSV", "Dynamic Assets", "Template Assets URL", "Required Uploads", "Render Status", "Action", "_Milestone", "_Progress Note", "Last Error"],
	},
	{
		key: "workOrders",
		name: "Active Work Orders",
		type: "table",
		filter: { property: "Render Status", select: { does_not_equal: "Done" } },
		sorts: [{ property: "Last Synced At", direction: "descending" }],
		visibleProperties: ["Name", "Render Status", "_Milestone", "_Progress Note", "Template", "Campaign", "Render Count", "Required Uploads", "Last Error"],
	},
	{
		key: "workOrders",
		name: "Ready to Download",
		type: "table",
		filter: { property: "Render Status", select: { equals: "Done" } },
		sorts: [{ property: "Completed At", direction: "descending" }],
		visibleProperties: ["Name", "Render Outputs", "Completed Renders", "Completed At", "Render Status", "Action", "Last Error"],
	},
	{
		key: "workOrders",
		name: "Completed",
		type: "table",
		filter: { property: "Render Status", select: { equals: "Done" } },
		sorts: [{ property: "Completed At", direction: "descending" }],
		visibleProperties: ["Name", "Render Outputs", "Completed Renders", "Completed At", "Template", "Campaign", "Render Status", "Tiller Work Order ID"],
	},
	{
		key: "uploads",
		name: "Needs Files",
		type: "table",
		filter: { property: "Ready", checkbox: { equals: false } },
		sorts: [{ property: "Phase", direction: "ascending" }],
		visibleProperties: ["Name", "Phase", "File", "Tiller Path", "Ready", "Parent Template", "Parent Work Order", "Last Error"],
	},
	{
		key: "uploads",
		name: "Ready Uploads",
		type: "table",
		filter: { property: "Ready", checkbox: { equals: true } },
		sorts: [{ property: "Uploaded At", direction: "descending" }],
		visibleProperties: ["Name", "Phase", "Tiller Path", "Ready", "Uploaded At", "Parent Template", "Parent Work Order", "Last Error"],
	},
	{
		key: "templateDataTableIndex",
		name: "All Template Data Tables",
		type: "table",
		sorts: [{ property: "Last Synced At", direction: "descending" }],
		visibleProperties: ["Name", "Template", "Data Rows Database URL", "CSV Columns", "Status", "Last Synced At", "Last Error"],
	},
	{
		key: "templateDataTableIndex",
		name: "Needs Sync",
		type: "table",
		filter: { property: "Status", select: { does_not_equal: "Ready" } },
		sorts: [{ property: "Last Synced At", direction: "descending" }],
		visibleProperties: ["Name", "Template", "Status", "Data Rows Database URL", "CSV Columns", "Last Error"],
	},
	{
		key: "renderOutputs",
		name: "Recent Outputs",
		type: "gallery",
		sorts: [{ property: "Downloaded At", direction: "descending" }],
		visibleProperties: ["Name", "Output File", "Status", "Campaign", "Work Order", "Template", "Output Filename", "Output Index", "Downloaded At", "Last Error"],
	},
	{
		key: "renderOutputs",
		name: "All Outputs",
		type: "table",
		sorts: [{ property: "Downloaded At", direction: "descending" }],
		visibleProperties: ["Name", "Output File", "Status", "Campaign", "Work Order", "Template", "Output Filename", "Output Index", "Downloaded At", "File Size Bytes", "Last Error"],
	},
	{
		key: "renderOutputs",
		name: "Failed Outputs",
		type: "table",
		filter: { property: "Status", select: { equals: "Failed" } },
		sorts: [{ property: "Downloaded At", direction: "descending" }],
		visibleProperties: ["Name", "Status", "Campaign", "Work Order", "Template", "Output Filename", "Last Error"],
	},
];

const LEGACY_VIEW_NAMES: Partial<Record<DatabaseKey, Record<string, string[]>>> = {
	campaigns: {
		"Open Campaigns": ["Active Campaigns"],
		"Ready - Submit Render": ["Ready to Render"],
	},
	workOrders: {
		"Start Work Order": ["Start Workorder"],
		Completed: ["Done"],
	},
	renderOutputs: {
		"All Outputs": ["By Campaign"],
	},
};

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
			resourcePageId: "",
			howToUsePageId: "",
			settingsPageId: "",
			templateDataTablesPageId: "",
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
	const resourcePageId = await findOrCreateChildPage(notion, parentPageId, `${portalTitle} Resources`, created);
	const howToUsePageId = await findOrCreateChildPage(notion, resourcePageId, "How to Use", created);
	const campaignsPageId = await findOrCreateChildPage(notion, resourcePageId, "Campaigns", created);
	const buildAssetsPageId = await findOrCreateChildPage(notion, resourcePageId, "Build Assets", created);
	const outputsPageId = await findOrCreateChildPage(notion, resourcePageId, "Campaign Outputs", created);
	const settingsPageId = await findOrCreateChildPage(notion, resourcePageId, SETTINGS_PAGE_TITLE, created);
	const templateDataTablesPageId = await findOrCreateChildPage(notion, buildAssetsPageId, "Template Data Tables", created);

	const refs: Partial<Record<DatabaseKey, DataSourceRef>> = {};
	for (const spec of DATABASE_SPECS) {
		const parentId = databaseParentIdForSpec(spec, {
			campaignsPageId,
			buildAssetsPageId,
			outputsPageId,
			settingsPageId,
			templateDataTablesPageId,
			fallbackPageId: resourcePageId,
		});
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
		templateDataTablesPageId,
		configDataSourceId: refs.config?.dataSourceId ?? "",
		refs,
		webhookUrls: input.webhookUrls ?? {},
	});
	await appendHowToUsePage(notion, howToUsePageId);
	await appendPortalNavigation(notion, portalPageId, howToUsePageId, settingsPageId, templateDataTablesPageId, refs);
	await appendSetupInstructions(notion, settingsPageId, refs);
	await appendWebhookUrlInstructions(notion, settingsPageId, input.webhookUrls ?? {});
	if (input.writeSetupChecklist !== false) {
		await appendSetupChecklist(notion, parentPageId, {
			storedWebhookUrls: Boolean(Object.keys(input.webhookUrls ?? {}).length),
		});
	}

	return {
		ok: true,
			dryRun,
			parentPageId,
			portalPageId,
			resourcePageId,
			howToUsePageId,
			settingsPageId,
		templateDataTablesPageId,
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

function databaseParentIdForSpec(
	spec: DatabaseSpec,
	pages: {
		campaignsPageId: string;
		buildAssetsPageId: string;
		outputsPageId: string;
		settingsPageId: string;
		templateDataTablesPageId: string;
		fallbackPageId: string;
	},
) {
	if (spec.placement === "settings") return pages.settingsPageId;
	if (spec.placement === "templateDataTables") return pages.templateDataTablesPageId;
	if (spec.key === "campaigns") return pages.campaignsPageId;
	if (spec.key === "templates" || spec.key === "workOrders") return pages.buildAssetsPageId;
	if (spec.key === "renderOutputs") return pages.outputsPageId;
	return pages.fallbackPageId;
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
	const selectUpdates: Record<string, any> = {};
	for (const property of spec.properties) {
		const existingProperty = existing[property.name];
		if (existingProperty) {
			const selectUpdate = selectOptionsForUpdate(existingProperty, property);
			if (selectUpdate) selectUpdates[property.name] = selectUpdate;
			continue;
		}
		if (property.type === "title" && hasTitleProperty) continue;
		const request = propertyToRequest(property, refs);
		if (!request) continue;
		missing[property.name] = request;
	}
	const properties = { ...missing, ...selectUpdates };
	if (Object.keys(properties).length === 0) return;
	await notion.dataSources.update({
		data_source_id: dataSourceId,
		properties,
	});
	repaired.push(`properties:${databaseName}:${Object.keys(properties).join(", ")}`);
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
					const existing = findExistingView(existingViews, view);
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

function findExistingView(existingViews: Map<string, { id: string }>, view: StarterViewSpec) {
	const existing = existingViews.get(view.name);
	if (existing) return existing;
	for (const legacyName of LEGACY_VIEW_NAMES[view.key]?.[view.name] ?? []) {
		const legacy = existingViews.get(legacyName);
		if (legacy) return legacy;
	}
	return null;
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
	const visibleOrder = [...(view.visibleProperties ?? [])].filter((name) => properties[name]);
	if (view.includeCsvProperties) {
		for (const name of Object.keys(properties)) {
			if (name.startsWith("_")) continue;
			if (["Campaign", "Include in Render", "Row Order", "Row Status", "Output Name"].includes(name)) continue;
			if (!visibleOrder.includes(name)) visibleOrder.push(name);
		}
	}
	if (view.includeCsvProperties && properties["_Output Name"] && !visibleOrder.includes("_Output Name")) {
		visibleOrder.push("_Output Name");
	}
	const visible = new Set(visibleOrder);
	const configuredPropertyNames = [
		...visibleOrder,
		...Object.keys(properties).filter((name) => !visible.has(name)),
	];
	const configuredProperties = configuredPropertyNames.map((name) => ({
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

function selectOptionsForUpdate(existingProperty: any, property: PropertySpec) {
	if (property.type !== "select") return null;
	const options = existingProperty?.select?.options;
	if (!Array.isArray(options)) return null;
	const existingNames = new Set(options.map((option: any) => option?.name).filter(Boolean));
	const missingNames = (property.options ?? []).filter((name) => !existingNames.has(name));
	if (missingNames.length === 0) return null;
	return {
		select: {
			options: [
				...options.map((option: any) => ({
					name: option.name,
					...(option.color ? { color: option.color } : {}),
				})),
				...missingNames.map((name) => ({ name })),
			],
		},
	};
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
	templateDataTablesPageId,
	configDataSourceId,
	refs,
	webhookUrls,
}: {
	notion: any;
	parentPageId: string;
	portalPageId: string;
	settingsPageId: string;
	templateDataTablesPageId: string;
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
		"Template Data Tables Page ID": richTextValue(templateDataTablesPageId),
		"Templates Data Source ID": richTextValue(refs.templates?.dataSourceId ?? ""),
		"Work Orders Data Source ID": richTextValue(refs.workOrders?.dataSourceId ?? ""),
		"Campaigns Data Source ID": richTextValue(refs.campaigns?.dataSourceId ?? ""),
		"Template Data Table Index Data Source ID": richTextValue(refs.templateDataTableIndex?.dataSourceId ?? ""),
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

async function appendHowToUsePage(notion: any, howToUsePageId: string) {
	const existing = await findChildByTitle(notion, howToUsePageId, "Daily workflow", "heading_2");
	if (existing?.id) return;

	await notion.blocks.children.append({
		block_id: howToUsePageId,
		children: [
			headingBlock("Daily workflow"),
			paragraphBlock("Use this portal from left to right: upload a Template, sync its data table, add Campaign rows, then submit the Campaign render."),
			codeBlockWithLanguage(`flowchart TD
  A[Add Template] --> B[Action: Add to Tiller]
  B --> C{Template Ready?}
  C -- Needs assets --> D[Add assets / Push Update]
  D --> C
  C -- Ready --> E[Action: Sync Data Table]
  E --> F[Add rows in template data table]
  F --> G[Create Campaign and link Template]
  G --> H{Need CSV review?}
  H -- Yes --> I[Action: Build CSV]
  I --> J[Review Generated CSV]
  H -- No --> K[Action: Submit Render]
  J --> K
  K --> L[Worker builds CSV and submits Work Order]
  L --> M[Render Outputs attach in Notion]`, "mermaid"),
			headingBlock("1. Add a Template"),
			paragraphBlock("Open Templates, create a row, attach the Cavalry file in Cav File, then set Action to Add to Tiller."),
			paragraphBlock("If Tiller needs assets, add them to the Template Assets URL or Upload rows, then set Action to Push Update."),
			headingBlock("2. Sync the Template data table"),
			paragraphBlock("When the Template is Ready, set Action to Sync Data Table. This creates a template-specific data rows database from Tiller CSV Columns."),
			paragraphBlock("Each Template has its own data table. Do not use a generic campaign data table."),
			headingBlock("3. Add Campaign rows"),
			paragraphBlock("Open the Template data table, add rows, link _Campaign to the Campaign, and check _Include in Render for each row that should render."),
			paragraphBlock("CSV field names must match the Template CSV Columns exactly."),
			headingBlock("4. Build CSV preview"),
			paragraphBlock("Optional: set Campaign Action to Build CSV. This writes Generated CSV and CSV Row Count so you can review before rendering."),
			headingBlock("5. Submit Render"),
			paragraphBlock("Set Campaign Action to Submit Render. The Worker validates rows, builds the CSV, saves it on the Campaign, creates the Tiller Work Order, uploads parameters, and watches for outputs."),
			headingBlock("6. Review outputs"),
			paragraphBlock("Finished files appear in Render Outputs and link back to the Campaign, Work Order, and Template."),
			headingBlock("Fix credentials"),
			paragraphBlock("If Tiller login fails, run this in Terminal:"),
			codeBlock(`${CLI_COMMAND} credentials`),
			paragraphBlock("If Google Drive asset links or output uploads fail, run this in Terminal:"),
			codeBlock(`${CLI_COMMAND} google-drive`),
			paragraphBlock("To review set/missing Worker secrets or delete old values, run this in Terminal:"),
			codeBlock(`${CLI_COMMAND} secrets`),
		],
	});
}

async function appendPortalNavigation(
	notion: any,
	portalPageId: string,
	howToUsePageId: string,
	settingsPageId: string,
	templateDataTablesPageId: string,
	refs: Partial<Record<DatabaseKey, DataSourceRef>>,
) {
	const existing = await findChildByTitle(notion, portalPageId, "Portal navigation", "heading_2");
	if (existing?.id) return;

	await notion.blocks.children.append({
		block_id: portalPageId,
		children: [
			headingBlock("Portal navigation"),
			calloutBlock("Start here", "green_background", [
				linkedParagraphBlock("How to Use", notionPageUrl(howToUsePageId)),
			]),
			calloutBlock("Campaigns (primary)", "yellow_background", [
				linkedParagraphBlock("Campaigns", refs.campaigns?.url),
			]),
			calloutBlock("Build assets", "blue_background", [
				linkedParagraphBlock("Templates", refs.templates?.url),
				linkedParagraphBlock("Work Orders", refs.workOrders?.url),
				linkedParagraphBlock("Uploads", refs.uploads?.url),
				linkedParagraphBlock("Template Data Tables", notionPageUrl(templateDataTablesPageId)),
			]),
			calloutBlock("Campaign outputs", "gray_background", [
				linkedParagraphBlock("Render Outputs", refs.renderOutputs?.url),
			]),
			calloutBlock("Settings", "red_background", [
				linkedParagraphBlock("Settings", notionPageUrl(settingsPageId)),
			]),
		],
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
				paragraphBlock("Tiller and Notion secrets are stored on the Worker. Do not store passwords in Notion database fields."),
				paragraphBlock("To update Tiller login or other credentials later, run this in Terminal:"),
				codeBlock(`${CLI_COMMAND} credentials`),
				paragraphBlock("To update Google Drive public folder links, private folders, or output uploads, run this in Terminal:"),
				codeBlock(`${CLI_COMMAND} google-drive`),
				paragraphBlock("To see which Worker secrets are set or delete old values, run this in Terminal:"),
				codeBlock(`${CLI_COMMAND} secrets`),
				paragraphBlock("To check the install, run this in Terminal:"),
				codeBlock(`${CLI_COMMAND} doctor`),
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
				paragraphBlock("Templates database: when Action is set to Add to Tiller, Push Update, Check Status, or Sync Data Table, send webhook to templateAction."),
				paragraphBlock("Work Orders database: when Action is set to Submit to Tiller, Check Status, or Download Results, send webhook to workOrderAction."),
				paragraphBlock("Campaigns database: when Action is set to Validate, Build CSV, or Submit Render, send webhook to campaignAction."),
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
				paragraphBlock("Each Template owns its own data rows database. Open a Template and set Action to Sync Data Table to create that database from Tiller CSV Columns. Add campaign rows there, link _Campaign to the Campaign, check _Include in Render, and keep CSV column names exactly matched to the Template."),
				paragraphBlock("Templates, Work Orders, and Campaigns have _Progress, _Milestone, and _Progress Note fields for live action feedback. Keep these near Action in your views."),
			],
		});
	}
}

async function appendWebhookUrlInstructions(
	notion: any,
	settingsPageId: string,
	webhookUrls: Partial<Record<"templateAction" | "workOrderAction" | "campaignAction" | "cavalryWorkOrderStarted", string>>,
) {
	if (Object.keys(webhookUrls).length === 0) return;
	const existing = await findChildByTitle(notion, settingsPageId, "Webhook URLs", "heading_2");
	if (existing?.id) return;

	await notion.blocks.children.append({
		block_id: settingsPageId,
		children: [
			headingBlock("Webhook URLs"),
			paragraphBlock("Use these URLs in Notion automations. Leave custom headers empty and select all existing properties under Content."),
			...webhookUrlBlocks("Template Action", "Use this in the Templates database automation.", webhookUrls.templateAction),
			...webhookUrlBlocks("Work Order Action", "Use this in the Work Orders database automation.", webhookUrls.workOrderAction),
			...webhookUrlBlocks("Campaign Action", "Use this in the Campaigns database automation.", webhookUrls.campaignAction),
			...webhookUrlBlocks("Cavalry Work Order Started", "Use this as the destination URL from Cavalry scripts.", webhookUrls.cavalryWorkOrderStarted),
		],
	});
}

function webhookUrlBlocks(label: string, help: string, url?: string) {
	if (!url) return [paragraphBlock(`${label}: not found. Run ntn workers webhooks list to inspect Worker webhooks.`)];
	return [
		paragraphBlock(label),
		paragraphBlock(help),
		codeBlock(url),
	];
}

async function appendSetupChecklist(
	notion: any,
	parentPageId: string,
	{
		storedWebhookUrls,
	}: {
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
			toDoBlock("Run the doctor command from Settings", false),
			toDoBlock("Use Add New Template, Start Work Order, or Ready - Submit Render for daily input", false),
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

function linkedText(content: string, url?: string) {
	return [{
		type: "text",
		text: {
			content,
			...(url ? { link: { url } } : {}),
		},
	}];
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

function linkedParagraphBlock(content: string, url?: string) {
	return {
		object: "block",
		type: "paragraph",
		paragraph: { rich_text: linkedText(content, url) },
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
	return codeBlockWithLanguage(content, "shell");
}

function codeBlockWithLanguage(content: string, language: string) {
	return {
		object: "block",
		type: "code",
		code: {
			language,
			rich_text: richText(content),
		},
	};
}

function calloutBlock(content: string, color: string, children: unknown[]) {
	return {
		object: "block",
		type: "callout",
		callout: {
			rich_text: richText(content),
			color,
			children,
		},
	};
}

function notionPageUrl(id: string) {
	return id ? `https://www.notion.so/${id.replace(/-/g, "")}` : undefined;
}

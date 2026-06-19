import { Worker } from "@notionhq/workers";
import { j } from "@notionhq/workers/schema-builder";
import { Agent } from "undici";
import { setupWorkspace } from "./setup/setupWorkspace.js";
import { CONFIG_ROW_TITLE, type DatabaseKey } from "./setup/schemaManifest.js";

const worker = new Worker();
export default worker;

const DEFAULT_TILLER_API_BASE = "https://tiller.work/api/wo";
const DEFAULT_MAX_DRIVE_DOWNLOAD_BYTES = 100 * 1024 * 1024;
const WORK_ORDER_STATUS_PROPERTY = "Render Status";
const CLI_CREDENTIALS_COMMAND = "npm exec --yes --package=github:MotionWriter/notion-tiller-portal-public#main -- notion-tiller-portal credentials";
const CLI_GOOGLE_DRIVE_COMMAND = "npm exec --yes --package=github:MotionWriter/notion-tiller-portal-public#main -- notion-tiller-portal google-drive";
const insecureTillerAgent = new Agent({ connect: { rejectUnauthorized: false } });

type PortalDataSourceKey = Exclude<DatabaseKey, "config">;

const DATA_SOURCE_ENV: Record<PortalDataSourceKey, string> = {
	templates: "TEMPLATES_DATA_SOURCE_ID",
	workOrders: "WORK_ORDERS_DATA_SOURCE_ID",
	campaigns: "CAMPAIGNS_DATA_SOURCE_ID",
	templateDataTableIndex: "TEMPLATE_DATA_TABLE_INDEX_DATA_SOURCE_ID",
	renderOutputs: "RENDER_OUTPUTS_DATA_SOURCE_ID",
	uploads: "UPLOADS_DATA_SOURCE_ID",
	portalAreas: "PORTAL_AREAS_DATA_SOURCE_ID",
	credentials: "CREDENTIALS_DATA_SOURCE_ID",
	actionCenter: "ACTION_CENTER_DATA_SOURCE_ID",
	failureInbox: "FAILURE_INBOX_DATA_SOURCE_ID",
};

const CONFIG_PROPERTY_BY_KEY: Record<PortalDataSourceKey, string> = {
	templates: "Templates Data Source ID",
	workOrders: "Work Orders Data Source ID",
	campaigns: "Campaigns Data Source ID",
	templateDataTableIndex: "Template Data Table Index Data Source ID",
	renderOutputs: "Render Outputs Data Source ID",
	uploads: "Uploads Data Source ID",
	portalAreas: "Portal Areas Data Source ID",
	credentials: "Credentials Data Source ID",
	actionCenter: "Action Center Data Source ID",
	failureInbox: "Failure Inbox Data Source ID",
};

type PortalConfig = Record<PortalDataSourceKey, string> & {
	templateDataTablesPageId: string;
};
let portalConfigPromise: Promise<Partial<PortalConfig>> | null = null;

worker.tool("setupWorkspace", {
	title: "Setup Tiller Portal Workspace",
	description:
		"Create or repair a portable Tiller Portal scaffold under a user-provided Notion parent page.",
	schema: j.object({
		parentPageId: j.string().describe("Notion parent page ID or URL where the portal should be created."),
		portalName: j.string().describe("Optional portal page name. Use null for Tiller Portal.").nullable(),
		databasePrefix: j.string().describe("Optional database name prefix. Use null for Tiller.").nullable(),
		webhookUrls: j.object({
			templateAction: j.string().nullable(),
			workOrderAction: j.string().nullable(),
			campaignAction: j.string().nullable(),
			portalAreaAction: j.string().nullable(),
			credentialAction: j.string().nullable(),
			controlAction: j.string().nullable(),
			cavalryWorkOrderStarted: j.string().nullable(),
		}).nullable(),
		writeSetupChecklist: j.boolean().describe("If true, write setup checklist blocks to the parent page.").nullable(),
	}),
	execute: async ({ parentPageId, portalName, databasePrefix, webhookUrls, writeSetupChecklist }, { notion }) => {
		try {
			return await setupWorkspace({
				notion,
				input: {
					parentPageId,
					portalName: portalName ?? undefined,
					databasePrefix: databasePrefix ?? undefined,
					webhookUrls: webhookUrls ? {
						templateAction: webhookUrls.templateAction ?? undefined,
						workOrderAction: webhookUrls.workOrderAction ?? undefined,
						campaignAction: webhookUrls.campaignAction ?? undefined,
						portalAreaAction: webhookUrls.portalAreaAction ?? undefined,
						credentialAction: webhookUrls.credentialAction ?? undefined,
						controlAction: webhookUrls.controlAction ?? undefined,
						cavalryWorkOrderStarted: webhookUrls.cavalryWorkOrderStarted ?? undefined,
					} : undefined,
					writeSetupChecklist: writeSetupChecklist ?? undefined,
					mode: "create_or_repair",
					dryRun: false,
				},
			});
		} catch (error) {
			return formatToolError(error);
		}
	},
});

worker.tool("testTillerConnection", {
	title: "Test Tiller Connection",
	description:
		"Authenticate with Tiller using worker secrets and report whether the connection is usable.",
	schema: j.object({}),
	hints: { readOnlyHint: true },
	execute: async () => {
		try {
			const client = new TillerClient();
			await client.authenticate();
			await client.request("GET", "/Template");

			return {
				ok: true,
				baseUrl: client.safeBaseUrl(),
				message: "Authenticated with Tiller.",
			};
		} catch (error) {
			return formatToolError(error);
		}
	},
});

worker.tool("checkTillerWorkOrder", {
	title: "Check Tiller Work Order",
	description:
		"Fetch a Tiller work order by ID and return its current status. Use this when a user asks for render status.",
	schema: j.object({
		workOrderId: j.number().describe("The numeric Tiller work order ID to check."),
	}),
	hints: { readOnlyHint: true },
	execute: async ({ workOrderId }) => {
		try {
			const client = new TillerClient();
			await client.authenticate();
			const workOrder = await client.request("GET", `/WorkOrder/${workOrderId}`);
			const status =
				workOrder?.status?.workOrderStatusType ??
				workOrder?.workOrderStatusType ??
				"Unknown";

			return {
				ok: true,
				workOrderId,
				status,
				workOrder,
			};
		} catch (error) {
			return formatToolError(error);
		}
	},
});

worker.tool("listTillerWorkOrders", {
	title: "List Tiller Work Orders",
	description:
		"List recent Tiller work orders directly from Tiller. Use this to find an existing work order ID.",
	schema: j.object({
		limit: j.number().describe("Maximum work orders to return. Use null for 10.").nullable(),
	}),
	hints: { readOnlyHint: true },
	execute: async ({ limit }) => {
		try {
			const client = new TillerClient();
			await client.authenticate();
			const response = await client.request("GET", "/WorkOrder");
			const workOrders = normalizeWorkOrderList(response).slice(0, limit ?? 10);
			return {
				ok: true,
				count: workOrders.length,
				workOrders,
			};
		} catch (error) {
			return formatToolError(error);
		}
	},
});

worker.tool("listTillerTemplates", {
	title: "List Tiller Templates",
	description: "List templates directly from Tiller.",
	schema: j.object({
		limit: j.number().describe("Maximum templates to return. Use null for all.").nullable(),
	}),
	hints: { readOnlyHint: true },
	execute: async ({ limit }) => {
		try {
			const client = new TillerClient();
			await client.authenticate();
			const response = await client.request("GET", "/Template");
			const templates = normalizeTemplateList(response);
			return {
				ok: true,
				count: limit == null ? templates.length : Math.min(limit, templates.length),
				templates: limit == null ? templates : templates.slice(0, limit),
			};
		} catch (error) {
			return formatToolError(error);
		}
	},
});

worker.tool("importTillerTemplates", {
	title: "Import Tiller Templates",
	description:
		"Import all Tiller templates into the configured Notion Tiller Templates data source. Upserts by Tiller Template ID.",
	schema: j.object({
		dataSourceId: j
			.string()
			.describe("Optional Templates data source ID. Use null for TEMPLATES_DATA_SOURCE_ID.")
			.nullable(),
		limit: j.number().describe("Maximum templates to import. Use null for all.").nullable(),
		dryRun: j.boolean().describe("If true, report actions without writing Notion.").nullable(),
	}),
	execute: async ({ dataSourceId, limit, dryRun }, { notion }) => {
		try {
			const resolvedDataSourceId =
				dataSourceId || await getDataSourceId(notion, "templates");
			const client = new TillerClient();
			await client.authenticate();
			const response = await client.request("GET", "/Template");
			const templates = normalizeTemplateList(response);
			const selected = limit == null ? templates : templates.slice(0, limit);
			const result = await upsertTemplates({
				notion,
				dataSourceId: resolvedDataSourceId,
				templates: selected,
				dryRun: dryRun === true,
			});
			return { ok: true, totalFetched: templates.length, ...result };
		} catch (error) {
			return formatToolError(error);
		}
	},
});

worker.tool("importTillerWorkOrders", {
	title: "Import Tiller Work Orders",
	description:
		"Import all Tiller work orders into the configured Notion Tiller Work Orders data source. Upserts by Tiller Work Order ID.",
	schema: j.object({
		dataSourceId: j
			.string()
			.describe("Optional Work Orders data source ID. Use null for WORK_ORDERS_DATA_SOURCE_ID.")
			.nullable(),
		limit: j.number().describe("Maximum work orders to import. Use null for all.").nullable(),
		dryRun: j.boolean().describe("If true, report actions without writing Notion.").nullable(),
	}),
	execute: async ({ dataSourceId, limit, dryRun }, { notion }) => {
		try {
			const resolvedDataSourceId =
				dataSourceId || await getDataSourceId(notion, "workOrders");
			const client = new TillerClient();
			await client.authenticate();
			const response = await client.request("GET", "/WorkOrder");
			const workOrders = normalizeWorkOrderList(response);
			const selected = limit == null ? workOrders : workOrders.slice(0, limit);
			const result = await upsertWorkOrders({
				notion,
				dataSourceId: resolvedDataSourceId,
				workOrders: selected,
				dryRun: dryRun === true,
			});
			return { ok: true, totalFetched: workOrders.length, ...result };
		} catch (error) {
			return formatToolError(error);
		}
	},
});

worker.tool("scanPendingWorkOrders", {
	title: "Scan Pending Tiller Work Orders",
	description:
		"Find rows in the configured Notion Tiller Work Orders data source that are ready for Tiller action.",
	schema: j.object({
		dataSourceId: j
			.string()
			.describe("Optional Notion data source ID. Use null to use WORK_ORDERS_DATA_SOURCE_ID.")
			.nullable(),
		limit: j.number().describe("Maximum rows to return. Use null for 10.").nullable(),
	}),
	hints: { readOnlyHint: true },
	execute: async ({ dataSourceId, limit }, { notion }) => {
		try {
			const resolvedDataSourceId =
				dataSourceId || await getDataSourceId(notion, "workOrders");
			const response = await notion.dataSources.query({
				data_source_id: resolvedDataSourceId,
				page_size: Math.max(1, Math.min(limit ?? 10, 50)),
				filter: {
					or: [
						{ property: "Action", select: { equals: "Submit to Tiller" } },
						{ property: "Action", select: { equals: "Check Status" } },
						{ property: WORK_ORDER_STATUS_PROPERTY, select: { equals: "Submit Requested" } },
						{ property: WORK_ORDER_STATUS_PROPERTY, select: { equals: "Queued" } },
						{ property: WORK_ORDER_STATUS_PROPERTY, select: { equals: "Rendering" } },
					],
				},
			});

			return {
				ok: true,
				count: response.results.length,
				workOrders: response.results.map(summarizeNotionWorkOrderPage),
			};
		} catch (error) {
			return formatToolError(error);
		}
	},
});

worker.tool("buildCampaignCsv", {
	title: "Build Campaign CSV",
	description:
		"Generate a CSV from the linked Template's data rows database and write it back to the Campaign page for review.",
	schema: j.object({
		pageId: j.string().describe("The Notion Campaign page ID to build CSV for."),
	}),
	execute: async ({ pageId }, { notion }) => {
		try {
			return buildCampaignCsvFromPage({ notion, pageId });
		} catch (error) {
			await writePageError(notion, pageId, error);
			return formatToolError(error);
		}
	},
});

worker.tool("validateCampaign", {
	title: "Validate Campaign",
	description:
		"Validate a Campaign page against its linked Tiller template CSV schema and mark invalid data rows.",
	schema: j.object({
		pageId: j.string().describe("The Notion Campaign page ID to validate."),
	}),
	execute: async ({ pageId }, { notion }) => {
		try {
			return validateCampaignFromPage({ notion, pageId });
		} catch (error) {
			await writePageError(notion, pageId, error);
			return formatToolError(error);
		}
	},
});

worker.tool("submitCampaignRender", {
	title: "Submit Campaign Render",
	description:
		"Build campaign CSV, submit a Tiller work order, upload the generated CSV, poll briefly, and attach finished outputs to Render Outputs.",
	schema: j.object({
		pageId: j.string().describe("The Notion Campaign page ID to render."),
		pollSeconds: j.number().describe("Seconds to poll for completion. Use null for 60.").nullable(),
	}),
	execute: async ({ pageId, pollSeconds }, { notion }) => {
		try {
			return submitCampaignRenderFromPage({ notion, pageId, pollSeconds: pollSeconds ?? 60 });
		} catch (error) {
			await writePageError(notion, pageId, error);
			return formatToolError(error);
		}
	},
});

worker.tool("checkWorkOrderStatus", {
	title: "Check Work Order Status",
	description:
		"Read a Notion Work Orders row, fetch its Tiller work order status, and write the latest status back to Notion.",
	schema: j.object({
		pageId: j.string().describe("The Notion Work Orders page ID to update."),
	}),
	execute: async ({ pageId }, { notion }) => {
		try {
			return checkWorkOrderStatusFromPage({ notion, pageId });
		} catch (error) {
			await writePageError(notion, pageId, error);
			return formatToolError(error);
		}
	},
});

worker.tool("downloadWorkOrderResults", {
	title: "Download Work Order Results",
	description:
		"Download finished Tiller render outputs, create one Render Outputs row per file, and attach each file in Notion.",
	schema: j.object({
		pageId: j.string().describe("The Notion Work Orders page ID to download results for."),
	}),
	execute: async ({ pageId }, { notion }) => {
		try {
			return downloadWorkOrderResultsFromPage({ notion, pageId });
		} catch (error) {
			await writePageError(notion, pageId, error);
			return formatToolError(error);
		}
	},
});

worker.tool("submitWorkOrder", {
	title: "Submit Work Order",
	description:
		"Create a Tiller work order from a Notion Work Orders row that has a ready Tiller template ID and render count. Creates Upload rows for required Tiller parameter files.",
	schema: j.object({
		pageId: j.string().describe("The Notion Work Orders page ID to submit."),
	}),
	execute: async ({ pageId }, { notion }) => {
		try {
			return submitWorkOrderFromPage({ notion, pageId });
		} catch (error) {
			await writePageError(notion, pageId, error);
			return formatToolError(error);
		}
	},
});

worker.tool("submitTemplate", {
	title: "Submit Template",
	description:
		"Create a Tiller template from a Notion Templates row with a Cavalry Scene .cv file attached.",
	schema: j.object({
		pageId: j.string().describe("The Notion Templates page ID to submit."),
	}),
	execute: async ({ pageId }, { notion }) => {
		try {
			return submitTemplateFromPage({ notion, pageId });
		} catch (error) {
			await writePageError(notion, pageId, error);
			return formatToolError(error);
		}
	},
});

worker.tool("syncTemplateDataTable", {
	title: "Sync Template Data Table",
	description:
		"Create or repair a template-specific data rows database from the CSV parameters stored in Template Details.",
	schema: j.object({
		pageId: j.string().describe("The Notion Templates page ID to sync."),
	}),
	execute: async ({ pageId }, { notion }) => {
		try {
			return syncTemplateDataTableFromPage({ notion, pageId });
		} catch (error) {
			await writePageError(notion, pageId, error);
			return formatToolError(error);
		}
	},
});

worker.tool("finalizeTemplateAssets", {
	title: "Finalize Template Assets",
	description:
		"Upload attached Notion asset files for an existing Tiller template, confirm assets, and update the Templates row when Ready.",
	schema: j.object({
		pageId: j.string().describe("The Notion Templates page ID to finalize."),
	}),
	execute: async ({ pageId }, { notion }) => {
		try {
			await assertPageInDataSource(notion, pageId, "templates");
			const page = await notion.pages.retrieve({ page_id: pageId });
			const summary = summarizeNotionTemplatePage(page);
			if (!summary.tillerTemplateId) {
				throw new Error("Template row is missing Tiller Template ID.");
			}
			return finalizeTemplateAssets({
				notion,
				pageId,
				templateId: summary.tillerTemplateId,
			});
		} catch (error) {
			await writePageError(notion, pageId, error);
			return formatToolError(error);
		}
	},
});

worker.tool("finalizeWorkOrderInputs", {
	title: "Finalize Work Order Inputs",
	description:
		"Upload attached Notion parameter and dynamic asset files for a Tiller work order, confirm inputs, update status, and store result metadata when available.",
	schema: j.object({
		pageId: j.string().describe("The Notion Work Orders page ID to finalize."),
		pollSeconds: j.number().describe("Optional seconds to poll for Done. Use null for 30.").nullable(),
	}),
	execute: async ({ pageId, pollSeconds }, { notion }) => {
		try {
			return finalizeWorkOrderInputs({
				notion,
				pageId,
				pollSeconds: pollSeconds ?? 30,
			});
		} catch (error) {
			await writePageError(notion, pageId, error);
			return formatToolError(error);
		}
	},
});

worker.webhook("templateAction", {
	title: "Template Action",
	description: "Run the requested Tiller template action from a Notion Templates row.",
	execute: async (events, { notion }) => {
		for (const event of events) {
			const pageId = extractWebhookPageId(event.body);
			if (!pageId) {
				throw new Error(`Webhook body is missing pageId. Body keys: ${Object.keys(event.body).join(", ")}`);
			}
			try {
				await runTemplateActionFromPage({ notion, pageId });
			} catch (error) {
				await writePageError(notion, pageId, error);
				throw error;
			}
		}
	},
});

worker.webhook("workOrderAction", {
	title: "Work Order Action",
	description: "Run the requested Tiller work order action from a Notion Work Orders row.",
	execute: async (events, { notion }) => {
		for (const event of events) {
			const pageId = extractWebhookPageId(event.body);
			if (!pageId) {
				throw new Error(`Webhook body is missing pageId. Body keys: ${Object.keys(event.body).join(", ")}`);
			}
			try {
				await runWorkOrderActionFromPage({ notion, pageId });
			} catch (error) {
				await writePageError(notion, pageId, error);
				throw error;
			}
		}
	},
});

worker.webhook("cavalryWorkOrderStarted", {
	title: "Cavalry Work Order Started",
	description: "Receive a work order started by Cavalry, mirror it into Notion, and check for completion.",
	execute: async (events, { notion }) => {
		for (const event of events) {
			await receiveCavalryWorkOrderStarted({
				notion,
				body: event.body,
			});
		}
	},
});

worker.webhook("campaignAction", {
	title: "Campaign Action",
	description: "Run the requested campaign action from a Notion Campaigns row.",
	execute: async (events, { notion }) => {
		for (const event of events) {
			const pageId = extractWebhookPageId(event.body);
			if (!pageId) {
				throw new Error(`Webhook body is missing pageId. Body keys: ${Object.keys(event.body).join(", ")}`);
			}
			try {
				await runCampaignActionFromPage({ notion, pageId });
			} catch (error) {
				await writePageError(notion, pageId, error);
				throw error;
			}
		}
	},
});

worker.webhook("portalAreaAction", {
	title: "Portal Area Action",
	description: "Create or repair a portal area from a Notion Portal Areas row.",
	execute: async (events, { notion }) => {
		for (const event of events) {
			const pageId = extractWebhookPageId(event.body);
			if (!pageId) {
				throw new Error(`Webhook body is missing pageId. Body keys: ${Object.keys(event.body).join(", ")}`);
			}
			try {
				await runPortalAreaActionFromPage({ notion, pageId });
			} catch (error) {
				await writePortalAreaError(notion, pageId, error);
				throw error;
			}
		}
	},
});

worker.webhook("credentialAction", {
	title: "Credential Action",
	description: "Check credential status and show safe update commands from a Notion Credentials row.",
	execute: async (events, { notion }) => {
		for (const event of events) {
			const pageId = extractWebhookPageId(event.body);
			if (!pageId) {
				throw new Error(`Webhook body is missing pageId. Body keys: ${Object.keys(event.body).join(", ")}`);
			}
			try {
				await runCredentialActionFromPage({ notion, pageId });
			} catch (error) {
				await writeCredentialError(notion, pageId, error);
				throw error;
			}
		}
	},
});

worker.webhook("controlAction", {
	title: "Control Action",
	description: "Run portal doctor checks from a Notion Action Center row.",
	execute: async (events, { notion }) => {
		for (const event of events) {
			const pageId = extractWebhookPageId(event.body);
			if (!pageId) {
				throw new Error(`Webhook body is missing pageId. Body keys: ${Object.keys(event.body).join(", ")}`);
			}
			try {
				await runControlActionFromPage({ notion, pageId });
			} catch (error) {
				await writeControlError(notion, pageId, error);
				throw error;
			}
		}
	},
});

async function buildCampaignCsvFromPage({
	notion,
	pageId,
}: {
	notion: any;
	pageId: string;
}) {
	await assertPageInDataSource(notion, pageId, "campaigns");
	await setPageProgress(notion, pageId, 5, "Queued", "Preparing campaign CSV.");
	const validation = await validateCampaignFromPage({ notion, pageId });
	if (!validation.valid) throw new Error(validation.message);

	await setPageProgress(notion, pageId, 70, "Building CSV", "Creating CSV from included campaign rows.");
	const csv = buildCsv(validation.columns, validation.includedRows.map((row) => row.values));
	await notion.pages.update({
		page_id: pageId,
		properties: {
			Action: { select: { name: "None" } },
			"Campaign Status": { select: { name: "Ready" } },
			"Generated CSV": richTextLongValue(csv),
			"CSV Row Count": { number: validation.includedRows.length },
			"Last Error": richTextValue(""),
			"Last Synced At": { date: { start: new Date().toISOString() } },
		},
	});
	await setPageProgress(notion, pageId, 100, "CSV Ready", "CSV is ready to review.");

	return {
		ok: true,
		pageId,
		campaign: validation.campaign,
		templatePageId: validation.templatePageId,
		template: validation.template,
		columns: validation.columns,
		rowCount: validation.includedRows.length,
		csv,
		message: "Campaign CSV generated and written to Notion.",
	};
}

async function submitCampaignRenderFromPage({
	notion,
	pageId,
	pollSeconds,
}: {
	notion: any;
	pageId: string;
	pollSeconds: number;
}) {
	await assertPageInDataSource(notion, pageId, "campaigns");
	const actionId = await claimActionLock(notion, pageId, "Submit Render");
	try {
	await setPageProgress(notion, pageId, 5, "Queued", "Preparing campaign render.");
	const validation = await validateCampaignFromPage({ notion, pageId });
	if (!validation.valid) throw new Error(validation.message);
	if (!validation.templatePageId) throw new Error("Campaign is missing linked Template.");
	const campaignPage = await notion.pages.retrieve({ page_id: pageId });
	const campaign = summarizeNotionCampaignPage(campaignPage);
	if (campaign.workOrderPageIds.length > 0) {
		const workOrderPageId = campaign.workOrderPageIds[0];
		await setPageProgress(notion, pageId, 80, "Checking Status", "Campaign already has a linked work order.");
		const status = await checkWorkOrderStatusFromPage({ notion, pageId: workOrderPageId });
		await notion.pages.update({
			page_id: pageId,
			properties: {
				Action: { select: { name: "None" } },
				"Campaign Status": { select: { name: status.notionStatus === "Done" ? "Done" : "Rendering" } },
				"Last Error": richTextValue(""),
				"Last Synced At": { date: { start: new Date().toISOString() } },
			},
		});
		await setPageProgress(notion, pageId, status.notionStatus === "Done" ? 100 : 80, status.notionStatus === "Done" ? "Done" : "Waiting on Tiller", "Checked the linked work order instead of creating a duplicate.");
		return {
			ok: true,
			pageId,
			workOrderPageId,
			tillerTemplateId: null,
			tillerWorkOrderId: status.tillerWorkOrderId,
			tillerStatus: status.tillerStatus,
			notionStatus: status.notionStatus,
			rowCount: validation.includedRows.length,
			outputRows: [],
			results: [],
			message: "Campaign already had a linked work order, so I checked that work order instead of creating a duplicate.",
		};
	}

	await setPageProgress(notion, pageId, 25, "Building CSV", "Creating work order CSV from campaign rows.");
	const templatePage = await notion.pages.retrieve({ page_id: validation.templatePageId });
	const template = summarizeNotionTemplatePage(templatePage);
	if (!template.tillerTemplateId) throw new Error("Linked Template is missing Tiller Template ID.");
		const parameterPath = template.parameterFilePath || "parameters.csv";
		const csv = buildCsv(validation.columns, validation.includedRows.map((row) => row.values));
		await notion.pages.update({
			page_id: pageId,
			properties: {
				"Generated CSV": richTextLongValue(csv),
				"CSV Row Count": { number: validation.includedRows.length },
				"Last Error": richTextValue(""),
				"Last Synced At": { date: { start: new Date().toISOString() } },
			},
		});
		await setPageProgress(notion, pageId, 32, "CSV Ready", "CSV created. Submitting render to Tiller.");
		const csvFile = {
			name: parameterPath.split("/").pop() || "parameters.csv",
			bytes: new TextEncoder().encode(csv).buffer,
		contentType: "text/csv",
	};

	const client = new TillerClient();
	await setPageProgress(notion, pageId, 35, "Authenticating Tiller", "Connecting to Tiller.");
	await client.authenticate();
	await setPageProgress(notion, pageId, 40, "Creating Work Order", "Creating Tiller work order.");
	const created = await client.request("POST", "/WorkOrder", {
		body: {
			name: validation.campaign,
			templateID: template.tillerTemplateId,
			renderCount: validation.includedRows.length,
		},
	});
	const workOrderId = getCreatedWorkOrderId(created);
	const csvUpload = await uploadNotionFile(notion, csvFile);
	const workOrderPage = await notion.pages.create({
		parent: {
			type: "data_source_id",
			data_source_id: await getDataSourceId(notion, "workOrders"),
		},
		properties: {
			Name: titleValue(`${validation.campaign} Render Test`),
			Action: { select: { name: "None" } },
			[WORK_ORDER_STATUS_PROPERTY]: { select: { name: "Submit Requested" } },
			Campaign: relationValue(pageId),
			Template: relationValue(validation.templatePageId),
			"Tiller Template ID": { number: template.tillerTemplateId },
			"Tiller Work Order ID": { number: workOrderId },
			"Render Count": { number: validation.includedRows.length },
			"Submitted At": { date: { start: new Date().toISOString() } },
			"Last Error": richTextValue(""),
			"Last Synced At": { date: { start: new Date().toISOString() } },
		},
	});
	await attachFileUploadToPage(notion, workOrderPage.id, "Parameter CSV", csvFile.name, csvUpload.id);
	await notion.pages.update({
		page_id: pageId,
		properties: {
			Action: { select: { name: "None" } },
			"Campaign Status": { select: { name: "Rendering" } },
			"Generated CSV": richTextLongValue(csv),
			"CSV Row Count": { number: validation.includedRows.length },
			"Work Order": relationValue(workOrderPage.id),
			"Last Action ID": richTextValue(actionId),
			"Last Error": richTextValue(""),
			"Last Synced At": { date: { start: new Date().toISOString() } },
		},
	});

	await setPageProgress(notion, pageId, 55, "Uploading Parameters", "Uploading generated CSV to Tiller.");
	await client.uploadMultipart(`/workorder/${workOrderId}/parameter`, parameterPath, csvFile);
	await client.request("POST", `/workorder/${workOrderId}/parameter/confirm`, {
		parse: "text",
		allowStatus: [409],
	});

	const dynamicStatus = await client.request("GET", `/workorder/${workOrderId}/dynamicasset`, {
		allowStatus: [409],
	});
	const pendingDynamicAssets = getPendingItems(dynamicStatus);
	if (pendingDynamicAssets.length > 0) {
		await createUploadRows({
			notion,
			parentPageId: workOrderPage.id,
			phase: "dynamic_asset",
			items: pendingDynamicAssets,
		});
		await notion.pages.update({
			page_id: workOrderPage.id,
			properties: {
				[WORK_ORDER_STATUS_PROPERTY]: { select: { name: "Pending Dynamic Assets" } },
				"Required Uploads": richTextValue(formatRequiredUploads(pendingDynamicAssets)),
			},
		});
		await setPageProgress(notion, pageId, 85, "Waiting on Assets", "Dynamic assets are needed before render can start.");
		return {
			ok: true,
			pageId,
			workOrderPageId: workOrderPage.id,
			tillerTemplateId: template.tillerTemplateId,
			tillerWorkOrderId: workOrderId,
			tillerStatus: "PendingDynamicAssets",
			notionStatus: "Pending Dynamic Assets",
			rowCount: validation.includedRows.length,
			outputRows: [],
			results: [],
			message: "Campaign work order created. Dynamic assets are required before render can start.",
		};
	}
	await client.request("POST", `/workorder/${workOrderId}/dynamicasset/confirm`, {
		parse: "text",
		allowStatus: [409],
	});

	await setPageProgress(notion, pageId, 80, "Waiting on Tiller", "Render is running in Tiller.");
	const statusResult = await pollWorkOrderStatus(client, workOrderId, pollSeconds);
	const notionStatus = mapTillerStatusToNotionStatus(statusResult.status);
	const workOrderSummary = {
		pageId: workOrderPage.id,
		url: workOrderPage.url ?? "",
		name: validation.campaign,
		action: "None",
		status: notionStatus,
		tillerTemplateId: template.tillerTemplateId,
		tillerWorkOrderId: workOrderId,
		renderCount: validation.includedRows.length,
		downloadRendersHere: "",
		templateAssetsUrl: "",
	};
	const results = statusResult.status === "Done"
		? await fetchWorkOrderResults(client, workOrderId)
		: [];
	const outputRows = statusResult.status === "Done"
		? await (async () => {
			await setPageProgress(notion, pageId, 90, "Downloading Outputs", "Attaching finished renders to Notion.");
			return createRenderOutputRowsForWorkOrder({
			notion,
			client,
			pageId: workOrderPage.id,
			summary: workOrderSummary,
			results,
			});
		})()
		: [];
	await notion.pages.update({
		page_id: workOrderPage.id,
		properties: {
			[WORK_ORDER_STATUS_PROPERTY]: { select: { name: notionStatus } },
			"Completed Renders": { number: notionStatus === "Done" ? outputRows.length : null },
			"Completed At": notionStatus === "Done" ? { date: { start: new Date().toISOString() } } : { date: null },
			"Last Error": richTextValue(statusResult.status === "Failed" ? "Tiller render failed." : ""),
			"Last Synced At": { date: { start: new Date().toISOString() } },
		},
	});
	await notion.pages.update({
		page_id: pageId,
		properties: {
			"Campaign Status": { select: { name: notionStatus === "Done" ? "Done" : "Rendering" } },
			"Last Action ID": richTextValue(actionId),
			"Last Error": richTextValue(statusResult.status === "Failed" ? "Tiller render failed." : ""),
			"Last Synced At": { date: { start: new Date().toISOString() } },
		},
	});
	await setPageProgress(
		notion,
		pageId,
		statusResult.status === "Done" ? 100 : 80,
		statusResult.status === "Done" ? "Done" : "Waiting on Tiller",
		statusResult.status === "Done" ? "Render complete. Outputs are attached." : "Render submitted; still processing.",
	);

	return {
		ok: true,
		pageId,
		workOrderPageId: workOrderPage.id,
		tillerTemplateId: template.tillerTemplateId,
		tillerWorkOrderId: workOrderId,
		tillerStatus: statusResult.status,
		notionStatus,
		rowCount: validation.includedRows.length,
		outputRows,
		results,
		message: notionStatus === "Done" ? "Campaign render completed and outputs attached." : "Campaign render submitted; still processing.",
	};
	} finally {
		await releaseActionLock(notion, pageId, actionId);
	}
}

async function validateCampaignFromPage({
	notion,
	pageId,
}: {
	notion: any;
	pageId: string;
}) {
	await assertPageInDataSource(notion, pageId, "campaigns");
	await setPageProgress(notion, pageId, 10, "Reading Template", "Checking linked template requirements.");
	const page = await notion.pages.retrieve({ page_id: pageId });
	const campaign = summarizeNotionCampaignPage(page);
	const errors: string[] = [];
	if (!campaign.name) errors.push("Campaign row is missing Name.");
	if (campaign.templatePageIds.length === 0) {
		errors.push("Campaign row is missing Template relation.");
	}
	if (campaign.templatePageIds.length > 1) {
		errors.push("Campaign must use one Template for now.");
	}

	let template: ReturnType<typeof summarizeNotionTemplatePage> | null = null;
	let csvColumns: string[] = [];
	if (campaign.templatePageIds.length > 0) {
		const templatePage = await notion.pages.retrieve({ page_id: campaign.templatePageIds[0] });
		template = summarizeNotionTemplatePage(templatePage);
		csvColumns = getTemplateCsvColumns(template);
		if (!template.tillerTemplateId) errors.push("Linked Template is missing Tiller Template ID.");
		if (template.status && template.status !== "Ready") {
			errors.push(`Linked Template is ${template.status}, not Ready.`);
		}
		if (csvColumns.length === 0) errors.push("Linked Template is missing CSV Columns.");
	}

	if (csvColumns.length > 0 && !template?.dataRowsDatabaseId) {
		errors.push("Linked Template does not have a data rows database yet. Open the Template, set Action to Create Data Table, then add campaign rows to that template-specific database.");
	}
	const rowsDataSourceLabel = `the template data rows database for "${template?.name || "this template"}"`;
	const rows: CampaignDataRowSummary[] = csvColumns.length > 0 && template?.dataRowsDatabaseId
		? await queryCampaignDataRows({
			notion,
			campaignPageId: pageId,
			csvColumns,
			dataSourceId: template?.dataRowsDatabaseId,
		})
		: [];
	await setPageProgress(notion, pageId, 50, "Checking Rows", "Checking included campaign rows.");
	const includedRows = rows
		.filter((row) => row.include);
	if (csvColumns.length > 0 && includedRows.length === 0) {
		errors.push(`No included rows were found in ${rowsDataSourceLabel}. Add rows there, set _Campaign to this Campaign, and check _Include in Render.`);
	}

	const invalidRows = includedRows
		.map((row) => ({
			...row,
			missingColumns: csvColumns.filter((column) => !row.values[column]),
		}))
		.filter((row) => row.missingColumns.length > 0);
	for (const row of invalidRows) {
		errors.push(`${row.name || row.pageId}: missing ${row.missingColumns.join(", ")}`);
	}

	await Promise.all(includedRows
		.filter((row) => row.rowStatusProperty)
		.map((row) => notion.pages.update({
			page_id: row.pageId,
			properties: {
				[row.rowStatusProperty]: { select: { name: invalidRows.some((invalid) => invalid.pageId === row.pageId) ? "Invalid" : "Valid" } },
			},
		})));

	const valid = errors.length === 0;
	const message = valid ? "Campaign validates against linked template CSV schema." : errors.join("\n");
	await notion.pages.update({
		page_id: pageId,
		properties: {
			Action: { select: { name: "None" } },
			"Campaign Status": { select: { name: valid ? "Ready" : "Needs Fix" } },
			"Last Error": richTextValue(valid ? "" : message),
			"Last Synced At": { date: { start: new Date().toISOString() } },
		},
	});
	await setPageProgress(notion, pageId, 100, valid ? "Ready" : "Needs Fix", valid ? "Campaign rows match template CSV columns." : message);

	return {
		ok: valid,
		valid,
		pageId,
		campaign: campaign.name,
		templatePageId: campaign.templatePageIds[0] ?? "",
		template: template?.name ?? "",
		columns: csvColumns,
		rowCount: includedRows.length,
		includedRows,
		errors,
		message,
	};
}

async function checkWorkOrderStatusFromPage({
	notion,
	pageId,
}: {
	notion: any;
	pageId: string;
}) {
	await assertPageInDataSource(notion, pageId, "workOrders");
	await setPageProgress(notion, pageId, 20, "Checking Status", "Checking Tiller work order status.");
	const page = await notion.pages.retrieve({ page_id: pageId });
	const summary = summarizeNotionWorkOrderPage(page);
	if (!summary.tillerWorkOrderId) {
		throw new Error("Notion row is missing Tiller Work Order ID.");
	}

	const client = new TillerClient();
	await client.authenticate();
	const workOrder = await client.request("GET", `/WorkOrder/${summary.tillerWorkOrderId}`);
	const tillerStatus = getWorkOrderCurrentStatus(workOrder);
	const notionStatus = mapTillerStatusToNotionStatus(tillerStatus);

	await notion.pages.update({
		page_id: pageId,
		properties: {
			[WORK_ORDER_STATUS_PROPERTY]: { select: { name: notionStatus } },
			Action: { select: { name: "None" } },
			"Completed Renders": {
				number: notionStatus === "Done" ? summary.renderCount : null,
			},
			"Last Error": richTextValue(""),
			...(notionStatus === "Done"
				? { "Completed At": { date: { start: new Date().toISOString() } } }
				: {}),
		},
	});
	await setPageProgress(notion, pageId, notionStatus === "Done" ? 100 : 80, notionStatus === "Done" ? "Done" : "Waiting on Tiller", `Tiller status: ${tillerStatus}.`);

	return {
		ok: true,
		pageId,
		tillerWorkOrderId: summary.tillerWorkOrderId,
		tillerStatus,
		notionStatus,
	};
}

async function submitWorkOrderFromPage({
	notion,
	pageId,
}: {
	notion: any;
	pageId: string;
}) {
	await assertPageInDataSource(notion, pageId, "workOrders");
	await setPageProgress(notion, pageId, 5, "Queued", "Preparing work order.");
	const page = await notion.pages.retrieve({ page_id: pageId });
	const summary = summarizeNotionWorkOrderPage(page);
	if (!summary.name) throw new Error("Work order row is missing Name.");
	if (!Number.isInteger(summary.tillerTemplateId)) {
		throw new Error("Work order row is missing Tiller Template ID.");
	}
	if (!Number.isInteger(summary.renderCount) || Number(summary.renderCount) <= 0) {
		throw new Error("Work order row needs Render Count greater than zero.");
	}
	if (summary.tillerWorkOrderId) {
		return finalizeWorkOrderInputs({ notion, pageId, pollSeconds: 30 });
	}

	const actionId = await claimActionLock(notion, pageId, "Submit to Tiller");
	try {
	const client = new TillerClient();
	await setPageProgress(notion, pageId, 15, "Authenticating Tiller", "Connecting to Tiller.");
	await client.authenticate();
	await setPageProgress(notion, pageId, 30, "Creating Work Order", "Creating Tiller work order.");
	const created = await client.request("POST", "/WorkOrder", {
		body: {
			name: summary.name,
			templateID: summary.tillerTemplateId,
			renderCount: summary.renderCount,
		},
	});
	const workOrderId = getCreatedWorkOrderId(created);
	const parameters = await client.request("GET", `/workorder/${workOrderId}/parameter`);
	const pendingParameters = getPendingItems(parameters);
	const createdUploads = await createUploadRows({
		notion,
		parentPageId: pageId,
		phase: "parameter",
		items: pendingParameters,
	});
	const workOrder = await client.request("GET", `/WorkOrder/${workOrderId}`);
	const tillerStatus = getWorkOrderCurrentStatus(workOrder);
	const notionStatus = pendingParameters.length > 0
		? "Pending Parameters"
		: mapTillerStatusToNotionStatus(tillerStatus);

	await notion.pages.update({
		page_id: pageId,
		properties: {
			Action: { select: { name: "None" } },
			[WORK_ORDER_STATUS_PROPERTY]: { select: { name: notionStatus } },
			"Tiller Work Order ID": { number: workOrderId },
			"Submitted At": { date: { start: new Date().toISOString() } },
			"Required Uploads": richTextValue(formatRequiredUploads(pendingParameters)),
			"Last Action ID": richTextValue(actionId),
			"Last Error": richTextValue(""),
		},
	});
	await setPageProgress(notion, pageId, pendingParameters.length > 0 ? 45 : 80, pendingParameters.length > 0 ? "Uploading Parameters" : "Waiting on Tiller", pendingParameters.length > 0 ? "Parameter files are needed." : "Work order created.");

	return {
		ok: true,
		pageId,
		tillerTemplateId: summary.tillerTemplateId,
		tillerWorkOrderId: workOrderId,
		renderCount: summary.renderCount,
		tillerStatus,
		notionStatus,
		requiredParameterUploads: pendingParameters.map((item) => getStatusTarget(item)).filter(Boolean),
		createdUploadRows: createdUploads,
		outputRows: [],
		message: pendingParameters.length > 0
			? "Work order created. Attach files to created Upload rows, then submit again."
			: "Work order created with no parameter uploads required.",
	};
	} finally {
		await releaseActionLock(notion, pageId, actionId);
	}
}

async function submitTemplateFromPage({
	notion,
	pageId,
}: {
	notion: any;
	pageId: string;
}) {
	await assertPageInDataSource(notion, pageId, "templates");
	await setPageProgress(notion, pageId, 5, "Queued", "Preparing template.");
	const page = await notion.pages.retrieve({ page_id: pageId });
	const summary = summarizeNotionTemplatePage(page);
	if (!summary.name) throw new Error("Template row is missing Name.");
	if (summary.tillerTemplateId) {
		return finalizeTemplateAssets({
			notion,
			pageId,
			templateId: summary.tillerTemplateId,
		});
	}
	if (summary.cavalryScenes.length === 0) {
		throw new Error("Template row is missing Cavalry Scene file.");
	}

	const actionId = await claimActionLock(notion, pageId, "Add to Tiller");
	try {
	await setPageProgress(notion, pageId, 15, "Reading Cav file", "Reading attached Cavalry file.");
	const scene = await fetchNotionJsonFile(summary.cavalryScenes[0]);
	const client = new TillerClient();
	await setPageProgress(notion, pageId, 25, "Authenticating Tiller", "Connecting to Tiller.");
	await client.authenticate();
	await setPageProgress(notion, pageId, 40, "Validating Scene", "Validating Cavalry scene with Tiller.");
	const validation = await client.request("POST", "/TemplateValidation", {
		body: scene.json,
	});
	await setPageProgress(notion, pageId, 55, "Creating Template", "Creating template in Tiller.");
	const created = await client.request("POST", "/Template", {
		body: { name: summary.name, cavalryProject: scene.json },
	});
	const templateId = getCreatedTemplateId(created);
	const assets = await client.request("GET", `/template/${templateId}/asset`);
	await setPageProgress(notion, pageId, 70, "Checking Assets", "Checking required template assets.");
	const pendingAssets = getPendingItems(assets);
	const status = await client.request("GET", `/template/${templateId}/status`);
	const templateDetails = await buildTemplateSetupDetails(client, templateId, {
		created,
		assets,
		status,
	});
	const tillerStatus = getTemplateDisplayStatus(status);
	const notionStatus =
		pendingAssets.length > 0 ? "PendingAssets" : ensureTemplateStatus(tillerStatus);
	const createdUploads = await createUploadRows({
		notion,
		parentPageId: pageId,
		parentKind: "template",
		phase: "template_asset",
		items: pendingAssets,
	});

	await notion.pages.update({
		page_id: pageId,
			properties: {
				Action: { select: { name: "None" } },
				Status: { select: { name: notionStatus } },
				"Tiller Template ID": { number: templateId },
				"Required Assets": richTextValue(formatRequiredUploads(pendingAssets)),
				...formatTemplateDetailProperties(templateDetails),
				"Last Action ID": richTextValue(actionId),
					"Tiller Response": richTextValue(
						formatTemplateResponse({
							status: tillerStatus,
							pendingAssets,
							message: pendingAssets.length > 0
							? "Template created. Tiller is waiting for the listed assets."
							: "Template created. No assets are required.",
					}),
				),
				"Last Synced At": { date: { start: new Date().toISOString() } },
				"Last Error": richTextValue(""),
			},
		});
	await setPageProgress(
		notion,
		pageId,
		pendingAssets.length > 0 ? 85 : 100,
		pendingAssets.length > 0 ? "Waiting on Assets" : "Ready",
		pendingAssets.length > 0 ? "Template created. Upload required assets." : "Template created and ready. You can now create a database for this template using the Action field.",
	);

	return {
		ok: true,
		pageId,
		fileName: scene.name,
		tillerTemplateId: templateId,
		tillerStatus,
		notionStatus,
		requiredTemplateAssets: pendingAssets.map((item) => getStatusTarget(item)).filter(Boolean),
		createdUploadRows: createdUploads,
		message: pendingAssets.length > 0
			? "Template created. Attach files to created Upload rows, then sync again."
			: "Template created with no asset uploads required.",
	};
	} finally {
		await releaseActionLock(notion, pageId, actionId);
	}
}

async function checkTemplateStatusFromPage({
	notion,
	pageId,
}: {
	notion: any;
	pageId: string;
}) {
	await assertPageInDataSource(notion, pageId, "templates");
	await setPageProgress(notion, pageId, 20, "Checking Status", "Checking template status in Tiller.");
	const page = await notion.pages.retrieve({ page_id: pageId });
	const summary = summarizeNotionTemplatePage(page);
	if (!summary.tillerTemplateId) {
		throw new Error("Template row is missing Tiller Template ID.");
	}

	const client = new TillerClient();
	await client.authenticate();
	const status = await client.request("GET", `/template/${summary.tillerTemplateId}/status`);
	const templateDetails = await buildTemplateSetupDetails(client, summary.tillerTemplateId, { status });
	const statusTypes = getTemplateStatusTypes(status);
	const isReady = statusTypes.includes("Ready");
	const hasPendingAssets = statusTypes.includes("PendingAssets");
	const notionStatus = isReady ? "Ready" : hasPendingAssets ? "PendingAssets" : "Unknown";

	await notion.pages.update({
		page_id: pageId,
		properties: {
			Action: { select: { name: "None" } },
			Status: { select: { name: notionStatus } },
			...formatTemplateDetailProperties(templateDetails),
				"Tiller Response": richTextValue(
					formatTemplateResponse({
						status: statusTypes.join(", ") || "Unknown",
						message: isReady
						? "Template is Ready. Tiller will not accept more asset uploads for this template."
						: hasPendingAssets
							? "Template is waiting for assets. Attach the required files, then use Push Update."
							: "Template status checked.",
				}),
			),
			"Last Synced At": { date: { start: new Date().toISOString() } },
			"Last Error": richTextValue(""),
		},
	});
	await setPageProgress(notion, pageId, isReady ? 100 : 85, isReady ? "Ready" : "Waiting on Assets", isReady ? "Template is ready." : "Template still needs assets.");

	return {
		ok: true,
		pageId,
		tillerTemplateId: summary.tillerTemplateId,
		tillerStatus: statusTypes.join(", ") || "Unknown",
		notionStatus,
	};
}

async function syncTemplateDataTableFromPage({
	notion,
	pageId,
}: {
	notion: any;
	pageId: string;
}) {
	await assertPageInDataSource(notion, pageId, "templates");
	await setPageProgress(notion, pageId, 10, "Reading Template", "Reading template details.");
	const page = await notion.pages.retrieve({ page_id: pageId });
	const summary = summarizeNotionTemplatePage(page);
	if (!summary.name) throw new Error("Template row is missing Name.");

	let details = parseTemplateDetails(summary.templateDetails);
	if (!details && summary.tillerTemplateId) {
		await setPageProgress(notion, pageId, 25, "Checking Status", "Fetching template details from Tiller.");
		const client = new TillerClient();
		await client.authenticate();
		details = await buildTemplateSetupDetails(client, summary.tillerTemplateId, {});
	}
	if (!details) {
		throw new Error("Template Details are missing. Use Add to Tiller or Check Status before Create Data Table.");
	}

	const csvParameters = getTemplateCsvParameters(details)
		.slice()
		.sort((a, b) => a.columnIndex - b.columnIndex);
	const csvColumns = csvParameters.map((parameter) => parameter.name).filter(Boolean);
	if (csvColumns.length === 0) {
		throw new Error("Template Details do not include CSV parameters.");
	}
	assertUniqueCsvColumns(csvColumns);

	await setPageProgress(notion, pageId, 40, "Building Data Table", "Creating or repairing template data rows database.");
	const campaignsDataSourceId = await getDataSourceId(notion, "campaigns");
	const templateDataTablesPageId = await getTemplateDataTablesParentPageId(notion, pageId);
	const databaseName = `${summary.name} Data Rows`;
	const dataTable = await findOrCreateTemplateDataTable({
		notion,
		parentPageId: templateDataTablesPageId,
		databaseName,
		existingDataSourceId: summary.dataRowsDatabaseId,
		campaignsDataSourceId,
		csvColumns,
	});
	await upsertTemplateDataTableIndexRow({
		notion,
		templatePageId: pageId,
		templateName: summary.name,
		databaseName,
		dataTable,
		csvColumns,
	});

	await setPageProgress(notion, pageId, 85, "Updating Template", "Saving data table link on template.");
	await notion.pages.update({
		page_id: pageId,
		properties: {
			Action: { select: { name: "None" } },
			"Data Rows Database ID": richTextValue(dataTable.dataSourceId),
			"Data Rows Database URL": { url: dataTable.url || null },
			"Data Rows Status": { select: { name: "Ready" } },
			...formatTemplateDetailProperties(details),
			"Last Synced At": { date: { start: new Date().toISOString() } },
			"Last Error": richTextValue(""),
		},
	});
	await setPageProgress(notion, pageId, 100, "Ready", `Data table ready with ${csvColumns.length} CSV columns.`);

	return {
		ok: true,
		pageId,
		template: summary.name,
		dataSourceId: dataTable.dataSourceId,
		databaseId: dataTable.databaseId,
		url: dataTable.url,
		columns: csvColumns,
		message: "Template data table is ready.",
	};
}

async function runTemplateActionFromPage({
	notion,
	pageId,
}: {
	notion: any;
	pageId: string;
}) {
	await assertPageInDataSource(notion, pageId, "templates");
	const page = await notion.pages.retrieve({ page_id: pageId });
	const summary = summarizeNotionTemplatePage(page);
	if (!summary.action || summary.action === "None") {
		return { ok: true, pageId, ignored: true, reason: "No template action selected." };
	}
	if (summary.action === "Check Status") {
		return checkTemplateStatusFromPage({ notion, pageId });
	}
	if (summary.action === "Create Data Table" || summary.action === "Sync Data Table") {
		return syncTemplateDataTableFromPage({ notion, pageId });
	}
	if (
		summary.action === "Add to Tiller" ||
		summary.action === "Sync to Tiller" ||
		summary.action === "Push Update"
	) {
		return submitTemplateFromPage({ notion, pageId });
	}
	throw new Error(`Unsupported Template action: ${summary.action || "None"}.`);
}

async function runWorkOrderActionFromPage({
	notion,
	pageId,
}: {
	notion: any;
	pageId: string;
}) {
	await assertPageInDataSource(notion, pageId, "workOrders");
	const page = await notion.pages.retrieve({ page_id: pageId });
	const summary = summarizeNotionWorkOrderPage(page);
	if (!summary.action || summary.action === "None") {
		return { ok: true, pageId, ignored: true, reason: "No work order action selected." };
	}
	if (summary.action === "Check Status") {
		return checkWorkOrderStatusFromPage({ notion, pageId });
	}
	if (summary.action === "Download Results") {
		return downloadWorkOrderResultsFromPage({ notion, pageId });
	}
	if (summary.action === "Submit to Tiller") {
		return submitWorkOrderFromPage({ notion, pageId });
	}
	throw new Error(`Unsupported Work Order action: ${summary.action || "None"}.`);
}

async function runCampaignActionFromPage({
	notion,
	pageId,
}: {
	notion: any;
	pageId: string;
}) {
	await assertPageInDataSource(notion, pageId, "campaigns");
	const page = await notion.pages.retrieve({ page_id: pageId });
	const summary = summarizeNotionCampaignPage(page);
	if (!summary.action || summary.action === "None") {
		return { ok: true, pageId, ignored: true, reason: "No campaign action selected." };
	}
	if (summary.action === "Validate") {
		return validateCampaignFromPage({ notion, pageId });
	}
	if (summary.action === "Submit Render") {
		return submitCampaignRenderFromPage({ notion, pageId, pollSeconds: 60 });
	}
	if (summary.action === "Build CSV" || summary.action === "Generate CSV") {
		return buildCampaignCsvFromPage({ notion, pageId });
	}
	throw new Error(`Unsupported Campaign action: ${summary.action || "None"}.`);
}

async function runPortalAreaActionFromPage({
	notion,
	pageId,
}: {
	notion: any;
	pageId: string;
}) {
	await assertPageInDataSource(notion, pageId, "portalAreas");
	const page = await notion.pages.retrieve({ page_id: pageId });
	const summary = summarizePortalAreaPage(page);
	if (!summary.action || summary.action === "None") {
		return { ok: true, pageId, ignored: true, reason: "No portal area action selected." };
	}
	if (summary.action !== "Create Portal Area" && summary.action !== "Repair Portal Area") {
		throw new Error(`Unsupported Portal Area action: ${summary.action}.`);
	}
	if (!summary.confirmAction) {
		await notion.pages.update({
			page_id: pageId,
			properties: {
				Action: { select: { name: "None" } },
				Status: { select: { name: "Failed" } },
				"Last Error": richTextValue("Check Confirm Action before creating or repairing a portal area."),
				"Last Synced At": { date: { start: new Date().toISOString() } },
			},
		});
		throw new Error("Confirm Action is required before creating or repairing a portal area.");
	}
	if (!summary.parentPageUrl) {
		await notion.pages.update({
			page_id: pageId,
			properties: {
				Action: { select: { name: "None" } },
				Status: { select: { name: "Failed" } },
				"Last Error": richTextValue("Parent Page URL is required before creating a portal area."),
				"Last Synced At": { date: { start: new Date().toISOString() } },
			},
		});
		throw new Error("Parent Page URL is required before creating a portal area.");
	}

	await notion.pages.update({
		page_id: pageId,
		properties: {
			Status: { select: { name: "Creating" } },
			"Last Result": richTextValue("Creating or repairing portal area..."),
			"Last Error": richTextValue(""),
			"Last Synced At": { date: { start: new Date().toISOString() } },
		},
	});

	try {
		const result = await setupWorkspace({
			notion,
			input: {
				parentPageId: summary.parentPageUrl,
				portalName: summary.name || undefined,
				databasePrefix: summary.databasePrefix || undefined,
				writeSetupChecklist: false,
				mode: "create_or_repair",
				dryRun: false,
			},
		});
		await notion.pages.update({
			page_id: pageId,
			properties: {
				Action: { select: { name: "None" } },
				Status: { select: { name: "Ready" } },
				"Portal Page URL": { url: notionPageUrl(result.portalPageId) },
				"Settings Page URL": { url: notionPageUrl(result.settingsPageId) },
				"Last Result": richTextValue(`Portal area ready. Created ${result.created.length}, repaired ${result.repaired.length}.`),
				"Last Error": richTextValue(""),
				"Last Synced At": { date: { start: new Date().toISOString() } },
			},
		});
		return {
			ok: true,
			pageId,
			portalPageId: result.portalPageId,
			settingsPageId: result.settingsPageId,
			created: result.created.length,
			repaired: result.repaired.length,
		};
	} catch (error) {
		await notion.pages.update({
			page_id: pageId,
			properties: {
				Action: { select: { name: "None" } },
				Status: { select: { name: "Failed" } },
				"Last Result": richTextValue("Portal area setup failed. Fix the error and run the action again."),
				"Last Error": richTextValue(errorDetail(error)),
				"Last Synced At": { date: { start: new Date().toISOString() } },
			},
		});
		throw error;
	}
}

async function runCredentialActionFromPage({
	notion,
	pageId,
}: {
	notion: any;
	pageId: string;
}) {
	await assertPageInDataSource(notion, pageId, "credentials");
	const page = await notion.pages.retrieve({ page_id: pageId });
	const summary = summarizeCredentialPage(page);
	if (!summary.action || summary.action === "None") {
		return { ok: true, pageId, ignored: true, reason: "No credential action selected." };
	}
	if (summary.action !== "Check Status" && summary.action !== "Show Update Command") {
		throw new Error(`Unsupported Credential action: ${summary.action}.`);
	}
	const result = await checkCredentialStatus(summary.credentialType);
	await notion.pages.update({
		page_id: pageId,
		properties: {
			Action: { select: { name: "None" } },
			Status: { select: { name: result.status } },
			"Update Command": richTextValue(result.command),
			"Last Result": richTextValue(result.message),
			"Last Error": richTextValue(result.error ?? ""),
			"Last Validated At": { date: { start: new Date().toISOString() } },
		},
	});
	if (result.status === "Failed" || result.status === "Needs Update") {
		await recordFailure(notion, {
			name: `${summary.credentialType || "Credential"} needs attention`,
			sourceType: "Credential",
			severity: result.status === "Failed" ? "Error" : "Warning",
			sourcePageUrl: summary.url,
			lastError: result.error || result.message,
			suggestedFix: `Run ${result.command}`,
		});
	}
	return { ok: result.status === "Connected", pageId, status: result.status, message: result.message };
}

async function checkCredentialStatus(credentialType: string) {
	const type = credentialType || "Tiller Login";
	if (type === "Tiller Login") {
		const command = CLI_CREDENTIALS_COMMAND;
		if (!process.env.TILLER_EMAIL || !process.env.TILLER_PASSWORD) {
			return {
				status: "Needs Update",
				command,
				message: "Tiller email/password are not configured on the Worker.",
				error: `Run ${command} to set Tiller email/password.`,
			};
		}
		try {
			const client = new TillerClient();
			await client.authenticate();
			return {
				status: "Connected",
				command,
				message: "Tiller login is connected.",
			};
		} catch (error) {
			return {
				status: "Failed",
				command,
				message: "Tiller rejected the current Worker credentials.",
				error: formatUserFacingError(error),
			};
		}
	}

	if (type === "Google Drive API Key") {
		const command = CLI_GOOGLE_DRIVE_COMMAND;
		if (!process.env.GOOGLE_DRIVE_API_KEY?.trim()) {
			return {
				status: "Needs Update",
				command,
				message: "Google Drive API key is not configured. Public Drive folder links may fail.",
				error: `Run ${command} to set a Google Drive API key.`,
			};
		}
		return {
			status: "Connected",
			command,
			message: "Google Drive API key is configured. Folder-specific access is checked when assets are read.",
		};
	}

	if (type === "Google Drive OAuth") {
		const command = CLI_GOOGLE_DRIVE_COMMAND;
		const hasOAuth =
			process.env.GOOGLE_DRIVE_CLIENT_ID?.trim() &&
			process.env.GOOGLE_DRIVE_CLIENT_SECRET?.trim() &&
			process.env.GOOGLE_DRIVE_REFRESH_TOKEN?.trim();
		if (!hasOAuth) {
			return {
				status: "Needs Update",
				command,
				message: "Google Drive OAuth is not configured. Private folders and Drive output uploads may fail.",
				error: `Run ${command} to set Google Drive OAuth credentials.`,
			};
		}
		try {
			await getGoogleDriveAccessToken();
			return {
				status: "Connected",
				command,
				message: "Google Drive OAuth refresh token works.",
			};
		} catch (error) {
			return {
				status: "Failed",
				command,
				message: "Google Drive OAuth refresh failed.",
				error: formatUserFacingError(error),
			};
		}
	}

	return {
		status: "Failed",
		command: CLI_CREDENTIALS_COMMAND,
		message: `Unknown credential type: ${type}.`,
		error: "Choose Tiller Login, Google Drive API Key, or Google Drive OAuth.",
	};
}

async function runControlActionFromPage({
	notion,
	pageId,
}: {
	notion: any;
	pageId: string;
}) {
	await assertPageInDataSource(notion, pageId, "actionCenter");
	const page = await notion.pages.retrieve({ page_id: pageId });
	const summary = summarizeControlPage(page);
	if (!summary.action || summary.action === "None") {
		return { ok: true, pageId, ignored: true, reason: "No control action selected." };
	}
	if (summary.action !== "Run Doctor") {
		throw new Error(`Unsupported Control action: ${summary.action}.`);
	}

	await notion.pages.update({
		page_id: pageId,
		properties: {
			Status: { select: { name: "Running" } },
			"Last Result": richTextValue("Running portal doctor checks..."),
			"Last Error": richTextValue(""),
			"Last Checked At": { date: { start: new Date().toISOString() } },
		},
	});

	const result = await runNotionDoctor(notion, summary.url);
	await notion.pages.update({
		page_id: pageId,
		properties: {
			Action: { select: { name: "None" } },
			Status: { select: { name: result.ok ? "Healthy" : "Needs Attention" } },
			"Tiller Status": { select: { name: result.tiller } },
			"Google Drive Status": { select: { name: result.googleDrive } },
			"Worker Status": { select: { name: result.worker } },
			"Notion Status": { select: { name: result.notion } },
			"Last Result": richTextValue(result.message),
			"Last Error": richTextValue(result.errors.join("\n")),
			"Last Checked At": { date: { start: new Date().toISOString() } },
		},
	});
	return result;
}

async function runNotionDoctor(notion: any, sourcePageUrl: string) {
	const errors: string[] = [];
	let notionStatus = "Connected";
	let workerStatus = "Ready";
	let tillerStatus = "Unknown";
	let googleDriveStatus = "Unknown";

	try {
		await getDataSourceId(notion, "templates");
		await getDataSourceId(notion, "workOrders");
		await getDataSourceId(notion, "campaigns");
		await getDataSourceId(notion, "renderOutputs");
		await getDataSourceId(notion, "credentials");
	} catch (error) {
		notionStatus = "Failed";
		workerStatus = "Failed";
		errors.push(formatUserFacingError(error));
	}

	const tiller = await checkCredentialStatus("Tiller Login");
	tillerStatus = tiller.status === "Connected" ? "Connected" : tiller.status === "Needs Update" ? "Needs Update" : "Failed";
	if (tiller.status !== "Connected") {
		errors.push(tiller.error ?? tiller.message);
		await recordFailure(notion, {
			name: "Tiller login needs attention",
			sourceType: "Doctor",
			severity: "Error",
			sourcePageUrl,
			lastError: tiller.error ?? tiller.message,
			suggestedFix: `Run ${tiller.command}`,
		});
	}

	const hasDriveApiKey = !!process.env.GOOGLE_DRIVE_API_KEY?.trim();
	const hasDriveOAuth =
		process.env.GOOGLE_DRIVE_CLIENT_ID?.trim() &&
		process.env.GOOGLE_DRIVE_CLIENT_SECRET?.trim() &&
		process.env.GOOGLE_DRIVE_REFRESH_TOKEN?.trim();
	if (!hasDriveApiKey && !hasDriveOAuth) {
		googleDriveStatus = "Not Configured";
	} else if (hasDriveOAuth) {
		const drive = await checkCredentialStatus("Google Drive OAuth");
		googleDriveStatus = drive.status === "Connected" ? "Configured" : "Failed";
		if (drive.status === "Failed") {
			errors.push(drive.error ?? drive.message);
			await recordFailure(notion, {
				name: "Google Drive OAuth needs attention",
				sourceType: "Doctor",
				severity: "Warning",
				sourcePageUrl,
				lastError: drive.error ?? drive.message,
				suggestedFix: `Run ${drive.command}`,
			});
		}
	} else {
		googleDriveStatus = "Configured";
	}

	const ok = errors.length === 0;
	return {
		ok,
		notion: notionStatus,
		worker: workerStatus,
		tiller: tillerStatus,
		googleDrive: googleDriveStatus,
		message: ok ? "Portal doctor passed. Core setup looks healthy." : `Portal doctor found ${errors.length} issue${errors.length === 1 ? "" : "s"}. Open Failure Inbox for fixes.`,
		errors,
	};
}

function extractWebhookPageId(body: Record<string, unknown>) {
	const directKeys = ["pageId", "page_id", "pageID", "notionPageId"];
	for (const key of directKeys) {
		const value = body[key];
		const pageId = extractNotionIdFromString(value);
		if (pageId) return pageId;
	}

	const candidates = [
		(body.page as { id?: unknown; url?: unknown } | undefined)?.id,
		(body.page as { id?: unknown; url?: unknown } | undefined)?.url,
		(body.entity as { id?: unknown; type?: unknown } | undefined)?.type === "page"
			? (body.entity as { id?: unknown }).id
			: undefined,
		(body.data as { page_id?: unknown; pageId?: unknown } | undefined)?.page_id,
		(body.data as { page_id?: unknown; pageId?: unknown } | undefined)?.pageId,
		(body.data as { id?: unknown; object?: unknown } | undefined)?.object === "page"
			? (body.data as { id?: unknown }).id
			: undefined,
	];
	for (const value of candidates) {
		const pageId = extractNotionIdFromString(value);
		if (pageId) return pageId;
	}

	return null;
}

function parseCavalryWorkOrderPayload(body: unknown) {
	const payload = (body ?? {}) as Record<string, unknown>;
	const data = (payload.data ?? {}) as Record<string, unknown>;
	const parsedWorkOrderId = parseInteger(
		payload.workOrderId ??
		payload.workOrderID ??
		payload.tillerWorkOrderId ??
		payload.tillerWorkOrderID ??
		data.workOrderId ??
		data.workOrderID,
	);
	if (!Number.isInteger(parsedWorkOrderId)) {
		throw new Error("Cavalry webhook needs workOrderId.");
	}
	const workOrderId = parsedWorkOrderId as number;
	return {
		workOrderId,
		name: parseString(payload.name ?? payload.workOrderName ?? data.name ?? data.workOrderName),
		templateId: parseInteger(payload.templateId ?? payload.templateID ?? payload.tillerTemplateId ?? data.templateId ?? data.templateID),
		renderCount: parseInteger(payload.renderCount ?? data.renderCount),
		campaignPageId: extractNotionIdFromString(payload.campaignPageId ?? payload.campaignUrl ?? data.campaignPageId ?? data.campaignUrl) ?? "",
		templatePageId: extractNotionIdFromString(payload.templatePageId ?? payload.templateUrl ?? data.templatePageId ?? data.templateUrl) ?? "",
		pollSeconds: Math.min(Math.max(parseInteger(payload.pollSeconds ?? data.pollSeconds) ?? 60, 0), 300),
	};
}

function parseInteger(value: unknown) {
	if (typeof value === "number" && Number.isInteger(value)) return value;
	if (typeof value === "string" && /^-?\d+$/.test(value.trim())) return Number.parseInt(value.trim(), 10);
	return null;
}

function parseString(value: unknown) {
	return typeof value === "string" && value.trim() ? value.trim() : "";
}

function extractNotionIdFromString(value: unknown) {
	if (typeof value !== "string") return null;
	if (looksLikeNotionId(value)) return value;
	const match = value.match(/[0-9a-f]{32}/i);
	return match ? match[0] : null;
}

function looksLikeNotionId(value: string) {
	return /^[0-9a-f]{32}$/i.test(value) ||
		/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

class TillerClient {
	private readonly baseUrl: string;
	private token: string | null = null;

	constructor() {
		this.baseUrl = getEnv("TILLER_API_BASE", DEFAULT_TILLER_API_BASE).replace(/\/+$/, "");
	}

	safeBaseUrl() {
		const url = new URL(this.baseUrl);
		return `${url.protocol}//${url.host}${url.pathname}`;
	}

	async authenticate() {
		const emailAddress = getRequiredEnv("TILLER_EMAIL");
		const password = getRequiredEnv("TILLER_PASSWORD");
		const tokenText = await this.request("POST", "/Authentication", {
			auth: false,
			parse: "text",
			body: { emailAddress, password },
		});
		this.token = normalizeAuthToken(tokenText);
		return this.token;
	}

	async getWorkOrderParameters(workOrderId: number) {
		return this.request("GET", `/workorder/${workOrderId}/parameter`);
	}

	async uploadMultipart(
		path: string,
		fieldName: string,
		file: { name: string; bytes: ArrayBuffer; contentType?: string },
	) {
		const boundary = `----NotionTillerBoundary${Math.random().toString(36).slice(2)}`;
		const before = Buffer.from(
			`--${boundary}\r\n` +
				`Content-Disposition: form-data; name="${escapeMultipartValue(fieldName)}"; filename="${escapeMultipartValue(file.name)}"\r\n` +
				`Content-Type: ${file.contentType || "application/octet-stream"}\r\n\r\n`,
			"utf8",
		);
		const after = Buffer.from(`\r\n--${boundary}--\r\n`, "utf8");
		return this.request("POST", path, {
			rawBody: Buffer.concat([before, Buffer.from(file.bytes), after]),
			headers: { "Content-Type": `multipart/form-data; boundary=${boundary}` },
		});
	}

	async request(
		method: string,
		path: string,
		options: {
			auth?: boolean;
			body?: unknown;
			rawBody?: BodyInit;
			parse?: "auto" | "text" | "arrayBuffer";
			headers?: Record<string, string>;
			allowStatus?: number[];
		} = {},
	) {
		const url = new URL(this.baseUrl + path);
		const headers: Record<string, string> = { ...(options.headers ?? {}) };
		const auth = options.auth ?? true;
		let payload: string | undefined;

		if (auth && this.token) {
			headers.Authorization = `Bearer ${this.token}`;
		}

		if (options.body !== undefined) {
			headers["Content-Type"] = "application/json";
			payload = JSON.stringify(options.body);
		}

		const requestBody = options.rawBody ?? payload;
		let response: Response;
		try {
			response = await fetch(url, {
				method,
				headers,
				body: requestBody,
				...(allowInsecureTillerTls(url) ? { dispatcher: insecureTillerAgent } : {}),
			} as RequestInit);
		} catch (error) {
			const detail = errorDetail(error);
			throw new Error(`Fetch failed for ${method} ${url.origin}${url.pathname}: ${detail}`);
		}

		const data = await parseResponse(response, options.parse ?? "auto");
		if (!response.ok && !(options.allowStatus ?? []).includes(response.status)) {
			const error = new Error(`Tiller API error ${response.status}`);
			(error as Error & { status?: number; data?: unknown }).status = response.status;
			(error as Error & { status?: number; data?: unknown }).data = data;
			throw error;
		}

		return data;
	}

	async resolveRedirectLocation(path: string) {
		const url = new URL(this.baseUrl + path);
		const headers: Record<string, string> = {};
		if (this.token) {
			headers.Authorization = `Bearer ${this.token}`;
		}

		let response: Response;
		try {
			response = await fetch(url, {
				method: "GET",
				headers,
				redirect: "manual",
				...(allowInsecureTillerTls(url) ? { dispatcher: insecureTillerAgent } : {}),
			} as RequestInit);
		} catch (error) {
			const detail = errorDetail(error);
			throw new Error(`Fetch failed for GET ${url.origin}${url.pathname}: ${detail}`);
		}

		if ([301, 302, 303, 307, 308].includes(response.status)) {
			const location = response.headers.get("location");
			if (location) return location;
		}
		if (!response.ok) {
			const data = await parseResponse(response, "auto");
			const error = new Error(`Tiller API error ${response.status}`);
			(error as Error & { status?: number; data?: unknown }).status = response.status;
			(error as Error & { status?: number; data?: unknown }).data = data;
			throw error;
		}

		return url.toString();
	}

}

async function parseResponse(response: Response, parse: "auto" | "text" | "arrayBuffer") {
	if (response.status === 204) return null;
	if (parse === "arrayBuffer") return response.arrayBuffer();

	const text = await response.text();
	if (parse === "text") return text;
	if (!text.trim()) return null;

	const contentType = response.headers.get("content-type") ?? "";
	if (contentType.includes("application/json")) {
		try {
			return JSON.parse(text);
		} catch {
			return text;
		}
	}

	try {
		return JSON.parse(text);
	} catch {
		return text;
	}
}

function normalizeAuthToken(value: unknown) {
	if (typeof value !== "string") {
		throw new Error("Tiller authentication did not return a token string.");
	}

	const trimmed = value.trim();
	if (!trimmed) throw new Error("Tiller authentication returned an empty token.");

	try {
		const parsed = JSON.parse(trimmed);
		if (typeof parsed === "string" && parsed.trim()) return parsed.trim();
	} catch {
		// Plain text token is normal.
	}

	return trimmed.replace(/^"|"$/g, "");
}

function getEnv(name: string, fallback: string) {
	return process.env[name] || fallback;
}

async function getDataSourceId(notion: any, key: PortalDataSourceKey) {
	const envName = DATA_SOURCE_ENV[key];
	const explicit = process.env[envName];
	if (explicit) return explicit;

	const config = await getPortalConfig(notion);
	const configured = config[key];
	if (configured) return configured;

	throw new Error(
		`Missing ${envName}. Run setupWorkspace and set TILLER_PORTAL_CONFIG_DATA_SOURCE_ID, or set ${envName}.`,
	);
}

async function getTemplateDataTablesParentPageId(notion: any, fallbackPageId: string) {
	const explicit = process.env.TEMPLATE_DATA_TABLES_PAGE_ID;
	if (explicit) return explicit;
	const config = await getPortalConfig(notion);
	return config.templateDataTablesPageId || fallbackPageId;
}

async function assertPageInDataSource(notion: any, pageId: string, key: PortalDataSourceKey) {
	const page = await notion.pages.retrieve({ page_id: pageId });
	const expectedDataSourceId = await getDataSourceId(notion, key);
	const actualParent = getPageParentId(page);
	if (!actualParent) {
		throw new PageScopeError(`Page ${pageId} has no readable parent. Refusing to run this action.`);
	}
	if (actualParent === expectedDataSourceId) return;

	const expectedParentIds = new Set([expectedDataSourceId]);
	try {
		const dataSource = await notion.dataSources.retrieve({ data_source_id: expectedDataSourceId });
		const databaseId = getDataSourceParentDatabaseId(dataSource);
		if (databaseId) expectedParentIds.add(databaseId);
	} catch {
		// If lookup fails, strict data_source_id comparison above is still enforced.
	}
	if (!expectedParentIds.has(actualParent)) {
		throw new PageScopeError(`This action can only run on ${displayDataSourceKey(key)} pages from the configured portal database.`);
	}
}

class PageScopeError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "PageScopeError";
	}
}

function getPageParentId(page: unknown) {
	const parent = (page as { parent?: Record<string, unknown> })?.parent;
	if (!parent || typeof parent !== "object") return "";
	if (typeof parent.data_source_id === "string") return parent.data_source_id;
	if (typeof parent.database_id === "string") return parent.database_id;
	return "";
}

function displayDataSourceKey(key: PortalDataSourceKey) {
	return {
		templates: "Template",
		workOrders: "Work Order",
		campaigns: "Campaign",
		templateDataTableIndex: "Template Data Table Index",
		renderOutputs: "Render Outputs",
		uploads: "Uploads",
		portalAreas: "Portal Areas",
		credentials: "Credentials",
		actionCenter: "Action Center",
		failureInbox: "Failure Inbox",
	}[key];
}

async function claimActionLock(notion: any, pageId: string, actionName: string) {
	const page = await notion.pages.retrieve({ page_id: pageId });
	const properties = (page as { properties?: Record<string, unknown> }).properties ?? {};
	const existingLock = getRichTextProperty(properties["Worker Lock"]);
	const lockExpiresAt = getDateProperty(properties["Lock Expires At"]);
	if (existingLock && lockExpiresAt && lockExpiresAt.getTime() > Date.now()) {
		throw new Error(`${actionName} is already running. Wait a minute, then try again if it does not finish.`);
	}

	const actionId = `${actionName}:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`;
	const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
	await notion.pages.update({
		page_id: pageId,
		properties: {
			"Worker Lock": richTextValue(actionId),
			"Lock Expires At": { date: { start: expiresAt } },
			"Last Action ID": richTextValue(actionId),
		},
	});

	const check = await notion.pages.retrieve({ page_id: pageId });
	const checkProperties = (check as { properties?: Record<string, unknown> }).properties ?? {};
	if (getRichTextProperty(checkProperties["Worker Lock"]) !== actionId) {
		throw new Error(`${actionName} was already picked up by another worker run.`);
	}
	return actionId;
}

async function releaseActionLock(notion: any, pageId: string, actionId: string) {
	try {
		const page = await notion.pages.retrieve({ page_id: pageId });
		const properties = (page as { properties?: Record<string, unknown> }).properties ?? {};
		if (getRichTextProperty(properties["Worker Lock"]) !== actionId) return;
		await notion.pages.update({
			page_id: pageId,
			properties: {
				"Worker Lock": richTextValue(""),
				"Lock Expires At": { date: null },
			},
		});
	} catch {
		// Lock expiry is the fallback if release cannot complete.
	}
}

async function getPortalConfig(notion: any): Promise<Partial<PortalConfig>> {
	if (!portalConfigPromise) {
		portalConfigPromise = loadPortalConfig(notion).catch((error) => {
			portalConfigPromise = null;
			throw error;
		});
	}
	return portalConfigPromise;
}

async function loadPortalConfig(notion: any): Promise<Partial<PortalConfig>> {
	const configDataSourceId = process.env.TILLER_PORTAL_CONFIG_DATA_SOURCE_ID;
	if (!configDataSourceId) return {};

	const response = await notion.dataSources.query({
		data_source_id: configDataSourceId,
		page_size: 1,
		filter: {
			property: "Name",
			title: { equals: CONFIG_ROW_TITLE },
		},
	});
	const row = response.results?.[0];
	const properties = row?.properties ?? {};
	const config: Partial<PortalConfig> = {};
	for (const key of Object.keys(CONFIG_PROPERTY_BY_KEY) as PortalDataSourceKey[]) {
		config[key] = getRichTextProperty(properties[CONFIG_PROPERTY_BY_KEY[key]]);
	}
	config.templateDataTablesPageId = getRichTextProperty(properties["Template Data Tables Page ID"]);
	return config;
}

function getRequiredEnv(name: string) {
	const value = process.env[name];
	if (!value) throw new Error(`Missing worker secret: ${name}`);
	return value;
}

function allowInsecureTillerTls(url: URL) {
	return process.env.TILLER_ALLOW_INSECURE_TLS === "true" && url.hostname === "tiller.work";
}

function formatToolError(error: unknown) {
	const typed = error as Error & { status?: number; data?: unknown };
	return {
		ok: false,
		error: typed?.message ?? String(error),
		status: typed?.status ?? null,
		data: typed?.data == null ? null : safeJsonString(typed.data),
	};
}

function errorDetail(error: unknown) {
	if (!(error instanceof Error)) return String(error);
	const cause = (error as Error & { cause?: unknown }).cause;
	if (cause instanceof Error) return `${error.message}; cause=${cause.message}`;
	if (cause && typeof cause === "object") return `${error.message}; cause=${JSON.stringify(cause)}`;
	return error.message;
}

function safeJsonString(value: unknown) {
	if (typeof value === "string") return value;
	try {
		return JSON.stringify(value);
	} catch {
		return String(value);
	}
}

function notionPageUrl(id: string) {
	if (!id) return "";
	return `https://www.notion.so/${id.replace(/-/g, "")}`;
}

function summarizeNotionWorkOrderPage(page: unknown) {
	const value = page as {
		id?: string;
		url?: string;
		properties?: Record<string, unknown>;
	};
	const properties = value.properties ?? {};
	return {
		pageId: value.id ?? "",
		url: value.url ?? "",
		name: getTitleProperty(properties.Name),
		action: getSelectProperty(properties.Action),
		status: getSelectProperty(properties[WORK_ORDER_STATUS_PROPERTY]) || getSelectProperty(properties.Status),
		tillerTemplateId: getNumberProperty(properties["Tiller Template ID"]),
		tillerWorkOrderId: getNumberProperty(properties["Tiller Work Order ID"]),
		renderCount: getNumberProperty(properties["Render Count"]),
		downloadRendersHere: getUrlProperty(properties["Download Renders Here"]),
		templateAssetsUrl: getUrlProperty(properties["Template Assets URL"]),
	};
}

function summarizeNotionTemplatePage(page: unknown) {
	const value = page as {
		id?: string;
		url?: string;
		properties?: Record<string, unknown>;
	};
	const properties = value.properties ?? {};
	return {
		pageId: value.id ?? "",
		url: value.url ?? "",
		name: getTitleProperty(properties.Name),
		action: getSelectProperty(properties.Action),
		status: getSelectProperty(properties.Status),
		tillerTemplateId: getNumberProperty(properties["Tiller Template ID"]),
		templateAssetsUrl: getUrlProperty(properties["Template Assets URL"]),
		templateDetails: getRichTextProperty(properties["Template Details"]),
		csvColumns: getRichTextProperty(properties["CSV Columns"]),
		dataRowsDatabaseId: getRichTextProperty(properties["Data Rows Database ID"]),
		dataRowsDatabaseUrl: getUrlProperty(properties["Data Rows Database URL"]),
		dataRowsStatus: getSelectProperty(properties["Data Rows Status"]),
		parameterFilePath: getRichTextProperty(properties["Parameter File Path"]),
		cavalryScenes: [
			...getFilesProperty(properties["Cav File"]),
			...getFilesProperty(properties["Cavalry Scene"]),
		],
	};
}

function summarizeNotionCampaignPage(page: unknown) {
	const value = page as {
		id?: string;
		url?: string;
		properties?: Record<string, unknown>;
	};
	const properties = value.properties ?? {};
	return {
		pageId: value.id ?? "",
		url: value.url ?? "",
		name: getTitleProperty(properties.Name),
		action: getSelectProperty(properties.Action),
		templatePageIds: getRelationProperty(properties.Template),
		workOrderPageIds: getRelationProperty(properties["Work Order"]),
	};
}

function summarizePortalAreaPage(page: unknown) {
	const value = page as {
		id?: string;
		url?: string;
		properties?: Record<string, unknown>;
	};
	const properties = value.properties ?? {};
	return {
		pageId: value.id ?? "",
		url: value.url ?? "",
		name: getTitleProperty(properties.Name),
		action: getSelectProperty(properties.Action),
		parentPageUrl: getUrlProperty(properties["Parent Page URL"]),
		databasePrefix: getRichTextProperty(properties["Database Prefix"]),
		confirmAction: getCheckboxProperty(properties["Confirm Action"]),
	};
}

function summarizeCredentialPage(page: unknown) {
	const value = page as {
		id?: string;
		url?: string;
		properties?: Record<string, unknown>;
	};
	const properties = value.properties ?? {};
	return {
		pageId: value.id ?? "",
		url: value.url ?? "",
		name: getTitleProperty(properties.Name),
		action: getSelectProperty(properties.Action),
		credentialType: getSelectProperty(properties["Credential Type"]),
	};
}

function summarizeControlPage(page: unknown) {
	const value = page as {
		id?: string;
		url?: string;
		properties?: Record<string, unknown>;
	};
	const properties = value.properties ?? {};
	return {
		pageId: value.id ?? "",
		url: value.url ?? "",
		name: getTitleProperty(properties.Name),
		action: getSelectProperty(properties.Action),
	};
}

function summarizeCampaignDataRow(page: unknown, csvColumns: string[]) {
	const value = page as {
		id?: string;
		url?: string;
		properties?: Record<string, unknown>;
	};
	const properties = value.properties ?? {};
	const values: Record<string, string> = {};
	for (const column of csvColumns) {
		values[column] = getCsvPropertyValue(properties[column]);
	}
	return {
		pageId: value.id ?? "",
		url: value.url ?? "",
		name: getTitleProperty(properties._Row) || getTitleProperty(properties.Name),
		campaignPageIds: getRelationProperty(properties._Campaign ?? properties.Campaign),
		include: getCheckboxProperty(properties["_Include in Render"] ?? properties["Include in Render"]),
		rowStatusProperty: properties["_Row Status"] ? "_Row Status" : properties["Row Status"] ? "Row Status" : "",
		values,
	};
}

function getTitleProperty(property: unknown) {
	const title = (property as { title?: Array<{ plain_text?: string }> })?.title ?? [];
	return title.map((entry) => entry.plain_text ?? "").join("").trim();
}

function getSelectProperty(property: unknown) {
	return (property as { select?: { name?: string } })?.select?.name ?? "";
}

function getNumberProperty(property: unknown) {
	const value = (property as { number?: number | null })?.number;
	return typeof value === "number" ? value : null;
}

function getDateProperty(property: unknown) {
	const start = (property as { date?: { start?: string | null } | null })?.date?.start;
	if (typeof start !== "string" || !start) return null;
	const date = new Date(start);
	return Number.isNaN(date.getTime()) ? null : date;
}

function getUrlProperty(property: unknown) {
	const value = (property as { url?: string | null })?.url;
	return typeof value === "string" ? value.trim() : "";
}

function getRelationProperty(property: unknown) {
	const relation = (property as { relation?: Array<{ id?: string }> })?.relation ?? [];
	return relation.map((entry) => entry.id).filter((id): id is string => typeof id === "string");
}

function getCsvPropertyValue(property: unknown) {
	return getRichTextProperty(property) || getTitleProperty(property) || getSelectProperty(property) || getUrlProperty(property);
}

function getFilesProperty(property: unknown) {
	const files = (property as { files?: Array<any> })?.files ?? [];
	return files
		.map((file) => {
			const url =
				file?.type === "file"
					? file?.file?.url
					: file?.type === "external"
						? file?.external?.url
						: null;
			return typeof url === "string"
				? { name: String(file?.name ?? "file"), url }
				: null;
		})
		.filter((file) => file != null);
}

async function fetchNotionJsonFile(file: { name: string; url: string }) {
	const response = await fetch(file.url);
	if (!response.ok) {
		throw new Error(`Could not fetch Notion file ${file.name}: HTTP ${response.status}`);
	}
	const text = await response.text();
	try {
		return { name: file.name, json: JSON.parse(text), format: detectSceneFormat(file.name) };
	} catch (error) {
		throw new Error(
			`Cavalry Scene file ${file.name} is not valid JSON. Cavalry .cv files should contain JSON text. ${(error as Error).message}`,
		);
	}
}

function detectSceneFormat(fileName: string) {
	const extension = fileName.split(".").pop()?.toLowerCase() ?? "";
	if (extension === "cv") return "cavalry-cv-json";
	if (extension === "json") return "json";
	if (extension === "txt") return "text-json";
	return extension ? `${extension}-json` : "json";
}

async function fetchNotionBinaryFile(file: { name: string; url: string }) {
	const response = await fetch(file.url);
	if (!response.ok) {
		throw new Error(`Could not fetch Notion file ${file.name}: HTTP ${response.status}`);
	}
	return {
		name: file.name,
		bytes: await response.arrayBuffer(),
		contentType: response.headers.get("content-type") ?? "application/octet-stream",
	};
}

function getWorkOrderCurrentStatus(workOrder: unknown) {
	const value = workOrder as {
		status?: { workOrderStatusType?: string };
		workOrderStatusType?: string;
	};
	return value?.status?.workOrderStatusType ?? value?.workOrderStatusType ?? "Unknown";
}

function normalizeWorkOrderList(value: unknown) {
	const items = Array.isArray(value)
		? value
		: Array.isArray((value as { workOrders?: unknown[] })?.workOrders)
			? (value as { workOrders: unknown[] }).workOrders
			: Array.isArray((value as { items?: unknown[] })?.items)
				? (value as { items: unknown[] }).items
				: Object.values((value as Record<string, unknown>) ?? {});

	return items
		.map((item) => {
			const workOrder = item as {
				workOrderID?: number;
				workOrderId?: number;
				id?: number;
				templateID?: number;
				templateId?: number;
				name?: string;
				renderCount?: number;
				status?: { workOrderStatusType?: string };
				workOrderStatusType?: string;
			};
			const id = workOrder.workOrderID ?? workOrder.workOrderId ?? workOrder.id;
			if (typeof id !== "number") return null;
			return {
				id,
				name: workOrder.name ?? `Work Order ${id}`,
				templateId: workOrder.templateID ?? workOrder.templateId ?? null,
				renderCount: workOrder.renderCount ?? null,
				status: getWorkOrderCurrentStatus(workOrder),
				raw: safeJsonString(workOrder),
			};
		})
		.filter((item) => item != null);
}

function normalizeTemplateList(value: unknown) {
	const items = Array.isArray(value)
		? value
		: Array.isArray((value as { templates?: unknown[] })?.templates)
			? (value as { templates: unknown[] }).templates
			: Array.isArray((value as { items?: unknown[] })?.items)
				? (value as { items: unknown[] }).items
				: Object.values((value as Record<string, unknown>) ?? {});

	return items
		.map((item) => {
			const template = item as {
				templateID?: number;
				templateId?: number;
				id?: number;
				name?: string;
				status?: { templateStatusType?: string };
				templateStatusType?: string;
				ready?: boolean;
				creationTime?: string;
				createdAt?: string;
				created?: string;
			};
			const id = template.templateID ?? template.templateId ?? template.id;
			if (typeof id !== "number") return null;
			return {
				id,
				name: template.name ?? `Template ${id}`,
				status: getTemplateDisplayStatus(template),
				created: template.creationTime ?? template.createdAt ?? template.created ?? "",
				raw: safeJsonString(template),
			};
		})
		.filter((item) => item != null);
}

function getTemplateDisplayStatus(value: unknown) {
	if (Array.isArray(value)) {
		const latest = value.at(-1) as { templateStatusType?: string } | undefined;
		return latest?.templateStatusType ?? "Unknown";
	}
	const template = value as {
		status?: { templateStatusType?: string };
		templateStatusType?: string;
		ready?: boolean;
	};
	if (template.status?.templateStatusType) return template.status.templateStatusType;
	if (template.templateStatusType) return template.templateStatusType;
	if (template.ready === true) return "Ready";
	if (template.ready === false) return "PendingAssets";
	return "Unknown";
}

function getTemplateStatusTypes(statusData: unknown) {
	if (Array.isArray(statusData)) {
		return statusData
			.map((entry) => (entry as { templateStatusType?: string })?.templateStatusType)
			.filter(Boolean);
	}
	const value = statusData as {
		status?: { templateStatusType?: string };
		templateStatusType?: string;
	};
	if (value?.status?.templateStatusType) return [value.status.templateStatusType];
	if (value?.templateStatusType) return [value.templateStatusType];
	return [];
}

async function upsertTemplates({
	notion,
	dataSourceId,
	templates,
	dryRun,
}: {
	notion: any;
	dataSourceId: string;
	templates: Array<any>;
	dryRun: boolean;
}) {
	let created = 0;
	let updated = 0;
	const errors: Array<{ id: number; error: string }> = [];
	for (const template of templates) {
		try {
			const existing = await findPageByNumberProperty(
				notion,
				dataSourceId,
				"Tiller Template ID",
				template.id,
			);
			if (dryRun) {
				if (existing) updated++;
				else created++;
				continue;
			}
			const properties = {
				Name: titleValue(template.name),
				"Tiller Template ID": { number: template.id },
				Status: { select: { name: ensureTemplateStatus(template.status) } },
				"Last Synced At": { date: { start: new Date().toISOString() } },
			};
			if (existing) {
				await notion.pages.update({ page_id: existing.id, properties });
				updated++;
			} else {
				await notion.pages.create({
					parent: { type: "data_source_id", data_source_id: dataSourceId },
					properties,
				});
				created++;
			}
		} catch (error) {
			errors.push({ id: template.id, error: (error as Error)?.message ?? String(error) });
		}
	}
	return { dryRun, selected: templates.length, created, updated, errors };
}

async function upsertWorkOrders({
	notion,
	dataSourceId,
	workOrders,
	dryRun,
}: {
	notion: any;
	dataSourceId: string;
	workOrders: Array<any>;
	dryRun: boolean;
}) {
	let created = 0;
	let updated = 0;
	const errors: Array<{ id: number; error: string }> = [];
	for (const workOrder of workOrders) {
		try {
			const existing = await findPageByNumberProperty(
				notion,
				dataSourceId,
				"Tiller Work Order ID",
				workOrder.id,
			);
			if (dryRun) {
				if (existing) updated++;
				else created++;
				continue;
			}
			const properties = {
				Name: titleValue(workOrder.name),
				Action: { select: { name: "None" } },
				[WORK_ORDER_STATUS_PROPERTY]: { select: { name: ensureWorkOrderStatus(workOrder.status) } },
				"Completed Renders": {
					number: ensureWorkOrderStatus(workOrder.status) === "Done"
						? workOrder.renderCount ?? null
						: null,
				},
				"Tiller Template ID": { number: workOrder.templateId ?? null },
				"Tiller Work Order ID": { number: workOrder.id },
				"Render Count": { number: workOrder.renderCount ?? null },
				"Last Synced At": { date: { start: new Date().toISOString() } },
			};
			if (existing) {
				await notion.pages.update({ page_id: existing.id, properties });
				updated++;
			} else {
				await notion.pages.create({
					parent: { type: "data_source_id", data_source_id: dataSourceId },
					properties,
				});
				created++;
			}
		} catch (error) {
			errors.push({ id: workOrder.id, error: (error as Error)?.message ?? String(error) });
		}
	}
	return { dryRun, selected: workOrders.length, created, updated, errors };
}

async function findPageByNumberProperty(
	notion: any,
	dataSourceId: string,
	property: string,
	value: number,
) {
	const response = await notion.dataSources.query({
		data_source_id: dataSourceId,
		page_size: 1,
		filter: {
			property,
			number: { equals: value },
		},
	});
	return response.results?.[0] ?? null;
}

function ensureTemplateStatus(status: string) {
	if (["Ready", "PendingAssets", "Failed", "Archived", "Unknown"].includes(status)) {
		return status;
	}
	return "Unknown";
}

function ensureWorkOrderStatus(status: string) {
	const mapped = mapTillerStatusToNotionStatus(status);
	return mapped || "Queued";
}

function dateOrNull(value: string) {
	return value ? { date: { start: value } } : { date: null };
}

function mapTillerStatusToNotionStatus(tillerStatus: string) {
	if (tillerStatus === "Done") return "Done";
	if (tillerStatus === "Failed") return "Failed";
	if (tillerStatus === "Archived") return "Archived";
	if (tillerStatus === "PendingParameters") return "Pending Parameters";
	if (
		tillerStatus === "PendingDynamicAssets" ||
		tillerStatus === "PendingDependentAssets"
	) {
		return "Pending Dynamic Assets";
	}
	if (tillerStatus === "Rendering") return "Rendering";
	if (tillerStatus.startsWith("Queued")) return "Queued";
	return "Queued";
}

function getCreatedWorkOrderId(value: unknown) {
	const data = value as { workOrderID?: number; workOrderId?: number; id?: number };
	const workOrderId = data?.workOrderID ?? data?.workOrderId ?? data?.id;
	if (!Number.isInteger(workOrderId)) {
		throw new Error(`Work order ID missing in Tiller response: ${safeJsonString(value)}`);
	}
	return workOrderId as number;
}

function getCreatedTemplateId(value: unknown) {
	const data = value as { templateID?: number; templateId?: number; id?: number };
	const templateId = data?.templateID ?? data?.templateId ?? data?.id;
	if (!Number.isInteger(templateId)) {
		throw new Error(`Template ID missing in Tiller response: ${safeJsonString(value)}`);
	}
	return templateId as number;
}

async function buildTemplateSetupDetails(
	client: TillerClient,
	templateId: number,
	known: { created?: unknown; assets?: unknown; status?: unknown } = {},
) {
	const template = await client.request("GET", `/Template/${templateId}`);
	const assets = known.assets ?? await client.request("GET", `/template/${templateId}/asset`);
	const status = known.status ?? await client.request("GET", `/template/${templateId}/status`);
	const statusTypes = getTemplateStatusTypes(status);
	return {
		templateID: templateId,
		template,
		assets,
		status,
		ready: statusTypes.includes("Ready"),
		...(known.created ? { created: known.created } : {}),
	};
}

function formatTemplateDetailProperties(details: unknown) {
	const csvParameters = getTemplateCsvParameters(details);
	const smartFolderParameters = getTemplateSmartFolderParameters(details);
	const csvColumns = csvParameters
		.slice()
		.sort((a, b) => a.columnIndex - b.columnIndex)
		.map((parameter) => parameter.name)
		.filter(Boolean);
	const parameterFilePath = csvParameters[0]?.assetPath ?? "";
	return {
		"Template Details": richTextLongValue(safeJsonString(details)),
		...(csvColumns.length > 0
			? { "CSV Columns": richTextValue(csvColumns.join(",")) }
			: {}),
		...(parameterFilePath
			? { "Parameter File Path": richTextValue(parameterFilePath) }
			: {}),
		...(smartFolderParameters.length > 0
			? { "Smart Folder Parameters": richTextValue(smartFolderParameters.join("\n")) }
			: {}),
	};
}

function getTemplateCsvParameters(details: unknown) {
	const template = (details as { template?: { csvParameters?: unknown[] } })?.template;
	return (Array.isArray(template?.csvParameters) ? template.csvParameters : [])
		.map((item) => {
			const value = item as {
				name?: unknown;
				columnIndex?: unknown;
				assetPath?: unknown;
				templateCSVParameterID?: unknown;
			};
			return {
				name: typeof value.name === "string" ? value.name : "",
				columnIndex: typeof value.columnIndex === "number" ? value.columnIndex : 0,
				assetPath: typeof value.assetPath === "string" ? value.assetPath : "",
				id: typeof value.templateCSVParameterID === "number" ? value.templateCSVParameterID : null,
			};
		})
		.filter((parameter) => parameter.name);
}

function parseTemplateDetails(value: string) {
	if (!value.trim()) return null;
	try {
		return JSON.parse(value) as unknown;
	} catch {
		throw new Error("Template Details are not valid JSON. Use Check Status to refresh them.");
	}
}

function getTemplateSmartFolderParameters(details: unknown) {
	const template = (details as { template?: { smartFolderParameters?: unknown[] } })?.template;
	return (Array.isArray(template?.smartFolderParameters) ? template.smartFolderParameters : [])
		.map((item) => (item as { assetPath?: unknown }).assetPath)
		.filter((assetPath): assetPath is string => typeof assetPath === "string" && assetPath.length > 0);
}

function flattenUploadStatus(data: unknown) {
	if (!data) return [];
	if (Array.isArray(data)) return data;
	const value = data as {
		files?: unknown[];
		directories?: unknown[];
		fileSequences?: unknown[];
	};
	return [
		...(Array.isArray(value.files) ? value.files : []),
		...(Array.isArray(value.directories) ? value.directories : []),
		...(Array.isArray(value.fileSequences) ? value.fileSequences : []),
	];
}

function getPendingItems(data: unknown) {
	return flattenUploadStatus(data).filter((item) => {
		return (item as { ready?: boolean })?.ready === false;
	});
}

function getStatusTarget(item: unknown) {
	const value = item as {
		path?: string;
		directory?: string;
		filePathPattern?: string;
		requiredIndex?: string | number;
	};
	if (value?.filePathPattern && value.requiredIndex != null) {
		return concreteSequencePath(value.filePathPattern, String(value.requiredIndex));
	}
	return value?.path ?? value?.directory ?? value?.filePathPattern ?? "";
}

function concreteSequencePath(pattern: string, requiredIndex: string) {
	const normalized = normalizeUploadPath(pattern);
	const slashIndex = normalized.lastIndexOf("/");
	const dir = slashIndex >= 0 ? normalized.slice(0, slashIndex + 1) : "";
	const base = slashIndex >= 0 ? normalized.slice(slashIndex + 1) : normalized;
	const dotIndex = base.lastIndexOf(".");
	const stem = dotIndex >= 0 ? base.slice(0, dotIndex) : base;
	const ext = dotIndex >= 0 ? base.slice(dotIndex) : "";
	const strippedStem = stem.replace(/\d+$/, "");
	return `${dir}${strippedStem}${requiredIndex}${ext}`;
}

async function createUploadRows({
	notion,
	parentPageId,
	parentKind = "work_order",
	phase,
	items,
}: {
	notion: any;
	parentPageId: string;
	parentKind?: "work_order" | "template";
	phase: "parameter" | "dynamic_asset" | "template_asset";
	items: unknown[];
}) {
	const dataSourceId = await getDataSourceId(notion, "uploads");
	const createdRows = [];
	for (const item of items) {
		const targetPath = getStatusTarget(item);
		if (!targetPath) continue;
		const created = await notion.pages.create({
			parent: {
				type: "data_source_id",
				data_source_id: dataSourceId,
			},
			properties: {
				Name: titleValue(`${phase}: ${targetPath}`),
				...(parentKind === "template"
					? { "Parent Template Page ID": richTextValue(parentPageId) }
					: { "Parent Work Order Page ID": richTextValue(parentPageId) }),
				Phase: { select: { name: phase } },
				"Tiller Path": richTextValue(targetPath),
				Ready: { checkbox: false },
				"Last Error": richTextValue(""),
			},
		});
		createdRows.push({
			pageId: created.id,
			phase,
			tillerPath: targetPath,
			url: created.url ?? "",
		});
	}
	return createdRows;
}

async function finalizeTemplateAssets({
	notion,
	pageId,
	templateId,
}: {
	notion: any;
	pageId: string;
	templateId: number;
}) {
	await assertPageInDataSource(notion, pageId, "templates");
	await setPageProgress(notion, pageId, 20, "Checking Status", "Checking template asset status.");
	const client = new TillerClient();
	await client.authenticate();
	const currentStatus = await client.request("GET", `/template/${templateId}/status`);
	const currentStatusTypes = getTemplateStatusTypes(currentStatus);
	if (currentStatusTypes.includes("Ready")) {
		const templateDetails = await buildTemplateSetupDetails(client, templateId, {
			status: currentStatus,
		});
		await notion.pages.update({
			page_id: pageId,
			properties: {
				Action: { select: { name: "None" } },
				Status: { select: { name: "Ready" } },
				"Required Assets": richTextValue(""),
				...formatTemplateDetailProperties(templateDetails),
				"Tiller Response": richTextValue(
					formatTemplateResponse({
						status: currentStatusTypes.join(", "),
						message: "Template is already Ready. Tiller will not accept more asset uploads for this template.",
					}),
				),
				"Last Synced At": { date: { start: new Date().toISOString() } },
				"Last Error": richTextValue(""),
			},
		});
		await setPageProgress(notion, pageId, 100, "Ready", "Template is already ready.");
		return {
			ok: true,
			pageId,
			tillerTemplateId: templateId,
			tillerStatus: currentStatusTypes.join(", "),
			notionStatus: "Ready",
			uploadedRows: [],
			missingRows: [],
			message: "Template is already Ready. Tiller will not accept more asset uploads for this template.",
		};
	}

	let uploadRows = await queryUploadRowsForParent({
		notion,
		parentKind: "template",
		parentPageId: pageId,
		phase: "template_asset",
		ready: false,
	});

	if (uploadRows.length === 0) {
		const assets = await client.request("GET", `/template/${templateId}/asset`);
		const pendingAssets = getPendingItems(assets);
		if (pendingAssets.length > 0) {
			await createUploadRows({
				notion,
				parentPageId: pageId,
				parentKind: "template",
				phase: "template_asset",
				items: pendingAssets,
			});
			uploadRows = await queryUploadRowsForParent({
				notion,
				parentKind: "template",
				parentPageId: pageId,
				phase: "template_asset",
				ready: false,
			});
		}
	}

	const templatePage = await notion.pages.retrieve({ page_id: pageId });
	const templateSummary = summarizeNotionTemplatePage(templatePage);
	await setPageProgress(notion, pageId, 70, "Uploading Assets", "Uploading template assets from Notion and Google Drive.");
	const templateUpload = await uploadRowsToTiller({
		notion,
		client,
		parentKind: "template",
		pageId,
		phase: "template_asset",
		uploadPath: `/template/${templateId}/asset`,
		folderUrl: templateSummary.templateAssetsUrl,
	});
	if (templateUpload.missingRows.length > 0) {
		await notion.pages.update({
			page_id: pageId,
			properties: {
				Action: { select: { name: "None" } },
				Status: { select: { name: "PendingAssets" } },
				"Required Assets": richTextValue(
					templateUpload.missingRows.map((row: UploadRow) => row.tillerPath || row.name).join("\n"),
				),
				"Tiller Response": richTextValue(
					formatTemplateResponse({
						status: "PendingAssets",
						requiredAssets: templateUpload.missingRows.map((row: UploadRow) => row.tillerPath || row.name),
						message: templateSummary.templateAssetsUrl
							? `I uploaded ${templateUpload.uploaded.length} file(s), but some required assets are still missing. Attach files to the listed Upload rows or fix the Google Drive folder, then use Push Update.`
							: "Attach files to the listed Upload rows, then use Push Update.",
					}),
				),
				"Last Error": richTextValue(""),
			},
		});
		await setPageProgress(notion, pageId, 85, "Waiting on Assets", "Some required template assets are still missing.");
		return {
			ok: true,
			pageId,
			tillerTemplateId: templateId,
			tillerStatus: "PendingAssets",
			notionStatus: "PendingAssets",
			uploadedRows: templateUpload.uploaded,
			missingRows: templateUpload.missingRows.map(rowSummary),
			message: "Template assets still need attached files in Upload rows.",
		};
	}
	const uploadedRows = templateUpload.uploaded;

	await client.request("POST", `/template/${templateId}/asset/confirm`, { parse: "text" });
	await setPageProgress(notion, pageId, 90, "Checking Assets", "Confirming uploaded template assets.");
	const status = await client.request("GET", `/template/${templateId}/status`);
	const templateDetails = await buildTemplateSetupDetails(client, templateId, { status });
	const statusTypes = getTemplateStatusTypes(status);
	const isReady = statusTypes.includes("Ready");
	const notionStatus = isReady ? "Ready" : "PendingAssets";

	await notion.pages.update({
		page_id: pageId,
		properties: {
			Action: { select: { name: "None" } },
			Status: { select: { name: notionStatus } },
			"Required Assets": richTextValue(isReady ? "" : safeJsonString(status)),
			...formatTemplateDetailProperties(templateDetails),
			"Tiller Response": richTextValue(
				formatTemplateResponse({
					status: statusTypes.join(", ") || "Unknown",
					message: isReady
						? "Template assets uploaded. Template is Ready."
						: "Template assets uploaded, but Tiller has not marked the template Ready.",
				}),
			),
			"Last Synced At": { date: { start: new Date().toISOString() } },
			"Last Error": richTextValue(isReady ? "" : `Template status: ${statusTypes.join(", ") || "Unknown"}`),
		},
	});
	await setPageProgress(notion, pageId, isReady ? 100 : 85, isReady ? "Ready" : "Waiting on Assets", isReady ? "Template assets uploaded and ready." : "Template assets uploaded; waiting on Tiller.");

	return {
		ok: true,
		pageId,
		tillerTemplateId: templateId,
		tillerStatus: statusTypes.join(", ") || "Unknown",
		notionStatus,
		uploadedRows,
		missingRows: [],
		message: isReady ? "Template assets uploaded and template is Ready." : "Template assets uploaded, but template is not Ready yet.",
	};
}

async function finalizeWorkOrderInputs({
	notion,
	pageId,
	pollSeconds,
}: {
	notion: any;
	pageId: string;
	pollSeconds: number;
}) {
	await assertPageInDataSource(notion, pageId, "workOrders");
	await setPageProgress(notion, pageId, 45, "Uploading Parameters", "Checking work order parameters.");
	const page = await notion.pages.retrieve({ page_id: pageId });
	const summary = summarizeNotionWorkOrderPage(page);
	if (!summary.tillerWorkOrderId) {
		throw new Error("Work order row is missing Tiller Work Order ID.");
	}

	const client = new TillerClient();
	await client.authenticate();
	const workOrderId = summary.tillerWorkOrderId;
	let uploadedParameters = (await uploadRowsToTiller({
		notion,
		client,
		parentKind: "work_order",
		pageId,
		phase: "parameter",
		uploadPath: `/workorder/${workOrderId}/parameter`,
		folderUrl: summary.templateAssetsUrl,
	})).uploaded;

	let parameterStatus = await client.request("GET", `/workorder/${workOrderId}/parameter`, {
		allowStatus: [409],
	});
	let pendingParameters = getPendingItems(parameterStatus);
	if (pendingParameters.length === 0) {
		await client.request("POST", `/workorder/${workOrderId}/parameter/confirm`, {
			parse: "text",
			allowStatus: [409],
		});
	} else {
		await ensureMissingUploadRows({
			notion,
			parentPageId: pageId,
			phase: "parameter",
			items: pendingParameters,
		});
		const parameterUpload = await uploadRowsToTiller({
			notion,
			client,
			parentKind: "work_order",
			pageId,
			phase: "parameter",
			uploadPath: `/workorder/${workOrderId}/parameter`,
			folderUrl: summary.templateAssetsUrl,
		});
		uploadedParameters = [...uploadedParameters, ...parameterUpload.uploaded];
		if (parameterUpload.uploaded.length > 0) {
			parameterStatus = await client.request("GET", `/workorder/${workOrderId}/parameter`, {
				allowStatus: [409],
			});
			pendingParameters = getPendingItems(parameterStatus);
			if (pendingParameters.length === 0) {
				await client.request("POST", `/workorder/${workOrderId}/parameter/confirm`, {
					parse: "text",
					allowStatus: [409],
				});
			}
		}
		if (pendingParameters.length === 0) {
			// Continue to dynamic assets.
		} else {
			const parameterRows = parameterUpload.missingRows.length > 0
				? parameterUpload.missingRows
				: await queryUploadRowsForParent({
					notion,
					parentKind: "work_order",
					parentPageId: pageId,
					phase: "parameter",
					ready: false,
				});
			await updateWorkOrderPending(notion, pageId, "Pending Parameters", pendingParameters, parameterRows);
			await setPageProgress(notion, pageId, 55, "Uploading Parameters", "Parameter files are still needed.");
			return {
				ok: true,
				pageId,
				tillerWorkOrderId: workOrderId,
				tillerStatus: "PendingParameters",
				notionStatus: "Pending Parameters",
				uploadedParameters,
				uploadedDynamicAssets: [],
				createdUploadRows: parameterRows.map(rowSummary),
				outputRows: [],
				results: [],
				message: summary.templateAssetsUrl
					? "Some parameter files are still missing. Check Template Assets URL or attach files to Upload rows, then run finalizeWorkOrderInputs again."
					: "Attach parameter files to Upload rows, then run finalizeWorkOrderInputs again.",
			};
		}
	}

	let dynamicStatus = await client.request("GET", `/workorder/${workOrderId}/dynamicasset`, {
		allowStatus: [409],
	});
	let pendingDynamicAssets = getPendingItems(dynamicStatus);
	let uploadedDynamicAssets: UploadedFileSummary[] = [];
	if (pendingDynamicAssets.length > 0) {
		await setPageProgress(notion, pageId, 65, "Uploading Assets", "Checking dynamic assets.");
		const existingRows = await queryUploadRowsForParent({
			notion,
			parentKind: "work_order",
			parentPageId: pageId,
			phase: "dynamic_asset",
		});
		if (existingRows.length === 0) {
			await createUploadRows({
				notion,
				parentPageId: pageId,
				phase: "dynamic_asset",
				items: pendingDynamicAssets,
			});
		}
		const dynamicUpload = await uploadRowsToTiller({
			notion,
			client,
			parentKind: "work_order",
			pageId,
			phase: "dynamic_asset",
			uploadPath: `/workorder/${workOrderId}/dynamicasset`,
			folderUrl: summary.templateAssetsUrl,
		});
		uploadedDynamicAssets = [...uploadedDynamicAssets, ...dynamicUpload.uploaded];
		if (dynamicUpload.uploaded.length > 0) {
			dynamicStatus = await client.request("GET", `/workorder/${workOrderId}/dynamicasset`, {
				allowStatus: [409],
			});
			pendingDynamicAssets = getPendingItems(dynamicStatus);
			if (pendingDynamicAssets.length === 0) {
				await client.request("POST", `/workorder/${workOrderId}/dynamicasset/confirm`, {
					parse: "text",
					allowStatus: [409],
				});
			}
		}
		if (pendingDynamicAssets.length === 0) {
			// Continue to render polling.
		} else {
				const dynamicRows = await queryUploadRowsForParent({
					notion,
					parentKind: "work_order",
					parentPageId: pageId,
					phase: "dynamic_asset",
					ready: false,
				});
				if (dynamicRows.some((row: UploadRow) => row.files.length === 0)) {
					await updateWorkOrderPending(notion, pageId, "Pending Dynamic Assets", pendingDynamicAssets, dynamicRows);
					await setPageProgress(notion, pageId, 85, "Waiting on Assets", "Dynamic assets are still needed.");
					return {
						ok: true,
						pageId,
						tillerWorkOrderId: workOrderId,
						tillerStatus: "PendingDynamicAssets",
						notionStatus: "Pending Dynamic Assets",
						uploadedParameters,
						uploadedDynamicAssets,
						createdUploadRows: dynamicRows.map(rowSummary),
						outputRows: [],
						results: [],
						message: summary.templateAssetsUrl
							? "Some dynamic asset files are still missing. Check Template Assets URL or attach files to Upload rows, then run finalizeWorkOrderInputs again."
							: "Attach dynamic asset files to Upload rows, then run finalizeWorkOrderInputs again.",
					};
				}
		}
	}

	const remainingDynamicUpload = await uploadRowsToTiller({
		notion,
		client,
		parentKind: "work_order",
		pageId,
		phase: "dynamic_asset",
		uploadPath: `/workorder/${workOrderId}/dynamicasset`,
		folderUrl: summary.templateAssetsUrl,
	});
	uploadedDynamicAssets = [...uploadedDynamicAssets, ...remainingDynamicUpload.uploaded];
	dynamicStatus = await client.request("GET", `/workorder/${workOrderId}/dynamicasset`, {
		allowStatus: [409],
	});
	pendingDynamicAssets = getPendingItems(dynamicStatus);
	if (pendingDynamicAssets.length > 0) {
		const dynamicRows = await queryUploadRowsForParent({
			notion,
			parentKind: "work_order",
			parentPageId: pageId,
			phase: "dynamic_asset",
			ready: false,
		});
		await updateWorkOrderPending(notion, pageId, "Pending Dynamic Assets", pendingDynamicAssets, dynamicRows);
		await setPageProgress(notion, pageId, 85, "Waiting on Assets", "Dynamic assets are still needed.");
		return {
			ok: true,
			pageId,
			tillerWorkOrderId: workOrderId,
			tillerStatus: "PendingDynamicAssets",
			notionStatus: "Pending Dynamic Assets",
			uploadedParameters,
			uploadedDynamicAssets,
			createdUploadRows: dynamicRows.map(rowSummary),
			outputRows: [],
			results: [],
			message: summary.templateAssetsUrl
				? "Some dynamic asset files are still missing. Check Template Assets URL or attach files to Upload rows, then run finalizeWorkOrderInputs again."
				: "Attach dynamic asset files to Upload rows, then run finalizeWorkOrderInputs again.",
		};
	}
	await client.request("POST", `/workorder/${workOrderId}/dynamicasset/confirm`, {
		parse: "text",
		allowStatus: [409],
	});

	await setPageProgress(notion, pageId, 80, "Waiting on Tiller", "Render is running in Tiller.");
	const statusResult = await pollWorkOrderStatus(client, workOrderId, pollSeconds);
	const notionStatus = mapTillerStatusToNotionStatus(statusResult.status);
	const results = statusResult.status === "Done"
		? await fetchWorkOrderResults(client, workOrderId)
		: [];
	const outputRows = statusResult.status === "Done"
		? await (async () => {
			await setPageProgress(notion, pageId, 90, "Downloading Outputs", "Attaching finished renders to Notion.");
			return createRenderOutputRowsForWorkOrder({ notion, client, pageId, summary, results });
		})()
		: [];

	await notion.pages.update({
		page_id: pageId,
		properties: {
			Action: { select: { name: "None" } },
			[WORK_ORDER_STATUS_PROPERTY]: { select: { name: notionStatus } },
			"Completed Renders": {
				number: notionStatus === "Done" ? summary.renderCount : null,
			},
			"Required Uploads": richTextValue(""),
			"Last Error": richTextValue(
				statusResult.status === "Failed"
					? "Tiller render failed."
					: "",
			),
			"Last Synced At": { date: { start: new Date().toISOString() } },
			...(notionStatus === "Done"
				? { "Completed At": { date: { start: new Date().toISOString() } } }
				: {}),
		},
	});
	await clearCampaignMissingUploadsForWorkOrder(notion, pageId, notionStatus);
	await setPageProgress(notion, pageId, statusResult.status === "Done" ? 100 : 80, statusResult.status === "Done" ? "Done" : "Waiting on Tiller", statusResult.status === "Done" ? "Render complete. Outputs are attached." : "Render submitted; still processing.");

	return {
		ok: true,
		pageId,
		tillerWorkOrderId: workOrderId,
		tillerStatus: statusResult.status,
		notionStatus,
		uploadedParameters,
		uploadedDynamicAssets,
		createdUploadRows: [],
		outputRows,
		results,
		message: notionStatus === "Done" ? "Render completed." : "Inputs finalized; render is still processing.",
	};
}

async function downloadWorkOrderResultsFromPage({
	notion,
	pageId,
}: {
	notion: any;
	pageId: string;
}) {
	await assertPageInDataSource(notion, pageId, "workOrders");
	await setPageProgress(notion, pageId, 90, "Downloading Outputs", "Checking for finished render outputs.");
	const page = await notion.pages.retrieve({ page_id: pageId });
	const summary = summarizeNotionWorkOrderPage(page);
	if (!summary.tillerWorkOrderId) {
		throw new Error("Work order row is missing Tiller Work Order ID.");
	}

	const client = new TillerClient();
	await client.authenticate();
	const workOrderId = summary.tillerWorkOrderId;
	const workOrder = await client.request("GET", `/WorkOrder/${workOrderId}`);
	const tillerStatus = getWorkOrderCurrentStatus(workOrder);
	const notionStatus = mapTillerStatusToNotionStatus(tillerStatus);
	if (tillerStatus !== "Done") {
		await notion.pages.update({
			page_id: pageId,
			properties: {
				Action: { select: { name: "None" } },
				[WORK_ORDER_STATUS_PROPERTY]: { select: { name: notionStatus } },
				"Last Error": richTextValue("Results are not ready yet."),
				"Last Synced At": { date: { start: new Date().toISOString() } },
			},
		});
		await setPageProgress(notion, pageId, 80, "Waiting on Tiller", "Results are not ready yet.");
		return {
			ok: true,
			pageId,
			tillerWorkOrderId: workOrderId,
			tillerStatus,
			notionStatus,
			outputRows: [],
			results: [],
			message: "Results are not ready yet.",
		};
	}

	const results = await fetchWorkOrderResults(client, workOrderId);
	const outputRows = await createRenderOutputRowsForWorkOrder({ notion, client, pageId, summary, results });

	await notion.pages.update({
		page_id: pageId,
		properties: {
			Action: { select: { name: "None" } },
			[WORK_ORDER_STATUS_PROPERTY]: { select: { name: "Done" } },
			"Completed Renders": {
				number: outputRows.length,
			},
			"Last Error": richTextValue(""),
			"Last Synced At": { date: { start: new Date().toISOString() } },
			"Completed At": { date: { start: new Date().toISOString() } },
		},
	});
	await setPageProgress(notion, pageId, 100, "Done", "Results attached to Render Outputs.");
	const campaignPageId = await findCampaignPageIdForWorkOrder(notion, pageId);
	if (campaignPageId) {
		await notion.pages.update({
			page_id: campaignPageId,
			properties: {
				"Campaign Status": { select: { name: "Done" } },
				"Last Error": richTextValue(""),
				"Last Synced At": { date: { start: new Date().toISOString() } },
			},
		});
	}

	return {
		ok: true,
		pageId,
		tillerWorkOrderId: workOrderId,
		tillerStatus,
		notionStatus: "Done",
		outputRows,
		results,
		message: outputRows.length > 0
			? "Results attached to Render Outputs."
			: "Work order is Done, but Tiller returned no result files.",
	};
}

async function receiveCavalryWorkOrderStarted({
	notion,
	body,
}: {
	notion: any;
	body: unknown;
}) {
	const payload = parseCavalryWorkOrderPayload(body);
	if (payload.campaignPageId) {
		await assertPageInDataSource(notion, payload.campaignPageId, "campaigns");
	}
	if (payload.templatePageId) {
		await assertPageInDataSource(notion, payload.templatePageId, "templates");
	}
	const dataSourceId = await getDataSourceId(notion, "workOrders");
	const client = new TillerClient();
	await client.authenticate();
	const workOrder = await client.request("GET", `/WorkOrder/${payload.workOrderId}`);
	const tillerStatus = getWorkOrderCurrentStatus(workOrder);
	const notionStatus = mapTillerStatusToNotionStatus(tillerStatus);
	const normalized = normalizeWorkOrderList([workOrder])[0] ?? {
		id: payload.workOrderId,
		name: payload.name || `Work Order ${payload.workOrderId}`,
		templateId: payload.templateId ?? null,
		renderCount: payload.renderCount ?? null,
		status: tillerStatus,
		raw: safeJsonString(workOrder),
	};
	const renderCount = normalized.renderCount ?? payload.renderCount ?? null;
	const templateId = normalized.templateId ?? payload.templateId ?? null;
	const existing = await findPageByNumberProperty(
		notion,
		dataSourceId,
		"Tiller Work Order ID",
		payload.workOrderId,
	);
	const properties = {
		Name: titleValue(payload.name || normalized.name),
		Action: { select: { name: "None" } },
		[WORK_ORDER_STATUS_PROPERTY]: { select: { name: notionStatus } },
		"Tiller Work Order ID": { number: payload.workOrderId },
		"Tiller Template ID": { number: templateId },
		"Render Count": { number: renderCount },
		"Completed Renders": {
			number: notionStatus === "Done" ? renderCount : null,
		},
		"Submitted At": { date: { start: new Date().toISOString() } },
		"Last Error": richTextValue(""),
		"Last Synced At": { date: { start: new Date().toISOString() } },
		...(notionStatus === "Done"
			? { "Completed At": { date: { start: new Date().toISOString() } } }
			: {}),
	};
	const page = existing
		? await notion.pages.update({ page_id: existing.id, properties })
		: await notion.pages.create({
			parent: { type: "data_source_id", data_source_id: dataSourceId },
			properties,
		});
	const pageId = page.id;
	if (payload.campaignPageId) {
		await notion.pages.update({
			page_id: payload.campaignPageId,
			properties: {
				"Work Order": relationValue(pageId),
				"Campaign Status": { select: { name: notionStatus === "Done" ? "Done" : "Rendering" } },
				"Last Error": richTextValue(""),
				"Last Synced At": { date: { start: new Date().toISOString() } },
			},
		});
	}

	const statusResult = ["Done", "Failed"].includes(tillerStatus)
		? { status: tillerStatus, workOrder }
		: await pollWorkOrderStatus(client, payload.workOrderId, payload.pollSeconds);
	const finalStatus = mapTillerStatusToNotionStatus(statusResult.status);
	const summary = summarizeNotionWorkOrderPage(await notion.pages.retrieve({ page_id: pageId }));
	const results = statusResult.status === "Done"
		? await fetchWorkOrderResults(client, payload.workOrderId)
		: [];
	const outputRows = statusResult.status === "Done"
		? await createRenderOutputRowsForWorkOrder({ notion, client, pageId, summary, results })
		: [];

	await notion.pages.update({
		page_id: pageId,
		properties: {
			Action: { select: { name: "None" } },
			[WORK_ORDER_STATUS_PROPERTY]: { select: { name: finalStatus } },
			"Completed Renders": { number: finalStatus === "Done" ? outputRows.length : null },
			"Last Error": richTextValue(finalStatus === "Failed" ? "Tiller render failed." : ""),
			"Last Synced At": { date: { start: new Date().toISOString() } },
			...(finalStatus === "Done"
				? { "Completed At": { date: { start: new Date().toISOString() } } }
				: {}),
		},
	});
	if (payload.campaignPageId) {
		await notion.pages.update({
			page_id: payload.campaignPageId,
			properties: {
				"Campaign Status": { select: { name: finalStatus === "Done" ? "Done" : "Rendering" } },
				"Last Error": richTextValue(finalStatus === "Failed" ? "Tiller render failed." : ""),
				"Last Synced At": { date: { start: new Date().toISOString() } },
			},
		});
	}

	return {
		ok: true,
		pageId,
		tillerWorkOrderId: payload.workOrderId,
		tillerStatus: statusResult.status,
		notionStatus: finalStatus,
		outputRows,
	};
}

async function createRenderOutputRowsForWorkOrder({
	notion,
	client,
	pageId,
	summary,
	results,
}: {
	notion: any;
	client: TillerClient;
	pageId: string;
	summary: ReturnType<typeof summarizeNotionWorkOrderPage>;
	results: Array<{ name: string; size: number | null }>;
}) {
	if (!summary.tillerWorkOrderId) throw new Error("Work order row is missing Tiller Work Order ID.");
	if (results.length === 0) return [];

	const campaignPageId = await findCampaignPageIdForWorkOrder(notion, pageId);
	const templatePageId = summary.tillerTemplateId
		? await findTemplatePageIdByTillerId(notion, summary.tillerTemplateId)
		: "";
	const outputRows = [];
	const driveOutputTarget = summary.downloadRendersHere
		? await tryResolveDriveOutputTarget(summary.downloadRendersHere)
		: { target: null, error: "" };
	for (const [index, result] of results.entries()) {
		const encodedName = encodeURIComponent(result.name);
		const signedUrl = await resolveWorkOrderResultLocation(client, summary.tillerWorkOrderId, encodedName);
		const file = await fetchSignedResultFile(signedUrl, result.name, result.size);
		const driveUpload = driveOutputTarget.target
			? await tryUploadOutputFileToDrive(driveOutputTarget.target, file)
			: { url: "", error: driveOutputTarget.error };
		const upload = await uploadNotionFile(notion, file);
		const outputPage = await upsertRenderOutputRow({
			notion,
			workOrderPageId: pageId,
			campaignPageId,
			templatePageId,
			summary,
			result,
			index: index + 1,
			file,
			fileUploadId: upload.id,
			driveUpload,
		});
		outputRows.push({
			pageId: outputPage.id,
			url: outputPage.url ?? "",
			outputFilename: result.name,
			fileSizeBytes: file.bytes.byteLength,
			contentType: file.contentType,
			driveUrl: driveUpload.url,
			driveError: driveUpload.error,
		});
	}
	await syncParentRenderOutputRelations({
		notion,
		workOrderPageId: pageId,
		campaignPageId,
		outputPageIds: outputRows.map((row) => row.pageId),
	});
	return outputRows;
}

async function syncParentRenderOutputRelations({
	notion,
	workOrderPageId,
	campaignPageId,
	outputPageIds,
}: {
	notion: any;
	workOrderPageId: string;
	campaignPageId: string;
	outputPageIds: string[];
}) {
	if (outputPageIds.length === 0) return;
	const renderOutputs = { "Render Outputs": relationValueMany(outputPageIds) };
	await notion.pages.update({
		page_id: workOrderPageId,
		properties: renderOutputs,
	});
	if (campaignPageId) {
		await notion.pages.update({
			page_id: campaignPageId,
			properties: renderOutputs,
		});
	}
}

async function uploadNotionFile(
	notion: any,
	file: { name: string; bytes: ArrayBuffer; contentType?: string },
) {
	const contentType = file.contentType || "application/octet-stream";
	const upload = await notion.fileUploads.create({
		mode: "single_part",
		filename: file.name,
		content_type: contentType,
	});
	const sent = await notion.fileUploads.send({
		file_upload_id: upload.id,
		file: {
			filename: file.name,
			data: new Blob([file.bytes], { type: contentType }),
		},
	});
	return sent ?? upload;
}

async function upsertRenderOutputRow({
	notion,
	workOrderPageId,
	campaignPageId,
	templatePageId,
	summary,
	result,
	index,
	file,
	fileUploadId,
	driveUpload,
}: {
	notion: any;
	workOrderPageId: string;
	campaignPageId: string;
	templatePageId: string;
	summary: ReturnType<typeof summarizeNotionWorkOrderPage>;
	result: { name: string; size: number | null };
	index: number;
	file: { name: string; bytes: ArrayBuffer; contentType?: string };
	fileUploadId: string;
	driveUpload: { url: string; error: string };
}) {
	const dataSourceId = await getDataSourceId(notion, "renderOutputs");
	const existing = await findRenderOutputRow(notion, dataSourceId, workOrderPageId, result.name);
	const properties = {
		Name: titleValue(`${summary.name || `Work Order ${summary.tillerWorkOrderId}`} - ${result.name}`),
		Status: { select: { name: "Available" } },
		"Work Order": relationValue(workOrderPageId),
		...(campaignPageId ? { Campaign: relationValue(campaignPageId) } : {}),
		...(templatePageId ? { Template: relationValue(templatePageId) } : {}),
		"Output Index": { number: index },
		"Output Filename": richTextValue(result.name),
		"Tiller Work Order ID": { number: summary.tillerWorkOrderId },
		"Tiller Template ID": { number: summary.tillerTemplateId },
		"File Size Bytes": { number: file.bytes.byteLength },
		"Content Type": richTextValue(file.contentType || "application/octet-stream"),
		"Downloaded At": { date: { start: new Date().toISOString() } },
		"Last Error": richTextValue(driveUpload.error),
	};
	let outputPage;
	if (existing) {
		outputPage = await notion.pages.update({ page_id: existing.id, properties });
	} else {
		outputPage = await notion.pages.create({
			parent: { type: "data_source_id", data_source_id: dataSourceId },
			properties,
		});
	}
	return attachFileUploadToPage(notion, outputPage.id, "Output File", result.name, fileUploadId);
}

async function attachFileUploadToPage(
	notion: any,
	pageId: string,
	propertyName: string,
	filename: string,
	fileUploadId: string,
) {
	return notion.pages.update({
		page_id: pageId,
		properties: {
			[propertyName]: {
				files: [{
					type: "file_upload" as const,
					name: filename,
					file_upload: { id: fileUploadId },
				}],
			},
		},
	});
}

async function findRenderOutputRow(
	notion: any,
	dataSourceId: string,
	workOrderPageId: string,
	outputFilename: string,
) {
	const response = await notion.dataSources.query({
		data_source_id: dataSourceId,
		page_size: 1,
		filter: {
			and: [
				{ property: "Work Order", relation: { contains: workOrderPageId } },
				{ property: "Output Filename", rich_text: { equals: outputFilename } },
			],
		},
	});
	return response.results?.[0] ?? null;
}

async function findCampaignPageIdForWorkOrder(notion: any, workOrderPageId: string) {
	const dataSourceId = await getDataSourceId(notion, "campaigns");
	const response = await notion.dataSources.query({
		data_source_id: dataSourceId,
		page_size: 1,
		filter: {
			property: "Work Order",
			relation: { contains: workOrderPageId },
		},
	});
	return response.results?.[0]?.id ?? "";
}

async function findTemplatePageIdByTillerId(notion: any, tillerTemplateId: number) {
	const dataSourceId = await getDataSourceId(notion, "templates");
	const page = await findPageByNumberProperty(notion, dataSourceId, "Tiller Template ID", tillerTemplateId);
	return page?.id ?? "";
}

async function uploadRowsToTiller({
	notion,
	client,
	parentKind,
	pageId,
	phase,
	uploadPath,
	folderUrl,
}: {
	notion: any;
	client: TillerClient;
	parentKind: "work_order" | "template";
	pageId: string;
	phase: "parameter" | "dynamic_asset" | "template_asset";
	uploadPath: string;
	folderUrl?: string;
}) {
	const rows = await queryUploadRowsForParent({
		notion,
		parentKind,
		parentPageId: pageId,
		phase,
		ready: false,
	});
	if (rows.length === 0) return { uploaded: [], missingRows: [] };

	const rowsNeedingDrive = rows.filter((row: UploadRow) => row.files.length === 0);
	const driveMatches = folderUrl && rowsNeedingDrive.length > 0
		? matchDriveFilesToUploadRows(await listPublicDriveFolderFiles(folderUrl), rowsNeedingDrive)
		: new Map<string, DriveFile>();
	const uploaded: UploadedFileSummary[] = [];
	const missingRows: UploadRow[] = [];
	const plannedUploads: Array<
		| { row: UploadRow; source: "notion"; parts: Array<{ uploadPath: string; file: { name: string; url: string } }> }
		| { row: UploadRow; source: "google_drive"; driveFile: DriveFile }
	> = [];

	for (const row of rows) {
		if (row.files.length > 0) {
			const validation = validateNotionUploadRow(row);
			if (!validation.ok) {
				await markUploadRowError(notion, row.pageId, validation.message);
				missingRows.push(row);
				continue;
			}
			plannedUploads.push({ row, source: "notion", parts: validation.parts });
			continue;
		}

		const driveMatch = driveMatches.get(row.pageId);
		if (driveMatch) {
			plannedUploads.push({ row, source: "google_drive", driveFile: driveMatch });
			continue;
		}

		const message = folderUrl
			? `No Notion attachment and no matching Google Drive file found for ${row.tillerPath}.`
			: `Attach a file for ${row.tillerPath}.`;
		await markUploadRowError(notion, row.pageId, message);
		missingRows.push(row);
	}

	if (missingRows.length > 0) {
		return { uploaded, missingRows };
	}

	for (const planned of plannedUploads) {
		const row = planned.row;
		try {
			if (planned.source === "notion") {
				for (const part of planned.parts) {
					const file = await fetchNotionBinaryFile(part.file);
					await client.uploadMultipart(uploadPath, part.uploadPath, file);
				}
				await markUploadRowReady(notion, row.pageId);
				uploaded.push({
					pageId: row.pageId,
					tillerPath: row.tillerPath,
					source: "notion",
					fileCount: row.files.length,
					driveFile: "",
				});
				continue;
			}

			if (planned.source === "google_drive") {
				const file = await fetchDriveBinaryFile(planned.driveFile);
				await client.uploadMultipart(uploadPath, row.tillerPath, file);
				await markUploadRowReady(notion, row.pageId);
				uploaded.push({
					pageId: row.pageId,
					tillerPath: row.tillerPath,
					source: "google_drive",
					fileCount: null,
					driveFile: planned.driveFile.name,
				});
				continue;
			}
		} catch (error) {
			await markUploadRowError(notion, row.pageId, (error as Error)?.message ?? String(error));
			throw error;
		}
	}

	return { uploaded, missingRows };
}

function validateNotionUploadRow(row: UploadRow) {
	const parts = buildUploadParts(row.tillerPath, row.files);
	if (!isExactFilePath(row.tillerPath)) return { ok: true as const, parts };

	const expectedName = basename(row.tillerPath);
	const attachedNames = row.files.map((file) => file.name).filter(Boolean);
	if (parts.length !== 1 || attachedNames.length !== 1) {
		return {
			ok: false as const,
			parts: [],
			message: `Expected one file named ${expectedName} for ${row.tillerPath}, but found ${attachedNames.length || 0} attachment(s).`,
		};
	}
	if (normalizeFilename(attachedNames[0]) !== normalizeFilename(expectedName)) {
		return {
			ok: false as const,
			parts: [],
			message: `Attached file ${attachedNames[0]} does not match expected file ${expectedName} for ${row.tillerPath}.`,
		};
	}
	return { ok: true as const, parts };
}

async function markUploadRowReady(notion: any, pageId: string) {
	await notion.pages.update({
		page_id: pageId,
		properties: {
			Ready: { checkbox: true },
			"Uploaded At": { date: { start: new Date().toISOString() } },
			"Last Error": richTextValue(""),
		},
	});
}

async function markUploadRowError(notion: any, pageId: string, message: string) {
	await notion.pages.update({
		page_id: pageId,
		properties: {
			Ready: { checkbox: false },
			"Last Error": richTextValue(message),
		},
	});
}

async function ensureMissingUploadRows({
	notion,
	parentPageId,
	phase,
	items,
}: {
	notion: any;
	parentPageId: string;
	phase: "parameter" | "dynamic_asset";
	items: unknown[];
}) {
	const existing = await queryUploadRowsForParent({
		notion,
		parentKind: "work_order",
		parentPageId,
		phase,
	});
	const existingTargets = new Set(existing.map((row: UploadRow) => row.tillerPath));
	const missing = items.filter((item) => !existingTargets.has(getStatusTarget(item)));
	return createUploadRows({ notion, parentPageId, phase, items: missing });
}

async function updateWorkOrderPending(
	notion: any,
	pageId: string,
	status: string,
	items: unknown[],
	uploadRows: UploadRow[] = [],
) {
	await notion.pages.update({
		page_id: pageId,
		properties: {
			Action: { select: { name: "None" } },
			[WORK_ORDER_STATUS_PROPERTY]: { select: { name: status } },
			"Required Uploads": richTextValue(formatRequiredUploads(items)),
			"Last Error": richTextValue(""),
			"Last Synced At": { date: { start: new Date().toISOString() } },
		},
	});
	await updateCampaignMissingUploadsForWorkOrder(notion, pageId, uploadRows, status);
}

async function updateCampaignMissingUploadsForWorkOrder(
	notion: any,
	workOrderPageId: string,
	uploadRows: UploadRow[],
	status: string,
) {
	const campaignPageId = await findCampaignPageIdForWorkOrder(notion, workOrderPageId);
	if (!campaignPageId) return;
	const uploadPageIds = uploadRows.map((row) => row.pageId).filter(Boolean);
	const firstUploadUrl = uploadRows.find((row) => row.url)?.url ?? null;
	try {
		await notion.pages.update({
			page_id: campaignPageId,
			properties: {
				"Campaign Status": { select: { name: "Needs Fix" } },
				"Missing Uploads": relationValueMany(uploadPageIds),
				"Missing Uploads URL": { url: firstUploadUrl },
				"Last Error": richTextValue(`${status}: ${uploadRows.length} upload row(s) need files. Open Missing Uploads.`),
				"Last Synced At": { date: { start: new Date().toISOString() } },
			},
		});
	} catch {
		await notion.pages.update({
			page_id: campaignPageId,
			properties: {
				"Campaign Status": { select: { name: "Needs Fix" } },
				"Last Error": richTextValue(`${status}: ${uploadRows.length} upload row(s) need files. Open the Uploads database > Needs Files.`),
				"Last Synced At": { date: { start: new Date().toISOString() } },
			},
		});
	}
}

async function clearCampaignMissingUploadsForWorkOrder(notion: any, workOrderPageId: string, notionStatus: string) {
	const campaignPageId = await findCampaignPageIdForWorkOrder(notion, workOrderPageId);
	if (!campaignPageId) return;
	try {
		await notion.pages.update({
			page_id: campaignPageId,
			properties: {
				"Campaign Status": { select: { name: notionStatus === "Done" ? "Done" : "Rendering" } },
				"Missing Uploads": relationValueMany([]),
				"Missing Uploads URL": { url: null },
				"Last Error": richTextValue(""),
				"Last Synced At": { date: { start: new Date().toISOString() } },
			},
		});
	} catch {
		await notion.pages.update({
			page_id: campaignPageId,
			properties: {
				"Campaign Status": { select: { name: notionStatus === "Done" ? "Done" : "Rendering" } },
				"Last Error": richTextValue(""),
				"Last Synced At": { date: { start: new Date().toISOString() } },
			},
		});
	}
}

async function pollWorkOrderStatus(
	client: TillerClient,
	workOrderId: number,
	pollSeconds: number,
) {
	const deadline = Date.now() + Math.max(0, pollSeconds) * 1000;
	let workOrder = await client.request("GET", `/WorkOrder/${workOrderId}`);
	let status = getWorkOrderCurrentStatus(workOrder);
	while (!["Done", "Failed"].includes(status) && Date.now() < deadline) {
		await sleep(2500);
		workOrder = await client.request("GET", `/WorkOrder/${workOrderId}`);
		status = getWorkOrderCurrentStatus(workOrder);
	}
	return { status, workOrder };
}

function normalizeResultList(value: unknown) {
	if (!Array.isArray(value)) return [];
	return value.map((item) => {
		const result = item as { name?: string; size?: number };
		return {
			name: result.name ?? "",
			size: typeof result.size === "number" ? result.size : null,
		};
	}).filter((result) => result.name);
}

async function fetchWorkOrderResults(client: TillerClient, workOrderId: number) {
	try {
		return normalizeResultList(
			await client.request("GET", `/WorkOrder/${workOrderId}/result`, { allowStatus: [409] }),
		);
	} catch (error) {
		if ((error as Error & { status?: number }).status !== 401) throw error;
		return normalizeResultList(
			await client.request("GET", `/workorder/${workOrderId}/result`, { allowStatus: [409] }),
		);
	}
}

async function resolveWorkOrderResultLinks(
	client: TillerClient,
	workOrderId: number,
	results: Array<{ name: string; size: number | null }>,
) {
	const links = [];
	for (const result of results) {
		const encodedName = encodeURIComponent(result.name);
		const url = await resolveWorkOrderResultLocation(client, workOrderId, encodedName);
		links.push({ ...result, url });
	}
	return links;
}

async function resolveWorkOrderResultLocation(
	client: TillerClient,
	workOrderId: number,
	encodedName: string,
) {
	try {
		return await client.resolveRedirectLocation(`/WorkOrder/${workOrderId}/result/${encodedName}`);
	} catch (error) {
		if ((error as Error & { status?: number }).status !== 401) throw error;
		return client.resolveRedirectLocation(`/workorder/${workOrderId}/result/${encodedName}`);
	}
}

async function uploadWorkOrderResultsToDrive(
	client: TillerClient,
	workOrderId: number,
	results: Array<{ name: string; size: number | null }>,
	folderUrl: string,
) {
	if (results.length === 0) return [];
	const folderId = extractGoogleDriveFolderId(folderUrl);
	if (!folderId) {
		throw new Error("Download Renders Here is not a recognized Google Drive folder link.");
	}
	const accessToken = await getGoogleDriveAccessToken();
	const uploaded = [];
	for (const result of results) {
		const encodedName = encodeURIComponent(result.name);
		const signedUrl = await resolveWorkOrderResultLocation(client, workOrderId, encodedName);
		const file = await fetchSignedResultFile(signedUrl, result.name, result.size);
		const driveFile = await uploadBinaryFileToDrive({
			accessToken,
			folderId,
			file,
		});
		uploaded.push({
			name: result.name,
			size: result.size,
			url: driveFile.webViewLink,
			driveFileId: driveFile.id,
		});
	}
	return uploaded;
}

async function tryUploadWorkOrderResultsToDrive(
	client: TillerClient,
	workOrderId: number,
	results: Array<{ name: string; size: number | null }>,
	folderUrl: string,
) {
	try {
		const uploads = await uploadWorkOrderResultsToDrive(client, workOrderId, results, folderUrl);
		return { uploads, error: "" };
	} catch (error) {
		const message = (error as Error)?.message ?? String(error);
		return {
			uploads: [],
			error: `Google Drive upload failed, so temporary Tiller download links were used instead. These links expire quickly; run Download Results again to refresh them. ${message}`,
		};
	}
}

async function tryResolveDriveOutputTarget(folderUrl: string) {
	try {
		const folderId = extractGoogleDriveFolderId(folderUrl);
		if (!folderId) {
			throw new Error("Download Renders Here is not a recognized Google Drive folder link.");
		}
		return {
			target: {
				folderId,
				accessToken: await getGoogleDriveAccessToken(),
			},
			error: "",
		};
	} catch (error) {
		const message = (error as Error)?.message ?? String(error);
		return {
			target: null,
			error: `Notion output attached, but Google Drive upload was skipped. Run ${CLI_GOOGLE_DRIVE_COMMAND} and check Download Renders Here. ${message}`,
		};
	}
}

async function tryUploadOutputFileToDrive(
	target: { folderId: string; accessToken: string },
	file: { name: string; bytes: ArrayBuffer; contentType?: string },
) {
	try {
		const driveFile = await uploadBinaryFileToDrive({
			accessToken: target.accessToken,
			folderId: target.folderId,
			file,
		});
		return { url: driveFile.webViewLink, error: "" };
	} catch (error) {
		const message = (error as Error)?.message ?? String(error);
		return {
			url: "",
			error: `Notion output attached, but Google Drive upload failed. Run ${CLI_GOOGLE_DRIVE_COMMAND} and check Download Renders Here. ${message}`,
		};
	}
}

async function fetchSignedResultFile(url: string, filename: string, expectedSize: number | null) {
	const response = await fetch(url);
	if (!response.ok) {
		throw new Error(`Could not download Tiller result ${filename}: ${response.status} ${response.statusText}`);
	}
	const contentLength = Number(response.headers.get("content-length") ?? expectedSize ?? 0);
	const maxBytes = getMaxDriveDownloadBytes();
	if (Number.isFinite(contentLength) && contentLength > maxBytes) {
		throw new Error(`Tiller result ${filename} is larger than the ${maxBytes} byte limit.`);
	}
	const bytes = await response.arrayBuffer();
	if (bytes.byteLength > maxBytes) {
		throw new Error(`Tiller result ${filename} is larger than the ${maxBytes} byte limit.`);
	}
	return {
		name: filename,
		bytes,
		contentType: normalizeFileContentType(filename, response.headers.get("content-type")),
	};
}

function normalizeFileContentType(filename: string, contentType: string | null) {
	const lower = filename.toLowerCase();
	const normalized = contentType?.split(";")[0]?.trim().toLowerCase() ?? "";
	if (normalized && normalized !== "application/octet-stream") return normalized;
	if (lower.endsWith(".gif")) return "image/gif";
	if (lower.endsWith(".png")) return "image/png";
	if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
	if (lower.endsWith(".webp")) return "image/webp";
	if (lower.endsWith(".mp4")) return "video/mp4";
	if (lower.endsWith(".mov")) return "video/quicktime";
	if (lower.endsWith(".csv")) return "text/csv";
	if (lower.endsWith(".json") || lower.endsWith(".cv")) return "application/json";
	if (lower.endsWith(".txt")) return "text/plain";
	return normalized || "application/octet-stream";
}

async function getGoogleDriveAccessToken() {
	const clientId = getRequiredEnv("GOOGLE_DRIVE_CLIENT_ID");
	const clientSecret = getRequiredEnv("GOOGLE_DRIVE_CLIENT_SECRET");
	const refreshToken = getRequiredEnv("GOOGLE_DRIVE_REFRESH_TOKEN");
	const body = new URLSearchParams({
		client_id: clientId,
		client_secret: clientSecret,
		refresh_token: refreshToken,
		grant_type: "refresh_token",
	});
	const response = await fetch("https://oauth2.googleapis.com/token", {
		method: "POST",
		headers: { "Content-Type": "application/x-www-form-urlencoded" },
		body,
	});
	const data = await parseDriveJsonResponse(response, "refresh Google Drive OAuth token");
	const accessToken = (data as { access_token?: string }).access_token;
	if (!accessToken) throw new Error("Google Drive OAuth did not return an access token.");
	return accessToken;
}

async function uploadBinaryFileToDrive({
	accessToken,
	folderId,
	file,
}: {
	accessToken: string;
	folderId: string;
	file: { name: string; bytes: ArrayBuffer; contentType?: string };
}) {
	const boundary = `----NotionTillerDriveBoundary${Math.random().toString(36).slice(2)}`;
	const metadata = {
		name: file.name,
		parents: [folderId],
	};
	const before = Buffer.from(
		`--${boundary}\r\n` +
			"Content-Type: application/json; charset=UTF-8\r\n\r\n" +
			`${JSON.stringify(metadata)}\r\n` +
			`--${boundary}\r\n` +
			`Content-Type: ${file.contentType || "application/octet-stream"}\r\n\r\n`,
		"utf8",
	);
	const after = Buffer.from(`\r\n--${boundary}--\r\n`, "utf8");
	const response = await fetch(
		"https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink,webContentLink",
		{
			method: "POST",
			headers: {
				Authorization: `Bearer ${accessToken}`,
				"Content-Type": `multipart/related; boundary=${boundary}`,
			},
			body: Buffer.concat([before, Buffer.from(file.bytes), after]),
		},
	);
	const data = await parseDriveJsonResponse(response, `upload ${file.name} to Google Drive`);
	const driveFile = data as { id?: string; name?: string; webViewLink?: string; webContentLink?: string };
	if (!driveFile.id || !driveFile.webViewLink) {
		throw new Error(`Google Drive upload for ${file.name} did not return a file link.`);
	}
	return {
		id: driveFile.id,
		name: driveFile.name ?? file.name,
		webViewLink: driveFile.webViewLink,
		webContentLink: driveFile.webContentLink ?? null,
	};
}

function rowSummary(row: UploadRow) {
	return {
		pageId: row.pageId,
		name: row.name,
		tillerPath: row.tillerPath,
		url: row.url,
	};
}

async function queryCampaignDataRows({
	notion,
	campaignPageId,
	csvColumns,
	dataSourceId,
}: {
	notion: any;
	campaignPageId: string;
	csvColumns: string[];
		dataSourceId: string;
	}) {
		if (!dataSourceId) throw new Error("Template data rows database is missing. Open the linked Template and run Create Data Table.");
		const rows: CampaignDataRowSummary[] = [];
		let cursor: string | undefined;
		do {
			const response = await notion.dataSources.query({
				data_source_id: dataSourceId,
			page_size: 100,
			...(cursor ? { start_cursor: cursor } : {}),
		});
		rows.push(...(response.results ?? [])
			.map((row: unknown) => summarizeCampaignDataRow(row, csvColumns))
			.filter((row: CampaignDataRowSummary) => row.campaignPageIds.includes(campaignPageId)));
		cursor = response.has_more ? response.next_cursor : undefined;
	} while (cursor);
	return rows;
}

function getTemplateCsvColumns(template: ReturnType<typeof summarizeNotionTemplatePage>) {
	return parseCsvColumns(template.csvColumns || process.env.CAMPAIGN_CSV_COLUMNS || "");
}

function parseCsvColumns(value: string) {
	return value
		.split(",")
		.map((column) => column.trim())
		.filter(Boolean);
}

const TEMPLATE_DATA_ROW_CONTROL_FIELDS = [
	"_Row",
	"_Campaign",
	"_Include in Render",
	"_Row Status",
	"_Output Name",
];

function assertUniqueCsvColumns(csvColumns: string[]) {
	const seen = new Set<string>();
	const duplicates = new Set<string>();
	for (const column of csvColumns) {
		if (seen.has(column)) duplicates.add(column);
		seen.add(column);
	}
	if (duplicates.size > 0) {
		throw new Error(`Template CSV columns must be unique. Duplicate columns: ${Array.from(duplicates).join(", ")}.`);
	}
	const reserved = csvColumns.filter((column) => TEMPLATE_DATA_ROW_CONTROL_FIELDS.includes(column));
	if (reserved.length > 0) {
		throw new Error(`Template CSV columns conflict with portal fields: ${reserved.join(", ")}.`);
	}
}

async function findOrCreateTemplateDataTable({
	notion,
	parentPageId,
	databaseName,
	existingDataSourceId,
	campaignsDataSourceId,
	csvColumns,
}: {
	notion: any;
	parentPageId: string;
	databaseName: string;
	existingDataSourceId: string;
	campaignsDataSourceId: string;
	csvColumns: string[];
}) {
	if (existingDataSourceId) {
		const dataSource = await notion.dataSources.retrieve({ data_source_id: existingDataSourceId });
		await repairTemplateDataTableProperties({
			notion,
			dataSourceId: existingDataSourceId,
			existingProperties: dataSource.properties ?? {},
			campaignsDataSourceId,
			csvColumns,
		});
		return {
			dataSourceId: existingDataSourceId,
			databaseId: getDataSourceParentDatabaseId(dataSource),
			url: typeof dataSource.url === "string" ? dataSource.url : "",
		};
	}

	const existingDatabase = await findChildDatabaseByTitle(notion, parentPageId, databaseName);
	if (existingDatabase?.dataSourceId) {
		const dataSource = await notion.dataSources.retrieve({ data_source_id: existingDatabase.dataSourceId });
		await repairTemplateDataTableProperties({
			notion,
			dataSourceId: existingDatabase.dataSourceId,
			existingProperties: dataSource.properties ?? {},
			campaignsDataSourceId,
			csvColumns,
		});
		return {
			dataSourceId: existingDatabase.dataSourceId,
			databaseId: existingDatabase.databaseId,
			url: existingDatabase.url,
		};
	}

	const database = await notion.databases.create({
		parent: { type: "page_id", page_id: parentPageId },
		title: [{ type: "text", text: { content: databaseName } }],
		is_inline: false,
		initial_data_source: {
			properties: templateDataRowBaseProperties(csvColumns),
		},
	});
	const dataSourceId = database.data_sources?.[0]?.id;
	if (!dataSourceId) throw new Error(`Created database ${databaseName} has no data source.`);
	const createdDataSource = await notion.dataSources.retrieve({ data_source_id: dataSourceId });
	await repairTemplateDataTableProperties({
		notion,
		dataSourceId,
		existingProperties: createdDataSource.properties ?? {},
		campaignsDataSourceId,
		csvColumns,
	});
	return {
		dataSourceId,
		databaseId: typeof database.id === "string" ? database.id : "",
		url: typeof database.url === "string" ? database.url : "",
	};
}

async function upsertTemplateDataTableIndexRow({
	notion,
	templatePageId,
	templateName,
	databaseName,
	dataTable,
	csvColumns,
}: {
	notion: any;
	templatePageId: string;
	templateName: string;
	databaseName: string;
	dataTable: { dataSourceId: string; databaseId: string; url: string };
	csvColumns: string[];
}) {
	let indexDataSourceId = "";
	try {
		indexDataSourceId = await getDataSourceId(notion, "templateDataTableIndex");
	} catch {
		return;
	}
	if (!indexDataSourceId) return;

	const existing = await notion.dataSources.query({
		data_source_id: indexDataSourceId,
		page_size: 1,
		filter: {
			property: "Name",
			title: { equals: databaseName },
		},
	});
	const properties = {
		Name: titleValue(databaseName),
		Template: { relation: [{ id: templatePageId }] },
		"Data Rows Database URL": { url: dataTable.url || null },
		"Data Rows Database ID": richTextValue(dataTable.dataSourceId),
		"CSV Columns": richTextValue(csvColumns.join(", ")),
		Status: { select: { name: "Ready" } },
		"Last Synced At": { date: { start: new Date().toISOString() } },
		"Last Error": richTextValue(""),
	};
	if (existing.results?.[0]?.id) {
		await notion.pages.update({ page_id: existing.results[0].id, properties });
		return;
	}
	await notion.pages.create({
		parent: { type: "data_source_id", data_source_id: indexDataSourceId },
		properties,
	});
}

async function repairTemplateDataTableProperties({
	notion,
	dataSourceId,
	existingProperties,
	campaignsDataSourceId,
	csvColumns,
}: {
	notion: any;
	dataSourceId: string;
	existingProperties: Record<string, any>;
	campaignsDataSourceId: string;
	csvColumns: string[];
}) {
	const desired = templateDataRowAllProperties(campaignsDataSourceId, csvColumns);
	const updates: Record<string, any> = {};
	for (const [name, request] of Object.entries(desired)) {
		const existing = existingProperties[name];
		if (!existing) {
			updates[name] = request;
			continue;
		}
		const selectRequest = (request as { select?: { options?: Array<{ name?: string; color?: string }> } }).select;
		if (selectRequest) {
			const selectUpdate = selectOptionsUpdate(existing, selectRequest.options ?? []);
			if (selectUpdate) updates[name] = selectUpdate;
		}
	}
	if (Object.keys(updates).length === 0) return;
	await notion.dataSources.update({
		data_source_id: dataSourceId,
		properties: updates,
	});
}

function templateDataRowBaseProperties(csvColumns: string[]) {
	return {
		"_Row": { title: {} },
		"_Include in Render": { checkbox: {} },
		"_Row Status": { select: { options: ["Draft", "Valid", "Invalid", "Rendered"].map((name) => ({ name })) } },
		"_Output Name": { rich_text: {} },
		...Object.fromEntries(csvColumns.map((column) => [column, { rich_text: {} }])),
	};
}

function templateDataRowAllProperties(campaignsDataSourceId: string, csvColumns: string[]) {
	return {
		...templateDataRowBaseProperties(csvColumns),
		"_Campaign": {
			relation: {
				data_source_id: campaignsDataSourceId,
				type: "single_property",
				single_property: {},
			},
		},
	};
}

function selectOptionsUpdate(existingProperty: any, desiredOptions: Array<{ name?: string; color?: string }>) {
	const existingOptions = existingProperty?.select?.options;
	if (!Array.isArray(existingOptions)) return null;
	const existingNames = new Set(existingOptions.map((option: any) => option?.name).filter(Boolean));
	const missing = desiredOptions.filter((option) => option.name && !existingNames.has(option.name));
	if (missing.length === 0) return null;
	return {
		select: {
			options: [
				...existingOptions.map((option: any) => ({
					name: option.name,
					...(option.color ? { color: option.color } : {}),
				})),
				...missing.map((option) => ({ name: option.name })),
			],
		},
	};
}

async function findChildDatabaseByTitle(notion: any, parentPageId: string, title: string) {
	let cursor: string | undefined;
	do {
		const response = await notion.blocks.children.list({
			block_id: parentPageId,
			page_size: 100,
			...(cursor ? { start_cursor: cursor } : {}),
		});
		for (const child of response.results ?? []) {
			if (child?.type !== "child_database") continue;
			const childTitle = child.child_database?.title;
			if (childTitle !== title) continue;
			const database = await notion.databases.retrieve({ database_id: child.id });
			return {
				databaseId: typeof database.id === "string" ? database.id : child.id,
				dataSourceId: database.data_sources?.[0]?.id ?? "",
				url: typeof database.url === "string" ? database.url : "",
			};
		}
		cursor = response.has_more ? response.next_cursor : undefined;
	} while (cursor);
	return null;
}

function getDataSourceParentDatabaseId(dataSource: any) {
	const parent = dataSource?.parent;
	if (parent?.type === "database_id" && typeof parent.database_id === "string") return parent.database_id;
	if (typeof dataSource?.database_id === "string") return dataSource.database_id;
	return "";
}

function buildCsv(columns: string[], rows: Array<Record<string, string>>) {
	return [
		columns.map(escapeCsvValue).join(","),
		...rows.map((row) => columns.map((column) => escapeCsvValue(row[column] ?? "")).join(",")),
	].join("\n");
}

function escapeCsvValue(value: string) {
	if (!/[",\n\r]/.test(value)) return value;
	return `"${value.replace(/"/g, '""')}"`;
}

function sleep(ms: number) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

async function listPublicDriveFolderFiles(folderUrl: string) {
	const auth = await getGoogleDriveReadAuth();
	const folderId = extractGoogleDriveFolderId(folderUrl);
	if (!folderId) {
		throw new Error("Template Assets URL is not a recognized Google Drive folder link.");
	}
	return listPublicDriveFolderFilesById(folderId, auth);
}

async function listPublicDriveFolderFilesById(folderId: string, auth: GoogleDriveReadAuth, prefix = "") {
	const files: DriveFile[] = [];
	let pageToken = "";
	do {
		const url = new URL("https://www.googleapis.com/drive/v3/files");
		applyGoogleDriveAuth(url, auth);
		url.searchParams.set("q", `'${folderId}' in parents and trashed=false`);
		url.searchParams.set("fields", "nextPageToken,files(id,name,mimeType,size)");
		url.searchParams.set("pageSize", "1000");
		url.searchParams.set("supportsAllDrives", "true");
		url.searchParams.set("includeItemsFromAllDrives", "true");
		if (pageToken) url.searchParams.set("pageToken", pageToken);
		const response = await fetch(url, { headers: googleDriveAuthHeaders(auth) });
		const data = await parseDriveJsonResponse(response, "list Google Drive folder files");
		for (const file of (data as { files?: DriveFile[] }).files ?? []) {
			const relativePath = prefix ? `${prefix}/${file.name}` : file.name;
			if (file.mimeType === "application/vnd.google-apps.folder") {
				files.push(...await listPublicDriveFolderFilesById(file.id, auth, relativePath));
			} else {
				files.push({ ...file, relativePath });
			}
		}
		pageToken = String((data as { nextPageToken?: string }).nextPageToken ?? "");
	} while (pageToken);

	return files;
}

function extractGoogleDriveFolderId(value: string) {
	const trimmed = value.trim();
	const folderMatch = trimmed.match(/\/folders\/([a-zA-Z0-9_-]+)/);
	if (folderMatch) return folderMatch[1];
	try {
		const url = new URL(trimmed);
		const id = url.searchParams.get("id");
		return id && /^[a-zA-Z0-9_-]+$/.test(id) ? id : "";
	} catch {
		return "";
	}
}

function matchDriveFilesToUploadRows(files: DriveFile[], rows: UploadRow[]) {
	const byName = new Map(files.map((file) => [file.name, file]));
	const byPath = new Map(files.map((file) => [normalizeUploadPath(file.relativePath ?? file.name), file]));
	const matches = new Map<string, DriveFile>();
	for (const row of rows) {
		const normalizedTarget = normalizeUploadPath(row.tillerPath);
		const targetName = normalizedTarget.split("/").pop() ?? row.tillerPath;
		const match = byPath.get(normalizedTarget) ?? byName.get(targetName);
		if (match) matches.set(row.pageId, match);
	}
	return matches;
}

async function fetchDriveBinaryFile(file: DriveFile) {
	const auth = await getGoogleDriveReadAuth();
	const size = Number(file.size ?? 0);
	const maxBytes = getMaxDriveDownloadBytes();
	if (Number.isFinite(size) && size > maxBytes) {
		throw new Error(`Google Drive file ${file.name} is larger than the ${maxBytes} byte limit.`);
	}
	if (file.mimeType?.startsWith("application/vnd.google-apps.")) {
		throw new Error(`Google Drive file ${file.name} is a Google-native file and cannot be uploaded as binary.`);
	}
	const url = new URL(`https://www.googleapis.com/drive/v3/files/${file.id}`);
	applyGoogleDriveAuth(url, auth);
	url.searchParams.set("alt", "media");
	const response = await fetch(url, { headers: googleDriveAuthHeaders(auth) });
	if (!response.ok) {
		await parseDriveJsonResponse(response, `download Google Drive file ${file.name}`);
	}
	const contentLength = Number(response.headers.get("content-length") ?? 0);
	if (Number.isFinite(contentLength) && contentLength > maxBytes) {
		throw new Error(`Google Drive file ${file.name} is larger than the ${maxBytes} byte limit.`);
	}
	const bytes = await response.arrayBuffer();
	if (bytes.byteLength > maxBytes) {
		throw new Error(`Google Drive file ${file.name} is larger than the ${maxBytes} byte limit.`);
	}
	return {
		name: file.name,
		bytes,
		contentType: response.headers.get("content-type") ?? file.mimeType ?? "application/octet-stream",
	};
}

type GoogleDriveReadAuth = {
	apiKey?: string;
	accessToken?: string;
};

async function getGoogleDriveReadAuth(): Promise<GoogleDriveReadAuth> {
	const apiKey = process.env.GOOGLE_DRIVE_API_KEY?.trim();
	if (apiKey) return { apiKey };

	const hasOAuth =
		process.env.GOOGLE_DRIVE_CLIENT_ID?.trim() &&
		process.env.GOOGLE_DRIVE_CLIENT_SECRET?.trim() &&
		process.env.GOOGLE_DRIVE_REFRESH_TOKEN?.trim();
	if (hasOAuth) return { accessToken: await getGoogleDriveAccessToken() };

	throw new Error(
		`Google Drive access is not configured. For public folder links, add a Google Drive API key. For private folders, add Google Drive OAuth credentials. Run: ${CLI_GOOGLE_DRIVE_COMMAND}`,
	);
}

function applyGoogleDriveAuth(url: URL, auth: GoogleDriveReadAuth) {
	if (auth.apiKey) url.searchParams.set("key", auth.apiKey);
}

function googleDriveAuthHeaders(auth: GoogleDriveReadAuth) {
	return auth.accessToken ? { Authorization: `Bearer ${auth.accessToken}` } : undefined;
}

async function parseDriveJsonResponse(response: Response, action: string) {
	const text = await response.text();
	let data: unknown = null;
	try {
		data = text ? JSON.parse(text) : null;
	} catch {
		data = text;
	}
	if (!response.ok) {
		const message =
			(data as { error?: { message?: string } })?.error?.message ??
			(typeof data === "string" ? data : response.statusText);
		throw new Error(`Could not ${action}: Google Drive API ${response.status} ${message}`);
	}
	return data;
}

function getMaxDriveDownloadBytes() {
	const configured = Number(process.env.MAX_DRIVE_DOWNLOAD_BYTES ?? 0);
	return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_MAX_DRIVE_DOWNLOAD_BYTES;
}

type DriveFile = {
	id: string;
	name: string;
	mimeType?: string;
	size?: string;
	relativePath?: string;
};

type UploadedFileSummary = {
	pageId: string;
	tillerPath: string;
	source: "notion" | "google_drive";
	fileCount: number | null;
	driveFile: string;
};

type CampaignDataRowSummary = ReturnType<typeof summarizeCampaignDataRow>;

async function queryUploadRowsForParent({
	notion,
	parentKind,
	parentPageId,
	phase,
	ready,
}: {
	notion: any;
	parentKind: "work_order" | "template";
	parentPageId: string;
	phase: "parameter" | "dynamic_asset" | "template_asset";
	ready?: boolean;
}) {
	const dataSourceId = await getDataSourceId(notion, "uploads");
	const parentProperty =
		parentKind === "template" ? "Parent Template Page ID" : "Parent Work Order Page ID";
	const filters: Array<Record<string, unknown>> = [
		{ property: parentProperty, rich_text: { equals: parentPageId } },
		{ property: "Phase", select: { equals: phase } },
	];
	if (typeof ready === "boolean") {
		filters.push({ property: "Ready", checkbox: { equals: ready } });
	}
	const response = await notion.dataSources.query({
		data_source_id: dataSourceId,
		page_size: 100,
		filter: { and: filters },
	});
	return response.results.map(summarizeUploadPage);
}

function summarizeUploadPage(page: unknown) {
	const value = page as {
		id?: string;
		url?: string;
		properties?: Record<string, unknown>;
	};
	const properties = value.properties ?? {};
	return {
		pageId: value.id ?? "",
		url: value.url ?? "",
		name: getTitleProperty(properties.Name),
		phase: getSelectProperty(properties.Phase),
		tillerPath: getRichTextProperty(properties["Tiller Path"]),
		ready: getCheckboxProperty(properties.Ready),
		files: getFilesProperty(properties.File),
	};
}

type UploadRow = ReturnType<typeof summarizeUploadPage>;

function getRichTextProperty(property: unknown) {
	const richText = (property as { rich_text?: Array<{ plain_text?: string }> })?.rich_text ?? [];
	return richText.map((entry) => entry.plain_text ?? "").join("").trim();
}

function getCheckboxProperty(property: unknown) {
	return (property as { checkbox?: boolean })?.checkbox === true;
}

function buildUploadParts(
	tillerPath: string,
	files: Array<{ name: string; url: string }>,
) {
	if (!tillerPath) throw new Error("Upload row is missing Tiller Path.");
	if (files.length === 0) return [];
	if (files.length === 1) {
		return [{ uploadPath: tillerPath, file: files[0] }];
	}

	return files.map((file) => ({
		uploadPath: `${normalizeUploadPath(tillerPath)}/${file.name}`,
		file,
	}));
}

function normalizeUploadPath(value: string) {
	return String(value || "")
		.replace(/^@assets\//i, "")
		.replace(/^assets\//i, "")
		.replace(/\\/g, "/")
		.replace(/^\/+/, "");
}

function basename(value: string) {
	return normalizeUploadPath(value).split("/").filter(Boolean).at(-1) ?? "";
}

function normalizeFilename(value: string) {
	return basename(value).trim().toLowerCase();
}

function isExactFilePath(value: string) {
	const name = basename(value);
	return /\.[a-z0-9]{1,12}$/i.test(name);
}

function escapeMultipartValue(value: string) {
	return String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\r|\n/g, " ");
}

function formatRequiredUploads(items: unknown[]) {
	if (items.length === 0) return "";
	return items
		.map((item) => getStatusTarget(item))
		.filter(Boolean)
		.join("\n");
}

function formatTemplateResponse({
	status,
	pendingAssets = [],
	requiredAssets = [],
	message,
}: {
	status: string;
	pendingAssets?: unknown[];
	requiredAssets?: string[];
	message: string;
}) {
	const assets = requiredAssets.length > 0
		? requiredAssets
		: pendingAssets.map((item) => getStatusTarget(item)).filter(Boolean);
	return [
		message,
		`Current Tiller status: ${status || "Unknown"}.`,
		...(assets.length > 0 ? ["Required assets:", ...assets.map((asset) => `- ${asset}`)] : []),
	].join("\n");
}

function titleValue(content: string) {
	return {
		title: [{ type: "text" as const, text: { content: content.slice(0, 1900) } }],
	};
}

function richTextValue(content: string) {
	return {
		rich_text: content
			? [{ type: "text" as const, text: { content: content.slice(0, 1900) } }]
			: [],
	};
}

function richTextLongValue(content: string) {
	return {
		rich_text: content
			? content.match(/[\s\S]{1,1900}/g)?.slice(0, 100).map((chunk) => ({
				type: "text" as const,
				text: { content: chunk },
			})) ?? []
			: [],
	};
}

function relationValue(pageId: string) {
	return {
		relation: pageId ? [{ id: pageId }] : [],
	};
}

function relationValueMany(pageIds: string[]) {
	return {
		relation: pageIds.map((id) => ({ id })),
	};
}

async function setPageProgress(
	notion: any,
	pageId: string,
	progress: number,
	milestone: string,
	note = "",
) {
	try {
		await notion.pages.update({
			page_id: pageId,
			properties: {
				"_Progress": { number: Math.max(0, Math.min(100, progress)) },
				"_Milestone": { select: { name: milestone } },
				"_Progress Note": richTextValue(note),
			},
		});
	} catch {
		// Progress is UX-only and older installs may not have these properties yet.
	}
}

async function writePageError(
	notion: any,
	pageId: string,
	error: unknown,
) {
	if (error instanceof PageScopeError) return;
	const message = formatUserFacingError(error);
	await setPageProgress(notion, pageId, 100, "Error", message);
	try {
		await notion.pages.update({
			page_id: pageId,
			properties: {
				Action: { select: { name: "None" } },
				"Last Error": richTextValue(message),
			},
		});
		await recordFailureForPage(notion, pageId, message);
	} catch {
		// Preserve original failure for tool output.
	}
}

async function writePortalAreaError(
	notion: any,
	pageId: string,
	error: unknown,
) {
	const message = formatUserFacingError(error);
	try {
		await notion.pages.update({
			page_id: pageId,
			properties: {
				Action: { select: { name: "None" } },
				Status: { select: { name: "Failed" } },
				"Last Result": richTextValue("Portal area action failed. Fix the error and run the action again."),
				"Last Error": richTextValue(message),
				"Last Synced At": { date: { start: new Date().toISOString() } },
			},
		});
		await recordFailureForPage(notion, pageId, message);
	} catch {
		// Preserve original failure for webhook output.
	}
}

async function writeCredentialError(
	notion: any,
	pageId: string,
	error: unknown,
) {
	const message = formatUserFacingError(error);
	try {
		await notion.pages.update({
			page_id: pageId,
			properties: {
				Action: { select: { name: "None" } },
				Status: { select: { name: "Failed" } },
				"Last Result": richTextValue("Credential check failed. No secrets were stored in Notion."),
				"Last Error": richTextValue(message),
				"Last Validated At": { date: { start: new Date().toISOString() } },
			},
		});
		await recordFailureForPage(notion, pageId, message);
	} catch {
		// Preserve original failure for webhook output.
	}
}

async function writeControlError(
	notion: any,
	pageId: string,
	error: unknown,
) {
	const message = formatUserFacingError(error);
	try {
		await notion.pages.update({
			page_id: pageId,
			properties: {
				Action: { select: { name: "None" } },
				Status: { select: { name: "Failed" } },
				"Last Result": richTextValue("Doctor check failed."),
				"Last Error": richTextValue(message),
				"Last Checked At": { date: { start: new Date().toISOString() } },
			},
		});
		await recordFailureForPage(notion, pageId, message);
	} catch {
		// Preserve original failure for webhook output.
	}
}

async function recordFailure(
	notion: any,
	input: {
		name: string;
		sourceType: string;
		severity: string;
		sourcePageUrl?: string;
		lastError: string;
		suggestedFix: string;
	},
) {
	try {
		const dataSourceId = await getDataSourceId(notion, "failureInbox");
		await notion.pages.create({
			parent: { type: "data_source_id", data_source_id: dataSourceId },
			properties: {
				Name: titleValue(input.name),
				"Source Type": { select: { name: input.sourceType } },
				Severity: { select: { name: input.severity } },
				Status: { select: { name: "Open" } },
				...(input.sourcePageUrl ? { "Source Page URL": { url: input.sourcePageUrl } } : {}),
				"Last Error": richTextValue(input.lastError),
				"Suggested Fix": richTextValue(input.suggestedFix),
				"Last Seen At": { date: { start: new Date().toISOString() } },
			},
		});
	} catch {
		// Failure Inbox is best-effort. Never hide original action result.
	}
}

async function recordFailureForPage(notion: any, pageId: string, message: string) {
	try {
		const page = await notion.pages.retrieve({ page_id: pageId });
		const sourceType = await sourceTypeForPage(notion, page);
		await recordFailure(notion, {
			name: `${sourceType} action failed`,
			sourceType,
			severity: "Error",
			sourcePageUrl: (page as { url?: string }).url,
			lastError: message,
			suggestedFix: suggestedFixForError(message),
		});
	} catch {
		// Failure Inbox is best-effort.
	}
}

async function sourceTypeForPage(notion: any, page: unknown) {
	const actualParent = getPageParentId(page);
	const candidates: Array<[PortalDataSourceKey, string]> = [
		["templates", "Template"],
		["workOrders", "Work Order"],
		["campaigns", "Campaign"],
		["uploads", "Upload"],
		["renderOutputs", "Render Output"],
		["portalAreas", "Portal Area"],
		["credentials", "Credential"],
	];
	for (const [key, label] of candidates) {
		try {
			if (actualParent === await getDataSourceId(notion, key)) return label;
		} catch {
			// Keep trying other configured sources.
		}
	}
	return "Doctor";
}

function suggestedFixForError(message: string) {
	if (/TILLER_|Tiller/i.test(message)) return `Run ${CLI_CREDENTIALS_COMMAND}`;
	if (/Google Drive|GOOGLE_DRIVE/i.test(message)) return `Run ${CLI_GOOGLE_DRIVE_COMMAND}`;
	if (/missing|upload|file/i.test(message)) return "Open the related row and check required uploads or file links.";
	return "Open the source row, review Last Error, then rerun the Action.";
}

function formatUserFacingError(error: unknown) {
	const message = (error as Error)?.message ?? String(error);
	if (error instanceof PageScopeError) {
		return "This action is connected to the wrong portal database. Open the matching Tiller database row and try again.";
	}
	const missingSecret = message.match(/^Missing worker secret: ([A-Z0-9_]+)$/);
	if (missingSecret) {
		return `Worker setup is missing ${missingSecret[1]}. Run this in Terminal, then try again: ${CLI_CREDENTIALS_COMMAND}`;
	}
	const tillerStatus = message.match(/^Tiller API error (\d+)/);
	if (tillerStatus) {
		if (["401", "403"].includes(tillerStatus[1])) {
			return `Tiller authentication failed. Run this in Terminal to update email/password, then try again: ${CLI_CREDENTIALS_COMMAND}`;
		}
		return `Tiller rejected this request (HTTP ${tillerStatus[1]}). Check the row details and Tiller status, then try again.`;
	}
	if (message.startsWith("Fetch failed for ")) {
		return `Could not connect to Tiller or a linked file. Check network access and file links. If Tiller login changed, run: ${CLI_CREDENTIALS_COMMAND}`;
	}
	if (message.includes("already running") || message.includes("already picked up")) {
		return message;
	}
	return message;
}

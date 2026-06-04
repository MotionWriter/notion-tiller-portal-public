#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import {
	cpSync,
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	realpathSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { createInterface } from "node:readline";
import { stdin as input, stdout as output } from "node:process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(realpathSync(fileURLToPath(import.meta.url)));
const repoRoot = path.resolve(__dirname, "..");
const sourceWorkerDir = path.join(repoRoot, "tiller-agent-worker");
const installRoot = path.join(os.homedir(), ".notion-tiller-portal");
const workerDir = path.join(installRoot, "worker");
const statePath = path.join(installRoot, "install-state.json");
const command = process.argv[2] ?? "install";
const notionIntegrationUrl = "https://www.notion.so/profile/integrations/internal";
const defaultPortalName = "Tiller Portal";
const defaultDatabasePrefix = "Tiller";
const cliCommand = "npm exec --yes --package=github:MotionWriter/notion-tiller-portal-public#main -- notion-tiller-portal";
const useColor = process.stdout.isTTY && process.env.NO_COLOR === undefined;
const color = {
	bold: (value) => useColor ? `\x1b[1m${value}\x1b[22m` : value,
	cyan: (value) => useColor ? `\x1b[36m${value}\x1b[39m` : value,
	dim: (value) => useColor ? `\x1b[2m${value}\x1b[22m` : value,
	link: (value) => useColor ? `\x1b[1m\x1b[36m\x1b[4m${value}\x1b[24m\x1b[39m\x1b[22m` : value,
	yellow: (value) => useColor ? `\x1b[33m${value}\x1b[39m` : value,
};

main().catch((error) => {
	console.error(`\nInstall failed: ${error.message}`);
	process.exit(1);
});

async function main() {
	if (command === "doctor") {
		runDoctor();
		return;
	}
	if (command === "credentials") {
		await updateCredentials();
		return;
	}
	if (command === "onboarding") {
		await runOnboarding();
		return;
	}
	if (command !== "install") {
		throw new Error(`Unknown command "${command}". Use "install", "doctor", "credentials", or "onboarding".`);
	}

	console.log(color.bold("Notion Tiller Portal installer"));
	console.log(color.dim("Daily render work happens in Notion. Terminal is only for setup.\n"));

	checkVersion("node", ["--version"], 22, "Node 22 or newer is required.");
	checkVersion("npm", ["--version"], 10, "npm 10.9.2 or newer is required.");
	checkCommand("ntn", ["--version"], "Notion CLI missing. Install it first: curl -fsSL https://ntn.dev | NTN_INSTALL_DIR=\"$HOME/.local/bin\" bash");
	ensureNotionLogin();

	const existingState = readState();
	const existingWorkersConfig = path.join(workerDir, "workers.json");
	if (canResumeFromWorkerEnv(existingState, existingWorkersConfig)) {
		await resumeFromWorkerEnv(existingState, existingWorkersConfig);
		return;
	}

	const rl = createPrompt();
	printSection("Step 1 of 5", "Setup page");
	printInfo("Create one blank Notion page.");
	printInfo("Copy that page URL.");
	printInfo("The installer will build the portal under that page.\n");
	const parentPageId = await ask(rl, "Setup page URL or ID: ");

	printSection("Step 2 of 5", "Notion integration token");
	await printNotionTokenHelp();
	const notionApiToken = await askHidden(rl, "Notion internal integration token: ");

	printSection("Step 3 of 5", "Portal names");
	const portalName = await askOptional(rl, `Portal page name [${defaultPortalName}]: `, defaultPortalName);
	printInfo("Database prefix example: Acme creates Acme Campaigns, Acme Work Orders, etc.");
	const databasePrefix = await askOptional(rl, `Database name prefix [${defaultDatabasePrefix}]: `, defaultDatabasePrefix);

	printSection("Step 4 of 5", "Tiller login");
	printInfo("Tiller credentials are stored on the Notion Worker, not in Notion pages.\n");
	const tillerEmail = await ask(rl, "Tiller email: ");
	const tillerPassword = await askHidden(rl, "Tiller password: ");

	printSection("Step 5 of 5", "Save Worker secrets");
	await printSecretCommandWarning();
	const allowArgSecret = await askAction(rl, "Continue setting Worker secrets? [y/N] ");
	rl.close();
	if (!/^y(es)?$/i.test(allowArgSecret.trim())) throw new Error("Stopped before setting secrets.");

	run("ntn", ["doctor"], { allowFail: true });
	await prepareWorkerDir();
	writeState({ completedSteps: ["preflight"], parentPageId, portalName, databasePrefix });
	await runWithSpinner("npm", ["install"], { cwd: workerDir, message: "Installing Worker dependencies" });
	await runWithSpinner("npm", ["run", "build"], { cwd: workerDir, message: "Building Worker" });
	writeState({ completedSteps: ["preflight", "build"], parentPageId, portalName, databasePrefix });

	await runWithSpinner("ntn", ["workers", "deploy", "--no-git", "--name", "tiller-agent-worker"], {
		cwd: workerDir,
		message: "Deploying Notion Worker",
	});
	const workersConfig = path.join(workerDir, "workers.json");
	const workerId = readWorkerId(workersConfig);
	writeState({ completedSteps: ["preflight", "build", "deploy"], workerId, parentPageId, portalName, databasePrefix });

	setWorkerEnv(workersConfig, "NOTION_API_TOKEN", notionApiToken);
	setWorkerEnv(workersConfig, "TILLER_EMAIL", tillerEmail);
	setWorkerEnv(workersConfig, "TILLER_PASSWORD", tillerPassword);
	writeState({ completedSteps: ["preflight", "build", "deploy", "worker-env"], workerId, parentPageId, portalName, databasePrefix });

	await ensureTillerAuth(workersConfig);
	await finishInstall({ parentPageId, workerId, workersConfig, portalName, databasePrefix });
}

async function resumeFromWorkerEnv(state, workersConfig) {
	console.log(`Resuming existing Worker ${state.workerId}.`);
	console.log(`Worker folder: ${workerDir}`);

	const rl = createPrompt();
	const parentPageId = state.parentPageId || await ask(rl, "Setup page URL or ID: ");
	const portalName = state.portalName || defaultPortalName;
	const databasePrefix = state.databasePrefix || defaultDatabasePrefix;
	const updateToken = await ask(rl, "Update Notion internal integration token? [y/N] ");
	if (/^y(es)?$/i.test(updateToken.trim())) {
		await printNotionTokenHelp();
		const notionApiToken = await askHidden(rl, "Notion internal integration token: ");
		setWorkerEnv(workersConfig, "NOTION_API_TOKEN", notionApiToken);
	}
	rl.close();

	await ensureTillerAuth(workersConfig);
	await finishInstall({ parentPageId, workerId: state.workerId, workersConfig, portalName, databasePrefix });
}

async function finishInstall({ parentPageId, workerId, workersConfig, portalName, databasePrefix }) {
	const setup = await runWithSpinner("ntn", [
		"workers",
		"exec",
		"setupWorkspace",
		"-d",
		JSON.stringify(setupPayload({ parentPageId, portalName, databasePrefix, writeSetupChecklist: false })),
		"--workers-config-file",
		workersConfig,
	], { cwd: workerDir, message: "Creating Notion portal and databases" });
	const setupJson = parseLastJson(setup.stdout);
	const configDataSourceId = setupJson?.configDataSourceId;
	if (!configDataSourceId) throw new Error("setupWorkspace did not return configDataSourceId.");
	writeState({ completedSteps: ["preflight", "build", "deploy", "worker-env", "setup"], workerId, parentPageId, portalName, databasePrefix, configDataSourceId, portalPageId: setupJson?.portalPageId ?? "" });

	setWorkerEnv(workersConfig, "TILLER_PORTAL_CONFIG_DATA_SOURCE_ID", configDataSourceId);

	await runWithSpinner("ntn", [
		"workers",
		"exec",
		"setupWorkspace",
		"-d",
		JSON.stringify(setupPayload({ parentPageId, portalName, databasePrefix, writeSetupChecklist: false })),
		"--workers-config-file",
		workersConfig,
	], { cwd: workerDir, allowFail: true, message: "Saving portal configuration" });

	const webhooks = await runWithSpinner("ntn", ["workers", "webhooks", "list", "--workers-config-file", workersConfig], {
		cwd: workerDir,
		message: "Getting Worker webhook URLs",
	});
	const webhookUrls = parseWebhookUrls(webhooks.stdout);
	const foundWebhookNames = Object.keys(webhookUrls);
	printInfo(`Found ${foundWebhookNames.length} Worker webhook URL${foundWebhookNames.length === 1 ? "" : "s"}: ${foundWebhookNames.join(", ") || "none"}.`);

	const rl = createPrompt();
	const storeWebhookInfo = await askActionYesNoDefault(
		rl,
		"Store these webhook URLs in the generated Settings page? [Y/n] ",
		true,
	);
	rl.close();
	if (storeWebhookInfo) {
		await runWithSpinner("ntn", [
			"workers",
			"exec",
			"setupWorkspace",
			"-d",
			JSON.stringify(setupPayload({ parentPageId, portalName, databasePrefix, webhookUrls, writeSetupChecklist: true })),
			"--workers-config-file",
			workersConfig,
		], { cwd: workerDir, allowFail: true, message: "Writing webhooks to Settings page" });
	} else {
		await runWithSpinner("ntn", [
			"workers",
			"exec",
			"setupWorkspace",
			"-d",
			JSON.stringify(setupPayload({ parentPageId, portalName, databasePrefix, writeSetupChecklist: true })),
			"--workers-config-file",
			workersConfig,
		], { cwd: workerDir, allowFail: true, message: "Writing setup checklist" });
	}
	writeState({ completedSteps: ["preflight", "build", "deploy", "worker-env", "setup", "config-env", "webhooks"], workerId, parentPageId, portalName, databasePrefix, configDataSourceId, portalPageId: setupJson?.portalPageId ?? "" });

	printSection("Done", "Install complete");
	console.log(`Portal page ID: ${setupJson?.portalPageId ?? "(created; see setup output)"}`);
	console.log("\nWebhook URLs:");
	printWebhookUrls(webhookUrls);
	console.log("\nNext:");
	console.log("1. Open Settings in Notion.");
	console.log("2. Add database automations using the stored webhook instructions.");
	console.log(`3. Run: ${cliCommand} doctor`);
}

function setupPayload({ parentPageId, portalName, databasePrefix, webhookUrls, writeSetupChecklist }) {
	return {
		parentPageId,
		portalName: portalName || defaultPortalName,
		databasePrefix: databasePrefix || defaultDatabasePrefix,
		webhookUrls: webhookUrls
			? {
				templateAction: webhookUrls.templateAction ?? null,
				workOrderAction: webhookUrls.workOrderAction ?? null,
				campaignAction: webhookUrls.campaignAction ?? null,
				cavalryWorkOrderStarted: webhookUrls.cavalryWorkOrderStarted ?? null,
			}
			: null,
		writeSetupChecklist: writeSetupChecklist ?? null,
	};
}

function parseWebhookUrls(value) {
	const urls = {};
	const names = ["templateAction", "workOrderAction", "campaignAction", "cavalryWorkOrderStarted"];
	for (const name of names) {
		const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
		const match = value.match(new RegExp(`(https://\\S+/${escaped})(?:\\s|$)`));
		if (match?.[1]) urls[name] = match[1];
	}
	return urls;
}

function printWebhookUrls(webhookUrls) {
	const names = ["templateAction", "workOrderAction", "campaignAction", "cavalryWorkOrderStarted"];
	for (const name of names) {
		console.log(`- ${name}: ${webhookUrls[name] ?? "not found"}`);
	}
}

function canResumeFromWorkerEnv(state, workersConfig) {
	return Boolean(
		state?.workerId &&
		hasCompletedStep(state, "worker-env") &&
		existsSync(workersConfig) &&
		existsSync(path.join(workerDir, "package.json"))
	);
}

async function updateCredentials() {
	console.log("Notion Tiller Portal credentials\n");
	console.log("Secrets are set on Worker env. They are not stored in Notion or local state.\n");
	checkCommand("ntn", ["--version"], "Notion CLI missing.");
	ensureNotionLogin();

	const workersConfig = path.join(workerDir, "workers.json");
	if (!existsSync(workersConfig)) {
		throw new Error("No deployed Worker found. Run install first.");
	}
	const workerId = readWorkerId(workersConfig);
	console.log(`Updating Worker ${workerId}.`);

	const rl = createPrompt();
	const updates = [];

	if (await askYesNo(rl, "Update Notion internal integration token? [y/N] ")) {
		await printNotionTokenHelp();
		updates.push(["NOTION_API_TOKEN", await askHidden(rl, "Notion internal integration token: ")]);
	}

	const updateTiller = await askYesNo(rl, "Update Tiller email/password? [y/N] ");
	if (updateTiller) {
		updates.push(["TILLER_EMAIL", await ask(rl, "Tiller email: ")]);
		updates.push(["TILLER_PASSWORD", await askHidden(rl, "Tiller password: ")]);
	}

	if (await askYesNo(rl, "Update Tiller API base URL? [y/N] ")) {
		updates.push(["TILLER_API_BASE", await ask(rl, "Tiller API base URL: ")]);
	}

	if (await askYesNo(rl, "Update Google Drive API key? [y/N] ")) {
		updates.push(["GOOGLE_DRIVE_API_KEY", await askHidden(rl, "Google Drive API key: ")]);
	}

	if (await askYesNo(rl, "Update Google Drive OAuth client/refresh token? [y/N] ")) {
		updates.push(["GOOGLE_DRIVE_CLIENT_ID", await ask(rl, "Google Drive client ID: ")]);
		updates.push(["GOOGLE_DRIVE_CLIENT_SECRET", await askHidden(rl, "Google Drive client secret: ")]);
		updates.push(["GOOGLE_DRIVE_REFRESH_TOKEN", await askHidden(rl, "Google Drive refresh token: ")]);
	}

	if (await askYesNo(rl, "Update max Google Drive download bytes? [y/N] ")) {
		updates.push(["MAX_DRIVE_DOWNLOAD_BYTES", await ask(rl, "Max bytes, e.g. 104857600: ")]);
	}

	if (await askYesNo(rl, "Update fallback campaign CSV columns? [y/N] ")) {
		updates.push(["CAMPAIGN_CSV_COLUMNS", await ask(rl, "Comma-separated CSV columns: ")]);
	}

	if (updates.length === 0) {
		rl.close();
		console.log("No credential changes made.");
		return;
	}

	await printSecretCommandWarning();
	const confirm = await askYesNo(rl, "Apply these Worker env updates? [y/N] ");
	rl.close();
	if (!confirm) throw new Error("Stopped before setting credentials.");

	for (const [name, value] of updates) {
		setWorkerEnv(workersConfig, name, value);
	}

	if (updateTiller || updates.some(([name]) => name === "TILLER_API_BASE")) {
		await ensureTillerAuth(workersConfig);
	}

	console.log("\nCredentials updated. Run doctor to verify:");
	console.log(`${cliCommand} doctor`);
}

async function ensureTillerAuth(workersConfig) {
	for (;;) {
		const result = await runWithSpinner("ntn", [
			"workers",
			"exec",
			"testTillerConnection",
			"-d",
			"{}",
			"--workers-config-file",
			workersConfig,
		], { cwd: workerDir, allowFail: true, message: "Testing Tiller login" });
		const parsed = parseLastJson(result.stdout);
		const authOk = parsed?.ok === true || parsed?.data?.ok === true;
		if (result.status === 0 && authOk) {
			printInfo(parsed?.data?.message || parsed?.message || "Tiller login verified.");
			return;
		}

		const reason = parsed?.error || parsed?.data?.error || parsed?.message || parsed?.data?.message || lastNonEmptyLine(result.stderr) || lastNonEmptyLine(result.stdout) || "Unknown Tiller auth error.";
		console.log(`\nTiller login failed: ${reason}`);
		const rl = createPrompt();
		const retry = await askActionYesNoDefault(rl, "Update Tiller email/password now? [Y/n] ", true);
		if (!retry) {
			rl.close();
			throw new Error(`Tiller login failed. Run this later to update credentials:\n${cliCommand} credentials`);
		}
		const email = await ask(rl, "Tiller email: ");
		const password = await askHidden(rl, "Tiller password: ");
		rl.close();
		setWorkerEnv(workersConfig, "TILLER_EMAIL", email);
		setWorkerEnv(workersConfig, "TILLER_PASSWORD", password);
	}
}

async function runOnboarding() {
	console.log("Notion Tiller Portal setup\n");
	console.log("Daily render work happens in Notion. Terminal is only for setup.\n");

	const rl = createPrompt();
	printSection("Step 1 of 3", "Notion setup page");
	printInfo("Create one blank Notion page.");
	printInfo("Copy that page URL.");
	printInfo("The installer will build the portal under that page.\n");
	await question(rl, "Press Enter when that page is ready.");

	printSection("Step 2 of 3", "Notion integration token");
	console.log(`${color.dim("Open:")} ${color.link(notionIntegrationUrl)}`);
	printInfo("Create or open an internal integration.");
	printInfo("Copy the integration token.");
	printInfo("Share your setup page with that integration.\n");
	await question(rl, "Press Enter when the token is ready.");

	printSection("Step 3 of 3", "Tiller login");
	printInfo("Have your Tiller email ready.");
	printInfo("Have your Tiller password ready.");
	printInfo("These will be stored on the Notion Worker, not in Notion pages.\n");
	await question(rl, "Press Enter to continue to installer.");
	rl.close();
}

function runDoctor() {
	console.log("Notion Tiller Portal doctor\n");
	const issues = [];
	checkDoctorVersion("node", ["--version"], 22, "Install Node 22 or newer.", issues);
	checkDoctorVersion("npm", ["--version"], 10, "Install npm 10.9.2 or newer.", issues);
	checkDoctorCommand("ntn", ["--version"], "Install Notion CLI: curl -fsSL https://ntn.dev | NTN_INSTALL_DIR=\"$HOME/.local/bin\" bash", issues);

	const auth = run("ntn", ["api", "v1/users/me"], { capture: true, allowFail: true, quiet: true });
	const authOk = auth.status === 0;
	printCheck("ntn auth", authOk, authOk ? "ok" : "Run `ntn login`.");
	if (!authOk) issues.push("Run `ntn login`.");

	const state = readState();
	printCheck("install state", existsSync(statePath), existsSync(statePath) ? statePath : "Run installer.");
	if (!existsSync(statePath)) issues.push("Run installer.");

	if (existsSync(statePath)) {
		console.log(`completed: ${(state.completedSteps ?? []).join(", ") || "none"}`);
		if (state.workerId) console.log(`workerId: ${state.workerId}`);
		if (state.portalPageId) console.log(`portalPageId: ${state.portalPageId}`);
		if (state.configDataSourceId) console.log(`configDataSourceId: ${state.configDataSourceId}`);
	}

	const workersConfig = path.join(workerDir, "workers.json");
	printCheck("worker folder", existsSync(workerDir), workerDir);
	if (!existsSync(workerDir)) issues.push("Run installer to create local worker folder.");
	printCheck("workers.json", existsSync(workersConfig), workersConfig);
	if (!existsSync(workersConfig)) issues.push("Run installer to deploy Worker.");
	printCheck("worker package", existsSync(path.join(workerDir, "package.json")), path.join(workerDir, "package.json"));
	if (!existsSync(path.join(workerDir, "package.json"))) issues.push("Run installer to prepare Worker source.");

	if (existsSync(workersConfig) && authOk) {
		const workerId = readWorkerId(workersConfig);
		printCheck("worker id", Boolean(workerId), workerId || "Missing workerId.");

		const configOk = Boolean(state.configDataSourceId && hasCompletedStep(state, "config-env"));
		printCheck("config env", configOk, configOk ? state.configDataSourceId : "Run install resume to set TILLER_PORTAL_CONFIG_DATA_SOURCE_ID.");
		if (!configOk) issues.push("Run installer again to finish setup/config env.");

		const tiller = run("ntn", [
			"workers",
			"exec",
			"testTillerConnection",
			"-d",
			"{}",
			"--workers-config-file",
			workersConfig,
		], { cwd: workerDir, capture: true, allowFail: true, quiet: true });
		const tillerJson = parseLastJson(tiller.stdout);
		const tillerOk = tiller.status === 0 && tillerJson?.ok === true;
		printCheck("Tiller auth", tillerOk, tillerOk ? "ok" : "Update Tiller credentials.");
		if (!tillerOk) issues.push("Update Tiller credentials and rerun doctor.");

		const webhooks = run("ntn", ["workers", "webhooks", "list", "--workers-config-file", workersConfig], {
			cwd: workerDir,
			capture: true,
			allowFail: true,
			quiet: true,
		});
		const webhookNames = ["templateAction", "workOrderAction", "campaignAction", "cavalryWorkOrderStarted"];
		const missingWebhooks = webhookNames.filter((name) => !webhooks.stdout.includes(name));
		printCheck("webhooks", missingWebhooks.length === 0, missingWebhooks.length === 0 ? "all present" : `Missing: ${missingWebhooks.join(", ")}`);
		if (missingWebhooks.length > 0) issues.push("Redeploy Worker or inspect webhook list.");
	} else if (existsSync(workersConfig)) {
		console.log("SKIP Worker remote checks: Notion CLI auth missing.");
	}

	console.log("\nManual Notion automation check:");
	console.log("- Templates Action -> templateAction webhook");
	console.log("- Work Orders Action -> workOrderAction webhook");
	console.log("- Campaigns Action -> campaignAction webhook");

	if (issues.length === 0) {
		console.log("\nEverything basic looks ready.");
		return;
	}

	console.log("\nMissing / needs attention:");
	for (const issue of [...new Set(issues)]) console.log(`- ${issue}`);
}

function prepareWorkerDir() {
	if (!existsSync(path.join(sourceWorkerDir, "package.json"))) {
		throw new Error(`Worker source not found at ${sourceWorkerDir}. Reinstall package and try again.`);
	}

	printInfo(`Worker install folder: ${workerDir}`);
	mkdirSync(installRoot, { recursive: true });
	rmSync(workerDir, { recursive: true, force: true });
	mkdirSync(workerDir, { recursive: true });
	const skip = new Set(["node_modules", "dist", "workers.json"]);
	for (const entry of readdirSync(sourceWorkerDir)) {
		if (skip.has(entry)) continue;
		cpSync(path.join(sourceWorkerDir, entry), path.join(workerDir, entry), {
			recursive: true,
			filter: (source) => !path.relative(sourceWorkerDir, source).split(path.sep).includes("node_modules"),
		});
	}
	assertWorkerPackage();
}

function assertWorkerPackage() {
	const packagePath = path.join(workerDir, "package.json");
	if (!existsSync(packagePath)) throw new Error("Worker package.json was not copied.");
	const parsed = JSON.parse(readFileSync(packagePath, "utf8"));
	if (!parsed.scripts?.build) {
		throw new Error(`Worker package.json missing build script. Copied wrong package into ${workerDir}.`);
	}
}

function checkCommand(command, args, message) {
	const result = spawnSync(command, args, { encoding: "utf8" });
	if (result.status !== 0) throw new Error(message ?? `${command} check failed.`);
	console.log(`${command}: ${result.stdout.trim() || "ok"}`);
}

function setWorkerEnv(workersConfig, name, value) {
	run("ntn", ["workers", "env", "set", `${name}=${value}`, "--workers-config-file", workersConfig], {
		cwd: workerDir,
		label: `ntn workers env set ${name}=<redacted> --workers-config-file ${workersConfig}`,
	});
}

function checkVersion(command, args, minimumMajor, message) {
	const result = spawnSync(command, args, { encoding: "utf8" });
	if (result.status !== 0) throw new Error(message);
	const raw = result.stdout.trim();
	const major = Number((raw.match(/\d+/) ?? [])[0]);
	if (!Number.isFinite(major) || major < minimumMajor) throw new Error(`${message} Found ${raw}.`);
	console.log(`${command}: ${raw}`);
}

function checkDoctorCommand(command, args, issue, issues) {
	const result = spawnSync(command, args, { encoding: "utf8" });
	const ok = result.status === 0;
	printCheck(command, ok, ok ? result.stdout.trim() || "ok" : issue);
	if (!ok) issues.push(issue);
}

function checkDoctorVersion(command, args, minimumMajor, issue, issues) {
	const result = spawnSync(command, args, { encoding: "utf8" });
	const raw = result.stdout.trim();
	const major = Number((raw.match(/\d+/) ?? [])[0]);
	const ok = result.status === 0 && Number.isFinite(major) && major >= minimumMajor;
	printCheck(command, ok, ok ? raw : `${issue}${raw ? ` Found ${raw}.` : ""}`);
	if (!ok) issues.push(issue);
}

function printCheck(label, ok, detail) {
	console.log(`${ok ? "OK" : "MISSING"} ${label}: ${detail}`);
}

function ensureNotionLogin() {
	const me = run("ntn", ["api", "v1/users/me"], { capture: true, allowFail: true, quiet: true });
	if (me.status === 0) {
		console.log("ntn auth: ok");
		return;
	}

	console.log("ntn auth: login required");
	run("ntn", ["login"]);
	const verified = run("ntn", ["api", "v1/users/me"], { capture: true, allowFail: true, quiet: true });
	if (verified.status !== 0) {
		throw new Error("Notion CLI login did not complete. Run `ntn doctor` for details.");
	}
	console.log("ntn auth: ok");
}

function run(command, args, options = {}) {
	const result = spawnSync(command, args, {
		cwd: options.cwd,
		encoding: "utf8",
		stdio: options.capture ? ["ignore", "pipe", "pipe"] : "inherit",
	});
	if (options.capture && !options.quiet && result.stdout) process.stdout.write(result.stdout);
	if (options.capture && !options.quiet && result.stderr) process.stderr.write(result.stderr);
	if (result.status !== 0 && !options.allowFail) {
		throw new Error(`${options.label ?? `${command} ${args.join(" ")}`} failed.`);
	}
	return result;
}

function runWithSpinner(command, args, options = {}) {
	const message = options.message ?? `${command} ${args[0] ?? ""}`.trim();
	const frames = ["|", "/", "-", "\\"];
	let frameIndex = 0;
	let timer = null;

	if (process.stdout.isTTY) {
		process.stdout.write(`${color.cyan(frames[frameIndex])} ${message}...`);
		timer = setInterval(() => {
			frameIndex = (frameIndex + 1) % frames.length;
			process.stdout.write(`\r${color.cyan(frames[frameIndex])} ${message}...`);
		}, 120);
	} else {
		console.log(`${message}...`);
	}

	return new Promise((resolve, reject) => {
		const child = spawn(command, args, {
			cwd: options.cwd,
			stdio: ["ignore", "pipe", "pipe"],
		});
		let stdout = "";
		let stderr = "";
		child.stdout.on("data", (chunk) => {
			stdout += chunk.toString();
		});
		child.stderr.on("data", (chunk) => {
			stderr += chunk.toString();
		});
		child.on("error", (error) => {
			if (timer) clearInterval(timer);
			if (process.stdout.isTTY) process.stdout.write(`\r${color.bold("FAIL")} ${message}\n`);
			reject(error);
		});
		child.on("close", (status) => {
			if (timer) clearInterval(timer);
			if (process.stdout.isTTY) {
				process.stdout.write(`\r${status === 0 ? "OK" : "FAIL"} ${message}\n`);
			} else {
				console.log(`${status === 0 ? "done" : "failed"}: ${message}`);
			}
			if (status !== 0 && !options.allowFail) {
				reject(new Error(`${options.label ?? `${command} ${args.join(" ")}`} failed.${stderr ? `\n${stderr.trim()}` : ""}`));
				return;
			}
			resolve({ status, stdout, stderr });
		});
	});
}

function createPrompt() {
	const rl = createInterface({ input, output });
	rl.stdoutMuted = false;
	const originalWrite = rl._writeToOutput.bind(rl);
	rl._writeToOutput = (value) => {
		if (!rl.stdoutMuted) {
			originalWrite(value);
			return;
		}
		if (value.endsWith(": ")) {
			originalWrite(value);
			return;
		}
		originalWrite("*");
	};
	return rl;
}

function printSection(step, title) {
	console.log(`\n${color.cyan(color.bold(`======= ${step}: ${title} =======`))}`);
}

function printInfo(message) {
	console.log(color.dim(`- ${message}`));
}

async function printNotionTokenHelp() {
	console.log("");
	console.log(`${color.dim("Open:")} ${color.link(notionIntegrationUrl)}`);
	console.log(color.dim("Create or open an internal integration, copy the Integration token, and share the setup page with it.\n"));
	await sleep(1500);
}

async function printSecretCommandWarning() {
	console.log("");
	console.log(color.bold("Security note:"));
	console.log(color.dim("The Notion CLI currently sets Worker environment values through command arguments."));
	console.log(color.dim("Secrets can briefly appear in your shell history or local process list while they are being saved."));
	console.log(color.dim("They are not stored in Notion pages or in this installer state.\n"));
	await sleep(1800);
}

async function ask(rl, prompt) {
	printActionNeeded();
	const value = await question(rl, prompt);
	if (!value.trim()) throw new Error("Required input missing.");
	return value.trim();
}

async function askAction(rl, prompt) {
	return ask(rl, prompt);
}

async function askOptional(rl, prompt, fallback) {
	printActionNeeded();
	const value = await question(rl, prompt);
	return value.trim() || fallback;
}

async function askYesNo(rl, prompt) {
	const value = await question(rl, prompt);
	return /^y(es)?$/i.test(value.trim());
}

async function askYesNoDefault(rl, prompt, fallback) {
	const value = await question(rl, prompt);
	if (!value.trim()) return fallback;
	return /^y(es)?$/i.test(value.trim());
}

async function askActionYesNoDefault(rl, prompt, fallback) {
	printActionNeeded();
	return askYesNoDefault(rl, prompt, fallback);
}

async function askHidden(rl, prompt) {
	printActionNeeded();
	rl.stdoutMuted = true;
	const value = await question(rl, prompt);
	rl.stdoutMuted = false;
	output.write("\n");
	if (!value.trim()) throw new Error(`${prompt.replace(/:\s*$/, "")} missing.`);
	return value;
}

function question(rl, prompt) {
	return new Promise((resolve) => rl.question(prompt, resolve));
}

function printActionNeeded() {
	console.log(`\n${color.yellow(color.bold(">>> ACTION NEEDED <<<"))}`);
}

function sleep(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function readWorkerId(workersConfig) {
	if (!existsSync(workersConfig)) throw new Error("workers.json was not created after deploy.");
	const parsed = JSON.parse(readFileSync(workersConfig, "utf8"));
	if (!parsed.workerId) throw new Error("workers.json is missing workerId.");
	return parsed.workerId;
}

function parseLastJson(value) {
	const trimmed = value.trim();
	for (let index = trimmed.lastIndexOf("{"); index >= 0; index = trimmed.lastIndexOf("{", index - 1)) {
		try {
			return JSON.parse(trimmed.slice(index));
		} catch {
			// Keep scanning backward until final complete JSON object is found.
		}
	}
	return null;
}

function lastNonEmptyLine(value) {
	return String(value ?? "")
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter(Boolean)
		.at(-1) ?? "";
}

function readState() {
	if (!existsSync(statePath)) return {};
	try {
		return JSON.parse(readFileSync(statePath, "utf8"));
	} catch {
		return {};
	}
}

function hasCompletedStep(state, step) {
	return Array.isArray(state.completedSteps) && state.completedSteps.includes(step);
}

function writeState(state) {
	const previous = readState();
	writeFileSync(statePath, `${JSON.stringify({ ...previous, ...state, updatedAt: new Date().toISOString() }, null, 2)}\n`, {
		mode: 0o600,
	});
}

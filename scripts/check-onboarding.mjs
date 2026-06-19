import { readFileSync } from "node:fs";
import { commands, definitions } from "../web/onboarding/commandData.js";

const html = readFileSync(new URL("../web/onboarding/index.html", import.meta.url), "utf8");
const keys = [...html.matchAll(/data-(?:command|copy|toggle-definition|definition)="([^"]+)"/g)].map((match) => match[1]);
const missing = new Set();

for (const key of keys) {
	if (!(key in commands.mac) || !(key in commands.windows)) missing.add(`command:${key}`);
	if (!(key in definitions)) missing.add(`definition:${key}`);
}

if (missing.size > 0) {
	console.error(`Onboarding command data missing: ${[...missing].join(", ")}`);
	process.exit(1);
}

console.log(`Onboarding command data ok (${new Set(keys).size} keys).`);

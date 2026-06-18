const loginForm = document.querySelector("[data-login-form]");
const loginMessage = document.querySelector("[data-login-message]");
const guideRoot = document.querySelector("#guide-root");
const toast = document.querySelector(".toast");
const passwordInput = document.querySelector("[data-password-input]");
const togglePasswordButton = document.querySelector("[data-toggle-password]");

function setLoginMessage(message, type = "") {
	if (!loginMessage) return;
	loginMessage.textContent = message;
	loginMessage.classList.toggle("error", type === "error");
	loginMessage.classList.toggle("success", type === "success");
}

function lockGuide() {
	document.body.classList.add("is-locked");
	if (guideRoot) guideRoot.innerHTML = "";
}

async function unlockGuide() {
	const response = await fetch("/api/guide", { credentials: "include" });
	if (!response.ok) {
		lockGuide();
		return false;
	}
	if (guideRoot) guideRoot.innerHTML = await response.text();
	document.body.classList.remove("is-locked");
	hydrateGuide();
	return true;
}

async function checkSession() {
	const response = await fetch("/api/session", { credentials: "include" });
	if (response.ok) await unlockGuide();
}

async function submitLogin(event) {
	event.preventDefault();
	const form = event.currentTarget;
	const button = form.querySelector("button[type='submit']");
	const formData = new FormData(form);
	const email = String(formData.get("email") || "").trim();
	const password = String(formData.get("password") || "");
	button.disabled = true;
	button.textContent = "Checking Tiller...";
	setLoginMessage("");

	try {
		const response = await fetch("/api/login", {
			method: "POST",
			credentials: "include",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ email, password }),
		});
		const data = await response.json();
		if (!response.ok || !data.ok) {
			throw new Error(data.message || "Tiller login failed.");
		}
		form.reset();
		setLoginMessage("Authenticated with Tiller.", "success");
		await unlockGuide();
	} catch (error) {
		setLoginMessage(error.message || "Tiller login failed.", "error");
	} finally {
		button.disabled = false;
		button.textContent = "Unlock setup guide";
	}
}

async function logout() {
	await fetch("/api/logout", { method: "POST", credentials: "include" });
	setLoginMessage("");
	lockGuide();
}

function hydrateGuide() {
	for (const button of document.querySelectorAll("[data-platform]")) {
		button.addEventListener("click", () => setPlatform(button.dataset.platform || "mac"));
	}
	for (const button of document.querySelectorAll("[data-copy-target]")) {
		button.addEventListener("click", () => copyCommand(button));
	}
	document.querySelector("[data-logout]")?.addEventListener("click", logout);
	setPlatform("mac");
}

function setPlatform(platform) {
	for (const button of document.querySelectorAll("[data-platform]")) {
		const selected = button.dataset.platform === platform;
		button.classList.toggle("active", selected);
		button.setAttribute("aria-pressed", String(selected));
	}
	for (const block of document.querySelectorAll("[data-command-platform]")) {
		block.hidden = block.dataset.commandPlatform !== platform;
	}
	for (const label of document.querySelectorAll("[data-platform-label]")) {
		label.textContent = platform === "windows" ? "Windows PowerShell" : "macOS/Linux Terminal";
	}
	for (const button of document.querySelectorAll("[data-copy-key]")) {
		button.dataset.copyTarget = `${button.dataset.copyKey}-${platform}`;
	}
}

async function copyCommand(button) {
	const targetId = button.dataset.copyTarget;
	const target = targetId ? document.getElementById(targetId) : null;
	if (!target) return;
	const copied = await copyText(target.textContent || "");
	button.textContent = copied ? "Copied" : "Select";
	showToast(copied ? "Copied command" : "Copy failed. Select the command text manually.");
	window.setTimeout(() => {
		button.textContent = "Copy";
		hideToast();
	}, 1400);
}

async function copyText(value) {
	try {
		await navigator.clipboard.writeText(value);
		return true;
	} catch {
		return fallbackCopy(value);
	}
}

function fallbackCopy(value) {
	const textarea = document.createElement("textarea");
	textarea.value = value;
	textarea.setAttribute("readonly", "");
	textarea.style.position = "fixed";
	textarea.style.left = "-9999px";
	document.body.append(textarea);
	textarea.select();
	let copied = false;
	try {
		copied = document.execCommand("copy");
	} catch {
		copied = false;
	}
	textarea.remove();
	return copied;
}

function showToast(message) {
	if (!toast) return;
	toast.textContent = message;
	toast.hidden = false;
}

function hideToast() {
	if (toast) toast.hidden = true;
}

loginForm?.addEventListener("submit", submitLogin);
togglePasswordButton?.addEventListener("click", () => {
	const showing = passwordInput?.getAttribute("type") === "text";
	passwordInput?.setAttribute("type", showing ? "password" : "text");
	togglePasswordButton.textContent = showing ? "Show" : "Hide";
	togglePasswordButton.setAttribute("aria-pressed", String(!showing));
});
checkSession();

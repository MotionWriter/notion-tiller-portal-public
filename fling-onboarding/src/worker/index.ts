import { app } from "flingit";

const TILLER_API_BASE = "https://tiller.work/api/wo";
const sessionCookieName = "tiller_portal_session";
const sessionMaxAgeSeconds = 60 * 60 * 24 * 7;
const sessionSecret = getSessionSecret();

app.post("/api/login", async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ ok: false, message: "Enter your Tiller email and password." }, 400);
  }

  const { email, password } = body as { email?: unknown; password?: unknown };
  if (typeof email !== "string" || typeof password !== "string" || !email.trim() || !password) {
    return c.json({ ok: false, message: "Enter your Tiller email and password." }, 400);
  }

  try {
    const emailDomain = email.trim().split("@")[1] || "unknown";
    console.info(`Tiller login attempt domain=${emailDomain}`);
    const response = await fetch(`${TILLER_API_BASE}/Authentication`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        emailAddress: email.trim(),
        password,
      }),
    });

    const token = (await response.text()).trim();
    if (!response.ok) {
      console.warn(`Tiller login rejected status=${response.status} statusText=${response.statusText} body=${token.slice(0, 300)}`);
      if (response.status === 526) {
        return c.json({
          ok: false,
          message: "Tiller could not be reached because of a TLS/certificate issue. Your email and password were not rejected.",
        }, 502);
      }
      return c.json({ ok: false, message: "Tiller rejected that email or password." }, 401);
    }

    if (!token) {
      console.warn(`Tiller login returned empty token status=${response.status}`);
      return c.json({ ok: false, message: "Tiller did not return a valid login token." }, 502);
    }

    console.info(`Tiller login accepted domain=${emailDomain}`);
    c.header("Set-Cookie", await createSessionCookie(email.trim(), c.req.url));
    return c.json({ ok: true, message: "Authenticated with Tiller." });
  } catch (error) {
    console.error(`Tiller login fetch failed error=${error instanceof Error ? error.message : String(error)}`);
    return c.json({ ok: false, message: "Could not reach Tiller. Try again in a minute." }, 502);
  }
});

app.get("/api/session", async (c) => {
  const session = await readSession(c.req.header("Cookie") || "");
  if (!session) return c.json({ ok: false }, 401);
  return c.json({ ok: true, email: session.email });
});

app.post("/api/logout", (c) => {
  c.header("Set-Cookie", clearSessionCookie(c.req.url));
  return c.json({ ok: true });
});

app.get("/api/guide", async (c) => {
  const session = await readSession(c.req.header("Cookie") || "");
  if (!session) return c.json({ ok: false, message: "Tiller login required." }, 401);
  return c.html(renderGuide(session.email));
});

function getSessionSecret() {
  const envSecret = (globalThis as unknown as { process?: { env?: Record<string, string | undefined> } })
    .process?.env?.TILLER_PORTAL_SESSION_SECRET;
  if (envSecret) return envSecret;
  console.warn("TILLER_PORTAL_SESSION_SECRET is not set. Login sessions may reset when the Worker restarts.");
  return "local-dev-session-secret-change-before-production";
}

async function createSessionCookie(email: string, requestUrl: string) {
  const expiresAt = Date.now() + sessionMaxAgeSeconds * 1000;
  const payload = base64UrlEncode(JSON.stringify({ email, expiresAt }));
  const signature = await sign(payload);
  return `${sessionCookieName}=${payload}.${signature}; ${cookieOptions(requestUrl, sessionMaxAgeSeconds)}`;
}

function clearSessionCookie(requestUrl: string) {
  return `${sessionCookieName}=; ${cookieOptions(requestUrl, 0)}`;
}

function cookieOptions(requestUrl: string, maxAge: number) {
  const secure = new URL(requestUrl).protocol === "https:" ? "; Secure" : "";
  return `Max-Age=${maxAge}; Path=/; HttpOnly; SameSite=Lax${secure}`;
}

async function readSession(cookieHeader: string) {
  const raw = parseCookie(cookieHeader, sessionCookieName);
  if (!raw) return null;
  const [payload, signature] = raw.split(".");
  if (!payload || !signature || signature !== await sign(payload)) return null;

  try {
    const session = JSON.parse(base64UrlDecode(payload)) as { email?: unknown; expiresAt?: unknown };
    if (typeof session.email !== "string" || typeof session.expiresAt !== "number") return null;
    if (Date.now() > session.expiresAt) return null;
    return { email: session.email };
  } catch {
    return null;
  }
}

function parseCookie(cookieHeader: string, name: string) {
  return cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1) || "";
}

async function sign(payload: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(sessionSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return bytesToBase64Url(new Uint8Array(signature));
}

function base64UrlEncode(value: string) {
  return bytesToBase64Url(new TextEncoder().encode(value));
}

function base64UrlDecode(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  return new TextDecoder().decode(Uint8Array.from(binary, (char) => char.charCodeAt(0)));
}

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function renderGuide(email: string) {
  return `<!doctype html>
<header class="topbar">
  <a class="brand" href="#get-started" aria-label="Tiller Portal Guide">
    <span class="brand-mark">T</span>
    <span>Tiller Portal</span>
  </a>
  <nav class="topnav" aria-label="Primary">
    <a href="#install-command">Install</a>
    <a href="#doctor">Doctor</a>
    <a href="#security">Security</a>
  </nav>
  <div class="top-actions">
    <div class="platform-tabs compact" role="group" aria-label="Choose operating system">
      <button class="platform-tab active" type="button" data-platform="mac" aria-pressed="true">macOS</button>
      <button class="platform-tab" type="button" data-platform="windows" aria-pressed="false">Windows</button>
    </div>
    <button class="logout-button" type="button" data-logout>Log out</button>
  </div>
</header>

<div class="docs-shell">
  <aside class="sidebar" aria-label="Docs navigation">
    <nav>
      <a class="sidebar-home active" href="#get-started">Home</a>
      <div class="nav-group">
        <p>Get Started</p>
        <a href="#setup-overview">Setup overview</a>
        <a href="#how-setup-works">How setup works</a>
        <a href="#prerequisites">Prerequisites</a>
        <a href="#install-command">Install command</a>
      </div>
      <div class="nav-group">
        <p>Install</p>
        <a href="#installer-prompts">Installer prompts</a>
        <a href="#notion-automations">Notion automations</a>
        <a href="#doctor">Run doctor</a>
      </div>
      <div class="nav-group">
        <p>Reference</p>
        <a href="#security">Security notes</a>
        <a href="#google-drive">Integrate Google Drive</a>
        <a href="#troubleshooting">Troubleshooting</a>
      </div>
    </nav>
  </aside>

  <main class="content">
    <section class="hero" id="get-started">
      <p class="section-kicker">Authenticated as ${escapeHtml(email)}</p>
      <h1>Tiller Custom Portal Guide</h1>
      <p class="lede">Set up a Notion + Tiller render portal. Start with the checklist, then run one terminal command and finish the Notion automations.</p>
    </section>

    <section class="doc-section" id="setup-overview">
      <h2>Setup Overview</h2>
      <div class="quick-grid">
        <div class="mini-card"><strong>1. Prepare Notion</strong><span>Create one blank page, create an internal integration, and share the page with it.</span></div>
        <div class="mini-card"><strong>2. Run installer</strong><span>The installer creates the portal, deploys the Notion Worker, and saves Worker secrets.</span></div>
        <div class="mini-card"><strong>3. Add automations</strong><span>Connect Template, Work Order, and Campaign Action fields to the Worker webhooks.</span></div>
        <div class="mini-card"><strong>4. Validate</strong><span>Run doctor and fix anything missing before handing the portal to a client.</span></div>
      </div>
    </section>

    <section class="doc-section" id="how-setup-works">
      <h2>How Setup Works</h2>
      <p>The setup command asks for your Notion setup page, Notion integration token, portal name, database prefix, and Tiller login. Daily render work happens in Notion after setup.</p>
      <div class="callout tip">
        <strong>Terminal is only for setup</strong>
        <p>After install, users start template syncs, work orders, and campaign renders from Notion Action fields.</p>
      </div>
    </section>

    <section class="doc-section" id="prerequisites">
      <h2>Prerequisites</h2>
      <div class="info-list">
        <div><strong>Notion setup page</strong><span>Create one blank page. The installer builds the portal under that page.</span></div>
        <div><strong>Internal integration token</strong><span>Create one at <a href="https://www.notion.so/profile/integrations/internal" target="_blank" rel="noreferrer">Notion internal integrations</a>, then share the setup page with it.</span></div>
        <div><strong>Notion Workers</strong><span>Enable Workers in Notion workspace settings before installing.</span></div>
        <div><strong>Tiller login</strong><span>Have Tiller email and password ready. They are saved to the Worker, not Notion pages.</span></div>
      </div>
    </section>

    <section class="doc-section" id="install-command">
      <h2>Install Command</h2>
      <p>Copy the command for your operating system. Keep the terminal open while it asks setup questions.</p>
      ${commandCard("bootstrap", "Run installer", "curl -fsSL https://raw.githubusercontent.com/MotionWriter/notion-tiller-portal-public/main/scripts/bootstrap.sh | bash", "irm https://raw.githubusercontent.com/MotionWriter/notion-tiller-portal-public/main/scripts/bootstrap.ps1 | iex")}
    </section>

    <section class="doc-section" id="installer-prompts">
      <h2>Installer Prompts</h2>
      <div class="info-list">
        <div><strong>Setup page URL</strong><span>Paste the blank Notion page URL where the portal should be created.</span></div>
        <div><strong>Integration token</strong><span>Paste the Notion internal integration token. Make sure the setup page is shared with that integration first.</span></div>
        <div><strong>Portal names</strong><span>Choose the portal page name and database prefix shown in Notion.</span></div>
        <div><strong>Tiller login</strong><span>Used to authenticate and save Worker credentials.</span></div>
      </div>
    </section>

    <section class="doc-section" id="notion-automations">
      <h2>Notion Automations</h2>
      <p>Add one automation per database. Each Send webhook action should leave custom headers empty and select all existing properties.</p>
      <div class="link-grid">
        <div class="reference-card info-card"><strong>Templates</strong><span>Action changes -> use webhook: templateAction</span></div>
        <div class="reference-card info-card"><strong>Work Orders</strong><span>Action changes -> use webhook: workOrderAction</span></div>
        <div class="reference-card info-card"><strong>Campaigns</strong><span>Action changes -> use webhook: campaignAction</span></div>
      </div>
      <h3>Recipe</h3>
      <div class="info-list">
        <div><strong>1. Open database</strong><span>Open Templates, Work Orders, or Campaigns.</span></div>
        <div><strong>2. Add automation</strong><span>Trigger when Action is set to a supported value.</span></div>
        <div><strong>3. Send webhook</strong><span>Paste the matching webhook URL, leave custom headers empty, and select all existing properties.</span></div>
      </div>
    </section>

    <section class="doc-section" id="doctor">
      <h2>Run Doctor</h2>
      <p>Use doctor after install or whenever something feels broken.</p>
      <div class="command-list">
        ${commandCard("doctor", "Run doctor", "npm exec --yes --package=github:MotionWriter/notion-tiller-portal-public#main -- notion-tiller-portal doctor", "npm.cmd exec --yes --package=github:MotionWriter/notion-tiller-portal-public#main -- notion-tiller-portal doctor")}
        ${commandCard("credentials", "Update Tiller credentials", "npm exec --yes --package=github:MotionWriter/notion-tiller-portal-public#main -- notion-tiller-portal credentials", "npm.cmd exec --yes --package=github:MotionWriter/notion-tiller-portal-public#main -- notion-tiller-portal credentials")}
        ${commandCard("webhooks", "List webhook URLs", "npm exec --yes --package=github:MotionWriter/notion-tiller-portal-public#main -- notion-tiller-portal webhooks", "npm.cmd exec --yes --package=github:MotionWriter/notion-tiller-portal-public#main -- notion-tiller-portal webhooks")}
      </div>
    </section>

    <section class="doc-section" id="security">
      <h2>Security Notes</h2>
      <div class="callout warning">
        <strong>Do not paste secrets into Notion pages</strong>
        <p>Tiller passwords, Notion tokens, and Google credentials belong in Worker secrets through the installer or CLI commands.</p>
      </div>
      <div class="info-list">
        <div><strong>Tiller login</strong><span>Used to unlock this guide and save credentials to the deployed Worker.</span></div>
        <div><strong>Session</strong><span>This guide keeps users signed in with a secure cookie for seven days, unless they log out.</span></div>
        <div><strong>Worker secrets</strong><span>Stored outside Notion pages. Use maintenance commands to update them.</span></div>
      </div>
    </section>

    <section class="doc-section optional-section" id="google-drive">
      <p class="section-kicker">Optional</p>
      <h2>Integrate Google Drive</h2>
      <p>Google Drive is only needed when template or work order assets live in Drive folders. It is separate from the core Notion setup.</p>
      <div class="callout note">
        <strong>Skip this unless you need Drive folders</strong>
        <p>Notion setup, template upload, and Worker deployment do not require Google Drive.</p>
      </div>
      <div class="quick-grid">
        <div class="mini-card"><strong>Public folder links</strong><span>Use a Google Drive API key when folders are shared as anyone-with-link. No OAuth scope is needed.</span></div>
        <div class="mini-card"><strong>Private folders or output uploads</strong><span>Use OAuth credentials and a refresh token. Private reads need Drive readonly scope. Output uploads need Drive file scope.</span></div>
      </div>
      <h3>Output folders</h3>
      <div class="info-list">
        <div><strong>1. Save OAuth credentials</strong><span>Run the Google Drive command and add OAuth credentials with scope https://www.googleapis.com/auth/drive.file.</span></div>
        <div><strong>2. Choose output folder</strong><span>Paste the target Google Drive folder URL into the Work Order field Download Renders Here.</span></div>
        <div><strong>3. Submit or download</strong><span>Submit the render or run Download Results. Finished files attach to Notion Render Outputs and are copied to Drive when upload succeeds.</span></div>
        <div><strong>4. Fix failures</strong><span>If Drive upload fails, Notion outputs are still created and the Render Output Last Error explains what to fix.</span></div>
      </div>
      <div class="callout tip">
        <strong>Input vs output folders</strong>
        <p>Use Template Assets URL for input assets. Use Download Renders Here for output folders.</p>
      </div>
      <h3>API key walkthrough</h3>
      <div class="info-list">
        <div><strong>1. Open Google Cloud credentials</strong><span><a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noreferrer">Create or manage API keys.</a></span></div>
        <div><strong>2. Enable Google Drive API</strong><span><a href="https://console.cloud.google.com/apis/library/drive.googleapis.com" target="_blank" rel="noreferrer">Open Drive API library</a> and enable it for the project.</span></div>
        <div><strong>3. Create an API key</strong><span>Restrict it to Google Drive API when possible. Use this for public folder asset reads.</span></div>
        <div><strong>4. Save it to the Worker</strong><span>Run the Google Drive command below. Do not paste API keys into Notion pages.</span></div>
      </div>
      ${commandCard("google-drive", "Set up Google Drive", "npm exec --yes --package=github:MotionWriter/notion-tiller-portal-public#main -- notion-tiller-portal google-drive", "npm.cmd exec --yes --package=github:MotionWriter/notion-tiller-portal-public#main -- notion-tiller-portal google-drive")}
      <h3>AI helper prompt</h3>
      <div class="prompt-box">
        <strong>Paste this into an AI chat if you want guided Google setup</strong>
        <p>Walk me through creating a Google Cloud API key for Google Drive folder reads. I need the Google Drive API enabled, an API key restricted to Drive if possible, and guidance for public anyone-with-link folders. Do not ask me to paste secrets into Notion.</p>
      </div>
    </section>

    <section class="doc-section" id="troubleshooting">
      <h2>Troubleshooting</h2>
      <div class="troubleshooting-list">
        <div class="trouble-row"><strong>Refresh asks me to log in again</strong><span>Deployment needs a stable TILLER_PORTAL_SESSION_SECRET Worker secret.</span></div>
        <div class="trouble-row"><strong>Notion page not found</strong><span>Share the setup page with the Notion internal integration, then rerun installer.</span></div>
        <div class="trouble-row"><strong>Webhook did nothing</strong><span>Check matching webhook URL, select all properties, and run the webhooks command.</span></div>
        <div class="trouble-row"><strong>Tiller auth failed later</strong><span>Run the credentials command and update Tiller email/password.</span></div>
      </div>
    </section>
  </main>

  <aside class="toc" aria-label="On this page">
    <p>On This Page</p>
    <a href="#setup-overview">Setup Overview</a>
    <a href="#prerequisites">Prerequisites</a>
    <a href="#install-command">Install Command</a>
    <a href="#notion-automations">Notion Automations</a>
    <a href="#doctor">Run Doctor</a>
    <a href="#security">Security Notes</a>
    <a href="#google-drive">Integrate Google Drive</a>
    <a href="#troubleshooting">Troubleshooting</a>
  </aside>
</div>`;
}

function commandCard(key: string, label: string, macCommand: string, windowsCommand: string) {
  return `<div class="command-card">
    <div class="command-heading">
      <span>${escapeHtml(label)}</span>
      <button class="copy-button" type="button" data-copy-key="${escapeHtml(key)}" data-copy-target="${escapeHtml(key)}-mac">Copy</button>
    </div>
    <pre data-command-platform="mac"><code id="${escapeHtml(key)}-mac">${escapeHtml(macCommand)}</code></pre>
    <pre data-command-platform="windows" hidden><code id="${escapeHtml(key)}-windows">${escapeHtml(windowsCommand)}</code></pre>
  </div>`;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

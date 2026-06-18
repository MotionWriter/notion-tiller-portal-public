import { FormEvent, useEffect, useState } from "react";
import "./App.css";

type LoginState = "idle" | "loading" | "authenticated" | "error";

const sessionKey = "tillerPortalSession";

function App() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<LoginState>("idle");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const saved = window.localStorage.getItem(sessionKey);
    if (saved) {
      setEmail(saved);
      setStatus("authenticated");
    }
  }, []);

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("loading");
    setMessage("");

    try {
      const response = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await response.json() as { ok?: boolean; message?: string };
      if (!response.ok || !data.ok) {
        throw new Error(data.message || "Tiller login failed.");
      }

      window.localStorage.setItem(sessionKey, email);
      setPassword("");
      setStatus("authenticated");
      setMessage("Authenticated with Tiller.");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Tiller login failed.");
    }
  }

  function logout() {
    window.localStorage.removeItem(sessionKey);
    setPassword("");
    setStatus("idle");
    setMessage("");
  }

  if (status !== "authenticated") {
    return (
      <main className="login-shell">
        <section className="login-card">
          <p className="eyebrow">Tiller Custom Portal</p>
          <h1>Sign in with Tiller</h1>
          <p className="lede">
            Use your Tiller email and password to unlock the setup guide. Credentials are checked with Tiller and are not stored by this page.
          </p>

          <form onSubmit={handleLogin} className="login-form">
            <label>
              Tiller email
              <input
                autoComplete="email"
                inputMode="email"
                required
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
              />
            </label>

            <label>
              Tiller password
              <input
                autoComplete="current-password"
                required
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Password"
              />
            </label>

            <button type="submit" disabled={status === "loading"}>
              {status === "loading" ? "Checking Tiller..." : "Unlock setup guide"}
            </button>
          </form>

          {message && <p className={`form-message ${status === "error" ? "error" : ""}`}>{message}</p>}
        </section>
      </main>
    );
  }

  return (
    <main className="guide-shell">
      <header className="guide-header">
        <div>
          <p className="eyebrow">Authenticated</p>
          <h1>Tiller Custom Portal Setup</h1>
          <p className="lede">Follow these steps to connect Notion Workers to your Tiller account.</p>
        </div>
        <button className="secondary-button" onClick={logout}>Log out</button>
      </header>

      <section className="steps-grid">
        <article>
          <span>1</span>
          <h2>Create a Notion page</h2>
          <p>Create one blank Notion page. The installer builds the portal inside that page.</p>
        </article>
        <article>
          <span>2</span>
          <h2>Run the bootstrap</h2>
          <p>Use the macOS or Windows command from the public guide. Terminal is only for setup.</p>
        </article>
        <article>
          <span>3</span>
          <h2>Authorize Notion</h2>
          <p>Approve the Notion CLI code in the browser, then let the script continue.</p>
        </article>
        <article>
          <span>4</span>
          <h2>Finish automations</h2>
          <p>Add the generated webhook URLs to the Template, Work Order, and Campaign action automations.</p>
        </article>
      </section>

      <section className="command-panel">
        <h2>Start setup</h2>
        <p>Pick the command for the user's operating system in the setup guide.</p>
        <code>https://flingit.io/</code>
      </section>
    </main>
  );
}

export default App;

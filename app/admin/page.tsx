"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import styles from "./admin.module.css";

type CookieStatus = "unknown" | "valid" | "expired";

type CookieRecord = {
  id: string;
  label: string;
  status: CookieStatus;
  active: boolean;
  createdAt: string;
  checkedAt: string | null;
};

type CookieAction =
  | "add"
  | "replace"
  | "check"
  | "activate"
  | "remove";

async function readResponse(response: Response) {
  const data = (await response.json()) as {
    error?: string;
    cookies?: CookieRecord[];
  };

  if (!response.ok) {
    throw new Error(data.error || "Request failed");
  }

  return data;
}

function formatDate(value: string | null) {
  if (!value) {
    return "Not checked";
  }

  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export default function AdminPage() {
  const [cookies, setCookies] = useState<CookieRecord[]>([]);
  const [password, setPassword] = useState("");
  const [label, setLabel] = useState("");
  const [cookieInput, setCookieInput] = useState("");
  const [replaceId, setReplaceId] = useState<string | null>(null);
  const [replaceLabel, setReplaceLabel] = useState("");
  const [replaceValue, setReplaceValue] = useState("");
  const [loggedIn, setLoggedIn] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    void loadCookies();
  }, []);

  async function loadCookies() {
    setLoading(true);

    try {
      const response = await fetch("/api/admin/cookies", {
        cache: "no-store",
      });

      if (response.status === 401) {
        setLoggedIn(false);
        return;
      }

      const data = await readResponse(response);
      setCookies(data.cookies || []);
      setLoggedIn(true);
      setError("");
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to load admin data"
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleLogin(event: FormEvent) {
    event.preventDefault();
    setBusy("login");
    setError("");

    try {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      await readResponse(response);
      setPassword("");
      setLoggedIn(true);
      await loadCookies();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to sign in"
      );
    } finally {
      setBusy("");
    }
  }

  async function runAction(
    action: CookieAction,
    values: Record<string, unknown>,
    successMessage: string,
    busyId: string = action
  ) {
    setBusy(busyId);
    setError("");
    setNotice("");

    try {
      const response = await fetch("/api/admin/cookies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...values }),
      });
      const data = await readResponse(response);

      if (data.cookies) {
        setCookies(data.cookies);
      }

      setNotice(successMessage);

      return true;
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to complete the request"
      );

      return false;
    } finally {
      setBusy("");
    }
  }

  async function handleAdd(event: FormEvent) {
    event.preventDefault();

    const entries = cookieInput
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line, index) => {
        const [entryLabel, ...cookieParts] = line.split("\t");
        const hasLabel = cookieParts.length > 0;

        return {
          label:
            (hasLabel ? entryLabel.trim() : "") ||
            label.trim() ||
            `Cookie ${cookies.length + index + 1}`,
          cookie: (hasLabel ? cookieParts.join("\t") : line).trim(),
        };
      });

    if (!entries.length) {
      setError("Paste at least one cookie value.");
      return;
    }

    const success = await runAction(
      "add",
      { items: entries },
      `${entries.length} cookie${entries.length === 1 ? "" : "s"} added.`
    );

    if (success) {
      setLabel("");
      setCookieInput("");
    }
  }

  async function handleReplace(event: FormEvent) {
    event.preventDefault();

    if (!replaceId) {
      return;
    }

    const success = await runAction(
      "replace",
      {
        id: replaceId,
        label: replaceLabel,
        cookie: replaceValue,
      },
      "Cookie replaced. Check it before selecting it."
    );

    if (success) {
      setReplaceId(null);
      setReplaceLabel("");
      setReplaceValue("");
    }
  }

  async function signOut() {
    setBusy("logout");
    setError("");

    try {
      const response = await fetch("/api/admin/login", { method: "DELETE" });
      await readResponse(response);
      setLoggedIn(false);
      setCookies([]);
      setNotice("");
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to sign out"
      );
    } finally {
      setBusy("");
    }
  }

  const activeCookie = cookies.find((cookie) => cookie.active);
  const validCount = cookies.filter(
    (cookie) => cookie.status === "valid"
  ).length;
  const expiredCount = cookies.filter(
    (cookie) => cookie.status === "expired"
  ).length;

  return (
    <main className={`${styles.page} ${!loggedIn ? styles.loginPage : ""}`}>
      <div className={`${styles.shell} ${!loggedIn ? styles.loginShell : ""}`}>
        {loading ? (
          <div className={styles.loading}>
            <span className={styles.spinner} aria-hidden="true" />
            Loading admin panel...
          </div>
        ) : !loggedIn ? (
          <section className={styles.loginCard}>
            <div className={styles.overline}>
              <span className={styles.statusDot} />
              Secure control room
            </div>
            <h1>Admin Portal</h1>
            <form onSubmit={handleLogin} className={styles.loginForm}>
              <div className={styles.passwordWrap}>
                <input
                  id="admin-password"
                  type={showPassword ? "text" : "password"}
                  aria-label="Admin password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Enter administrator password"
                  required
                />
                <button
                  type="button"
                  className={styles.passwordToggle}
                  onClick={() => setShowPassword((visible) => !visible)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  title={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? (
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M3 3l18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.9 5.2A10.8 10.8 0 0 1 12 5c6.5 0 10 7 10 7a18.5 18.5 0 0 1-3.1 4.1M6.6 6.6C3.6 8.5 2 12 2 12s3.5 7 10 7c1.2 0 2.3-.2 3.3-.6" />
                    </svg>
                  ) : (
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>
              <button
                className={styles.primaryButton}
                type="submit"
                disabled={busy === "login"}
                aria-busy={busy === "login"}
              >
                {busy === "login" ? (
                  <>
                    <span className={styles.spinner} aria-hidden="true" />
                    <span className={styles.authenticating}>
                      Authenticating
                      <span className={styles.authDots} aria-hidden="true">
                        ...
                      </span>
                    </span>
                  </>
                ) : (
                  <>
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <ellipse cx="12" cy="5" rx="9" ry="3" />
                      <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
                    </svg>
                    Access Database
                  </>
                )}
              </button>
            </form>
            {error && (
              <div className={styles.error} role="alert">
                {error}
              </div>
            )}
            <div className={styles.loginHome}>
              <Link className={styles.actionButton} href="/">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2h-4v-8H9v8H5a2 2 0 0 1-2-2z" />
                </svg>
                Back to Homepage
              </Link>
            </div>
          </section>
        ) : (
          <>
            <header className={styles.headerActions}>
              <div>
                <div className={styles.overline}>
                  <span className={styles.statusDot} />
                  Workspace settings
                </div>
                <h1>Cookie Manager</h1>
              </div>
              <div className={styles.headerButtons}>
                <Link className={styles.actionButton} href="/">
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2h-4v-8H9v8H5a2 2 0 0 1-2-2z" />
                  </svg>
                  Home
                </Link>
                <button
                  className={`${styles.actionButton} ${styles.logoutButton}`}
                  type="button"
                  onClick={signOut}
                  disabled={busy === "logout"}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
                  </svg>
                  {busy === "logout" ? "Logging out..." : "Logout"}
                </button>
              </div>
            </header>

            <section className={styles.intro}>
              <div>
                <p>
                  Manage Roblox resolver credentials, check their status, and
                  choose which validated cookie to use.
                </p>
              </div>
              <div className={styles.activeBox}>
                <span className={styles.activeLabel}>CURRENT SELECTION</span>
                <strong>
                  {activeCookie ? activeCookie.label : "Environment fallback"}
                </strong>
                <span
                  className={
                    activeCookie?.status === "expired"
                      ? styles.expiredText
                      : styles.muted
                  }
                >
                  {activeCookie
                    ? activeCookie.status === "expired"
                      ? "Expired — resolver will not switch automatically"
                      : activeCookie.status === "valid"
                        ? "Selected manually"
                        : "Not checked yet"
                    : "Uses COOKIE environment variable if configured"}
                </span>
              </div>
            </section>

            <section className={styles.stats}>
              <div className={styles.statCard}>
                <span>STORED</span>
                <strong>{cookies.length}</strong>
              </div>
              <div className={styles.statCard}>
                <span>VALIDATED</span>
                <strong>{validCount}</strong>
              </div>
              <div className={styles.statCard}>
                <span>EXPIRED</span>
                <strong>{expiredCount}</strong>
              </div>
            </section>

            {error && (
              <div className={styles.error} role="alert">
                {error}
              </div>
            )}
            {notice && <div className={styles.notice}>{notice}</div>}

            <section className={styles.panel}>
              <div className={styles.panelHeader}>
                <div>
                  <h2>Add cookies</h2>
                  <p>Paste one cookie per line, up to 20 at a time.</p>
                </div>
                <span className={styles.limit}>MAX 100</span>
              </div>
              <form onSubmit={handleAdd} className={styles.addForm}>
                <div className={styles.formRow}>
                  <label htmlFor="cookie-label">
                    Default label <span>(optional)</span>
                  </label>
                  <input
                    id="cookie-label"
                    value={label}
                    onChange={(event) => setLabel(event.target.value)}
                    maxLength={60}
                    placeholder="e.g. Main account"
                    autoComplete="off"
                  />
                </div>
                <div className={styles.formRow}>
                  <label htmlFor="cookie-values">Cookie values</label>
                  <textarea
                    id="cookie-values"
                    value={cookieInput}
                    onChange={(event) => setCookieInput(event.target.value)}
                    placeholder="Paste cookie values here. For custom labels, use Label, then a tab, then the cookie."
                    autoComplete="off"
                    spellCheck={false}
                    required
                  />
                </div>
                <div className={styles.formFooter}>
                  <span>Values are never returned to the browser after saving.</span>
                  <button type="submit" disabled={Boolean(busy)}>
                    {busy === "add" ? "Encrypting..." : "Add cookies"}
                  </button>
                </div>
              </form>
            </section>

            <section className={styles.panel}>
              <div className={styles.panelHeader}>
                <div>
                  <h2>Cookie inventory</h2>
                  <p>Only validated cookies can be selected for resolving.</p>
                </div>
                <button
                  type="button"
                  className={styles.textButton}
                  onClick={() => void loadCookies()}
                >
                  Refresh
                </button>
              </div>

              {cookies.length === 0 ? (
                <div className={styles.empty}>
                  No managed cookies yet. Add one above to get started.
                </div>
              ) : (
                <div className={styles.cookieList}>
                  {cookies.map((cookie) => (
                    <article className={styles.cookieRow} key={cookie.id}>
                      <div className={styles.cookieInfo}>
                        <div className={styles.cookieTitle}>
                          <strong>{cookie.label}</strong>
                          {cookie.active && (
                            <span className={styles.activePill}>SELECTED</span>
                          )}
                          <span
                            className={`${styles.status} ${styles[cookie.status]}`}
                          >
                            {cookie.status}
                          </span>
                        </div>
                        <span className={styles.checkedAt}>
                          Checked: {formatDate(cookie.checkedAt)}
                        </span>
                      </div>

                      <div className={styles.actions}>
                        <button
                          type="button"
                          onClick={() =>
                            void runAction(
                              "check",
                              { id: cookie.id },
                              "Cookie validity updated.",
                              `check-${cookie.id}`
                            )
                          }
                          disabled={Boolean(busy)}
                        >
                          {busy === `check-${cookie.id}`
                            ? "Checking..."
                            : "Check"}
                        </button>
                        {!cookie.active && (
                          <button
                            type="button"
                            className={styles.secondary}
                            onClick={() =>
                              void runAction(
                                "activate",
                                { id: cookie.id },
                                `${cookie.label} selected manually.`
                              )
                            }
                            disabled={
                              Boolean(busy) || cookie.status !== "valid"
                            }
                          >
                            Select
                          </button>
                        )}
                        <button
                          type="button"
                          className={styles.secondary}
                          onClick={() => {
                            setReplaceId(cookie.id);
                            setReplaceLabel(cookie.label);
                            setReplaceValue("");
                          }}
                          disabled={Boolean(busy)}
                        >
                          Replace
                        </button>
                        <button
                          type="button"
                          className={styles.dangerButton}
                          onClick={() => {
                            if (
                              window.confirm(
                                `Remove "${cookie.label}"? This cannot be undone.`
                              )
                            ) {
                              void runAction(
                                "remove",
                                { id: cookie.id },
                                "Cookie removed."
                              );
                            }
                          }}
                          disabled={Boolean(busy)}
                        >
                          Remove
                        </button>
                      </div>

                      {replaceId === cookie.id && (
                        <form
                          className={styles.replaceForm}
                          onSubmit={handleReplace}
                        >
                          <div className={styles.formRow}>
                            <label htmlFor={`replace-label-${cookie.id}`}>
                              Label
                            </label>
                            <input
                              id={`replace-label-${cookie.id}`}
                              value={replaceLabel}
                              onChange={(event) =>
                                setReplaceLabel(event.target.value)
                              }
                              maxLength={60}
                              required
                            />
                          </div>
                          <div className={styles.formRow}>
                            <label htmlFor={`replace-value-${cookie.id}`}>
                              New cookie value
                            </label>
                            <input
                              id={`replace-value-${cookie.id}`}
                              type="password"
                              value={replaceValue}
                              onChange={(event) =>
                                setReplaceValue(event.target.value)
                              }
                              autoComplete="new-password"
                              required
                            />
                          </div>
                          <div className={styles.formFooter}>
                            <span>Replaced cookies must be checked again.</span>
                            <div className={styles.inlineButtons}>
                              <button
                                type="button"
                                className={styles.secondary}
                                onClick={() => setReplaceId(null)}
                              >
                                Cancel
                              </button>
                              <button type="submit" disabled={Boolean(busy)}>
                                Replace value
                              </button>
                            </div>
                          </div>
                        </form>
                      )}
                    </article>
                  ))}
                </div>
              )}
            </section>

            <aside className={styles.warning}>
              <strong>No automatic rotation</strong>
              <span>
                If a managed cookie is selected, the resolver uses only that
                cookie. If Roblox rejects it, it is marked expired and
                resolution stops until you replace it or manually select
                another validated cookie.
              </span>
            </aside>
          </>
        )}
      </div>
    </main>
  );
}

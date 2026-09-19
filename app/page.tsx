"use client";

import {
  FormEvent,
  useMemo,
  useRef,
  useState,
} from "react";

type Result = {
  link: string;
  success: boolean;
  id?: string;
  name?: string;
  error?: string;
};

export default function Home() {
  const [mode, setMode] = useState<"single" | "bulk">(
    "single"
  );
  const [input, setInput] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [loading, setLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(
    null
  );
  const [copiedAll, setCopiedAll] = useState(false);
  const [error, setError] = useState("");

  const resultsRef = useRef<HTMLDivElement>(null);

  const links = useMemo(() => {
    return [
      ...new Set(
        input
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter(Boolean)
      ),
    ];
  }, [input]);

  const successCount = results.filter(
    (result) => result.success
  ).length;

  async function handleResolve(event: FormEvent) {
    event.preventDefault();

    setResults([]);
    setError("");
    setCopiedAll(false);
    setCopiedId(null);

    const linksToResolve =
      mode === "single"
        ? [input.trim()].filter(Boolean)
        : links;

    if (linksToResolve.length === 0) {
      setError("Paste at least one Roblox share link.");
      return;
    }

    if (linksToResolve.length > 50) {
      setError("Maximum 50 links per request.");
      return;
    }

    setLoading(true);

    try {
      const response = await fetch("/api/resolve", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          links: linksToResolve,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        setError(
          data.error || "Failed to resolve links."
        );
        return;
      }

      const resolvedResults: Result[] =
        data.results || [];

      setResults(resolvedResults);

      if (mode === "bulk") {
        setTimeout(() => {
          resultsRef.current?.scrollIntoView({
            behavior: "smooth",
            block: "start",
          });
        }, 100);
      }
    } catch {
      setError("Unable to connect to the resolver.");
    } finally {
      setLoading(false);
    }
  }

  async function copyId(id: string) {
    try {
      await navigator.clipboard.writeText(id);

      setCopiedId(id);

      setTimeout(() => {
        setCopiedId(null);
      }, 2000);
    } catch {
      setError("Unable to copy ID to clipboard.");
    }
  }

  async function copyAllIds() {
    const ids = results
      .filter(
        (result) => result.success && result.id
      )
      .map((result) => result.id)
      .join("\n");

    if (!ids) {
      return;
    }

    try {
      await navigator.clipboard.writeText(ids);

      setCopiedAll(true);

      setTimeout(() => {
        setCopiedAll(false);
      }, 2000);
    } catch {
      setError("Unable to copy IDs to clipboard.");
    }
  }

  function clearAll() {
    setInput("");
    setResults([]);
    setError("");
    setCopiedId(null);
    setCopiedAll(false);
  }

  function handleInputChange(value: string) {
    if (!value.trim()) {
      clearAll();
      return;
    }

    setInput(value);
  }

  function changeMode(nextMode: "single" | "bulk") {
    setMode(nextMode);
    setInput("");
    setResults([]);
    setError("");
    setCopiedId(null);
    setCopiedAll(false);
  }

  return (
    <main className={`page ${mode}-mode`}>
      <div className="container">
        <section className="hero">
          <p className="eyebrow">
            <span className="eyebrow-dot" />
            ROBLOX SHARE LINK RESOLVER
          </p>

          <h1>
            <span>Ro-Link</span> Resolver
          </h1>

          <p className="description">
            Convert Roblox Share Links into their
            corresponding Roblox IDs quickly and
            efficiently.
          </p>

          <div className="mode-switch">
            <button
              type="button"
              className={
                mode === "single" ? "active" : ""
              }
              onClick={() => changeMode("single")}
              disabled={loading}
            >
              Single
            </button>

            <button
              type="button"
              className={
                mode === "bulk" ? "active" : ""
              }
              onClick={() => changeMode("bulk")}
              disabled={loading}
            >
              Bulk
            </button>
          </div>

          <form
            onSubmit={handleResolve}
            className="resolver"
          >
            <label htmlFor="share-link">
              {mode === "single"
                ? "Roblox Share Link"
                : "Roblox Share Links"}
            </label>

            {mode === "single" ? (
              <div className="input-row">
                <input
                  id="share-link"
                  type="url"
                  placeholder="https://www.roblox.com/share?code=..."
                  value={input}
                  onChange={(event) =>
                    handleInputChange(event.target.value)
                  }
                  disabled={loading}
                />

                <button
                  type="submit"
                  disabled={loading}
                >
                  {loading
                    ? "Resolving..."
                    : "Resolve"}
                </button>
              </div>
            ) : (
              <>
                <textarea
                  id="share-link"
                  placeholder={
                    "Paste one Roblox share link per line...\n\nhttps://www.roblox.com/share?code=...\nhttps://www.roblox.com/share?code=...\nhttps://www.roblox.com/share?code=..."
                  }
                  value={input}
                  onChange={(event) =>
                    handleInputChange(event.target.value)
                  }
                  disabled={loading}
                  spellCheck={false}
                />

                <div className="bulk-meta">
                  <span>
                    {links.length}{" "}
                    {links.length === 1
                      ? "link"
                      : "links"}
                  </span>

                  <span>Maximum 50</span>
                </div>

                <div className="bulk-actions">
                  <button
                    type="submit"
                    disabled={loading}
                  >
                    {loading
                      ? "Resolving..."
                      : `Resolve ${
                          links.length > 1
                            ? `${links.length} Links`
                            : "Links"
                        }`}
                  </button>

                  {input && !loading && (
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={clearAll}
                    >
                      Clear
                    </button>
                  )}
                </div>
              </>
            )}
          </form>

          {loading && mode === "bulk" && (
            <div className="loading-box">
              <div className="loading-spinner" />

              <div>
                <strong>
                  Resolving links...
                </strong>

                <span>
                  Roblox API requests are being
                  processed.
                </span>
              </div>
            </div>
          )}

          {results.length > 0 && (
            <div
              className="results-section"
              ref={resultsRef}
            >
              <div className="results-header">
                <div>
                  <span className="result-label">
                    RESULTS
                  </span>

                  <strong>
                    {successCount} / {results.length}{" "}
                    resolved
                  </strong>
                </div>

                {successCount > 0 && (
                  <button
                    type="button"
                    className="copy-all-button"
                    onClick={copyAllIds}
                  >
                    {copiedAll
                      ? "Copied All"
                      : "Copy All IDs"}
                  </button>
                )}
              </div>

              <div className="results-list">
                {results.map((result, index) => (
                  <div
                    className="result-row"
                    key={`${result.link}-${index}`}
                  >
                    <div className="result-number">
                      {String(index + 1).padStart(
                        2,
                        "0"
                      )}
                    </div>

                    <div className="result-link">
                      {result.name && (
                        <strong>{result.name}</strong>
                      )}

                      <span>{result.link}</span>
                    </div>

                    <div className="result-id">
                      {result.success && result.id ? (
                        <>
                          <strong>
                            {result.id}
                          </strong>

                          <button
                            type="button"
                            className={
                              copiedId === result.id
                                ? "copied"
                                : ""
                            }
                            onClick={() =>
                              copyId(result.id!)
                            }
                          >
                            {copiedId === result.id
                              ? "Copied"
                              : "Copy"}
                          </button>
                        </>
                      ) : (
                        <span className="failed">
                          {result.error || "Failed"}
                        </span>
                      )}
                    </div>

                    <div
                      className={
                        result.success
                          ? "status success"
                          : "status failed-status"
                      }
                    >
                      {result.success ? "✓" : "×"}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {error && (
            <div className="error">
              {error}
            </div>
          )}

          <div className="info">
            <span>50 links max</span>
            <span>•</span>
            <span>One link per line</span>
            <span>•</span>
            <span>
              Duplicates removed automatically
            </span>
          </div>
        </section>
      </div>
    </main>
  );
}
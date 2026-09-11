import { useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import type { FunctionReturnType } from "convex/server";
import type { Id } from "../../convex/_generated/dataModel";
import { api } from "../../convex/_generated/api";
import { backend } from "../lib/convex-client";
import { Brand } from "../components/site-chrome";
import { useQuery } from "convex/react";

export const Route = createFileRoute("/admin")({ component: AdminPage });
function AdminPage() {
  const [token, setToken] = useState("");
  const [result, setResult] = useState<FunctionReturnType<
    typeof api.admin.queue
  > | null>(null);
  const [selected, setSelected] = useState<Id<"resourceCandidates">[]>([]);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<"pending" | "approved" | "rejected">(
    "pending",
  );
  async function load(cursor: string | null = null, nextStatus = status) {
    if (!backend) {
      setError("Backend is not configured.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      setResult(
        await backend.query(api.admin.queue, {
          token: token.trim(),
          status: nextStatus,
          paginationOpts: { cursor, numItems: 20 },
        }),
      );
      setToken(token.trim());
      setStatus(nextStatus);
      setSelected([]);
    } catch {
      setError(
        "Cannot open the queue. Check administrator access and the backend connection.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function decide(decision: "approved" | "rejected") {
    if (!backend) return;
    setBusy(true);
    setError("");
    try {
      await backend.mutation(api.admin.decide, {
        token,
        ids: selected,
        decision,
        reason,
      });
      setReason("");
      await load();
    } catch {
      setError(
        "Decision was not saved. Check the review reason and confirm that selected offers have valid, unexpired claim links.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="app-shell admin-shell">
      <header className="admin-header">
        <Brand />
        <Link to="/" className="text-link">
          View website
        </Link>
      </header>
      <main
        className={`inner-page ${result ? "admin-workspace" : "admin-login"}`}
      >
        <div className="page-heading">
          <h1>{result ? "Review queue" : "Administrator access"}</h1>
          <p>
            {result
              ? "Check the source and terms, then select offers to review."
              : "Sign in to review submissions and manage failed extractions."}
          </p>
        </div>
        {!result ? (
          <form
            className="submission-panel admin-login-form"
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              if (!token.trim()) {
                setError(
                  "Enter your administrator token to open the review queue.",
                );
                return;
              }
              if (token.trim().length < 32) {
                setError(
                  "This token is incomplete. Enter your full administrator token.",
                );
                return;
              }
              void load();
            }}
          >
            <label htmlFor="admin-token">Administrator token</label>
            <input
              id="admin-token"
              type="password"
              value={token}
              onChange={(event) => {
                setToken(event.target.value);
                if (error) setError("");
              }}
              autoComplete="off"
              aria-invalid={Boolean(error)}
              aria-describedby={error ? "admin-error" : "admin-token-help"}
            />
            <p id="admin-token-help" className="form-help">
              Use your private administrator token. It is kept only in this tab.
            </p>
            {error && (
              <p id="admin-error" className="form-error" role="alert">
                {error}
              </p>
            )}
            <button
              type="submit"
              className="button button-primary"
              disabled={busy}
            >
              {busy ? "Opening queue…" : "Open review queue"}
            </button>
          </form>
        ) : (
          <>
            {error && (
              <p id="admin-error" className="form-error" role="alert">
                {error}
              </p>
            )}
            <div className="admin-toolbar">
              <div className="feed-tabs">
                {(["pending", "approved", "rejected"] as const).map((value) => (
                  <button
                    key={value}
                    aria-pressed={status === value}
                    className={status === value ? "active" : ""}
                    disabled={busy}
                    onClick={() => void load(null, value)}
                  >
                    {value === "pending" ? "Needs review" : value}
                  </button>
                ))}
              </div>
              <button
                className="button"
                disabled={busy}
                onClick={() => {
                  setResult(null);
                  setToken("");
                  setSelected([]);
                  setReason("");
                  setError("");
                }}
              >
                Sign out
              </button>
            </div>
            {result.page.map((item) => (
              <article
                key={item.id}
                className={`candidate-row ${status === "pending" ? "selectable-candidate" : ""}`}
              >
                {status === "pending" && (
                  <input
                    aria-label={`Select ${item.title}`}
                    type="checkbox"
                    checked={selected.includes(item.id)}
                    onChange={(event) =>
                      setSelected(
                        event.target.checked
                          ? [...selected, item.id]
                          : selected.filter((id) => id !== item.id),
                      )
                    }
                  />
                )}
                <div className="candidate-copy">
                  <div className="candidate-meta">
                    {item.logoUrl && (
                      <img
                        src={item.logoUrl}
                        width="24"
                        height="24"
                        alt=""
                        loading="lazy"
                        onError={(event) => {
                          event.currentTarget.hidden = true;
                        }}
                      />
                    )}
                    <span>{item.provider}</span>
                    <span>{item.value}</span>
                  </div>
                  <h2>{item.title}</h2>
                  <p>{item.reasons.join(" · ")}</p>
                  <p>Eligibility: {item.eligibility.join(", ") || "Unknown"}</p>
                  <ul>
                    {item.terms.map((term) => (
                      <li key={term}>{term}</li>
                    ))}
                  </ul>
                  <blockquote>
                    {item.evidence || "No evidence extracted."}
                  </blockquote>
                  <a
                    href={item.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Inspect original source ↗
                  </a>
                  {item.claimUrl.startsWith("https://") && (
                    <p>
                      <a
                        href={item.claimUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Inspect claim page ↗
                      </a>
                    </p>
                  )}
                  {item.imageUrl && (
                    <img
                      src={item.imageUrl}
                      alt={`${item.provider} offer preview`}
                      loading="lazy"
                      referrerPolicy="no-referrer"
                      style={{
                        maxWidth: "min(280px, 100%)",
                        maxHeight: 160,
                        objectFit: "contain",
                      }}
                      onError={(event) => {
                        event.currentTarget.hidden = true;
                      }}
                    />
                  )}
                </div>
              </article>
            ))}
            {!result.page.length && (
              <div className="empty-state">
                <h2>Nothing waiting here.</h2>
                <p>
                  New candidates appear after their source has been checked.
                </p>
              </div>
            )}
            {status === "pending" && result.page.length > 0 && (
              <div className="review-controls">
                <label htmlFor="review-reason">
                  Review reason ({selected.length} selected)
                </label>
                <input
                  id="review-reason"
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  minLength={8}
                  maxLength={500}
                  placeholder="What did you verify?"
                />
                <button
                  className="button button-primary"
                  disabled={
                    busy || !selected.length || reason.trim().length < 8
                  }
                  onClick={() => void decide("approved")}
                >
                  Approve selected
                </button>
                <button
                  className="button"
                  disabled={
                    busy || !selected.length || reason.trim().length < 8
                  }
                  onClick={() => void decide("rejected")}
                >
                  Reject selected
                </button>
              </div>
            )}
            <div className="admin-toolbar">
              <button
                className="button"
                disabled={busy}
                onClick={() => void load()}
              >
                First page / refresh
              </button>
              <button
                className="button"
                disabled={busy || result.isDone}
                onClick={() => void load(result.continueCursor)}
              >
                Next page
              </button>
            </div>
          </>
        )}
        {result && <FailedJobs token={token} />}
        {result && (
          <details className="admin-activity">
            <summary>
              Discovery activity{" "}
              <span>Search history and duplicate counts</span>
            </summary>
            <DiscoveryStatus token={token} />
          </details>
        )}
      </main>
    </div>
  );
}

function DiscoveryStatus({ token }: { token: string }) {
  const data = useQuery(api.admin.discoveryStatus, { token });
  return (
    <section className="detail-section" aria-label="Automatic discovery">
      <h2>Automatic discovery</h2>
      {!data ? (
        <p role="status">Loading discovery activity…</p>
      ) : (
        <>
          <p>
            {data.enabled ? "Active" : "Paused"} ·{" "}
            {data.searches.filter((search) => search.enabled).length} enabled
            searches. Recent public results are checked every three hours. Each
            search checks up to five links.
          </p>
          <p>
            Completed searches send new links for extraction and review. Only
            approved offers appear in the public collection.
          </p>
          {!data.runs.length && <p>No discovery searches have run yet.</p>}
          {data.runs.map((run) => (
            <article className="discovery-run" key={run.id}>
              <div className="candidate-copy">
                <h3>{run.query}</h3>
                <p>
                  {new Date(run.startedAt).toLocaleString()} · {run.status}
                </p>
                <p>
                  {run.found} found · {run.queued} queued · {run.duplicates}{" "}
                  duplicates · {run.limited} skipped by limits
                </p>
                {run.message && (
                  <p className="form-error" role="alert">
                    {run.message}
                  </p>
                )}
              </div>
            </article>
          ))}
        </>
      )}
    </section>
  );
}

function FailedJobs({ token }: { token: string }) {
  const [cursor, setCursor] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const jobs = useQuery(api.admin.failedJobs, {
    token,
    paginationOpts: { cursor, numItems: 10 },
  });
  async function retry(jobId: Id<"intakeJobs">) {
    setBusy(true);
    setError("");
    try {
      if (!backend) throw new Error("Backend unavailable");
      await backend.mutation(api.admin.retry, { token, jobId });
    } catch {
      setError("Retry could not be scheduled. Refresh and try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="admin-failures">
      <h2>Extraction failures</h2>
      <p>
        Failed requests stop after three attempts. Retry after resolving the
        source or service issue.
      </p>
      {!jobs && <p role="status">Loading failed extractions…</p>}
      {jobs?.page.map((job) => (
        <div className="failed-job" key={job.id}>
          <div className="candidate-copy">
            <p>{job.url}</p>
            <p>{job.message}</p>
          </div>
          <button
            className="button"
            disabled={busy}
            onClick={() => void retry(job.id)}
          >
            Retry source
          </button>
        </div>
      ))}
      {jobs && !jobs.page.length && <p>No failed jobs on this page.</p>}
      <div className="admin-toolbar">
        <button
          className="button"
          disabled={!cursor}
          onClick={() => setCursor(null)}
        >
          First page
        </button>
        <button
          className="button"
          disabled={!jobs || jobs.isDone}
          onClick={() => jobs && setCursor(jobs.continueCursor)}
        >
          Next failures
        </button>
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}

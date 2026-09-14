import { useEffect, useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import type { FunctionReturnType } from "convex/server";
import type { Id } from "../../convex/_generated/dataModel";
import { api } from "../../convex/_generated/api";
import { backend } from "../lib/convex-client";
import { Brand } from "../components/site-chrome";
import { useQuery } from "convex/react";
import {
  OFFER_AUDIENCES,
  OFFER_CATEGORIES,
  catalogAudience,
  catalogCategory,
} from "../../convex/lib/categories";

const SESSION_KEY = "perkdrop-admin-session";

function readStoredSession() {
  try {
    const saved = sessionStorage.getItem(SESSION_KEY);
    return saved && /^[a-f0-9]{64}$/.test(saved) ? saved : "";
  } catch {
    return "";
  }
}

const adminDateFormatter = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Kolkata",
});

export const Route = createFileRoute("/admin")({ component: AdminPage });

type ReviewStatus = "pending" | "approved" | "rejected";
type QueueResult = FunctionReturnType<typeof api.admin.queue>;

function useAdminController() {
  const [token, setToken] = useState("");
  const [session, setSession] = useState(readStoredSession);
  const [result, setResult] = useState<QueueResult | null>(null);
  const [selected, setSelected] = useState<Id<"resourceCandidates">[]>([]);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<ReviewStatus>("pending");
  const [categories, setCategories] = useState<Record<string, string>>({});
  const [audiences, setAudiences] = useState<Record<string, string>>({});
  const selectedIds = new Set(selected);
  async function openSession() {
    if (!backend) throw new Error("Backend is not configured.");
    if (session) return session;
    const started = await backend.mutation(api.admin.startSession, {
      token: token.trim(),
    });
    sessionStorage.setItem(SESSION_KEY, started.session);
    setSession(started.session);
    setToken("");
    return started.session;
  }
  async function load(cursor: string | null = null, nextStatus = status) {
    if (!backend) {
      setError("Backend is not configured.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const active = await openSession();
      const page = await backend.query(api.admin.queue, {
        session: active,
        status: nextStatus,
        paginationOpts: { cursor, numItems: 20 },
      });
      setResult(page);
      setStatus(nextStatus);
      setSelected([]);
      setCategories((current) => {
        const next = { ...current };
        for (const item of page.page)
          next[item.id] = catalogCategory(next[item.id] ?? item.category);
        return next;
      });
      setAudiences((current) => {
        const next = { ...current };
        for (const item of page.page)
          next[item.id] = catalogAudience(next[item.id] ?? item.audience);
        return next;
      });
    } catch {
      sessionStorage.removeItem(SESSION_KEY);
      setSession("");
      setResult(null);
      setError(
        "Cannot open the queue. Check administrator access and the backend connection.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function decide(decision: "approved" | "rejected", ids = selected) {
    if (!backend || !ids.length || !session) return;
    setBusy(true);
    setError("");
    try {
      await backend.mutation(api.admin.decide, {
        session,
        ids,
        decision,
        ...(reason.trim() ? { reason: reason.trim() } : {}),
        categories: ids.map((id) => ({
          id,
          category: catalogCategory(categories[id] ?? ""),
        })),
        audiences: ids.map((id) => ({
          id,
          audience: catalogAudience(audiences[id] ?? ""),
        })),
      });
      setReason("");
      await load();
    } catch {
      setError("Decision was not saved. Check the claim link and try again.");
    } finally {
      setBusy(false);
    }
  }
  async function reopen(ids = selected) {
    if (!backend || !ids.length || !session) return;
    setBusy(true);
    setError("");
    try {
      await backend.mutation(api.admin.reopen, { session, ids });
      setSelected([]);
      await load();
    } catch {
      setError(
        "Could not return those offers to review. Refresh and try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function signOut() {
    if (backend && session)
      await backend.mutation(api.admin.endSession, { session }).catch(() => {});
    sessionStorage.removeItem(SESSION_KEY);
    setSession("");
    setResult(null);
    setSelected([]);
    setError("");
  }
  useEffect(() => {
    if (session) void load();
  }, []);
  return {
    audiences,
    busy,
    categories,
    decide,
    error,
    load,
    reason,
    reopen,
    result,
    selected,
    selectedIds,
    session,
    setAudiences,
    setCategories,
    setError,
    setReason,
    setResult,
    setSelected,
    setToken,
    signOut,
    status,
    token,
  };
}

function AdminPage() {
  const {
    audiences,
    busy,
    categories,
    decide,
    error,
    load,
    reason,
    reopen,
    result,
    selected,
    selectedIds,
    setAudiences,
    setCategories,
    setError,
    setReason,
    setResult,
    setSelected,
    session,
    setToken,
    signOut,
    status,
    token,
  } = useAdminController();
  return (
    <div className="app-shell admin-shell">
      <header className="admin-header">
        <Brand />
        <div className="admin-header-links">
          {result && (
            <button
              type="button"
              className="text-link"
              onClick={() => void signOut()}
            >
              Sign out
            </button>
          )}
          <Link to="/" className="text-link">
            View website
          </Link>
        </div>
      </header>
      <main
        className={`inner-page ${result ? "admin-workspace" : "admin-login"}`}
      >
        <div className="page-heading">
          <h1>{result || session ? "Review queue" : "Administrator access"}</h1>
          <p>
            {result
              ? "Check the source and terms, then select offers to review."
              : session
                ? "Restoring this tab's administrator session."
                : "Sign in to review submissions and manage failed extractions."}
          </p>
        </div>
        {!result && !session && (
          <p className="demo-entry">
            <Link to="/reviewer-demo" className="button">
              Try reviewer demo
            </Link>
            <span>
              No administrator credentials needed. Demo decisions never change
              live offers.
            </span>
          </p>
        )}
        {!result && session ? (
          <p className="submission-panel" role="status">
            Opening queue…
          </p>
        ) : !result ? (
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
              The token is used once to start a 12-hour session in this tab.
              Later requests send the session, not the token.
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
                    {value === "pending"
                      ? "Needs review"
                      : value === "approved"
                        ? "Approved"
                        : "Rejected"}
                  </button>
                ))}
              </div>
              <button
                className="button"
                disabled={busy}
                onClick={() => void signOut()}
              >
                Sign out
              </button>
            </div>
            {result.page.map((item) => (
              <article
                key={item.id}
                className={`candidate-row ${status === "pending" || status === "rejected" ? "selectable-candidate" : ""}`}
              >
                {(status === "pending" || status === "rejected") && (
                  <input
                    aria-label={`Select ${item.title}`}
                    type="checkbox"
                    checked={selectedIds.has(item.id)}
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
                  {item.lastReason && status !== "pending" && (
                    <p>Last review: {item.lastReason}</p>
                  )}
                  {status === "pending" && (
                    <div className="admin-placement">
                      <label className="admin-category">
                        Homepage category
                        <select
                          value={catalogCategory(
                            categories[item.id] ?? item.category,
                          )}
                          onChange={(event) =>
                            setCategories((current) => ({
                              ...current,
                              [item.id]: event.target.value,
                            }))
                          }
                        >
                          {OFFER_CATEGORIES.map((category) => (
                            <option key={category} value={category}>
                              {category}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="admin-category">
                        Homepage audience
                        <select
                          value={catalogAudience(
                            audiences[item.id] ?? item.audience,
                          )}
                          onChange={(event) =>
                            setAudiences((current) => ({
                              ...current,
                              [item.id]: event.target.value,
                            }))
                          }
                        >
                          {OFFER_AUDIENCES.map((audience) => (
                            <option key={audience} value={audience}>
                              {audience}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                  )}
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
                  {status === "pending" && (
                    <div className="candidate-actions">
                      <button
                        className="button button-primary"
                        disabled={busy}
                        onClick={() => void decide("approved", [item.id])}
                      >
                        Approve
                      </button>
                      <button
                        className="button"
                        disabled={busy}
                        onClick={() => void decide("rejected", [item.id])}
                      >
                        Reject
                      </button>
                    </div>
                  )}
                  {status === "rejected" && (
                    <div className="candidate-actions">
                      <button
                        className="button button-primary"
                        disabled={busy}
                        onClick={() => void reopen([item.id])}
                      >
                        Return to review
                      </button>
                    </div>
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
                <button
                  className="button"
                  disabled={busy}
                  onClick={() =>
                    setSelected(result.page.map((item) => item.id))
                  }
                >
                  Select all on this page
                </button>
                <label htmlFor="review-reason">
                  Optional note ({selected.length} selected)
                </label>
                <input
                  id="review-reason"
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  maxLength={500}
                  placeholder="Optional. Approve or reject on the card if you prefer."
                />
                <button
                  className="button button-primary"
                  disabled={busy || !selected.length}
                  onClick={() => void decide("approved")}
                >
                  Approve selected
                </button>
                <button
                  className="button"
                  disabled={busy || !selected.length}
                  onClick={() => void decide("rejected")}
                >
                  Reject selected
                </button>
              </div>
            )}
            {status === "rejected" && result.page.length > 0 && (
              <div className="review-controls">
                <p>
                  {selected.length} selected. Send a rejected find back to Needs
                  review if the extraction was wrong.
                </p>
                <button
                  className="button button-primary"
                  disabled={busy || !selected.length}
                  onClick={() => void reopen()}
                >
                  Return to review
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
                className="button button-primary"
                disabled={busy || result.isDone}
                onClick={() => void load(result.continueCursor)}
              >
                Next page
              </button>
            </div>
          </>
        )}
        {result && session && <LiveCatalog session={session} />}
        {result && session && <FailedJobs session={session} />}
        {result && session && (
          <details className="admin-activity">
            <summary>
              Discovery activity{" "}
              <span>Search history and duplicate counts</span>
            </summary>
            <DiscoveryStatus session={session} />
          </details>
        )}
      </main>
    </div>
  );
}

function LiveCatalog({ session }: { session: string }) {
  const [cursor, setCursor] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const offers = useQuery(api.admin.liveOffers, {
    session,
    paginationOpts: { cursor, numItems: 10 },
  });
  async function unpublish(resourceId: Id<"resources">) {
    if (!backend) return;
    setBusy(true);
    setError("");
    try {
      await backend.mutation(api.admin.unpublish, { session, resourceId });
    } catch {
      setError("That offer could not be removed. Refresh and try again.");
    } finally {
      setBusy(false);
    }
  }
  async function recategorize(
    resourceId: Id<"resources">,
    category: string,
    audience: string,
  ) {
    if (!backend) return;
    setBusy(true);
    setError("");
    try {
      await backend.mutation(api.admin.recategorize, {
        session,
        resourceId,
        category,
        audience,
      });
    } catch {
      setError("Category or audience was not saved. Refresh and try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="admin-live">
      <h2>Live catalog</h2>
      <p>
        These offers are on the homepage. Set the category so the right filter
        shows them, or take one down if the claim is broken.
      </p>
      {!offers && <p role="status">Loading published offers…</p>}
      {offers?.page.map((item) => (
        <div className="failed-job" key={item.resourceId}>
          <div className="candidate-copy">
            <p>
              {item.provider} · {item.title}
            </p>
            <p>{item.claimUrl || item.slug}</p>
            <div className="admin-placement">
              <label className="admin-category">
                Homepage category
                <select
                  value={catalogCategory(item.category)}
                  disabled={busy}
                  onChange={(event) =>
                    void recategorize(
                      item.resourceId,
                      event.target.value,
                      item.audience,
                    )
                  }
                >
                  {OFFER_CATEGORIES.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
              </label>
              <label className="admin-category">
                Homepage audience
                <select
                  value={catalogAudience(item.audience)}
                  disabled={busy}
                  onChange={(event) =>
                    void recategorize(
                      item.resourceId,
                      item.category,
                      event.target.value,
                    )
                  }
                >
                  {OFFER_AUDIENCES.map((audience) => (
                    <option key={audience} value={audience}>
                      {audience}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>
          <button
            className="button"
            disabled={busy}
            onClick={() => void unpublish(item.resourceId)}
          >
            Unpublish
          </button>
        </div>
      ))}
      {offers && !offers.page.length && (
        <p className="admin-live-empty">
          Nothing is live yet. Approve a reviewed offer to publish it.
        </p>
      )}
      <div className="admin-toolbar">
        <button
          className="button"
          disabled={!cursor}
          onClick={() => setCursor(null)}
        >
          First page
        </button>
        <button
          className="button button-primary"
          disabled={!offers || offers.isDone}
          onClick={() => offers && setCursor(offers.continueCursor)}
        >
          Next offers
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

function DiscoveryStatus({ session }: { session: string }) {
  const data = useQuery(api.admin.discoveryStatus, { session });
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
            searches. Intent searches run every three hours. Hosts from
            published offers rotate on a slower cadence. Each search can return
            up to 20 links. Repeats are skipped. New links are queued for
            extraction. A daily discovery budget caps Firecrawl spend.
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
                  {adminDateFormatter.format(new Date(run.startedAt))} ·{" "}
                  {run.status}
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

function FailedJobs({ session }: { session: string }) {
  const [cursor, setCursor] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const jobs = useQuery(api.admin.failedJobs, {
    session,
    paginationOpts: { cursor, numItems: 10 },
  });
  async function retry(jobId: Id<"intakeJobs">) {
    setBusy(true);
    setError("");
    try {
      if (!backend) throw new Error("Backend unavailable");
      await backend.mutation(api.admin.retry, { session, jobId });
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
        Failed requests stop after two attempts. Retry after resolving the
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
          className="button button-primary"
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

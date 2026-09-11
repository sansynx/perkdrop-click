import { useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  LinkSimple,
  Globe,
  ListChecks,
} from "@phosphor-icons/react";
import { SiteHeader, SiteFooter } from "../components/site-chrome";
import { backend } from "../lib/convex-client";
import { api } from "../../convex/_generated/api";
import { useQuery } from "convex/react";
import type { Id } from "../../convex/_generated/dataModel";
import { visitorId } from "../lib/visitor";
import { ConvexError } from "convex/values";
import { canonicalUrl } from "../../convex/lib/intakePolicy";

export const Route = createFileRoute("/submit")({ component: SubmitPage });

function SubmitPage() {
  const [url, setUrl] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [receipt, setReceipt] = useState<{
    id: Id<"intakeJobs">;
    duplicate: boolean;
  } | null>(null);
  const [error, setError] = useState("");
  async function submit() {
    setBusy(true);
    setError("");
    try {
      if (!backend) throw new Error("Submissions are not configured yet.");
      const anonymousId = visitorId();
      const receipt = await backend.mutation(api.submissions.create, {
        url,
        anonymousId,
      });
      setReceipt(receipt);
      setSubmitted(true);
    } catch (error) {
      setError(
        error instanceof ConvexError && typeof error.data === "string"
          ? error.data
          : "We couldn't submit this link. Please check your connection and try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="app-shell">
      <SiteHeader />
      <main className="inner-page">
        <Link to="/" hash="feed" className="back-link">
          <ArrowLeft size={14} /> Back to discover
        </Link>
        <div className="submit-layout">
          <div>
            <div className="page-heading">
              <span className="section-kicker">PASS A GOOD THING ON</span>
              <h1>
                One link.
                <br />
                Someone's next big idea.
              </h1>
              <p>
                Found a free tool, a generous program, or credits worth
                claiming? Share the original link.
              </p>
            </div>
            <div className="submit-guidance">
              <div>
                <Globe size={20} />
                <div>
                  <strong>Start with the source</strong>
                  <p>
                    Official pages, public repositories, and announcements are
                    welcome.
                  </p>
                </div>
              </div>
              <div>
                <ListChecks size={20} />
                <div>
                  <strong>Give the details a look</strong>
                  <p>
                    A useful offer clearly explains what's included and who can
                    get it.
                  </p>
                </div>
              </div>
            </div>
          </div>
          <div className="submission-panel">
            {submitted ? (
              <div role="status">
                <span className="success-mark">
                  <Check size={23} />
                </span>
                <h2>Thanks for sharing.</h2>
                <p className="form-help">
                  {receipt && <Receipt receipt={receipt} />}
                </p>
                <button
                  className="button"
                  onClick={() => {
                    setSubmitted(false);
                    setUrl("");
                  }}
                >
                  Submit another link <ArrowRight size={15} />
                </button>
              </div>
            ) : (
              <form
                noValidate
                onSubmit={(event) => {
                  event.preventDefault();
                  if (busy) return;
                  try {
                    canonicalUrl(url.trim());
                  } catch {
                    setError("Enter a valid public http or https URL.");
                    return;
                  }
                  void submit();
                }}
              >
                <h2>Submit a find</h2>
                <p className="form-help">Good discoveries start with a link.</p>
                <label htmlFor="find-url">Resource URL</label>
                <div className="url-input">
                  <LinkSimple size={18} />
                  <input
                    id="find-url"
                    type="url"
                    required
                    value={url}
                    onChange={(event) => {
                      setUrl(event.target.value);
                      if (error) setError("");
                    }}
                    placeholder="https://example.com/offer"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    aria-invalid={Boolean(error)}
                    aria-describedby={
                      error ? "find-url-error" : "find-url-help"
                    }
                  />
                </div>
                <p id="find-url-help" className="form-help">
                  Link directly to the offer or announcement.
                </p>
                {error && (
                  <p id="find-url-error" className="form-error" role="alert">
                    {error}
                  </p>
                )}
                <button
                  className="button button-primary"
                  type="submit"
                  disabled={busy}
                >
                  {busy ? "Submitting…" : "Submit discovery"}{" "}
                  <ArrowRight size={16} />
                </button>
                <p className="form-help">
                  Duplicate links share one review. Clear offers from explicitly
                  trusted pages can be approved automatically.
                </p>
              </form>
            )}
          </div>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}

function Receipt({
  receipt,
}: {
  receipt: { id: Id<"intakeJobs">; duplicate: boolean };
}) {
  const status = useQuery(api.submissions.status, { id: receipt.id });
  return (
    <span>
      {receipt.duplicate && "This link has already been submitted. "}
      {status?.message ?? "Loading verification status…"}
      <br />
      Receipt: {receipt.id}
    </span>
  );
}

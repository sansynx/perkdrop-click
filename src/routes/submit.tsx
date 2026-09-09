import { useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  LinkSimple,
} from "@phosphor-icons/react";

export const Route = createFileRoute("/submit")({ component: SubmitPage });

function SubmitPage() {
  const [url, setUrl] = useState("");
  const [submitted, setSubmitted] = useState(false);
  return (
    <div className="app-shell">
      <header className="site-header">
        <div className="header-inner">
          <Link to="/" className="brand">
            <span className="brand-mark" />
            <span>Perkdrop</span>
            <span className="brand-domain">.click</span>
          </Link>
          <Link to="/" className="back-link">
            <ArrowLeft size={16} /> Discover
          </Link>
        </div>
      </header>
      <main className="submit-page container">
        <div className="submit-copy">
          <span className="eyebrow">SUBMIT A FIND</span>
          <h1>Know a useful drop?</h1>
          <p>
            Paste the link. We will pull out the useful bits and check it before
            it reaches the feed.
          </p>
        </div>
        {submitted ? (
          <div className="submit-success">
            <span className="success-icon">
              <Check size={24} weight="bold" />
            </span>
            <h2>Nice find. It is in the queue.</h2>
            <p>
              We will check the source, remove the noise and get it ready for
              review.
            </p>
            <Link to="/" className="primary-button">
              Back to discover <ArrowRight size={16} />
            </Link>
          </div>
        ) : (
          <form
            className="submit-form"
            onSubmit={(event) => {
              event.preventDefault();
              if (url.trim()) setSubmitted(true);
            }}
          >
            <label htmlFor="find-url">URL</label>
            <div className="url-input">
              <LinkSimple size={18} />
              <input
                id="find-url"
                type="url"
                required
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                placeholder="https://..."
              />
            </div>
            <p className="form-help">
              X posts, GitHub repos, hackathon pages, docs and product
              announcements are all welcome.
            </p>
            <button className="primary-button" type="submit">
              Send it in <ArrowRight size={16} />
            </button>
          </form>
        )}
      </main>
    </div>
  );
}

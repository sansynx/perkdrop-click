import { Link, createFileRoute } from "@tanstack/react-router";
import { ArrowLeft, Check, Clock, DotsThree, X } from "@phosphor-icons/react";

export const Route = createFileRoute("/admin")({ component: AdminPage });
const candidates = [
  {
    provider: "Railway",
    title: "$5 in hobby credits for new projects",
    source: "X",
    age: "18m ago",
  },
  {
    provider: "Hack Club",
    title: "Free domain for high-school builders",
    source: "Community",
    age: "2h ago",
  },
  {
    provider: "Fly.io",
    title: "Launch credits for open-source apps",
    source: "Blog",
    age: "6h ago",
  },
];

function AdminPage() {
  return (
    <div className="app-shell admin-shell">
      <header className="site-header">
        <div className="header-inner">
          <Link to="/" className="brand">
            <span className="brand-mark" />
            <span>Perkdrop</span>
          </Link>
          <Link to="/" className="back-link">
            <ArrowLeft size={16} /> Exit admin
          </Link>
        </div>
      </header>
      <main className="admin-page container">
        <div className="admin-heading">
          <div>
            <span className="eyebrow">INTERNAL REVIEW</span>
            <h1>Candidate queue</h1>
            <p>
              Keep the feed useful. Approve the good stuff, archive the dead
              stuff.
            </p>
          </div>
          <div className="admin-stats">
            <span>
              <strong>12</strong> candidates
            </span>
            <span>
              <strong>3</strong> failed checks
            </span>
          </div>
        </div>
        <div className="admin-tabs">
          <button className="active">
            Candidates <span>12</span>
          </button>
          <button>
            Rechecks <span>3</span>
          </button>
          <button>
            Archived <span>84</span>
          </button>
        </div>
        <div className="candidate-list">
          {candidates.map((candidate) => (
            <article className="candidate-row" key={candidate.title}>
              <div>
                <div className="candidate-meta">
                  <span>{candidate.provider}</span>
                  <span>{candidate.source}</span>
                  <span>{candidate.age}</span>
                </div>
                <h2>{candidate.title}</h2>
                <p>
                  Extraction looks useful. Final claim URL and eligibility need
                  a human pass.
                </p>
              </div>
              <div className="candidate-actions">
                <span className="candidate-status">
                  <Clock size={14} />
                  Needs review
                </span>
                <button className="approve">
                  <Check size={15} />
                  Approve
                </button>
                <button className="reject">
                  <X size={15} />
                  Reject
                </button>
                <button className="icon-button" aria-label="More actions">
                  <DotsThree size={18} />
                </button>
              </div>
            </article>
          ))}
        </div>
      </main>
    </div>
  );
}

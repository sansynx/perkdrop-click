import { useMemo, useState, type CSSProperties } from "react";
import { Link } from "@tanstack/react-router";
import {
  ArrowRight,
  CaretDown,
  Check,
  Compass,
  Funnel,
  Globe,
  MagnifyingGlass,
  SlidersHorizontal,
  UserCircle,
  X,
} from "@phosphor-icons/react";
import {
  audiences,
  categories,
  drops,
  sortOptions,
  type Drop,
} from "../lib/demo-data";
import { paginate } from "../lib/pagination";

function ProviderMark({ drop }: { drop: Drop }) {
  const [failed, setFailed] = useState(false);

  return (
    <span className="provider-mark" aria-hidden="true">
      {failed ? (
        drop.providerMark
      ) : (
        <img src={drop.logoUrl} alt="" onError={() => setFailed(true)} />
      )}
    </span>
  );
}

function DropRow({ drop, index }: { drop: Drop; index: number }) {
  return (
    <article
      className="drop-row"
      style={{ "--card-index": index } as CSSProperties}
    >
      <div className="drop-row-index" aria-hidden="true">
        {String(index + 1).padStart(2, "0")}
      </div>
      <ProviderMark drop={drop} />
      <div className="drop-row-copy">
        <div className="drop-row-provider">
          <span>{drop.provider}</span>
          <span>{drop.ago}</span>
        </div>
        <Link
          to="/drop/$slug"
          params={{ slug: drop.slug }}
          className="drop-title-link"
        >
          <h3>{drop.title}</h3>
        </Link>
        <p>{drop.description}</p>
      </div>
      <div className="drop-row-tags" aria-label="Offer details">
        <span>{drop.resourceType}</span>
        <span>{drop.region}</span>
        <span>{drop.requiresCard ? "Card required" : "No card"}</span>
      </div>
      <div className="drop-row-value">
        <strong>{drop.value}</strong>
        <span>{drop.claimed} claimed</span>
      </div>
      <Link
        to="/drop/$slug"
        params={{ slug: drop.slug }}
        className="row-action"
        aria-label={`View ${drop.title}`}
      >
        <ArrowRight size={19} weight="bold" />
      </Link>
    </article>
  );
}

function ForMePopover({ onClose }: { onClose: () => void }) {
  const [preferences, setPreferences] = useState({
    developer: true,
    student: false,
    startup: false,
    oss: false,
  });
  const toggle = (key: keyof typeof preferences) =>
    setPreferences((current) => ({ ...current, [key]: !current[key] }));

  return (
    <div
      className="for-me-popover"
      role="dialog"
      aria-label="Personalize your feed"
    >
      <div className="popover-header">
        <div>
          <span className="form-kicker">Your preferences</span>
          <h3>Shape the next scan.</h3>
        </div>
        <button
          className="icon-button"
          aria-label="Close preferences"
          onClick={onClose}
        >
          <X size={18} />
        </button>
      </div>
      <label className="field-label" htmlFor="country">
        Country
      </label>
      <div className="select-field">
        <Globe size={16} />
        <select id="country" defaultValue="India">
          <option>India</option>
          <option>United States</option>
          <option>United Kingdom</option>
          <option>Worldwide</option>
        </select>
        <CaretDown size={15} />
      </div>
      <span className="field-label">I am</span>
      <div className="preference-grid">
        {(
          [
            ["developer", "Developer"],
            ["student", "Student"],
            ["startup", "Startup"],
            ["oss", "OSS maintainer"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            className={`preference-option ${preferences[key] ? "selected" : ""}`}
            onClick={() => toggle(key)}
          >
            <span className="check-box">
              {preferences[key] ? <Check size={12} weight="bold" /> : null}
            </span>
            {label}
          </button>
        ))}
      </div>
      <p className="popover-note">
        Stored only in this browser. No account needed.
      </p>
    </div>
  );
}

export function PerkdropApp() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("Everything");
  const [audience, setAudience] = useState("Everyone");
  const [sort, setSort] = useState("Trending");
  const [requestedPage, setRequestedPage] = useState(1);
  const [showPreferences, setShowPreferences] = useState(false);

  const filteredDrops = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const result = drops.filter((drop) => {
      const matchesQuery =
        !normalized ||
        [
          drop.title,
          drop.provider,
          drop.description,
          drop.category,
          drop.eligibility,
          drop.resourceType,
        ].some((value) => value.toLowerCase().includes(normalized));
      const matchesCategory =
        category === "Everything" || drop.category === category;
      const matchesAudience =
        audience === "Everyone" ||
        drop.eligibility.toLowerCase().includes(audience.toLowerCase()) ||
        (audience === "Hackathons" &&
          drop.resourceType.toLowerCase().includes("hackathon"));

      return matchesQuery && matchesCategory && matchesAudience;
    });

    if (sort === "Ending Soon") return result.filter((drop) => drop.expires);
    if (sort === "Most Claimed")
      return [...result].sort(
        (a, b) => Number.parseInt(b.claimed) - Number.parseInt(a.claimed),
      );
    if (sort === "Recently Confirmed")
      return [...result].sort(
        (a, b) => Number.parseInt(b.confirmed) - Number.parseInt(a.confirmed),
      );
    return result;
  }, [audience, category, query, sort]);

  const {
    items: visibleDrops,
    page,
    pageCount,
  } = paginate(filteredDrops, requestedPage, 5);
  const resetPage = (callback: () => void) => {
    callback();
    setRequestedPage(1);
  };

  const clearFilters = () => {
    setQuery("");
    setCategory("Everything");
    setAudience("Everyone");
    setRequestedPage(1);
  };

  return (
    <div className="app-shell">
      <header className="site-header">
        <div className="header-inner">
          <Link to="/" className="brand" aria-label="Perkdrop home">
            <span className="brand-mark" />
            <span>Perkdrop</span>
            <span className="brand-domain">.click</span>
          </Link>
          <nav className="desktop-nav" aria-label="Main navigation">
            <Link to="/" className="active">
              Discover
            </Link>
            <a href="#feed">Index</a>
            <a href="#feed">Expiring</a>
          </nav>
          <div className="header-actions">
            <a href="#search" className="search-nav">
              <MagnifyingGlass size={17} /> Search
            </a>
            <Link to="/submit" className="submit-link">
              Submit a find <ArrowRight size={15} />
            </Link>
          </div>
        </div>
      </header>

      <main>
        <section className="hero-index">
          <div className="hero-image" aria-hidden="true">
            <img src="/perkdrop-hero.png" alt="" />
          </div>
          <div className="hero-scrim" aria-hidden="true" />
          <div className="hero-grid container">
            <div className="hero-copy">
              <span className="eyebrow">Useful, free, and still live</span>
              <h1>Find the good stuff before it disappears.</h1>
              <p>Perks, credits, tools, and programs worth claiming today.</p>
              <div className="hero-actions">
                <a className="primary-button" href="#feed">
                  Explore the index <ArrowRight size={17} />
                </a>
                <Link to="/submit" className="secondary-button">
                  Submit a find
                </Link>
              </div>
            </div>
            <aside className="hero-status" aria-label="Index status">
              <span className="status-label">Today&apos;s signal</span>
              <strong>142</strong>
              <span>offers checked this week</span>
              <div className="status-divider" />
              <p>New finds are checked before they make the index.</p>
            </aside>
          </div>
        </section>

        <section className="signal-bar" aria-label="Recent discoveries">
          <div className="container signal-inner">
            <span className="signal-title">New in the index</span>
            <div className="signal-track">
              <span>
                <strong>$100 cloud credits</strong> for new builders
              </span>
              <span>
                <strong>Free domain</strong> for students
              </span>
              <span>
                <strong>AI API credits</strong> for prototypes
              </span>
              <span>
                <strong>Hosting perk</strong> for open source
              </span>
            </div>
          </div>
        </section>

        <section className="feed-section container" id="feed">
          <div className="feed-intro">
            <div>
              <h2>The useful internet, organized.</h2>
              <p>
                Browse active offers by audience, category, or what is about to
                expire.
              </p>
            </div>
            <button
              className={`for-me-button ${showPreferences ? "selected" : ""}`}
              onClick={() => setShowPreferences((value) => !value)}
            >
              <UserCircle size={18} /> Tune my feed
            </button>
            {showPreferences ? (
              <ForMePopover onClose={() => setShowPreferences(false)} />
            ) : null}
          </div>

          <div className="feed-workspace">
            <aside className="filter-rail" aria-label="Feed filters">
              <div className="filter-rail-heading">
                <SlidersHorizontal size={17} />
                <span>Browse by</span>
              </div>
              <div className="rail-group">
                <span>For</span>
                {audiences.map((item) => (
                  <button
                    key={item}
                    className={audience === item ? "active" : ""}
                    onClick={() => resetPage(() => setAudience(item))}
                  >
                    {item}
                  </button>
                ))}
              </div>
              <div className="rail-group">
                <span>Category</span>
                {categories.map((item) => (
                  <button
                    key={item}
                    className={category === item ? "active" : ""}
                    onClick={() => resetPage(() => setCategory(item))}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </aside>

            <div className="feed-main">
              <div className="feed-toolbar">
                <div className="search-panel" id="search">
                  <label className="sr-only" htmlFor="resource-search">
                    Search resources
                  </label>
                  <MagnifyingGlass size={20} />
                  <input
                    id="resource-search"
                    value={query}
                    onChange={(event) =>
                      resetPage(() => setQuery(event.target.value))
                    }
                    placeholder="Search credits, tools, companies, or APIs"
                  />
                </div>
                <div className="sort-control">
                  <Funnel size={15} />
                  <label htmlFor="sort">Sort</label>
                  <select
                    id="sort"
                    value={sort}
                    onChange={(event) =>
                      resetPage(() => setSort(event.target.value))
                    }
                  >
                    {sortOptions.map((item) => (
                      <option key={item}>{item}</option>
                    ))}
                  </select>
                  <CaretDown size={14} />
                </div>
              </div>

              <div className="feed-summary">
                <span>
                  <strong>{filteredDrops.length}</strong> active finds
                </span>
                <span>Checked by people, not a content farm.</span>
              </div>
              <div className="feed-list">
                {visibleDrops.length ? (
                  visibleDrops.map((drop, index) => (
                    <DropRow key={drop.slug} drop={drop} index={index} />
                  ))
                ) : (
                  <div className="empty-state">
                    <Compass size={28} />
                    <h3>Nothing is matching yet.</h3>
                    <p>
                      Try another keyword, or clear the filters to see the full
                      index.
                    </p>
                    <button onClick={clearFilters}>Clear filters</button>
                  </div>
                )}
              </div>

              <div className="pagination" aria-label="Feed pagination">
                <span>
                  Page {page} of {pageCount}
                </span>
                <div className="pagination-buttons">
                  <button
                    aria-label="Previous page"
                    disabled={page === 1}
                    onClick={() => setRequestedPage(page - 1)}
                  >
                    Previous
                  </button>
                  {Array.from(
                    { length: pageCount },
                    (_, index) => index + 1,
                  ).map((item) => (
                    <button
                      key={item}
                      className={page === item ? "active" : ""}
                      aria-current={page === item ? "page" : undefined}
                      onClick={() => setRequestedPage(item)}
                    >
                      {item}
                    </button>
                  ))}
                  <button
                    aria-label="Next page"
                    disabled={page === pageCount}
                    onClick={() => setRequestedPage(page + 1)}
                  >
                    Next
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="site-footer">
        <div className="container footer-inner">
          <div>
            <Link to="/" className="brand">
              <span className="brand-mark" />
              <span>Perkdrop</span>
              <span className="brand-domain">.click</span>
            </Link>
            <p>Free resources that are actually worth your time.</p>
          </div>
          <div className="footer-links">
            <Link to="/submit">Submit a find</Link>
            <a href="#feed">Explore the index</a>
            <a href="mailto:hello@perkdrop.click">Contact</a>
          </div>
          <div className="footer-note">
            Built for people who keep making things.
          </div>
        </div>
      </footer>
    </div>
  );
}

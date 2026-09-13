import { useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  ArrowRight,
  ArrowUpRight,
  MagnifyingGlass,
  X,
  Clock,
  Code,
  GraduationCap,
  Cube,
  Check,
  Sparkle,
} from "@phosphor-icons/react";
import { audiences, categories } from "../lib/catalog";

import { SiteHeader, SiteFooter } from "./site-chrome";
import { LiveFeed } from "./live-feed";
import { backend } from "../lib/convex-client";
import type { FunctionReturnType } from "convex/server";
import { api } from "../../convex/_generated/api";
import { useDebouncedValue } from "../lib/use-debounced-value";

export function PerkdropApp({
  initialData,
}: {
  initialData?: FunctionReturnType<typeof api.catalog.page> | null;
}) {
  const [query, setQuery] = useState("");
  const settledQuery = useDebouncedValue(query);
  const [category, setCategory] = useState("Everything");
  const [audience, setAudience] = useState("Everyone");
  const [tab, setTab] = useState("All perks");
  const chooseCollection = (value: string) => {
    setCategory(value);
    setQuery("");
    setAudience("Everyone");
    setTab("All perks");
    document.getElementById("feed")?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <div className="app-shell">
      <a className="skip-link" href="#feed">
        Skip to resources
      </a>
      <SiteHeader />
      <main>
        <section className="hero" aria-labelledby="hero-title">
          <div className="hero-background" aria-hidden="true" />
          <div className="hero-content">
            <span className="hero-label">
              <span className="mini-mark">
                <Sparkle size={13} />
              </span>
              Your next project starts here
            </span>
            <h1 id="hero-title">
              Good things come
              <br />
              <span>in free drops.</span>
            </h1>
            <p>
              Discover free tools, credits, and opportunities.
              <br className="desktop-break" /> Less time searching. More time
              building.
            </p>
            <a href="#feed" className="button button-primary hero-browse">
              Browse resources <ArrowRight size={16} />
            </a>
          </div>
        </section>

        <section className="collections-section" id="collections">
          <div className="section-heading">
            <div>
              <span className="section-kicker">A GOOD PLACE TO START</span>
              <h2>A head start, whatever you make.</h2>
            </div>
          </div>
          <div className="collection-links">
            {[
              {
                title: "Build your next idea",
                text: "Cloud credits, APIs, and developer tools.",
                category: "Developer Tools",
                icon: Code,
              },
              {
                title: "Make student life easier",
                text: "Learning, domains, and tools for your degree.",
                category: "Education",
                icon: GraduationCap,
              },
              {
                title: "Keep open source going",
                text: "A little support for the work you share.",
                category: "Open Source",
                icon: Cube,
              },
            ].map((item) => (
              <button
                className="collection-link"
                key={item.title}
                onClick={() => chooseCollection(item.category)}
              >
                <span className="collection-icon">
                  <item.icon size={25} weight="light" />
                </span>
                <span>
                  <strong>{item.title}</strong>
                  <span>{item.text}</span>
                </span>
                <ArrowUpRight size={18} />
              </button>
            ))}
          </div>
        </section>
        <section
          className="discovery-section"
          id="feed"
          aria-labelledby="feed-title"
        >
          <div className="section-heading">
            <div>
              <h2 id="feed-title">Your next unfair advantage.</h2>
              <p>Find something useful. Put it to work.</p>
            </div>
            <span className="preview-label">Reviewed collection</span>
          </div>
          <div className="feed-navigation">
            <div className="feed-tabs" aria-label="Resource views">
              {["All perks", "Ending soon"].map((item) => (
                <button
                  key={item}
                  aria-pressed={tab === item}
                  className={tab === item ? "active" : ""}
                  onClick={() => setTab(item)}
                >
                  {item === "Ending soon" && <Clock size={15} />} {item}
                </button>
              ))}
            </div>
            <span className="inline-sort">Newest first</span>
          </div>
          <div className="feed-filters">
            <label className="feed-search">
              <MagnifyingGlass size={17} />
              <span className="sr-only">Search resources</span>
              <input
                aria-label="Search resources"
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                }}
                placeholder="Search perks..."
              />
              {query && (
                <button aria-label="Clear search" onClick={() => setQuery("")}>
                  <X size={15} />
                </button>
              )}
            </label>
            <label className="filter-select">
              <span>Category</span>
              <select
                value={category}
                aria-label="Category"
                onChange={(event) => {
                  const value = event.target.value;
                  setCategory(value);
                }}
              >
                {categories.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </label>
            <label className="filter-select">
              <span>For</span>
              <select
                value={audience}
                aria-label="Audience"
                onChange={(event) => {
                  const value = event.target.value;
                  setAudience(value);
                }}
              >
                {audiences.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </label>
          </div>
          {backend ? (
            <LiveFeed
              initialData={
                !query &&
                category === "Everything" &&
                audience === "Everyone" &&
                tab === "All perks"
                  ? initialData
                  : undefined
              }
              audience={audience}
              key={JSON.stringify([settledQuery, category, audience, tab])}
              search={settledQuery}
              category={category}
              endingSoon={tab === "Ending soon"}
            />
          ) : (
            <div className="empty-state" role="status">
              <h3>Resources are temporarily unavailable.</h3>
              <p>Please check back shortly.</p>
            </div>
          )}
        </section>
        <section className="about-section" id="about">
          <div className="about-title">
            <span className="section-kicker">LESS NOISE. MORE USEFUL.</span>
            <h2>
              The good stuff deserves
              <br />
              to be found.
            </h2>
            <p>
              Perkdrop brings scattered resources into one place, with the
              details you need to decide.
            </p>
          </div>
          <div className="about-details">
            <div>
              <span>
                <MagnifyingGlass size={20} />
              </span>
              <div>
                <h3>Discover something useful</h3>
                <p>
                  Browse tools, credits, learning resources, and programs by
                  category or audience.
                </p>
              </div>
            </div>
            <div>
              <span>
                <Check size={20} />
              </span>
              <div>
                <h3>Read the fine print</h3>
                <p>
                  See eligibility, region, and offer details. Always confirm
                  current terms with the provider.
                </p>
              </div>
            </div>
            <div>
              <span>
                <ArrowUpRight size={20} />
              </span>
              <div>
                <h3>Make it yours</h3>
                <p>
                  Follow the original source to claim a perk. Found another?
                  Share it with the community.
                </p>
              </div>
            </div>
          </div>
        </section>
        <section className="submit-banner">
          <span className="banner-icon">
            <Sparkle size={28} weight="light" />
          </span>
          <div>
            <h2>Found a good thing?</h2>
            <p>Make someone else's next project a little easier.</p>
          </div>
          <Link to="/submit" className="button button-primary">
            Submit a find <ArrowRight size={16} />
          </Link>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}

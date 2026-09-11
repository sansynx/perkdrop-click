import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, List, X } from "@phosphor-icons/react";

export function Brand() {
  return (
    <Link to="/" className="brand" aria-label="Perkdrop home">
      <img src="/perkdrop-mark.svg" width="28" height="28" alt="" />
      <span>
        perkdrop<span className="brand-suffix">.click</span>
      </span>
    </Link>
  );
}

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  return (
    <header className="site-header">
      <div className="header-inner">
        <Brand />
        <nav className="desktop-nav" aria-label="Main navigation">
          <Link to="/" hash="feed">
            Discover
          </Link>
          <Link to="/" hash="collections">
            Collections
          </Link>
          <Link to="/" hash="about">
            How it works
          </Link>
        </nav>
        <Link to="/submit" className="button button-small header-submit">
          Submit a find <ArrowRight size={15} />
        </Link>
        <button
          className="mobile-menu icon-button"
          aria-label={open ? "Close navigation" : "Open navigation"}
          aria-expanded={open}
          aria-controls="mobile-navigation"
          onClick={() => setOpen(!open)}
        >
          {open ? <X size={21} /> : <List size={21} />}
        </button>
      </div>
      {open && (
        <nav
          id="mobile-navigation"
          className="mobile-navigation"
          aria-label="Mobile navigation"
        >
          <Link to="/" hash="feed" onClick={() => setOpen(false)}>
            Discover
          </Link>
          <Link to="/" hash="collections" onClick={() => setOpen(false)}>
            Collections
          </Link>
          <Link to="/" hash="about" onClick={() => setOpen(false)}>
            How it works
          </Link>
          <Link to="/submit" onClick={() => setOpen(false)}>
            Submit a find
          </Link>
        </nav>
      )}
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="footer-main">
        <div>
          <Brand />
          <p>
            A little less searching.
            <br />A lot more making.
          </p>
        </div>
        <div className="footer-links">
          <Link to="/" hash="feed">
            Discover
          </Link>
          <Link to="/" hash="collections">
            Collections
          </Link>
          <Link to="/submit">Submit a find</Link>
        </div>
        <p className="footer-message">
          Something useful is out there.
          <br />
          Go make something with it.
        </p>
      </div>
      <div className="footer-bottom">
        <span>© 2026 Perkdrop.click</span>
        <span>For the curious. For the builders.</span>
      </div>
    </footer>
  );
}

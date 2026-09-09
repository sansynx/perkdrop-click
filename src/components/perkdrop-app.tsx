import { useMemo, useState } from 'react'
import { Link } from '@tanstack/react-router'
import {
  ArrowRight,
  CaretDown as ChevronDown,
  Check,
  Clock,
  Compass,
  Funnel,
  Globe,
  MagnifyingGlass,
  SquaresFour,
  UserCircle,
  X,
} from '@phosphor-icons/react'
import { audiences, categories, drops, sortOptions, type Drop } from '../lib/demo-data'

function ProviderMark({ drop }: { drop: Drop }) {
  const [failed, setFailed] = useState(false)
  return (
    <span className="provider-mark" aria-hidden="true">
      {failed ? drop.providerMark : <img src={drop.logoUrl} alt="" onError={() => setFailed(true)} />}
    </span>
  )
}

function DropCard({ drop, index }: { drop: Drop; index: number }) {
  return (
    <article className="drop-card" style={{ '--card-index': index } as React.CSSProperties}>
      <div className="drop-card-main">
        <div className="drop-card-topline">
          <div className="provider-line"><ProviderMark drop={drop} /><span>{drop.provider}</span></div>
          <span className="drop-age">{drop.ago}</span>
        </div>
        <Link to="/drop/$slug" params={{ slug: drop.slug }} className="drop-title-link"><h3>{drop.title}</h3></Link>
        <p className="drop-description">{drop.description}</p>
        <div className="drop-meta-row"><span className="value-chip">{drop.value}</span><span>{drop.region}</span><span>{drop.resourceType}</span><span>{drop.requiresCard ? 'Card required' : 'No card needed'}</span></div>
      </div>
      <div className="drop-card-side">
        <div className="drop-activity"><span>{drop.claimed}</span><span>{drop.confirmed}</span></div>
        {drop.expires ? <span className="expiry"><Clock size={14} />{drop.expires}</span> : null}
        <Link to="/drop/$slug" params={{ slug: drop.slug }} className="claim-button">Claim <ArrowRight size={16} weight="bold" /></Link>
      </div>
    </article>
  )
}

function ForMePopover({ onClose }: { onClose: () => void }) {
  const [preferences, setPreferences] = useState({ developer: true, student: false, startup: false, oss: false, cardFree: true })
  const toggle = (key: keyof typeof preferences) => setPreferences((current) => ({ ...current, [key]: !current[key] }))
  return (
    <div className="for-me-popover" role="dialog" aria-label="Personalize your feed">
      <div className="popover-header"><div><span className="eyebrow">SHOW ME</span><h3>Find what fits</h3></div><button className="icon-button" aria-label="Close preferences" onClick={onClose}><X size={18} /></button></div>
      <label className="field-label" htmlFor="country">Country</label>
      <div className="select-field"><Globe size={16} /><select id="country" defaultValue="India"><option>India</option><option>United States</option><option>United Kingdom</option><option>Worldwide</option></select><ChevronDown size={15} /></div>
      <span className="field-label">I am</span>
      <div className="preference-grid">{([['developer', 'Developer'], ['student', 'Student'], ['startup', 'Startup'], ['oss', 'OSS maintainer']] as const).map(([key, label]) => <button key={key} className={`preference-option ${preferences[key] ? 'selected' : ''}`} onClick={() => toggle(key)}><span className="check-box">{preferences[key] ? <Check size={12} weight="bold" /> : null}</span>{label}</button>)}</div>
      <button className={`preference-option full ${preferences.cardFree ? 'selected' : ''}`} onClick={() => toggle('cardFree')}><span className="check-box">{preferences.cardFree ? <Check size={12} weight="bold" /> : null}</span>Completely free and no card required</button>
      <p className="popover-note">Saved only in this browser. No account needed.</p>
    </div>
  )
}

export function PerkdropApp() {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('Everything')
  const [audience, setAudience] = useState('Everyone')
  const [sort, setSort] = useState('Trending')
  const [page, setPage] = useState(1)
  const [showPreferences, setShowPreferences] = useState(false)
  const filteredDrops = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    const result = drops.filter((drop) => {
      const matchesQuery = !normalized || [drop.title, drop.provider, drop.description, drop.category, drop.eligibility, drop.resourceType].some((value) => value.toLowerCase().includes(normalized))
      const matchesCategory = category === 'Everything' || drop.category === category
      const matchesAudience = audience === 'Everyone' || drop.eligibility.toLowerCase().includes(audience.toLowerCase()) || (audience === 'Hackathons' && drop.resourceType.toLowerCase().includes('hackathon'))
      return matchesQuery && matchesCategory && matchesAudience
    })
    if (sort === 'Ending Soon') return result.filter((drop) => drop.expires)
    if (sort === 'Most Claimed') return [...result].sort((a, b) => Number.parseInt(b.claimed) - Number.parseInt(a.claimed))
    if (sort === 'Recently Confirmed') return [...result].sort((a, b) => Number.parseInt(b.confirmed) - Number.parseInt(a.confirmed))
    return result
  }, [audience, category, query, sort])
  const pageSize = 5
  const pageCount = Math.max(1, Math.ceil(filteredDrops.length / pageSize))
  const visibleDrops = filteredDrops.slice((page - 1) * pageSize, page * pageSize)
  const changeFilter = (setter: (value: string) => void, value: string) => { setter(value); setPage(1) }

  return (
    <div className="app-shell">
      <header className="site-header"><div className="header-inner"><Link to="/" className="brand" aria-label="Perkdrop home"><span className="brand-mark" /><span>Perkdrop</span><span className="brand-domain">.click</span></Link><nav className="desktop-nav" aria-label="Main navigation"><Link to="/" className="active">Discover</Link><a href="#feed">Trending</a><a href="#feed">Ending Soon</a></nav><div className="header-actions"><a href="#search" className="search-nav"><MagnifyingGlass size={17} />Search</a><Link to="/submit" className="submit-link">Submit a find <ArrowRight size={15} /></Link></div></div></header>
      <main>
        <section className="hero hero-centered">
          <div className="hero-art" aria-hidden="true"><img src="/perkdrop-hero.png" alt="" /><div className="hero-art-veil" /></div>
          <div className="hero-copy container"><div className="eyebrow"><span className="live-dot" />Live from the internet</div><h1>The internet gives away a lot of stuff.<br /><em>We keep track of it.</em></h1><p>Free credits, tools, APIs, programs and random useful drops from around the internet.</p><div className="hero-proof"><span className="proof-avatar">P</span><span>142 drops checked this week</span><span className="proof-divider" /><span>Fresh every day</span></div></div>
          <div className="hero-art-note"><span>PERKDROP INDEX</span><strong>useful / current / free</strong></div><div className="hero-art-annotation">01<br />scan for a signal</div>
        </section>
        <section className="discovery-strip" aria-label="Recent discoveries"><div className="container discovery-inner"><div className="strip-label"><span className="live-dot" />Just found</div><div className="strip-items"><span><strong>$100</strong> cloud credits <small>4m</small></span><span><strong>Free domain</strong> for students <small>11m</small></span><span><strong>AI API credits</strong> <small>22m</small></span><span><strong>Student hosting</strong> perk <small>38m</small></span></div><ArrowRight className="strip-arrow" size={17} /></div></section>
        <section className="feed-section container" id="feed"><div className="feed-heading"><div><h2>What is useful now</h2><p>Offers worth a closer look, checked by people and kept moving.</p></div><button className={`for-me-button ${showPreferences ? 'selected' : ''}`} onClick={() => setShowPreferences((value) => !value)}><UserCircle size={17} />For me</button>{showPreferences ? <ForMePopover onClose={() => setShowPreferences(false)} /> : null}</div><div className="search-panel" id="search"><label className="sr-only" htmlFor="resource-search">Search resources</label><MagnifyingGlass size={21} /><input id="resource-search" value={query} onChange={(event) => { setQuery(event.target.value); setPage(1) }} placeholder="Search credits, tools, companies, APIs..." /><kbd>/</kbd></div><div className="filter-row" aria-label="Audience filters"><div className="filter-scroll">{audiences.map((item) => <button key={item} className={audience === item ? 'active' : ''} onClick={() => changeFilter(setAudience, item)}>{item}</button>)}</div><div className="filter-tools"><button className="category-button"><SquaresFour size={15} />Categories <ChevronDown size={14} /></button><span className="result-count">{filteredDrops.length} drops</span></div></div><div className="feed-controls"><div className="category-scroll" aria-label="Category filters">{categories.map((item) => <button key={item} className={category === item ? 'active' : ''} onClick={() => changeFilter(setCategory, item)}>{item}</button>)}</div><div className="sort-control"><Funnel size={15} /><label htmlFor="sort">Sort</label><select id="sort" value={sort} onChange={(event) => changeFilter(setSort, event.target.value)}>{sortOptions.map((item) => <option key={item}>{item}</option>)}</select><ChevronDown size={14} /></div></div><div className="feed-list">{visibleDrops.length ? visibleDrops.map((drop, index) => <DropCard key={drop.slug} drop={drop} index={index} />) : <div className="empty-state"><Compass size={26} /><h3>Nothing found here yet.</h3><p>Try removing a filter or check back when the internet drops something new.</p><button onClick={() => { setQuery(''); setCategory('Everything'); setAudience('Everyone'); setPage(1) }}>Clear filters</button></div>}</div><div className="pagination" aria-label="Feed pagination"><span>Page {page} of {pageCount}</span><div className="pagination-buttons"><button aria-label="Previous page" disabled={page === 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>Previous</button>{Array.from({ length: pageCount }, (_, index) => index + 1).map((item) => <button key={item} className={page === item ? 'active' : ''} aria-current={page === item ? 'page' : undefined} onClick={() => setPage(item)}>{item}</button>)}<button aria-label="Next page" disabled={page === pageCount} onClick={() => setPage((value) => Math.min(pageCount, value + 1))}>Next</button></div></div></section>
      </main>
      <footer className="site-footer"><div className="container footer-inner"><div><Link to="/" className="brand"><span className="brand-mark" /><span>Perkdrop</span></Link><p>The internet gives away a lot of stuff.<br />We keep track of it.</p></div><div className="footer-links"><Link to="/submit">Submit a find</Link><a href="#feed">Discover drops</a><a href="mailto:hello@perkdrop.click">Get in touch</a></div><div className="footer-note">Made for people who like useful things.<br />No account required.</div></div></footer>
    </div>
  )
}

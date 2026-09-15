import { useState, type CSSProperties } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowUpRight, Clock, Globe } from "@phosphor-icons/react";
import { hostOf, visibleMeta, type Drop } from "../lib/catalog";

export function ProviderMark({ drop }: { drop: Drop }) {
  const [failed, setFailed] = useState(false);
  return (
    <span className="provider-mark">
      {failed || !drop.logoUrl ? (
        drop.providerMark
      ) : (
        <img
          src={drop.logoUrl}
          alt=""
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          width="24"
          height="24"
          onError={() => setFailed(true)}
        />
      )}
    </span>
  );
}

export function ResourceRow({ drop, index }: { drop: Drop; index: number }) {
  const host = hostOf(drop.claimUrl || drop.source);
  const eligibility = visibleMeta(drop.eligibility);
  const region = visibleMeta(drop.region);
  return (
    <article className="resource-row" style={{ "--i": index } as CSSProperties}>
      <ProviderMark drop={drop} />
      <div className="resource-copy">
        <div className="resource-byline">
          <span>{drop.provider}</span>
          <span className="resource-category">{drop.category}</span>
        </div>
        <Link
          to="/drop/$slug"
          params={{ slug: drop.slug }}
          className="resource-title"
        >
          <h3>{drop.title}</h3>
        </Link>
        <p>{drop.description}</p>
        <div className="resource-meta">
          {host ? (
            <a
              href={drop.claimUrl || drop.source}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Globe size={13} />
              {host}
            </a>
          ) : null}
          {eligibility ? <span>{eligibility}</span> : null}
          {region && region !== eligibility ? <span>{region}</span> : null}
          {drop.expires ? (
            <span>
              <Clock size={13} />
              {drop.expires}
            </span>
          ) : null}
        </div>
      </div>
      <div className="resource-value">
        <strong>{drop.value}</strong>
        <span>{drop.resourceType}</span>
        <Link
          to="/drop/$slug"
          params={{ slug: drop.slug }}
          aria-label={`View ${drop.title}`}
        >
          View perk <ArrowUpRight size={14} />
        </Link>
      </div>
    </article>
  );
}

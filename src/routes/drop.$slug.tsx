import { Link, createFileRoute, notFound } from "@tanstack/react-router";
import {
  ArrowLeft,
  Check,
  Globe,
  Users,
  WarningCircle,
} from "@phosphor-icons/react";
import type { Drop } from "../lib/catalog";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { backend } from "../lib/convex-client";
import { SiteHeader, SiteFooter } from "../components/site-chrome";
import { ProviderMark } from "../components/resource-row";
import { CommunityFeedback } from "../components/community-feedback";

export const Route = createFileRoute("/drop/$slug")({
  loader: async ({ params }) => {
    const drop = backend
      ? await backend.query(api.catalog.get, { slug: params.slug })
      : null;
    if (!drop) throw notFound();
    return drop;
  },
  head: ({ loaderData }) => ({
    meta: [
      {
        title: loaderData
          ? loaderData.title + " — Perkdrop.click"
          : "Offer unavailable — Perkdrop.click",
      },
    ],
  }),
  component: DropDetail,
});
function DropDetail() {
  const { slug } = Route.useParams();
  const initialDrop = Route.useLoaderData();
  return backend ? (
    <LiveDetail slug={slug} initialDrop={initialDrop} />
  ) : (
    <Detail drop={initialDrop} />
  );
}
function LiveDetail({
  slug,
  initialDrop,
}: {
  slug: string;
  initialDrop: Drop;
}) {
  const live = useQuery(api.catalog.get, { slug });
  const drop = live === undefined ? initialDrop : live;
  if (drop === undefined)
    return (
      <div className="app-shell">
        <SiteHeader />
        <main className="inner-page" role="status">
          Loading offer…
        </main>
        <SiteFooter />
      </div>
    );
  return <Detail drop={drop ?? undefined} />;
}
function Detail({ drop }: { drop?: Drop }) {
  return (
    <div className="app-shell">
      <SiteHeader />
      <main className="inner-page">
        <Link to="/" hash="feed" className="back-link">
          <ArrowLeft size={14} /> Back to all perks
        </Link>
        {drop ? (
          <>
            <div className="detail-heading">
              <div className="detail-provider">
                <ProviderMark drop={drop} />
                <div>
                  <span>{drop.provider}</span>
                  <small>{drop.category}</small>
                </div>
                <span className="preview-label">Reviewed offer</span>
              </div>
              <h1>{drop.title}</h1>
              <p>{drop.description}</p>
            </div>
            <div className="detail-columns">
              <div>
                {drop.imageUrl && (
                  <img
                    className="reward-cover"
                    loading="lazy"
                    decoding="async"
                    src={drop.imageUrl}
                    alt={`${drop.provider} reward preview`}
                    referrerPolicy="no-referrer"
                    onError={(event) => {
                      event.currentTarget.hidden = true;
                    }}
                  />
                )}
                <section className="detail-section">
                  <h2>What's included</h2>
                  <p>
                    {drop.description} The listed value is{" "}
                    {drop.value.toLowerCase()}.
                  </p>
                </section>
                <section className="detail-section">
                  <h2>Is this for you?</h2>
                  <ul>
                    <li>
                      <Users size={16} />
                      {drop.eligibility}
                    </li>
                    <li>
                      <Globe size={16} />
                      {drop.region}
                    </li>
                    {drop.requiresCard !== undefined && (
                      <li>
                        <Check size={16} />
                        {drop.requiresCard
                          ? "A payment card is required"
                          : "No card requirement reported; confirm with the provider"}
                      </li>
                    )}
                  </ul>
                  {drop.requiresApplication && (
                    <p>
                      An application is required. Approval is determined by the
                      provider.
                    </p>
                  )}
                  {drop.requirements?.length ? (
                    <ul>
                      {drop.requirements.map((term) => (
                        <li key={term}>{term}</li>
                      ))}
                    </ul>
                  ) : null}
                </section>
                {drop.resourceId && (
                  <CommunityFeedback resourceId={drop.resourceId} />
                )}
              </div>
              <aside className="offer-panel">
                <span>Offer value</span>
                <strong>{drop.value}</strong>
                <dl>
                  <div>
                    <dt>Provider</dt>
                    <dd>{drop.provider}</dd>
                  </div>
                  <div>
                    <dt>Type</dt>
                    <dd>{drop.resourceType}</dd>
                  </div>
                  <div>
                    <dt>Available to</dt>
                    <dd>{drop.eligibility}</dd>
                  </div>
                  <div>
                    <dt>Source</dt>
                    <dd>{drop.source}</dd>
                  </div>
                </dl>
                {drop.claimUrl ? (
                  <a
                    className="button button-primary"
                    href={drop.claimUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Visit offer ↗
                  </a>
                ) : (
                  <button className="button" disabled>
                    Claim link pending verification
                  </button>
                )}
                <p>
                  Check the provider’s current eligibility and terms before
                  claiming.
                </p>
              </aside>
            </div>
          </>
        ) : (
          <div className="empty-state">
            <WarningCircle size={32} />
            <h1>We couldn't find that perk.</h1>
            <p>
              It may have moved. Explore the collection for another useful find.
            </p>
            <Link to="/" className="button">
              Back to discover
            </Link>
          </div>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}

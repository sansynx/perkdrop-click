import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { ResourceRow } from "./resource-row";
import type { FunctionReturnType } from "convex/server";
export function LiveFeed({
  audience,
  search,
  category,
  endingSoon,
  initialData,
}: {
  audience: string;
  search: string;
  category: string;
  endingSoon: boolean;
  initialData?: FunctionReturnType<typeof api.catalog.page> | null;
}) {
  const [cursors, setCursors] = useState<(string | null)[]>([null]);
  const live = useQuery(api.catalog.page, {
    audience,
    search,
    category,
    endingSoon,
    paginationOpts: { numItems: 5, cursor: cursors[cursors.length - 1] },
  });
  const result = live ?? (cursors.length === 1 ? initialData : undefined);
  return (
    <>
      <div className="resource-list">
        {result ? (
          result.page.length ? (
            result.page.map((drop, index) => (
              <ResourceRow key={drop.slug} drop={drop} index={index} />
            ))
          ) : (
            <div className="empty-state">
              <h3>No published perks here yet.</h3>
              <p>
                Verified submissions will appear here. Try another filter or
                share a discovery.
              </p>
            </div>
          )
        ) : (
          <div
            className="feed-skeleton"
            role="status"
            aria-label="Loading perks"
          >
            {[0, 1, 2].map((i) => (
              <div className="skeleton-row" key={i}>
                <span />
                <div>
                  <i />
                  <i />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <nav className="pagination" aria-label="Feed pagination">
        <span>Page {cursors.length}</span>
        <div>
          <button
            disabled={cursors.length === 1 || !result}
            onClick={() => setCursors(cursors.slice(0, -1))}
          >
            Previous
          </button>
          <button
            disabled={!result || result.isDone}
            onClick={() =>
              result && setCursors([...cursors, result.continueCursor])
            }
          >
            Next
          </button>
        </div>
      </nav>
    </>
  );
}

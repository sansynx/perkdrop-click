import { useState } from "react";
import { useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { Check } from "@phosphor-icons/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { backend } from "../lib/convex-client";
import { visitorId } from "../lib/visitor";

const choices = [
  ["claimed", "I claimed this"],
  ["works", "Works"],
  ["expired", "Expired"],
  ["needs_card", "Needs a card"],
  ["region_issue", "Region restriction"],
  ["not_free", "Not free"],
] as const;
type Reaction = (typeof choices)[number][0];

export function CommunityFeedback({
  resourceId,
}: {
  resourceId: Id<"resources">;
}) {
  const counts = useQuery(api.reactions.getSummary, { resourceId });
  const [selected, setSelected] = useState<Reaction[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  async function submit(reactionType: Reaction) {
    if (!backend || busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await backend.mutation(api.reactions.add, {
        resourceId,
        reactionType,
        anonymousId: visitorId(),
      });
      setSelected([...selected, reactionType]);
      setMessage("Thanks. Your feedback has been saved.");
    } catch (error) {
      setError(
        error instanceof ConvexError && typeof error.data === "string"
          ? error.data
          : "Your feedback could not be saved. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="detail-section">
      <h2>Community feedback</h2>
      <p>
        Share what happened when you tried this offer. Reports are community
        observations, not guarantees.
      </p>
      <div className="reaction-row">
        {choices.map(([type, label]) => (
          <button
            key={type}
            disabled={busy || selected.includes(type)}
            aria-pressed={selected.includes(type)}
            onClick={() => void submit(type)}
          >
            {selected.includes(type) && <Check size={14} />} {label}{" "}
            {counts?.[type] ? <span>({counts[type]})</span> : null}
          </button>
        ))}
      </div>
      {message && <p role="status">{message}</p>}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}

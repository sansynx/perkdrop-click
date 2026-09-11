import { expect, it } from "vitest";
import { createDemoSession, decideDemoOffer } from "./reviewer-demo";

it("isolates review decisions between sessions and resets from the snapshot", () => {
  const first = createDemoSession();
  const second = createDemoSession();
  const reviewed = decideDemoOffer(
    first,
    first[0].id,
    "approved",
    "Checked the source",
  );
  expect(reviewed[0].status).toBe("approved");
  expect(first[0].status).toBe("pending");
  expect(second[0].status).toBe("pending");
  expect(createDemoSession()[0].status).toBe("pending");
});

it("rejects invalid decisions, missing reasons, and unknown IDs", () => {
  const state = createDemoSession();
  expect(() =>
    decideDemoOffer(state, "production-id", "approved", "Checked source"),
  ).toThrow();
  expect(() =>
    decideDemoOffer(state, state[0].id, "published", "Checked source"),
  ).toThrow();
  expect(() => decideDemoOffer(state, state[0].id, "rejected", " ")).toThrow();
});

it("keeps a reason for rejection and prevents a second decision without reset", () => {
  const state = createDemoSession();
  const reviewed = decideDemoOffer(
    state,
    state[1].id,
    "rejected",
    "Claim URL does not match",
  );
  expect(reviewed[1].reason).toBe("Claim URL does not match");
  expect(reviewed[1].status).toBe("rejected");
  expect(() =>
    decideDemoOffer(reviewed, state[1].id, "approved", "Changed my mind"),
  ).toThrow();
});

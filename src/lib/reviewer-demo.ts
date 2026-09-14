export const DEMO_CREDENTIAL = "AllGas2026";
export const SNAPSHOT_DATE = "September 11, 2026";

export type DemoOffer = {
  id: string;
  title: string;
  provider: string;
  sourceUrl: string;
  claimUrl: string;
  evidence: string;
  eligibility: string[];
  concern: string;
  status: "pending" | "approved" | "rejected";
};

// Public-source fields copied from actual discoveries. No production IDs or private submissions.
const snapshot: Omit<DemoOffer, "status">[] = [
  {
    id: "demo-github-students",
    title: "GitHub Pro for Students",
    provider: "GitHub",
    sourceUrl: "https://education.github.com/pack",
    claimUrl: "https://education.github.com/pack#start-of-content",
    evidence: '"Free GitHub Pro while you are a student."',
    eligibility: ["Students"],
    concern:
      "Source trust and evidence need review. Regions were not extracted.",
  },
  {
    id: "demo-devengers",
    title: "Hack Devengers 2.0",
    provider: "Devengers",
    sourceUrl:
      "https://www.startupgrantsindia.com/competitions/hack-devengers-20",
    claimUrl: "https://www.startupgrantsindia.com/build-with-bharat-30",
    evidence:
      '"The total prize pool is ₹50,000 in cash, with the winner taking home ₹50,000."',
    eligibility: [
      "Open to developers, students, creators, designers, innovators, and tech enthusiasts.",
    ],
    concern:
      "The extracted claim URL differs from the source event. Verify the event and terms before any real approval.",
  },
  {
    id: "demo-claude-startups",
    title: "Claude for Startups Program",
    provider: "Anthropic",
    sourceUrl:
      "https://opportunitiesforyouth.org/2026/08/11/claude-for-startups/",
    claimUrl: "https://claude.com/programs/startups",
    evidence:
      "Eligible venture-backed startups may also be considered for free Claude credits and priority API rate limits, potentially reducing the cost of developing and testing AI-powered products during the critical early stages of company growth.",
    eligibility: [
      "Any early-stage founder or startup building with Claude.",
      "Startups seeking Claude credits must have received equity funding from an institutional investor.",
      "Startups must not have previously received Anthropic startup credits.",
    ],
    concern:
      "Extracted from a third-party article. Confirm current eligibility and availability on the original provider page.",
  },
];

export function createDemoSession(): DemoOffer[] {
  return snapshot.map((offer) => ({
    ...offer,
    eligibility: [...offer.eligibility],
    status: "pending",
  }));
}

export function decideDemoOffer(
  offers: DemoOffer[],
  id: unknown,
  decision: unknown,
): DemoOffer[] {
  if (decision !== "approved" && decision !== "rejected")
    throw new Error("Choose approve or reject.");
  const offer = offers.find((item) => item.id === id);
  if (!offer) throw new Error("Choose an offer in this demo.");
  if (offer.status !== "pending")
    throw new Error(
      "This demo offer was already reviewed. Reset the demo to try again.",
    );
  return offers.map((item) =>
    item.id === id ? { ...item, status: decision } : item,
  );
}

export const OFFER_CATEGORIES = [
  "AI & APIs",
  "Cloud & Hosting",
  "Developer Tools",
  "Domains",
  "Education",
  "Open Source",
  "Startup",
] as const;

export type OfferCategory = (typeof OFFER_CATEGORIES)[number];

export function isOfferCategory(value: string): value is OfferCategory {
  return (OFFER_CATEGORIES as readonly string[]).includes(value);
}

export function catalogCategory(value: string): OfferCategory {
  return isOfferCategory(value) ? value : "Developer Tools";
}

export const OFFER_AUDIENCES = [
  "Everyone",
  "Students",
  "Developers",
  "Startups",
  "OSS",
  "Hackathons",
  "Creators",
  "Researchers",
] as const;

export type OfferAudience = (typeof OFFER_AUDIENCES)[number];

export function isOfferAudience(value: string): value is OfferAudience {
  return (OFFER_AUDIENCES as readonly string[]).includes(value);
}

export function catalogAudience(value: string): OfferAudience {
  return isOfferAudience(value) ? value : "Everyone";
}

export function inferAudience(eligibility: string[]) {
  const text = eligibility.join(" ").toLowerCase();
  for (const [pattern, audience] of [
    [/student/, "Students"],
    [/startup|founder/, "Startups"],
    [/open.source|maintainer/, "OSS"],
    [/hackathon/, "Hackathons"],
    [/research/, "Researchers"],
    [/creator/, "Creators"],
    [/developer/, "Developers"],
    [/everyone|anyone|all users/, "Everyone"],
  ] as const)
    if (pattern.test(text)) return audience;
  return "Everyone";
}

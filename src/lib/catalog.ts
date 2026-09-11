export type Drop = {
  resourceId?: import("../../convex/_generated/dataModel").Id<"resources">;
  requiresApplication?: boolean;
  requirements?: string[];
  claimUrl?: string;
  imageUrl?: string;
  slug: string;
  provider: string;
  providerMark: string;
  logoUrl: string;
  title: string;
  description: string;
  value: string;
  category: string;
  resourceType: string;
  eligibility: string;
  region: string;
  source: string;
  sourceType: string;
  ago: string;
  claimed: string;
  confirmed: string;
  expires?: string;
  requiresCard?: boolean;
};

export const categories = [
  "Everything",
  "AI & APIs",
  "Cloud & Hosting",
  "Developer Tools",
  "Domains",
  "Education",
  "Open Source",
  "Startup",
];
export const audiences = [
  "Everyone",
  "Students",
  "Developers",
  "Startups",
  "OSS",
  "Hackathons",
  "Creators",
  "Researchers",
];

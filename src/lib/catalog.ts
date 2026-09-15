import { OFFER_AUDIENCES, OFFER_CATEGORIES } from "../../convex/lib/categories";
import { publicMeta } from "../../convex/lib/intakePolicy";

export type Drop = {
  resourceId?: import("../../convex/_generated/dataModel").Id<"resources">;
  requiresApplication?: boolean;
  requirements?: string[];
  claimUrl?: string;
  imageUrl?: string;
  foundOn?: string;
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

export const categories = ["Everything", ...OFFER_CATEGORIES];
export const audiences = [...OFFER_AUDIENCES];

export function hostOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

export function visibleMeta(value: string) {
  return publicMeta(value);
}

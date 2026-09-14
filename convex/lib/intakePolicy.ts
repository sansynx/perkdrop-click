export function canonicalUrl(input: string): string {
  if (input.length > 2048) throw new Error("URL is too long");
  const url = new URL(input.trim());
  const host = url.hostname.toLowerCase();
  if (
    !["https:", "http:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.port ||
    !host.includes(".") ||
    /^[\d.]+$/.test(host) ||
    host.includes(":") ||
    /(^|\.)(localhost|local|internal|test|invalid)$/.test(host) ||
    host.endsWith(".")
  )
    throw new Error("Enter a public website URL");
  url.hash = "";
  for (const key of [...url.searchParams.keys()])
    if (
      /^utm_/i.test(key) ||
      ["fbclid", "gclid", "msclkid"].includes(key.toLowerCase())
    )
      url.searchParams.delete(key);
  url.searchParams.sort();
  return url.href;
}
export function urlIdentity(input: string): string {
  const url = new URL(canonicalUrl(input));
  const host = url.hostname.replace(/^www\./, "").toLowerCase();
  const path = url.pathname.replace(/\/+$/, "") || "/";
  return `${host}${path}${url.search}`;
}
export function urlVariants(input: string): string[] {
  const canonical = canonicalUrl(input);
  const url = new URL(canonical);
  const hosts = new Set([
    url.hostname,
    url.hostname.replace(/^www\./, ""),
    url.hostname.startsWith("www.") ? url.hostname : `www.${url.hostname}`,
  ]);
  const paths = new Set([
    url.pathname,
    url.pathname.replace(/\/+$/, "") || "/",
    `${url.pathname.replace(/\/+$/, "")}/`,
  ]);
  const variants = new Set<string>();
  for (const host of hosts) {
    for (const path of paths) {
      const copy = new URL(canonical);
      copy.hostname = host;
      copy.pathname = path;
      variants.add(copy.href);
      copy.protocol = copy.protocol === "https:" ? "http:" : "https:";
      variants.add(copy.href);
    }
  }
  return [...variants];
}
export function isLowValueDiscovery(input: string): boolean {
  try {
    const url = new URL(canonicalUrl(input));
    return /\/(discussions|issues|pulls?|commits?|wiki)\b/i.test(url.pathname);
  } catch {
    return true;
  }
}
export function isPerkdropHost(host: string) {
  const name = host.toLowerCase().replace(/\.$/, "");
  if (name === "perkdrop.click" || name.endsWith(".perkdrop.click"))
    return true;
  if (name.split(".").includes("perkdrop-click")) return true;
  for (const raw of [
    process.env.PUBLIC_SITE_URL,
    process.env.CONVEX_SITE_URL,
  ]) {
    const value = raw?.trim();
    if (!value) continue;
    try {
      const site = new URL(value).hostname.toLowerCase().replace(/^www\./, "");
      if (name === site || name.endsWith(`.${site}`)) return true;
    } catch {
      /* Ignore unset or invalid site URLs. */
    }
  }
  return false;
}
export type Offer = {
  provider: string;
  title: string;
  description: string;
  claimUrl: string;
  valueText: string;
  eligibility: string[];
  requirements: string[];
  regions: string[];
  requiresCard: boolean;
  requiresApplication: boolean;
  evidence: string;
  isOffer: boolean;
  termsKnown: boolean;
  expiresAt?: number;
};
const normalized = (value: string) =>
  value.trim().toLowerCase().replace(/\s+/g, " ");
export function offerKey(offer: Offer): string {
  return JSON.stringify([
    canonicalUrl(offer.claimUrl),
    normalized(offer.provider),
    normalized(offer.title),
    normalized(offer.valueText),
    [...offer.eligibility].map(normalized).sort(),
    [...offer.requirements].map(normalized).sort(),
    [...offer.regions].map(normalized).sort(),
    offer.requiresCard,
    offer.requiresApplication,
  ]);
}
export function assess(
  offer: Offer,
  markdown: string,
  trusted: boolean,
  now: number,
) {
  const reasons: string[] = [];
  if (!offer.isOffer)
    return {
      decision: "rejected" as const,
      reasons: ["No concrete offer found"],
    };
  if (offer.expiresAt !== undefined && offer.expiresAt <= now)
    return { decision: "rejected" as const, reasons: ["Offer has expired"] };
  try {
    canonicalUrl(offer.claimUrl);
  } catch {
    reasons.push("Claim URL is missing or unsafe");
  }
  if (!trusted) reasons.push("Source has not been explicitly trusted");
  if (!offer.termsKnown || !offer.eligibility.length || !offer.regions.length)
    reasons.push("Eligibility or terms need verification");
  if (
    offer.evidence.length < 24 ||
    !normalized(markdown).includes(normalized(offer.evidence))
  )
    reasons.push("Evidence needs verification");
  if (offer.requiresCard) reasons.push("Payment card requirement");
  if (offer.requiresApplication) reasons.push("Application required");
  if (!offer.valueText || !offer.title || !offer.provider)
    reasons.push("Missing offer details");
  return {
    decision: reasons.length ? ("pending" as const) : ("approved" as const),
    reasons: reasons.length
      ? reasons
      : ["Trusted page with explicit offer evidence"],
  };
}
export function providerLogo(
  claimUrl: string,
  provider?: string,
): string | undefined {
  let host: string;
  try {
    host = new URL(canonicalUrl(claimUrl)).hostname;
  } catch {
    return undefined;
  }
  const logos: Record<string, string> = {
    "education.github.com": "github",
    "github.com": "github",
    "devpost.com": "devpost",
    "resend.com": "resend",
  };
  const brand = logos[host.replace(/^www\./, "")];
  const token = provider ? normalized(provider).replace(/[^a-z]/g, "") : "";
  return brand && (!provider || token === brand || token.includes(brand))
    ? `https://cdn.simpleicons.org/${brand}/262626`
    : undefined;
}
export function resolveProviderLogo(
  claimUrl: string,
  provider?: string,
  favicon?: unknown,
): string | undefined {
  return providerLogo(claimUrl, provider) ?? sourceFavicon(favicon, claimUrl);
}
export function sourceFavicon(
  value: unknown,
  claimUrl: string,
): string | undefined {
  try {
    const source = new URL(canonicalUrl(claimUrl));
    if (source.protocol !== "https:") return undefined;
    const fallback = `${source.origin}/favicon.ico`;
    if (typeof value !== "string" || value.length > 2048) return fallback;
    try {
      const icon = new URL(value, source);
      return icon.origin === source.origin && !icon.username && !icon.password
        ? canonicalUrl(icon.href)
        : fallback;
    } catch {
      return fallback;
    }
  } catch {
    return undefined;
  }
}

export function safeRewardImage(
  value: unknown,
  claimUrl?: string,
): string | undefined {
  if (typeof value !== "string" || value.length > 2048 || !claimUrl)
    return undefined;
  try {
    const image = new URL(value);
    const claim = new URL(canonicalUrl(claimUrl));
    if (
      image.protocol !== "https:" ||
      image.username ||
      image.password ||
      image.port
    )
      return undefined;
    const imageHost = image.hostname.replace(/^www\./, "").toLowerCase();
    const claimHost = claim.hostname.replace(/^www\./, "").toLowerCase();
    if (imageHost !== claimHost) return undefined;
    if (/\/(discussions|issues|pulls?)\b/i.test(image.pathname))
      return undefined;
    return image.href;
  } catch {
    return undefined;
  }
}

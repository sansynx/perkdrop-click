import { describe, expect, it } from "vitest";
import {
  assess,
  canonicalUrl,
  isPerkdropHost,
  offerKey,
  providerLogo,
  safeRewardImage,
  sourceFavicon,
  type Offer,
} from "./lib/intakePolicy";
const offer: Offer = {
  provider: "Resend",
  title: "Developer credits",
  description: "Credits for developers",
  claimUrl: "https://resend.com/startups",
  valueText: "$100",
  eligibility: ["Startups"],
  requirements: [],
  regions: ["Worldwide"],
  requiresCard: false,
  requiresApplication: false,
  evidence: "Eligible startups receive $100 in email credits.",
  isOffer: true,
  termsKnown: true,
};
describe("submission policy", () => {
  it("accepts source icons only from the validated offer origin", () => {
    expect(sourceFavicon("/brand/icon.png", "https://example.com/perk")).toBe(
      "https://example.com/brand/icon.png",
    );
    expect(
      sourceFavicon("https://tracker.example/icon", "https://example.com/perk"),
    ).toBe("https://example.com/favicon.ico");
    expect(sourceFavicon("/icon", "http://127.0.0.1")).toBeUndefined();
    expect(
      sourceFavicon("javascript:alert(1)", "https://example.com/perk"),
    ).toBe("https://example.com/favicon.ico");
  });
  it("deduplicates tracking links without dropping offer identity", () => {
    expect(
      canonicalUrl("https://resend.com/startups?utm_source=x&tier=a#top"),
    ).toBe("https://resend.com/startups?tier=a");
    expect(canonicalUrl("https://resend.com/startups?tier=b")).not.toBe(
      canonicalUrl("https://resend.com/startups?tier=a"),
    );
  });
  it.each([
    "http://127.0.0.1",
    "http://2130706433",
    "http://[::1]",
    "http://10.0.0.1",
    "http://localhost",
    "http://service.internal",
    "https://user:pass@resend.com",
    "file:///etc/passwd",
    "http://resend.com:8080",
  ])("blocks unsafe URL %s", (url) =>
    expect(() => canonicalUrl(url)).toThrow(),
  );
  it("recognizes Perkdrop hosts so crawlers cannot loop", () => {
    expect(isPerkdropHost("perkdrop.click")).toBe(true);
    expect(isPerkdropHost("perkdrop-click.sanathr106.chatgpt.site")).toBe(true);
    expect(isPerkdropHost("resend.com")).toBe(false);
  });
  it("does not merge distinct campaigns or eligibility", () => {
    expect(offerKey(offer)).not.toBe(offerKey({ ...offer, valueText: "$200" }));
    expect(offerKey(offer)).not.toBe(
      offerKey({ ...offer, eligibility: ["Students"] }),
    );
    expect(offerKey(offer)).not.toBe(offerKey({ ...offer, expiresAt: 123 }));
  });
  it("requires explicit trust and source evidence for automation", () => {
    expect(assess(offer, offer.evidence, false, 1).decision).toBe("pending");
    expect(assess(offer, "unrelated text", true, 1).decision).toBe("pending");
    expect(assess(offer, offer.evidence, true, 1).decision).toBe("approved");
    expect(
      assess({ ...offer, termsKnown: false }, offer.evidence, true, 1).decision,
    ).toBe("pending");
    expect(
      assess({ ...offer, expiresAt: 1 }, offer.evidence, true, 2).decision,
    ).toBe("rejected");
  });
  it("only accepts curated logo and image hosts", () => {
    expect(providerLogo("https://resend.com/startups")).toContain("/resend/");
    expect(
      providerLogo("https://education.github.com/pack", "GitHub Education"),
    ).toContain("/github/");
    expect(providerLogo("https://www.devpost.com/challenges")).toContain(
      "/devpost/",
    );
    expect(providerLogo("https://resend.com.evil.example")).toBeUndefined();
    expect(safeRewardImage("http://127.0.0.1/photo")).toBeUndefined();
    expect(safeRewardImage("https://tracking.example/photo")).toBeUndefined();
    expect(
      safeRewardImage("https://opengraph.githubassets.com/hash/org/repo"),
    ).toBeDefined();
  });
});

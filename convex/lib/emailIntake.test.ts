import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  extractPublicUrls,
  receiptMail,
  receiptText,
  senderEmail,
} from "./emailIntake";

describe("forwarded mail intake", () => {
  beforeEach(() => {
    vi.stubEnv(
      "PUBLIC_SITE_URL",
      "https://perkdrop-click.sanathr106.chatgpt.site",
    );
    vi.stubEnv("CONVEX_SITE_URL", "https://example.convex.site");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });
  it("keeps public claim URLs and drops Perkdrop links", () => {
    expect(
      extractPublicUrls(
        "Credits: https://resend.com/startups?utm_source=nl.",
        'Also see <a href="https://perkdrop.click/drop/x">here</a> and https://github.com/edu',
      ),
    ).toEqual(["https://resend.com/startups", "https://github.com/edu"]);
  });
  it("ignores AgentMail chrome and quoted replies", () => {
    expect(
      extractPublicUrls(
        "Please check https://resend.com/startups and https://agentmail.to/",
      ),
    ).toEqual(["https://resend.com/startups"]);
    expect(
      extractPublicUrls(
        "https://resend.com/startups\n\nOn Fri, Ada wrote:\n> https://github.com/edu\n",
      ),
    ).toEqual(["https://resend.com/startups"]);
    expect(
      extractPublicUrls(
        '<div>https://resend.com/startups</div><blockquote><a href="https://share.google/old">old</a></blockquote>',
      ),
    ).toEqual(["https://resend.com/startups"]);
  });
  it("reads the sender address from common email shapes", () => {
    expect(senderEmail("Ada <ada@example.com>")).toBe("ada@example.com");
    expect(senderEmail([{ email: "Ada@Example.com" }])).toBe("ada@example.com");
    expect(senderEmail("not-an-email")).toBeUndefined();
    expect(
      senderEmail("a@example.com\r\nBcc: victim@example.com"),
    ).toBeUndefined();
  });
  it("keeps offer links inside a forwarded Outlook or Gmail message", () => {
    expect(
      extractPublicUrls(
        "Fwd: Credits",
        "See below\nFrom: Offers <offers@example.com>\nSent: Friday\nhttps://resend.com/startups",
      ),
    ).toEqual(["https://resend.com/startups"]);
    expect(
      extractPublicUrls(
        "Fw: Credits",
        '<blockquote><a href="https://resend.com/startups">Apply</a></blockquote>',
      ),
    ).toEqual(["https://resend.com/startups"]);
  });
  it("confirms each link instead of dumping job ids", () => {
    const text = receiptText([
      {
        id: "job1",
        duplicate: false,
        url: "https://resend.com/startups",
      },
      { id: "job2", duplicate: true, url: "https://github.com/edu" },
    ]);
    expect(text).toContain("https://resend.com/startups");
    expect(text).toContain("https://github.com/edu");
    expect(text).toContain("\n\nWe're checking the original page now.\n");
    expect(text).toContain("We already have this one.");
    expect(text).not.toContain("job1");
    expect(text).not.toContain("job2");
    const { html } = receiptMail([
      {
        id: "job1",
        duplicate: false,
        url: "https://resend.com/startups",
      },
      { id: "job2", duplicate: true, url: "https://github.com/edu" },
    ]);
    expect(html).toContain("#d74708");
    expect(html).toContain("#fff1e9");
    expect(html).toContain("perkdrop");
    expect(html).toContain("https://example.convex.site/brand/mark.png");
    expect(html).toContain(
      "https://perkdrop-click.sanathr106.chatgpt.site/submit",
    );
    expect(html).toContain("resend.com/startups");
    expect(html).toContain("github.com/edu");
    expect(html).toContain("Checking source");
    expect(html).toContain("Already received");
    expect(html).toContain('href="https://resend.com/startups"');
    expect(html).not.toContain("Open the page");
  });
});

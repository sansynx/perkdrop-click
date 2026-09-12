import { canonicalUrl, isPerkdropHost } from "./intakePolicy";
import { convexSiteUrl, publicSiteUrl } from "./origins";

const URL_PATTERN = /https?:\/\/[^\s<>"'`\\]+/gi;
const HREF_PATTERN = /href=["'](https?:\/\/[^"']+)["']/gi;

export function stripQuotedMail(source: string) {
  let text = source.replace(/\r\n/g, "\n");
  text = text.replace(/<blockquote\b[^>]*>[\s\S]*?<\/blockquote>/gi, "\n");
  text = text.replace(
    /<div[^>]*class="[^"]*(?:gmail_quote|yahoo_quoted|protonmail_quote)[^"]*"[^>]*>[\s\S]*$/i,
    "\n",
  );
  text = text.replace(
    /<div[^>]*id="(?:divRplyFwdMsg|appendonsend)"[^>]*>[\s\S]*$/i,
    "\n",
  );
  text = text.replace(/\nOn .{0,220}wrote:\n[\s\S]*$/i, "\n");
  text = text.replace(/\n-{2,} ?Original Message ?-{2,}[\s\S]*$/i, "\n");
  text = text.replace(/\nFrom:\s.+\nSent:\s[\s\S]*$/i, "\n");
  text = text.replace(/^\s*>.*$/gm, "");
  return text;
}

function isIgnoredIntakeHost(host: string) {
  const name = host.toLowerCase().replace(/^www\./, "");
  if (isPerkdropHost(name)) return true;
  return name === "agentmail.to" || name.endsWith(".agentmail.to");
}

export function extractPublicUrls(
  ...parts: Array<string | null | undefined>
): string[] {
  const found = new Set<string>();
  const forwarded = /^\s*fw(?:d)?:/i.test(parts[0] ?? "");
  for (const part of parts) {
    if (!part) continue;
    const decoded = part.slice(0, 100_000).replace(/&amp;/g, "&");
    const source = forwarded ? decoded : stripQuotedMail(decoded);
    const matches = [
      ...(source.match(URL_PATTERN) ?? []),
      ...[...source.matchAll(HREF_PATTERN)].map((match) => match[1]),
    ];
    for (const raw of matches) {
      const trimmed = raw.replace(/[),.;:!?]+$/g, "");
      try {
        const url = canonicalUrl(trimmed);
        if (isIgnoredIntakeHost(new URL(url).hostname)) continue;
        found.add(url);
      } catch {
        /* Skip tracking links and unusable URLs. */
      }
      if (found.size >= 5) return [...found];
    }
  }
  return [...found];
}

export function senderEmail(from: unknown): string | undefined {
  if (typeof from === "string") {
    if (/[\r\n]/.test(from)) return undefined;
    const bracket = from.match(/<([^>]+)>/);
    const value = (bracket?.[1] ?? from).trim().toLowerCase();
    return value.length <= 320 &&
      /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(value)
      ? value
      : undefined;
  }
  if (Array.isArray(from)) {
    for (const entry of from) {
      const email = senderEmail(entry);
      if (email) return email;
    }
    return undefined;
  }
  if (from && typeof from === "object" && "email" in from) {
    const email = (from as { email: unknown }).email;
    return typeof email === "string" ? senderEmail(email) : undefined;
  }
  return undefined;
}

export function receiptText(
  receipts: { id: string; duplicate: boolean; url?: string }[],
): string {
  return receiptMail(receipts).text;
}

export function receiptMail(
  receipts: { id: string; duplicate: boolean; url?: string }[],
): { text: string; html: string } {
  const intro =
    receipts.length === 1
      ? "Got your email. This is the link we took from it."
      : `Got your email. We found ${receipts.length} links in it.`;
  const items = receipts.map((item, index) => {
    const link = item.url ?? "the link you sent";
    const status = item.duplicate
      ? "We already have this one. No second listing."
      : "We're checking the original page now.";
    const prefix = receipts.length > 1 ? `${index + 1}. ` : "";
    return { link, status, prefix, duplicate: item.duplicate, index };
  });
  const text = [
    intro,
    "",
    ...items.flatMap((item) => [
      `${item.prefix}${item.link}`,
      "",
      item.status,
      "",
    ]),
    "It only goes live if the offer is real and who can claim it is clear.",
    "",
    `Wrong link? Reply here, or paste the URL at ${submitUrl() || "the submit page"}`,
  ].join("\n");
  const cards = items
    .map((item) =>
      linkCard(
        item.link,
        item.status,
        item.duplicate,
        item.index,
        receipts.length > 1,
      ),
    )
    .join("");
  const heading =
    receipts.length === 1
      ? "Got this link."
      : `Found ${receipts.length} links.`;
  return {
    text,
    html: mailFrame({
      preheader: intro,
      kicker: "We got your email",
      heading,
      body: cards + footerBlock(),
    }),
  };
}

export function noticeMail(kind: "unavailable" | "limited"): {
  text: string;
  html: string;
} {
  const text =
    kind === "unavailable" ? unavailableMailText() : limitedMailText();
  return {
    text,
    html: mailFrame({
      preheader: text,
      kicker: "Perkdrop",
      heading:
        kind === "unavailable"
          ? "Can't check that yet."
          : "Couldn't queue those links.",
      body: `<p style="margin:0 0 24px;font-size:16px;line-height:1.6;color:#686868;">${escapeHtml(text)}</p>${footerBlock()}`,
    }),
  };
}

export const unavailableMailText = () => {
  const submit = submitUrl();
  return submit
    ? `We got your email, but we can't check sources right now. Try again in a few minutes, or paste the claim URL at ${submit}`
    : "We got your email, but we can't check sources right now. Try again in a few minutes.";
};

export const limitedMailText = () => {
  const submit = submitUrl();
  return submit
    ? `We got your email, but we couldn't queue those links. The daily cap may be hit. Try again later at ${submit}. Email and web submissions share the same limits.`
    : "We got your email, but we couldn't queue those links. The daily cap may be hit.";
};

function linkLabel(url: string) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, "");
    const path = parsed.pathname.replace(/\/$/, "");
    return path && path !== "/" ? `${host}${path}` : host;
  } catch {
    return url;
  }
}

function markSrc() {
  const site = convexSiteUrl();
  return site ? `${site}/brand/mark.png` : "";
}

function submitUrl() {
  const site = publicSiteUrl();
  return site ? `${site}/submit` : "";
}

function linkCard(
  url: string,
  status: string,
  duplicate: boolean,
  index: number,
  numbered: boolean,
) {
  const safeHref = escapeAttribute(url);
  const title = escapeHtml(linkLabel(url));
  const label = duplicate ? "Already received" : "Checking source";
  const labelColor = duplicate ? "#686868" : "#d74708";
  const background = duplicate ? "#f3f3f3" : "#fff1e9";
  const border = duplicate ? "#e9e9e9" : "#f3c4a8";
  const number = numbered ? `${index + 1}. ` : "";
  return `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 18px;border:1px solid ${border};border-radius:12px;background:${background};">
  <tr>
    <td align="center" style="padding:22px 24px;font-family:Arial,Helvetica,sans-serif;">
      <p style="margin:0 0 12px;font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:${labelColor};font-weight:700;">${number}${label}</p>
      <p style="margin:0 0 12px;font-size:16px;line-height:1.45;font-weight:700;word-break:break-all;">
        <a href="${safeHref}" style="color:#d74708;text-decoration:none;">${title}</a>
      </p>
      <p style="margin:0;font-size:15px;line-height:1.6;color:#686868;">${escapeHtml(status)}</p>
    </td>
  </tr>
</table>`;
}

function footerBlock() {
  const submit = submitUrl();
  const button = submit
    ? `<table role="presentation" cellpadding="0" cellspacing="0" align="center" style="margin:0 auto;">
  <tr>
    <td align="center" bgcolor="#d74708" style="background:#d74708;border-radius:8px;">
      <a href="${escapeAttribute(submit)}" style="display:inline-block;padding:13px 22px;font-size:14px;font-weight:700;color:#ffffff;text-decoration:none;">Submit another find</a>
    </td>
  </tr>
</table>`
    : "";
  return `
<p style="margin:4px 0 12px;font-size:15px;line-height:1.7;color:#686868;text-align:center;">It only goes live if the offer is real and who can claim it is clear.</p>
<p style="margin:0 0 24px;font-size:15px;line-height:1.7;color:#686868;text-align:center;">Wrong link? Reply to this thread.</p>
${button}`;
}

function brandRow() {
  const site = publicSiteUrl();
  const mark = markSrc();
  const markCell = mark
    ? `<td valign="middle" style="padding-right:10px;">
      <img src="${escapeAttribute(mark)}" width="32" height="32" alt="" style="display:block;border:0;width:32px;height:32px;" />
    </td>`
    : "";
  const name = `<td valign="middle" style="font-size:20px;letter-spacing:-0.4px;font-weight:700;color:#252525;font-family:Arial,Helvetica,sans-serif;">perkdrop<span style="color:#777;font-weight:400;">.click</span></td>`;
  const inner = `<table role="presentation" cellpadding="0" cellspacing="0" align="center" style="margin:0 auto;"><tr>${markCell}${name}</tr></table>`;
  if (!site) return inner;
  return `<a href="${escapeAttribute(site)}" style="text-decoration:none;color:#252525;">${inner}</a>`;
}

function mailFrame(args: {
  preheader: string;
  kicker: string;
  heading: string;
  body: string;
}) {
  const font = "Arial,Helvetica,sans-serif";
  return `<!doctype html>
<html lang="en">
<body style="margin:0;padding:0;background:#fafafa;">
  <div style="display:none;max-height:0;overflow:hidden;color:#fafafa;font-size:1px;line-height:1px;">${escapeHtml(args.preheader)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#fafafa" style="background:#fafafa;">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" align="center" style="width:100%;max-width:560px;background:#ffffff;border:1px solid #e9e9e9;">
          <tr>
            <td align="center" style="padding:28px 24px 20px;border-bottom:1px solid #e9e9e9;font-family:${font};">
              ${brandRow()}
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:32px 28px 36px;font-family:${font};color:#252525;">
              <p style="margin:0 0 10px;font-size:11px;letter-spacing:0.16em;text-transform:uppercase;color:#d74708;font-weight:700;">${escapeHtml(args.kicker)}</p>
              <h1 style="margin:0 0 28px;font-size:28px;line-height:1.2;letter-spacing:-0.6px;font-weight:700;color:#252525;">${escapeHtml(args.heading)}</h1>
              ${args.body}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttribute(value: string) {
  return escapeHtml(value).replace(/'/g, "&#39;");
}

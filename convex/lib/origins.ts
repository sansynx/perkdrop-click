export function publicSiteUrl() {
  return process.env.PUBLIC_SITE_URL?.trim().replace(/\/$/, "") ?? "";
}

export function convexSiteUrl() {
  return process.env.CONVEX_SITE_URL?.trim().replace(/\/$/, "") ?? "";
}

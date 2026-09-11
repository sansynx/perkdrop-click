import handler from "@tanstack/react-start/server-entry";

export default {
  fetch: (async (...args) => {
    const response = await handler.fetch(...args);
    const headers = new Headers(response.headers);
    headers.set("X-Content-Type-Options", "nosniff");
    headers.set("X-Frame-Options", "DENY");
    headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
    headers.set(
      "Permissions-Policy",
      "camera=(), microphone=(), geolocation=()",
    );
    headers.set(
      "Content-Security-Policy",
      "object-src 'none'; base-uri 'self'; frame-ancestors 'none'",
    );
    if (new URL(args[0].url).pathname.startsWith("/admin")) {
      headers.set("Cache-Control", "no-store");
      headers.set("X-Robots-Tag", "noindex, nofollow");
    }
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  }) satisfies typeof handler.fetch,
};

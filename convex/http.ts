import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { agentmail } from "./agentmailClient";
import { MARK_PNG_BASE64 } from "./lib/brandMark";

const http = httpRouter();
http.route({
  path: "/agentmail/webhook",
  method: "POST",
  handler: httpAction(async (ctx, req) =>
    agentmail.handleWebhook(ctx as never, req),
  ),
});
http.route({
  path: "/brand/mark.png",
  method: "GET",
  handler: httpAction(async () => {
    const bytes = Uint8Array.from(atob(MARK_PNG_BASE64), (char) =>
      char.charCodeAt(0),
    );
    return new Response(bytes, {
      status: 200,
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=86400",
      },
    });
  }),
});
export default http;

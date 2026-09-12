import { components, internal } from "./_generated/api";
import { AgentMail } from "@agentmail/convex";

export const agentmail: AgentMail = new AgentMail(components.agentmail, {
  onMessageReceived: internal.email.onMessageReceived,
});

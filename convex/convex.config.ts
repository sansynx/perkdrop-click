import { defineApp } from "convex/server";
import workflow from "@convex-dev/workflow/convex.config.js";
import agentmail from "@agentmail/convex/convex.config.js";
const app = defineApp();
app.use(workflow);
app.use(agentmail);
export default app;

import { expect, it } from "vitest";
import {
  agentDestination,
  registerAgentTools,
  type AgentTool,
  type ModelContext,
} from "./webmcp";

it("only permits fixed public destinations, never arbitrary URLs or admin", () => {
  expect(agentDestination("catalog")).toBe("/#feed");
  expect(agentDestination("reviewer_demo")).toBe("/reviewer-demo");
  for (const value of ["admin", "https://example.com", "__proto__", null, {}])
    expect(() => agentDestination(value)).toThrow();
});

it("works without WebMCP and cancels registrations on cleanup", () => {
  registerAgentTools(undefined, [], () => {
    throw new Error("Not expected");
  })();
  let signal: AbortSignal | undefined;
  const context: ModelContext = {
    registerTool: async (_tool, options) => {
      signal = options.signal;
    },
  };
  const tool: AgentTool = {
    name: "test",
    description: "Test",
    inputSchema: {},
    execute: () => "ok",
  };
  const cleanup = registerAgentTools(context, [tool], () => {
    throw new Error("Not expected");
  });
  expect(signal?.aborted).toBe(false);
  cleanup();
  expect(signal?.aborted).toBe(true);
});

it("handles browser permission rejection without an unhandled promise", async () => {
  let errors = 0;
  const context: ModelContext = {
    registerTool: async () => {
      throw new Error("NotAllowedError");
    },
  };
  registerAgentTools(
    context,
    [
      {
        name: "test",
        description: "Test",
        inputSchema: {},
        execute: () => "ok",
      },
    ],
    () => errors++,
  );
  await Promise.resolve();
  await Promise.resolve();
  expect(errors).toBe(1);
});

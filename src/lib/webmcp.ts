export type AgentTool = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations?: {
    readOnlyHint?: boolean;
    untrustedContentHint?: boolean;
    consequentialHint?: boolean;
  };
  execute: (input: Record<string, unknown>) => unknown | Promise<unknown>;
};
export type ModelContext = {
  registerTool: (
    tool: AgentTool,
    options: { signal: AbortSignal },
  ) => Promise<void>;
};

// Feature detection keeps browsers without the experimental API fully usable.
export function registerAgentTools(
  context: ModelContext | undefined,
  tools: AgentTool[],
  reportError: () => void,
) {
  const controller = new AbortController();
  if (context?.registerTool) {
    for (const tool of tools) {
      try {
        Promise.resolve(
          context.registerTool(tool, { signal: controller.signal }),
        ).catch(() => {
          if (!controller.signal.aborted) reportError();
        });
      } catch {
        reportError();
      }
    }
  }
  return () => controller.abort();
}

export function browserModelContext() {
  return (document as Document & { modelContext?: ModelContext }).modelContext;
}

export const publicDestinations = {
  catalog: "/#feed",
  submit: "/submit",
  reviewer_demo: "/reviewer-demo",
} as const;

export function agentDestination(value: unknown) {
  if (typeof value !== "string" || !Object.hasOwn(publicDestinations, value))
    throw new Error("Choose catalog, submit, or reviewer_demo.");
  return publicDestinations[value as keyof typeof publicDestinations];
}

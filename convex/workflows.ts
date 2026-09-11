import { WorkflowManager } from "@convex-dev/workflow";
import { components, internal } from "./_generated/api";
import { v } from "convex/values";
export const workflow = new WorkflowManager(components.workflow, {
  workpoolOptions: {
    maxParallelism: 2,
    defaultRetryBehavior: { maxAttempts: 3, initialBackoffMs: 65000, base: 2 },
  },
});
export const intake = workflow
  .define({
    args: { jobId: v.id("intakeJobs"), url: v.string() },
    returns: v.null(),
  })
  .handler(async (step, args): Promise<null> => {
    try {
      const extracted = await step.runAction(
        internal.intake.extract,
        { url: args.url },
        { retry: true },
      );
      await step.runMutation(internal.intake.finish, { ...args, ...extracted });
    } catch {
      await step.runMutation(internal.intake.fail, { jobId: args.jobId });
    }
    return null;
  });

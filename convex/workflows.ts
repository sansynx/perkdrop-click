import { WorkflowManager } from "@convex-dev/workflow";
import { components, internal } from "./_generated/api";
import { v } from "convex/values";
export const workflow = new WorkflowManager(components.workflow, {
  workpoolOptions: {
    maxParallelism: 10,
    defaultRetryBehavior: { maxAttempts: 2, initialBackoffMs: 65000, base: 2 },
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
    } catch (error) {
      await step.runMutation(internal.intake.fail, {
        jobId: args.jobId,
        message: error instanceof Error ? error.message : undefined,
      });
    }
    return null;
  });

/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as admin from "../admin.js";
import type * as catalog from "../catalog.js";
import type * as crons from "../crons.js";
import type * as discovery from "../discovery.js";
import type * as intake from "../intake.js";
import type * as lib_firecrawl from "../lib/firecrawl.js";
import type * as lib_intakePolicy from "../lib/intakePolicy.js";
import type * as lifecycle from "../lifecycle.js";
import type * as reactions from "../reactions.js";
import type * as revalidation from "../revalidation.js";
import type * as submissions from "../submissions.js";
import type * as workflows from "../workflows.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  admin: typeof admin;
  catalog: typeof catalog;
  crons: typeof crons;
  discovery: typeof discovery;
  intake: typeof intake;
  "lib/firecrawl": typeof lib_firecrawl;
  "lib/intakePolicy": typeof lib_intakePolicy;
  lifecycle: typeof lifecycle;
  reactions: typeof reactions;
  revalidation: typeof revalidation;
  submissions: typeof submissions;
  workflows: typeof workflows;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  workflow: import("@convex-dev/workflow/_generated/component.js").ComponentApi<"workflow">;
};

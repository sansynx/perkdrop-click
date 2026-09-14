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
import type * as agentmailClient from "../agentmailClient.js";
import type * as catalog from "../catalog.js";
import type * as crons from "../crons.js";
import type * as discovery from "../discovery.js";
import type * as email from "../email.js";
import type * as http from "../http.js";
import type * as intake from "../intake.js";
import type * as lib_adminSession from "../lib/adminSession.js";
import type * as lib_brandMark from "../lib/brandMark.js";
import type * as lib_categories from "../lib/categories.js";
import type * as lib_emailIntake from "../lib/emailIntake.js";
import type * as lib_firecrawl from "../lib/firecrawl.js";
import type * as lib_intakePolicy from "../lib/intakePolicy.js";
import type * as lib_limits from "../lib/limits.js";
import type * as lib_origins from "../lib/origins.js";
import type * as lib_publications from "../lib/publications.js";
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
  agentmailClient: typeof agentmailClient;
  catalog: typeof catalog;
  crons: typeof crons;
  discovery: typeof discovery;
  email: typeof email;
  http: typeof http;
  intake: typeof intake;
  "lib/adminSession": typeof lib_adminSession;
  "lib/brandMark": typeof lib_brandMark;
  "lib/categories": typeof lib_categories;
  "lib/emailIntake": typeof lib_emailIntake;
  "lib/firecrawl": typeof lib_firecrawl;
  "lib/intakePolicy": typeof lib_intakePolicy;
  "lib/limits": typeof lib_limits;
  "lib/origins": typeof lib_origins;
  "lib/publications": typeof lib_publications;
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
  agentmail: import("@agentmail/convex/_generated/component.js").ComponentApi<"agentmail">;
};

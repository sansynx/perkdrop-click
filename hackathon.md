# Hackathon log

- **Project:** Perkdrop.click
- **Event:** Convex All Gas Hackathon
- **What it does:** Collects free tools, credits, and programs with source links, eligibility details, and moderation before publication.
- **Live app:** https://perkdrop-click.sanathr106.chatgpt.site
- **Repo:** https://github.com/sansynx/perkdrop-click
- **Frontend:** Other, TanStack Start on Sites, with a separate Cloudflare Workers deployment
- **Convex deployment:** https://gregarious-canary-249.convex.cloud
- **Components:** @convex-dev/workflow
- **Convex features:** schema, tables, indexes, full-text search, queries, mutations, actions, crons, scheduled functions, realtime queries
- **Auth:** Other, server-validated administrator token; anonymous public submissions
- **AI models:** none explicitly configured; Firecrawl performs structured extraction
- **Started:** 2026-09-09T14:51:40Z
- **Last updated:** 2026-09-11T12:56:50Z

## Discovery and publication

Discovery is implemented and runs independently of whether the website or repository is public. Making GitHub public does not start or stop searches.

1. Convex schedules discovery every three hours in [convex/crons.ts](convex/crons.ts). Execution requires `DISCOVERY_ENABLED=true`, a configured Firecrawl key, and enabled search records.
2. [convex/discovery.ts](convex/discovery.ts) starts at most four searches per scheduled run. The default topics are cloud and API credits, student benefits, open-source sponsorships, and hackathon rewards. Firecrawl searches the public web with a past-month filter and returns up to five links per search. This is bounded discovery, not an exhaustive scan of the internet.
3. URL normalization and deduplication feed the extraction workflow. Structured offer keys merge matching offers; this does not detect every differently worded duplicate.
4. [convex/lib/intakePolicy.ts](convex/lib/intakePolicy.ts) checks explicit source trust, terms, eligibility, regions, evidence, required details, and card or application requirements. Non-offers and expired offers are rejected. Offers that pass every check can publish automatically; uncertain candidates wait for administrator review.
5. [convex/intake.ts](convex/intake.ts) publishes approved candidates. Administrators can also approve reviewed candidates through [convex/admin.ts](convex/admin.ts). Scheduled revalidation and expiry handling maintain the published catalog.

No source is trusted by default. An empty public catalog can therefore coexist with successful discovery. During the September 11 inspection, the database had 15 pending candidates and zero approved offers. These are dated observations, not live counters. Recent inspected search runs had completed and queued new links.

## Implementation evidence

| Capability         | Repository evidence                                                                            | Scope                                                                        |
| ------------------ | ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Persistent backend | [convex/schema.ts](convex/schema.ts)                                                           | Stores intake, candidates, publications, discovery runs, and review history. |
| Durable processing | [convex/convex.config.ts](convex/convex.config.ts), [convex/workflows.ts](convex/workflows.ts) | Coordinates background work and retries with the Convex workflow component.  |
| Public catalog     | [src/components/live-feed.tsx](src/components/live-feed.tsx)                                   | Reads real Convex data rather than demo listings.                            |
| Moderation         | [convex/admin.ts](convex/admin.ts), [src/routes/admin.tsx](src/routes/admin.tsx)               | Server-authorized review, batch decisions, and operational status.           |
| Lifecycle          | [convex/revalidation.ts](convex/revalidation.ts), [convex/lifecycle.ts](convex/lifecycle.ts)   | Rechecks published offers and handles expiry.                                |
| Automated checks   | [.github/workflows/checks.yml](.github/workflows/checks.yml)                                   | Runs formatting, type checks, tests, and a production build.                 |

## How Codex helped

I used Codex to implement the React routes and Convex backend, connect Firecrawl search and extraction, and write tests for authorization, deduplication, publication, and lifecycle behavior. I supplied the product direction and reviewed the results through screenshots and browser sessions.

That feedback changed concrete parts of the app. Codex removed repeated browse links, separated administrator navigation from public submission controls, corrected overlapping form states, and tightened the review layout. It also traced the empty catalog to pending moderation rather than replacing missing results with mock offers.

Codex helped inspect diffs, run checks, optimize the hero asset, and prepare deployment configuration. Convex and Firecrawl are implemented in the product. Direct OpenAI model calls and AgentMail are not currently implemented; Codex was used during development.

## Log

Earlier entries are reconstructed from Git history. Started records the first meaningful commit, not an independently verified project creation time.

### 2026-09-09 - bd89d31

Created the initial catalog interface, submission and admin routes, brand assets, and Convex schema. This version included demo content and early backend scaffolding, not the finished discovery pipeline (`src/components/perkdrop-app.tsx`, `convex/schema.ts`).

### 2026-09-09 - 0834824

Expanded the discovery interface, offer detail page, submission form, and administrator screen. Added responsive styling and pagination tests (`src/styles.css`, `src/routes`, `vitest.config.ts`).

### 2026-09-11 - 784bf81

Implemented Firecrawl discovery and extraction, URL and offer-key deduplication, explicit trust checks, batch moderation, scheduled revalidation, and expiry handling. Registered the workflow component for bounded concurrency and retries (`convex/discovery.ts`, `convex/intake.ts`, `convex/admin.ts`, `convex/revalidation.ts`, `convex/convex.config.ts`).

### 2026-09-11 - d8566de

Replaced demo listings with the live Convex catalog and server-rendered route data. Added secure page response headers, optimized hero artwork, and configured GitHub Actions to run formatting, type checks, tests, and production builds (`src/server.ts`, `src/components/live-feed.tsx`, `.github/workflows/checks.yml`). Includes the related frontend commit `02592f9`.

### 2026-09-11 - 9ef2a7d

Removed repeated browse links and separated administrator navigation from public submission controls. Fixed checkbox alignment, login helper and error spacing, retry-row wrapping, and excessive discovery-log height (`src/routes/admin.tsx`, `src/styles.css`).

### 2026-09-11 - bd79488

Added a GitHub-rendered Mermaid overview and specific notes about using Codex to implement, test, and debug the project. Documented runtime secret updates and credited the event sponsors (`README.md`).

### 2026-09-11 - working tree

Added 28px above the main hero button and 24px before the results divider to separate it from the filters (`src/styles.css`). Formatting, type checking, and 33 backend tests passed; the production build completed. Added this build log and the submission checklist below.

### 2026-09-11 - public Sites deployment

Published the existing server-rendered app publicly on chatgpt.site with its Convex backend unchanged. Sites reported a successful deployment at 12:56:50 UTC. The source and build scan found zero matches for configured secrets, and the package excluded local environment files. Formatting, type checking, and all 33 tests passed before publication. This establishes hosting status, not completion of the remaining submission requirements.

## Submission requirements and current gaps

### Reviewer access

The reviewer demo route is `/reviewer-demo`. It opens without credential entry and displays the public demo label `AllGas2026`. Three snapshots of actual discovered offers let judges try approval, rejection, reason validation, status filters, and reset. Source text remains explicitly unverified; demo approval is not an endorsement of the offer.

All demo decisions are tab-local and reset on reload. The demo does not write to Convex, reveal the administrator token, publish offers, change trust settings, or start Firecrawl requests. Production administrator authorization remains unchanged.

Optional browser-side WebMCP tools provide fixed public navigation and demo list/decide/reset actions. They use the current `document.modelContext` registration API with abort-based cleanup and graceful fallback to visible controls. No external MCP server or universal agent compatibility is claimed.

Verification on September 11: formatting, TypeScript checks, and all 40 tests passed. The added tests cover isolated decisions, reset, invalid input, navigation restrictions, registration cleanup, and rejection of the public demo credential by production admin functions. Local browser testing confirmed visible reason errors, approval, filters, and native WebMCP list/reject/reset calls. Desktop and 390px mobile layouts were inspected, with no horizontal overflow on mobile. An independent code review found no actionable security or correctness issues in this change.

Checked against the [official event page](https://www.convex.dev/hackathons/all-gas) on September 11, 2026. Deadline: September 22 at noon Pacific, September 23 at 00:30 IST.

- [x] Convex backend and Firecrawl integration implemented.
- [x] Root `hackathon.md` created from repository evidence.
- [x] Public repository, made public with the owner's approval.
- [x] Public app on `convex.site` or `chatgpt.site`. Sites confirmed the public chatgpt.site deployment on September 11.
- [ ] Sponsor-stack product usage. Direct OpenAI functionality and AgentMail integration are absent; Codex was used during development.
- [ ] Confirm Luma registration and participant eligibility, including age 18+, location restrictions, and original work begun after the event's August 25 start.
- [ ] Demo video under three minutes. No video supplied.
- [ ] X or LinkedIn build post tagging the four sponsors. No post supplied.
- [ ] Submit repository, eligible live URL, and video through the event's linked submission form.

## Product work before the demo

- Review pending candidates against their sources and publish only eligible offers. Discovery already runs; pending candidates are not public listings.
- Correct sparse pagination around hidden offers and verify time-based expiry updates in open pages.
- Size recheck throughput for the expected catalog; the current job processes up to 10 due offers per 12-hour run.
- Keep sponsor integration claims factual. Do not represent the current project as submitted or fully compliant.

## Hackathon and thanks

Built as part of the [Convex All Gas hackathon](https://www.convex.dev/hackathons/all-gas). Thank you to Convex, OpenAI, Firecrawl, and AgentMail for hosting and sponsoring the event. The implementation evidence and unchecked requirements above distinguish what has shipped from what remains before submission.

<p align="center"><img src="public/perkdrop-mark.svg" width="72" height="72" alt="Perkdrop logo"></p>
<h1 align="center">Perkdrop.click</h1>
<p align="center">Find free tools, credits, and programs with their eligibility and source links.</p>

[Live website](https://perkdrop-click.sansynx.workers.dev)

## How it works

Visitors browse the reviewed catalog or submit a public offer URL. Convex canonicalizes tracking URLs and checks for an existing submission before starting extraction. Firecrawl searches four configured categories every three hours and extracts evidence and terms from discovered pages.

Repeated offers merge into the existing review entry. Unknown eligibility, payment terms, and untrusted sources require administrator review. Trust is explicit database configuration, never an implicit domain allowlist. Administrators review evidence and approve or reject batches of up to 20. Approved offers appear through reactive Convex queries.

Scheduled checks revisit published offers every 12 hours. Changed terms or repeated verification failures hide an offer for review; expired offers leave the public catalog without deleting their history. Public feedback is deduplicated and rate-limited. It is anonymous feedback, not proof of identity or successful redemption.

There are no demo listings in the production UI. An empty catalog means no offers have been published yet.

## Tech stack

- React 19, TanStack Start and TanStack Router for server rendering and navigation.
- TypeScript, Vite, Geist typography, Phosphor interface icons, and plain CSS.
- Convex for the database, live queries, moderation, scheduled jobs, and durable workflows.
- Firecrawl for search and structured offer extraction.
- Cloudflare Workers for the server-rendered website and static assets.
- Vitest and convex-test for backend behavior tests. GitHub Actions runs checks and the production build.

The hero uses generated artwork delivered as lossless WebP. Provider favicons come from the offer's own HTTPS origin when available, with initials when an image fails. An icon is not a trust signal.

## Run locally

Use Node 22.22.3 or newer and pnpm 11.21.0.

```sh
pnpm install --frozen-lockfile
pnpm exec convex dev
```

In another terminal, set the public deployment URL in an ignored `.env.local` using `.env.example`, then run:

```sh
pnpm run dev
```

Configure `FIRECRAWL_API_KEY` and `ADMIN_REVIEW_TOKEN` in the selected Convex deployment's environment settings. The administrator token must be at least 32 characters. Never prefix secrets with `VITE_`, paste them into source, or commit local environment files.

## Secrets and operations

Firecrawl and administrator credentials belong to **Convex**, where extraction and authorization run. The website Worker does not need those credentials. `VITE_CONVEX_URL` is a public API address, not a secret.

The `/admin` page keeps the entered token in memory, not local storage. Server authorization protects each administrative query and mutation. Do not share the token or browser session. Rotate credentials immediately if exposed.

Discovery runs at 00:00, 03:00, 06:00, and every subsequent three-hour boundary in UTC. Search and intake limits bound spending; failures appear in the administrator activity view. Firecrawl availability and credits still affect discovery. No email or AgentMail service is integrated.

## Validate and deploy

```sh
pnpm run check
pnpm run build
```

Confirm the intended Convex deployment before deploying backend changes:

```sh
pnpm exec convex deploy
pnpm run deploy
```

Deploy the backend first. The frontend uses Cloudflare Workers because it includes server rendering, not a static-only Pages build. `wrangler.jsonc` contains this project's Worker configuration. Use your own account configuration for a fork.

## Code map

- `src/routes`: catalog, offer details, submission, and administrator pages.
- `src/components`: shared navigation, resource rows, live pagination, and feedback.
- `convex/intake.ts` and `convex/lib/intakePolicy.ts`: extraction, validation, deduplication, and publishing.
- `convex/admin.ts`: protected moderation and discovery status.
- `convex/discovery.ts`, `convex/revalidation.ts`, and `convex/lifecycle.ts`: discovery, checks, expiry, and cleanup.
- `convex/schema.ts`: tables and indexes.

## Security boundaries and remaining handoff work

Rate limits and anonymous identifiers limit abuse but cannot establish one-person-one-vote. There is no client-writable visitor counter or analytics SDK. A future count must be recorded server-side and should be described as an estimate.

The current live address is the Workers URL above. Custom-domain ownership and DNS setup require separate verification. A passive scan cannot guarantee the absence of every vulnerability.

The repository is private at the owner's request. The [All Gas hackathon](https://www.convex.dev/hackathons/all-gas) specifies submission requirements that differ from this private-repository and Cloudflare-hosting setup. Confirm those requirements, the build log, demo video, and social submission before entering.

## Built with Codex

Codex helped implement the interface, Convex data model and workflows, Firecrawl integration, moderation tools, tests, asset optimization, and deployment configuration. The project owner directed the design and product decisions and supplied service credentials. Codex is a development tool here, not a runtime dependency. Generated code and extracted offers still need review.

## Thanks

Thank you to **Convex, OpenAI, Firecrawl, and AgentMail**, the hosts and sponsors listed on the [All Gas hackathon event page](https://www.convex.dev/hackathons/all-gas). Their sponsorship does not imply endorsement of individual offers in this catalog.

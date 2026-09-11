import {
  HeadContent,
  Link,
  Scripts,
  createRootRoute,
} from "@tanstack/react-router";
import "@fontsource-variable/geist";
import { BackendProvider } from "../components/backend-provider";
import { AgentNavigation } from "../components/agent-navigation";

import appCss from "../styles.css?url";

export const Route = createRootRoute({
  errorComponent: ({ reset }) => (
    <main className="empty-state">
      <h1>Something went wrong.</h1>
      <p>We couldn't load this page. Please try again.</p>
      <button className="button" onClick={reset}>
        Try again
      </button>
      <p>
        <Link to="/">Back to discover</Link>
      </p>
    </main>
  ),
  notFoundComponent: () => (
    <main className="empty-state">
      <h1>Page not found.</h1>
      <p>This page may have moved or the offer is no longer available.</p>
      <Link className="button" to="/">
        Back to discover
      </Link>
    </main>
  ),
  head: () => ({
    meta: [
      {
        charSet: "utf-8",
      },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1",
      },
      {
        title: "Perkdrop.click - Useful free stuff from around the internet",
      },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      {
        rel: "icon",
        href: "/favicon.svg",
        type: "image/svg+xml",
      },
    ],
  }),
  shellComponent: RootDocument,
});

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        <BackendProvider>
          <AgentNavigation />
          {children}
        </BackendProvider>

        <Scripts />
      </body>
    </html>
  );
}

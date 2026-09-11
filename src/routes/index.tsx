import { createFileRoute } from "@tanstack/react-router";
import { PerkdropApp } from "../components/perkdrop-app";
import { backend } from "../lib/convex-client";
import { api } from "../../convex/_generated/api";

export const Route = createFileRoute("/")({
  loader: async () =>
    backend
      ? backend.query(api.catalog.page, {
          category: "Everything",
          audience: "Everyone",
          search: "",
          endingSoon: false,
          paginationOpts: { cursor: null, numItems: 5 },
        })
      : null,
  component: Home,
});

function Home() {
  return <PerkdropApp initialData={Route.useLoaderData()} />;
}

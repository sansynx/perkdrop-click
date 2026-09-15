import { createFileRoute } from "@tanstack/react-router";
import { PerkdropApp } from "../components/perkdrop-app";
import { backend } from "../lib/convex-client";
import { api } from "../../convex/_generated/api";

export const Route = createFileRoute("/")({
  loader: async () => {
    if (!backend) return null;
    try {
      return await backend.query(api.catalog.page, {
        category: "Everything",
        audience: "Everyone",
        search: "",
        endingSoon: false,
        paginationOpts: { cursor: null, numItems: 5 },
      });
    } catch {
      return null;
    }
  },
  component: Home,
});

function Home() {
  return <PerkdropApp initialData={Route.useLoaderData()} />;
}

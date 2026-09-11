import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  agentDestination,
  browserModelContext,
  registerAgentTools,
} from "../lib/webmcp";

export function AgentNavigation() {
  const navigate = useNavigate();
  useEffect(
    () =>
      registerAgentTools(
        browserModelContext(),
        [
          {
            name: "perkdrop_navigate",
            description:
              "Navigate to the public catalog, submission form, or isolated reviewer demo. Does not submit URLs or perform production moderation.",
            inputSchema: {
              type: "object",
              properties: {
                destination: {
                  type: "string",
                  enum: ["catalog", "submit", "reviewer_demo"],
                },
              },
              required: ["destination"],
              additionalProperties: false,
            },
            execute: async ({ destination }) => {
              const path = agentDestination(destination);
              if (path === "/#feed") await navigate({ to: "/", hash: "feed" });
              else if (path === "/submit") await navigate({ to: "/submit" });
              else await navigate({ to: "/reviewer-demo" });
              return { path };
            },
          },
        ],
        () =>
          console.warn(
            "Optional agent navigation is unavailable. Use the website links.",
          ),
      ),
    [navigate],
  );
  return null;
}

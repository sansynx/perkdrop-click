import { ConvexProvider, ConvexReactClient } from "convex/react";
import type { ReactNode } from "react";
const client = import.meta.env.VITE_CONVEX_URL
  ? new ConvexReactClient(import.meta.env.VITE_CONVEX_URL)
  : null;
export function BackendProvider({ children }: { children: ReactNode }) {
  return client ? (
    <ConvexProvider client={client}>{children}</ConvexProvider>
  ) : (
    children
  );
}

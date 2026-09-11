import { ConvexHttpClient } from "convex/browser";
export const backend = import.meta.env.VITE_CONVEX_URL
  ? new ConvexHttpClient(import.meta.env.VITE_CONVEX_URL)
  : null;

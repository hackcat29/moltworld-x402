import { USE_CASES } from "./nav.js";

/** Every HTML page the site serves (used for rate limiting and tests). */
export const SITE_PATHS = [
  "/",
  "/products",
  "/products/gateway",
  "/models",
  "/products/mandates",
  "/products/marketplace",
  "/products/receipts",
  "/solutions",
  "/solutions/agents",
  "/solutions/developers",
  "/solutions/api-creators",
  "/use-cases",
  ...USE_CASES.map((u) => `/use-cases/${u.slug}`),
  "/playground",
  "/stats",
];

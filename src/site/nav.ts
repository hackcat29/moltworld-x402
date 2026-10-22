import { config } from "../config.js";

export interface NavLink {
  label: string;
  href: string;
  description: string;
}

export interface NavMenu {
  id: string;
  label: string;
  /** Overview page for the section (also the no-JS fallback for the trigger). */
  href: string;
  links: NavLink[];
}

export const USE_CASES = [
  {
    slug: "agent-allowance",
    title: "Spending allowance for personal agents",
    summary: "Give an always-on agent a capped, revocable budget for models it doesn't have.",
  },
  {
    slug: "model-escalation",
    title: "Escalate hard steps to a stronger model",
    summary: "Run on a cheap model and pay for a frontier model only when a step needs it.",
  },
  {
    slug: "content-pipelines",
    title: "Content pipelines",
    summary: "Generate video, voice-overs and images per post, with failed jobs refunded.",
  },
  {
    slug: "agent-commerce",
    title: "Agent-to-agent commerce",
    summary: "Sell your API or agent skill to other agents and get paid per call.",
  },
  {
    slug: "team-budgets",
    title: "Budgets for team agents",
    summary: "One mandate per agent or employee, each with its own limits and an audit trail.",
  },
] as const;

export function navMenus(): NavMenu[] {
  const docs = config.docsUrl;
  return [
    {
      id: "products",
      label: "Products",
      href: "/products",
      links: [
        { label: "Gateway", href: "/products/gateway", description: "One API for chat, image, voice and video models, paid per request." },
        { label: "Models", href: "/models", description: "Every model, its upstream and its price." },
        { label: "Mandates", href: "/products/mandates", description: "Let an agent spend from your wallet, within limits you set." },
        { label: "Marketplace", href: "/products/marketplace", description: "Sell your own API through Moltworld's checkout." },
        { label: "Receipts", href: "/products/receipts", description: "Signed proof of what you paid for and what you got." },
      ],
    },
    {
      id: "solutions",
      label: "Solutions",
      href: "/solutions",
      links: [
        { label: "Agent frameworks", href: "/solutions/agents", description: "OpenClaw, Hermes Agent, Claude Code and any MCP client." },
        { label: "Developers", href: "/solutions/developers", description: "Add AI to your app without API keys or subscriptions." },
        { label: "API creators", href: "/solutions/api-creators", description: "Charge per call for your API, paid in USDC." },
      ],
    },
    {
      id: "use-cases",
      label: "Use cases",
      href: "/use-cases",
      links: USE_CASES.map((u) => ({ label: u.title, href: `/use-cases/${u.slug}`, description: u.summary })),
    },
    {
      id: "docs",
      label: "Docs",
      href: docs,
      links: [
        { label: "Quickstart", href: `${docs}/quickstart`, description: "Make your first paid request in a few minutes." },
        { label: "API reference", href: `${docs}/api-reference/introduction`, description: "Endpoints, request bodies, errors and headers." },
        { label: "SDKs", href: `${docs}/sdks/typescript`, description: "TypeScript and Python clients with spend limits." },
        { label: "Agents and MCP", href: `${docs}/agents/mcp`, description: "Connect OpenClaw, Hermes Agent and other MCP clients." },
      ],
    },
  ];
}

import { GapLabel } from "./navigator.js";

export type CrossSellTemplate = {
  id: string;
  title: string;
  message: string;
  rationale: string;
  suggestedServiceType: "service" | "tool";
};

const TAX_TEMPLATE: CrossSellTemplate = {
  id: "crosssell-tax-assist",
  title: "Optional Tax-Saving Assist",
  message:
    "Optional: if useful, I can also show tax-saving service options after you review the educational recommendations.",
  rationale:
    "Shown only as an optional next step so guidance stays education-first.",
  suggestedServiceType: "service",
};

const INFLATION_TEMPLATE: CrossSellTemplate = {
  id: "crosssell-diversification-assist",
  title: "Optional Diversification Assist",
  message:
    "Optional: once you review diversification basics, I can surface service options that support your risk profile.",
  rationale:
    "Presented after awareness content to avoid hard-sell behavior.",
  suggestedServiceType: "service",
};

const DEBT_TEMPLATE: CrossSellTemplate = {
  id: "crosssell-debt-consolidation",
  title: "Optional Debt Consolidation Comparison",
  message:
    "Optional: if you want, I can compare debt-consolidation service options and show pros/cons before any decision.",
  rationale:
    "Shown only for debt-stress scenarios where service comparison is contextually relevant.",
  suggestedServiceType: "service",
};

const GENERIC_TEMPLATE: CrossSellTemplate = {
  id: "crosssell-generic",
  title: "Optional Service Discovery",
  message:
    "Optional: I can also show relevant ET services, only if you want to explore them now.",
  rationale: "Kept optional and user-controlled to remain non-intrusive.",
  suggestedServiceType: "service",
};

export function getCrossSellTemplate(gapLabel: GapLabel | undefined): CrossSellTemplate {
  switch (gapLabel) {
    case "TAX_CONFUSION":
      return TAX_TEMPLATE;
    case "FD_INFLATION_GAP":
      return INFLATION_TEMPLATE;
    case "DEBT_STRESS":
      return DEBT_TEMPLATE;
    default:
      return GENERIC_TEMPLATE;
  }
}

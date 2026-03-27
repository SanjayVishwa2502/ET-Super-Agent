import { ProductItem } from "./types.js";

export const seedProducts: ProductItem[] = [
  // Loans
  {
    productId: "prod_loan_01",
    title: "HDFC Bank Personal Loan",
    category: "personal-loans",
    eligibilityRules: {
      minIncomeBand: "5-10LPA",
      riskLevel: "medium"
    },
    interestOrFee: "10.5% p.a.",
    benefitTags: ["quick-disbursal", "debt-consolidation", "no-collateral"]
  },
  {
    productId: "prod_loan_02",
    title: "SBI Premier Personal Loan",
    category: "personal-loans",
    eligibilityRules: {
      minIncomeBand: "15-25LPA",
      riskLevel: "low"
    },
    interestOrFee: "9.9% p.a.",
    benefitTags: ["low-interest", "high-ticket-size", "pre-approved"]
  },
  
  // Credit Cards
  {
    productId: "prod_cc_01",
    title: "ICICI Regalia Prime Card",
    category: "credit-cards",
    eligibilityRules: {
      minIncomeBand: "10-15LPA",
      riskLevel: "medium",
      requiresNoDebt: true
    },
    interestOrFee: "₹1,500/year",
    benefitTags: ["rewards", "lounge-access", "lifestyle"]
  },
  {
    productId: "prod_cc_02",
    title: "Axis Platinum Free Card",
    category: "credit-cards",
    eligibilityRules: {
      minIncomeBand: "5-10LPA",
      riskLevel: "low"
    },
    interestOrFee: "Lifetime Free",
    benefitTags: ["zero-fee", "fuel-surcharge-waiver", "first-card"]
  },

  // Mutual Funds & Investments
  {
    productId: "prod_mf_01",
    title: "Parag Parikh Flexi Cap Fund",
    category: "mutual-funds",
    eligibilityRules: {
      riskLevel: "high"
    },
    interestOrFee: "0.5% Expense Ratio",
    benefitTags: ["long-term-wealth", "equity-exposure", "diversified"]
  },
  {
    productId: "prod_mf_02",
    title: "SBI Liquid Debt Fund",
    category: "mutual-funds",
    eligibilityRules: {
      riskLevel: "low"
    },
    interestOrFee: "0.2% Expense Ratio",
    benefitTags: ["emergency-fund", "safe-returns", "high-liquidity"]
  },
  {
    productId: "prod_mf_03",
    title: "Nippon India Large Cap Fund",
    category: "mutual-funds",
    eligibilityRules: {
      riskLevel: "medium"
    },
    interestOrFee: "0.6% Expense Ratio",
    benefitTags: ["bluechip", "consistent-returns", "moderate-volatility"]
  },

  // Insurance
  {
    productId: "prod_ins_01",
    title: "Max Life Term Plan Plus",
    category: "insurance",
    eligibilityRules: {
      riskLevel: "medium"
    },
    interestOrFee: "From ₹800/month",
    benefitTags: ["life-cover", "tax-benefit-80c", "family-protection"]
  },
  {
    productId: "prod_ins_02",
    title: "Star Comprehensive Health",
    category: "insurance",
    eligibilityRules: {
      riskLevel: "low"
    },
    interestOrFee: "From ₹1,200/month",
    benefitTags: ["health-cover", "tax-benefit-80d", "cashless-claims"]
  }
];

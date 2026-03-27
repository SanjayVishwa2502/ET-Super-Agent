import { UserProfile } from "./types.js";

export const seedUsers: UserProfile[] = [
  {
    userId: "u_101_debt",
    name: "Rahul (Debt-Stressed)",
    incomeBand: "5-10LPA",
    riskAppetite: "low",
    activeLoans: ["credit_card_outstanding", "personal_loan"],
    portfolioMix: { equity: 0, debt: 0, cash: 100 },
    goals: ["clear_debt", "emergency_fund"],
  },
  {
    userId: "u_102_hnw",
    name: "Priya (High-Net-Worth)",
    incomeBand: "30LPA+",
    riskAppetite: "high",
    activeLoans: [],
    portfolioMix: { equity: 70, debt: 20, cash: 10 },
    goals: ["wealth_creation", "tax_optimization"],
  },
  {
    userId: "u_103_saver",
    name: "Amit (Young Saver)",
    incomeBand: "10-15LPA",
    riskAppetite: "low",
    activeLoans: [],
    portfolioMix: { equity: 10, debt: 40, cash: 50 },
    goals: ["first_home_downpayment", "safe_returns"],
  },
  {
    userId: "u_104_parent",
    name: "Sneha (Mid-Career Parent)",
    incomeBand: "15-25LPA",
    riskAppetite: "medium",
    activeLoans: ["home_loan"],
    portfolioMix: { equity: 40, debt: 40, cash: 20 },
    goals: ["child_education", "retirement_planning"],
  },
];

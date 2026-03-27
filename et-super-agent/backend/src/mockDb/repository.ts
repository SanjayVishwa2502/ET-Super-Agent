import { seedUsers } from "./users.js";
import { seedArticles } from "./articles.js";
import { seedProducts } from "./products.js";

// Mock DB Repositories
export const userRepository = {
  getById: (id: string) => seedUsers.find((u) => u.userId === id) || null,
  getAll: () => seedUsers,
};

export const articleRepository = {
  getById: (id: string) => seedArticles.find((a) => a.articleId === id) || null,
  getAll: () => seedArticles,
};

export const productRepository = {
  getById: (id: string) => seedProducts.find((p) => p.productId === id) || null,
  getByCategory: (category: string) => seedProducts.filter((p) => p.category === category),
  getByRiskLevel: (riskLevel: string) => seedProducts.filter((p) => p.eligibilityRules.riskLevel === riskLevel),
  getAll: () => seedProducts,
};

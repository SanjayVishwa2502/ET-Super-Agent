import { readFileSync } from "node:fs";
import { KGDataset, KGItem, KGItemTypeSchema, validateKGDataset } from "./kg.schema.js";
import embeddedKgDataset from "./kg.json" with { type: "json" };

type QueryParams = {
  topic?: string;
  intent?: string;
  persona?: string;
  type?: string;
  riskProfile?: "low" | "medium" | "high" | "mixed";
  limit?: number;
};

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function includesMatch(haystack: string[], needle: string): boolean {
  const normalizedNeedle = normalize(needle);
  return haystack.some((entry) => normalize(entry).includes(normalizedNeedle));
}

export class KGRepository {
  private readonly dataset: KGDataset;

  constructor(dataset: KGDataset) {
    this.dataset = dataset;
  }

  static fromFile(filePath?: string): KGRepository {
    if (!filePath) {
      const dataset = validateKGDataset(embeddedKgDataset);
      return new KGRepository(dataset);
    }

    const raw = readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(raw);
    const dataset = validateKGDataset(parsed);
    return new KGRepository(dataset);
  }

  static defaultFilePath(): string {
    return "embedded://kg.json";
  }

  all(): KGItem[] {
    return [...this.dataset];
  }

  byType(type: string): KGItem[] {
    const parsedType = KGItemTypeSchema.parse(type);
    return this.dataset.filter((item) => item.type === parsedType);
  }

  query(params: QueryParams): KGItem[] {
    let items = this.dataset;

    if (params.type) {
      const parsedType = KGItemTypeSchema.parse(params.type);
      items = items.filter((item) => item.type === parsedType);
    }

    if (params.topic) {
      const topic = normalize(params.topic);
      items = items.filter(
        (item) => normalize(item.category).includes(topic) || includesMatch(item.tags, topic),
      );
    }

    if (params.intent) {
      items = items.filter((item) => includesMatch(item.intentMap, params.intent!));
    }

    if (params.persona) {
      items = items.filter((item) => includesMatch(item.audience, params.persona!));
    }

    if (params.riskProfile) {
      items = items.filter((item) => item.riskProfile === params.riskProfile);
    }

    const limit = params.limit && params.limit > 0 ? params.limit : items.length;
    return items.slice(0, limit);
  }

  groupedByType(): Record<"product" | "tool" | "event" | "service", KGItem[]> {
    return {
      product: this.dataset.filter((item) => item.type === "product"),
      tool: this.dataset.filter((item) => item.type === "tool"),
      event: this.dataset.filter((item) => item.type === "event"),
      service: this.dataset.filter((item) => item.type === "service"),
    };
  }
}

export type { QueryParams };

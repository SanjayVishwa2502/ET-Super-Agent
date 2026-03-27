import { z } from "zod";

// ═══════════════════════════════════════════════════════════
// LLM Service – Pluggable Ollama adapter with graceful fallback
// ═══════════════════════════════════════════════════════════

// ─── Configuration ────────────────────────────────────────
const LLM_CONFIG = {
    baseUrl: process.env.LOCAL_MODEL_BASE_URL || "http://localhost:11434",
    model: process.env.LOCAL_MODEL_NAME || "llama3.2:3b",
    // Zero-cost default: model calls run only when explicitly enabled.
    enabled: process.env.USE_LLM === "true",
    timeoutMs: Number(process.env.LLM_TIMEOUT_MS ?? 15000),
    maxRetries: Number(process.env.LLM_MAX_RETRIES ?? 1),
    temperature: Number(process.env.LLM_TEMPERATURE ?? 0.7),
};

// ─── Types ────────────────────────────────────────────────
export type LLMMessage = {
    role: "system" | "user" | "assistant";
    content: string;
};

export type LLMOptions = {
    temperature?: number;
    maxTokens?: number;
    timeoutMs?: number;
    model?: string;
    /** If true, returns JSON mode (structured output) */
    jsonMode?: boolean;
};

export type LLMResponse = {
    content: string;
    fallback: boolean;
    model: string;
    durationMs: number;
    error?: string;
};

// ─── Ollama response schema ──────────────────────────────
const ollamaChatResponseSchema = z.object({
    message: z.object({
        role: z.string(),
        content: z.string(),
    }),
    done: z.boolean(),
    total_duration: z.number().optional(),
});

// ─── Service class ───────────────────────────────────────
export class LLMService {
    private static instance: LLMService | null = null;
    private available: boolean | null = null;
    private lastHealthCheck = 0;
    private readonly healthCheckIntervalMs = 30_000; // Re-check every 30s

    static getInstance(): LLMService {
        if (!LLMService.instance) {
            LLMService.instance = new LLMService();
        }
        return LLMService.instance;
    }

    /** Quick check: is LLM enabled and likely available? */
    get isEnabled(): boolean {
        return LLM_CONFIG.enabled;
    }

    get modelName(): string {
        return LLM_CONFIG.model;
    }

    /** Health check: ping Ollama to see if it's running */
    async checkHealth(): Promise<boolean> {
        if (!LLM_CONFIG.enabled) return false;

        const now = Date.now();
        if (this.available !== null && now - this.lastHealthCheck < this.healthCheckIntervalMs) {
            return this.available;
        }

        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 3000);
            const res = await fetch(`${LLM_CONFIG.baseUrl}/api/tags`, {
                signal: controller.signal,
            });
            clearTimeout(timeout);
            this.available = res.ok;
        } catch {
            this.available = false;
        }

        this.lastHealthCheck = now;
        return this.available;
    }

    /**
     * Send a chat completion request to Ollama.
     * Returns graceful fallback if Ollama is unavailable.
     */
    async chat(messages: LLMMessage[], options?: LLMOptions): Promise<LLMResponse> {
        const startTime = Date.now();
        const model = options?.model ?? LLM_CONFIG.model;
        const timeoutMs = options?.timeoutMs ?? LLM_CONFIG.timeoutMs;

        // 1. Check if LLM is enabled
        if (!LLM_CONFIG.enabled) {
            return {
                content: "",
                fallback: true,
                model,
                durationMs: 0,
                error: "LLM disabled via USE_LLM=false",
            };
        }

        // 2. Health check
        const healthy = await this.checkHealth();
        if (!healthy) {
            return {
                content: "",
                fallback: true,
                model,
                durationMs: Date.now() - startTime,
                error: "Ollama not reachable",
            };
        }

        // 3. Build request body
        const body: Record<string, any> = {
            model,
            messages,
            stream: false,
            options: {
                temperature: options?.temperature ?? LLM_CONFIG.temperature,
            },
        };

        if (options?.maxTokens) {
            body.options.num_predict = options.maxTokens;
        }

        if (options?.jsonMode) {
            body.format = "json";
        }

        // 4. Send request with retry
        let lastError: string | undefined;
        for (let attempt = 0; attempt <= LLM_CONFIG.maxRetries; attempt++) {
            try {
                const controller = new AbortController();
                const timeout = setTimeout(() => controller.abort(), timeoutMs);

                const res = await fetch(`${LLM_CONFIG.baseUrl}/api/chat`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(body),
                    signal: controller.signal,
                });

                clearTimeout(timeout);

                if (!res.ok) {
                    lastError = `Ollama returned ${res.status}: ${await res.text()}`;
                    continue;
                }

                const json = await res.json();
                const parsed = ollamaChatResponseSchema.safeParse(json);

                if (!parsed.success) {
                    lastError = `Invalid Ollama response shape: ${parsed.error.message}`;
                    continue;
                }

                return {
                    content: parsed.data.message.content.trim(),
                    fallback: false,
                    model,
                    durationMs: Date.now() - startTime,
                };
            } catch (err: any) {
                lastError = err.name === "AbortError"
                    ? `LLM timeout after ${timeoutMs}ms`
                    : `LLM request failed: ${err.message}`;
            }
        }

        // All retries failed → graceful fallback
        this.available = false; // Mark as down, will re-check after interval
        return {
            content: "",
            fallback: true,
            model,
            durationMs: Date.now() - startTime,
            error: lastError,
        };
    }

    /**
     * Convenience: single-turn completion (system + user message).
     */
    async complete(systemPrompt: string, userMessage: string, options?: LLMOptions): Promise<LLMResponse> {
        return this.chat(
            [
                { role: "system", content: systemPrompt },
                { role: "user", content: userMessage },
            ],
            options,
        );
    }

    /**
     * Convenience: multi-turn completion (system + history + latest user message).
     */
    async conversationalComplete(
        systemPrompt: string,
        history: Array<{ role: "user" | "assistant"; content: string }>,
        latestMessage: string,
        options?: LLMOptions,
    ): Promise<LLMResponse> {
        const messages: LLMMessage[] = [
            { role: "system", content: systemPrompt },
            ...history.slice(-10).map((h) => ({
                role: h.role as "user" | "assistant",
                content: h.content,
            })),
            { role: "user", content: latestMessage },
        ];

        return this.chat(messages, options);
    }

    /** Reset cached state (useful for testing) */
    resetCache(): void {
        this.available = null;
        this.lastHealthCheck = 0;
    }
}

// ─── Singleton export ────────────────────────────────────
export const llm = LLMService.getInstance();

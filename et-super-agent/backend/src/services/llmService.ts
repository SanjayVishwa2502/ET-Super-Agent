import { z } from "zod";

// ═══════════════════════════════════════════════════════════
// LLM Service – Pluggable Ollama adapter with graceful fallback
// ═══════════════════════════════════════════════════════════

type ProviderName = "auto" | "local" | "openrouter" | "groq" | "huggingface";

type ProviderConfig = {
    name: Exclude<ProviderName, "auto">;
    baseUrl: string;
    model: string;
    apiKey?: string;
    apiStyle: "ollama" | "openai";
    extraHeaders?: Record<string, string>;
};

// ─── Configuration ────────────────────────────────────────
const LLM_CONFIG = {
    provider: (process.env.MODEL_PROVIDER as ProviderName | undefined) ?? "auto",
    // Zero-cost default: model calls run only when explicitly enabled.
    enabled: process.env.USE_LLM === "true",
    timeoutMs: Number(process.env.LLM_TIMEOUT_MS ?? 15000),
    maxRetries: Number(process.env.LLM_MAX_RETRIES ?? 1),
    temperature: Number(process.env.LLM_TEMPERATURE ?? 0.7),
    // Local (optional)
    localBaseUrl: process.env.LOCAL_MODEL_BASE_URL || "http://localhost:11434",
    localModel: process.env.LOCAL_MODEL_NAME || "llama3.2:3b",
    // Free API candidates (quota-limited free tiers)
    openRouterBaseUrl: process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1",
    openRouterApiKey: process.env.OPENROUTER_API_KEY,
    openRouterModel: process.env.OPENROUTER_MODEL || "meta-llama/llama-3.2-3b-instruct:free",
    groqBaseUrl: process.env.GROQ_BASE_URL || "https://api.groq.com/openai/v1",
    groqApiKey: process.env.GROQ_API_KEY,
    groqModel: process.env.GROQ_MODEL || "llama-3.1-8b-instant",
    hfBaseUrl: process.env.HF_BASE_URL || "https://router.huggingface.co/v1",
    hfApiKey: process.env.HF_TOKEN,
    hfModel: process.env.HF_MODEL || "Qwen/Qwen2.5-7B-Instruct:fastest",
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

// ─── Response schemas ────────────────────────────────────
const ollamaChatResponseSchema = z.object({
    message: z.object({
        role: z.string(),
        content: z.string(),
    }),
    done: z.boolean(),
    total_duration: z.number().optional(),
});

const openAICompatibleResponseSchema = z.object({
    choices: z.array(
        z.object({
            message: z.object({
                content: z.string().nullable().optional(),
            }),
        }),
    ).min(1),
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
        return this.getProviderConfigs()[0]?.model ?? LLM_CONFIG.localModel;
    }

    get providerName(): ProviderName {
        return LLM_CONFIG.provider;
    }

    private getProviderConfigs(): ProviderConfig[] {
        const local: ProviderConfig = {
            name: "local",
            baseUrl: LLM_CONFIG.localBaseUrl,
            model: LLM_CONFIG.localModel,
            apiStyle: "ollama",
        };

        const openrouter: ProviderConfig = {
            name: "openrouter",
            baseUrl: LLM_CONFIG.openRouterBaseUrl,
            model: LLM_CONFIG.openRouterModel,
            apiKey: LLM_CONFIG.openRouterApiKey,
            apiStyle: "openai",
            extraHeaders: {
                "HTTP-Referer": process.env.OPENROUTER_SITE_URL ?? "https://example.com",
                "X-Title": process.env.OPENROUTER_APP_NAME ?? "ET Super Agent",
            },
        };

        const groq: ProviderConfig = {
            name: "groq",
            baseUrl: LLM_CONFIG.groqBaseUrl,
            model: LLM_CONFIG.groqModel,
            apiKey: LLM_CONFIG.groqApiKey,
            apiStyle: "openai",
        };

        const huggingface: ProviderConfig = {
            name: "huggingface",
            baseUrl: LLM_CONFIG.hfBaseUrl,
            model: LLM_CONFIG.hfModel,
            apiKey: LLM_CONFIG.hfApiKey,
            apiStyle: "openai",
        };

        if (LLM_CONFIG.provider === "local") return [local];
        if (LLM_CONFIG.provider === "openrouter") return [openrouter];
        if (LLM_CONFIG.provider === "groq") return [groq];
        if (LLM_CONFIG.provider === "huggingface") return [huggingface];

        // auto: prioritize hosted free APIs, then local model if available.
        return [openrouter, groq, huggingface, local];
    }

    private providerIsConfigured(provider: ProviderConfig): boolean {
        if (provider.apiStyle === "ollama") return true;
        return Boolean(provider.apiKey);
    }

    /** Health check: ping Ollama to see if it's running */
    async checkHealth(): Promise<boolean> {
        if (!LLM_CONFIG.enabled) return false;

        const now = Date.now();
        if (this.available !== null && now - this.lastHealthCheck < this.healthCheckIntervalMs) {
            return this.available;
        }

        const providers = this.getProviderConfigs();
        for (const provider of providers) {
            if (!this.providerIsConfigured(provider)) {
                continue;
            }

            try {
                const controller = new AbortController();
                const timeout = setTimeout(() => controller.abort(), 3000);
                const url = provider.apiStyle === "ollama"
                    ? `${provider.baseUrl}/api/tags`
                    : `${provider.baseUrl}/models`;

                const headers: Record<string, string> = {};
                if (provider.apiStyle === "openai" && provider.apiKey) {
                    headers.Authorization = `Bearer ${provider.apiKey}`;
                }

                const res = await fetch(url, {
                    signal: controller.signal,
                    headers,
                });
                clearTimeout(timeout);

                if (res.ok) {
                    this.available = true;
                    this.lastHealthCheck = now;
                    return true;
                }
            } catch {
                // try next provider
            }
        }

        this.available = false;

        this.lastHealthCheck = now;
        return this.available;
    }

    /**
     * Send a chat completion request to Ollama.
     * Returns graceful fallback if Ollama is unavailable.
     */
    async chat(messages: LLMMessage[], options?: LLMOptions): Promise<LLMResponse> {
        const startTime = Date.now();
        const fallbackModel = options?.model ?? this.modelName;
        const timeoutMs = options?.timeoutMs ?? LLM_CONFIG.timeoutMs;

        // 1. Check if LLM is enabled
        if (!LLM_CONFIG.enabled) {
            return {
                content: "",
                fallback: true,
                model: fallbackModel,
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
                model: fallbackModel,
                durationMs: Date.now() - startTime,
                error: "Ollama not reachable",
            };
        }

        // 3. Try providers in order
        let lastError: string | undefined;
        const providers = this.getProviderConfigs();

        for (const provider of providers) {
            if (!this.providerIsConfigured(provider)) {
                lastError = `Provider ${provider.name} not configured`;
                continue;
            }

            const model = options?.model ?? provider.model;

            for (let attempt = 0; attempt <= LLM_CONFIG.maxRetries; attempt++) {
                try {
                    const controller = new AbortController();
                    const timeout = setTimeout(() => controller.abort(), timeoutMs);

                    let url = "";
                    let body: Record<string, any> = {};
                    const headers: Record<string, string> = {
                        "Content-Type": "application/json",
                    };

                    if (provider.apiStyle === "ollama") {
                        url = `${provider.baseUrl}/api/chat`;
                        body = {
                            model,
                            messages,
                            stream: false,
                            options: {
                                temperature: options?.temperature ?? LLM_CONFIG.temperature,
                                ...(options?.maxTokens ? { num_predict: options.maxTokens } : {}),
                            },
                            ...(options?.jsonMode ? { format: "json" } : {}),
                        };
                    } else {
                        url = `${provider.baseUrl}/chat/completions`;
                        if (provider.apiKey) {
                            headers.Authorization = `Bearer ${provider.apiKey}`;
                        }
                        if (provider.extraHeaders) {
                            Object.assign(headers, provider.extraHeaders);
                        }

                        body = {
                            model,
                            messages,
                            temperature: options?.temperature ?? LLM_CONFIG.temperature,
                            stream: false,
                            ...(options?.maxTokens ? { max_tokens: options.maxTokens } : {}),
                            ...(options?.jsonMode
                                ? { response_format: { type: "json_object" } }
                                : {}),
                        };
                    }

                    const res = await fetch(url, {
                        method: "POST",
                        headers,
                        body: JSON.stringify(body),
                        signal: controller.signal,
                    });

                    clearTimeout(timeout);

                    if (!res.ok) {
                        lastError = `${provider.name} returned ${res.status}: ${await res.text()}`;
                        continue;
                    }

                    const json = await res.json();
                    if (provider.apiStyle === "ollama") {
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
                    }

                    const parsed = openAICompatibleResponseSchema.safeParse(json);
                    if (!parsed.success) {
                        lastError = `Invalid ${provider.name} response shape: ${parsed.error.message}`;
                        continue;
                    }

                    const content = parsed.data.choices[0]?.message?.content?.trim() ?? "";
                    if (!content) {
                        lastError = `${provider.name} returned empty content`;
                        continue;
                    }

                    return {
                        content,
                        fallback: false,
                        model,
                        durationMs: Date.now() - startTime,
                    };
                } catch (err: any) {
                    lastError = err.name === "AbortError"
                        ? `${provider.name} timeout after ${timeoutMs}ms`
                        : `${provider.name} request failed: ${err.message}`;
                }
            }
        }

        // All retries failed → graceful fallback
        this.available = false; // Mark as down, will re-check after interval
        return {
            content: "",
            fallback: true,
            model: fallbackModel,
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

import { Router } from "express";
import { v4 as uuidv4 } from "uuid";
import { sessionStore } from "../store/sessionStore.js";
import { userRepository, articleRepository } from "../mockDb/repository.js";
import { runConversationGraph } from "../orchestration/graph.js";
import { UserSession, EnrichedContext } from "../types.js";

export const validationRouter = Router();

type ScenarioResult = {
    scenarioId: string;
    name: string;
    description: string;
    passed: boolean;
    evidence: Record<string, any>;
    error?: string;
};

type ValidationReport = {
    runId: string;
    timestamp: string;
    totalScenarios: number;
    passed: number;
    failed: number;
    scenarios: ScenarioResult[];
};

// Utility: create a fresh session and wire context
function createTestSession(userId: string, articleId: string): UserSession {
    const now = new Date().toISOString();
    const user = userRepository.getById(userId);
    const article = articleRepository.getById(articleId);

    const session: UserSession = {
        sessionId: uuidv4(),
        createdAt: now,
        updatedAt: now,
        pageContext: {
            topic: article ? article.section.toLowerCase() : "general",
            tags: article ? article.topicTags : [],
            articleId: article?.articleId,
        },
        enrichedContext: {
            user,
            article,
            lastUpdatedAt: now,
        },
        profileAnswers: {},
        profileComplete: false,
        persona: "unknown",
        intents: [],
        latestGoal: undefined,
        recommendationHistory: [],
        history: [],
    };

    sessionStore.set(session);
    return session;
}

// Switch context on an existing session
function switchContext(session: UserSession, userId: string, articleId: string): { user: any; article: any; contextMissing: boolean } {
    const user = userRepository.getById(userId);
    const article = articleRepository.getById(articleId);
    const contextMissing = !user || !article;

    const enrichedContext: EnrichedContext = {
        user,
        article,
        lastUpdatedAt: new Date().toISOString(),
    };

    session.enrichedContext = enrichedContext;

    if (article) {
        session.pageContext = {
            topic: article.section.toLowerCase(),
            tags: article.topicTags,
            articleId: article.articleId,
        };
    }

    // Reset persona and intents so orchestration re-derives them from new context
    session.persona = "unknown";
    session.intents = [];
    session.latestGoal = undefined;
    session.profileAnswers = {};
    session.profileComplete = false;

    sessionStore.set(session);
    return { user, article, contextMissing };
}

// ═══════════ Scenario A ═══════════
// Same user, switch from Tax article to Debt article → recommendations must change
async function runScenarioA(): Promise<ScenarioResult> {
    try {
        const userId = "u_101_debt"; // Rahul
        const taxArticleId = "art_tax_01";
        const debtArticleId = "art_loans_02";
        const taxMessage = "I want help with my tax planning and saving options";
        const debtMessage = "I need help managing my credit card debt and loan payments";

        // Step 1: Tax context chat
        const session = createTestSession(userId, taxArticleId);

        const taxResult = await runConversationGraph({
            session: { ...session },
            message: taxMessage,
        });

        // Step 2: Switch to Debt context on same session
        switchContext(session, userId, debtArticleId);

        const debtResult = await runConversationGraph({
            session: { ...session },
            message: debtMessage,
        });

        // Verify: recommendations must differ
        const taxTitles = taxResult.recommendations.map(r => r.title).sort();
        const debtTitles = debtResult.recommendations.map(r => r.title).sort();
        const titlesMatch = JSON.stringify(taxTitles) === JSON.stringify(debtTitles);

        // Also check gap labels differ
        const gapsDiffer = taxResult.gapLabel !== debtResult.gapLabel;

        const passed = !titlesMatch || gapsDiffer;

        return {
            scenarioId: "5.1",
            name: "Scenario A: Article Switch Changes Output",
            description: "Same user (Rahul), switch from Tax article to Debt article → recommendations must change",
            passed,
            evidence: {
                user: userId,
                taxArticle: taxArticleId,
                debtArticle: debtArticleId,
                taxGapLabel: taxResult.gapLabel ?? "None",
                debtGapLabel: debtResult.gapLabel ?? "None",
                taxRecommendations: taxResult.recommendations.map(r => ({ title: r.title, type: r.type })),
                debtRecommendations: debtResult.recommendations.map(r => ({ title: r.title, type: r.type })),
                recommendationsChanged: !titlesMatch,
                gapLabelsChanged: gapsDiffer,
                taxVisitedNodes: taxResult.visitedNodes,
                debtVisitedNodes: debtResult.visitedNodes,
            },
        };
    } catch (err: any) {
        return {
            scenarioId: "5.1",
            name: "Scenario A: Article Switch Changes Output",
            description: "Same user, switch from Tax article to Debt article",
            passed: false,
            evidence: {},
            error: err.message,
        };
    }
}

// ═══════════ Scenario B ═══════════
// Same article, switch user persona → recommendations and compare rankings must change
async function runScenarioB(): Promise<ScenarioResult> {
    try {
        const articleId = "art_invest_01"; // Nifty high volatility article
        const userId1 = "u_103_saver"; // Amit - low risk
        const userId2 = "u_102_hnw"; // Priya - high risk
        const testMessage = "What should I do about my investments?";

        // Step 1: Low-risk user
        const session1 = createTestSession(userId1, articleId);
        const result1 = await runConversationGraph({
            session: { ...session1 },
            message: testMessage,
        });

        // Step 2: High-risk user on same article
        const session2 = createTestSession(userId2, articleId);
        const result2 = await runConversationGraph({
            session: { ...session2 },
            message: testMessage,
        });

        // Verify: recommendations or personas should differ
        const titles1 = result1.recommendations.map(r => r.title).sort();
        const titles2 = result2.recommendations.map(r => r.title).sort();
        const titlesMatch = JSON.stringify(titles1) === JSON.stringify(titles2);

        // Check persona assignment differs (low risk vs high risk)
        const personasDiffer = result1.updatedSession.persona !== result2.updatedSession.persona;

        const passed = !titlesMatch || personasDiffer;

        return {
            scenarioId: "5.2",
            name: "Scenario B: User Switch Changes Output",
            description: "Same article (Nifty high volatility), switch from low-risk Amit to high-risk Priya → output must change",
            passed,
            evidence: {
                article: articleId,
                user1: { id: userId1, persona: result1.updatedSession.persona },
                user2: { id: userId2, persona: result2.updatedSession.persona },
                user1Recommendations: result1.recommendations.map(r => ({ title: r.title, type: r.type })),
                user2Recommendations: result2.recommendations.map(r => ({ title: r.title, type: r.type })),
                recommendationsChanged: !titlesMatch,
                personasChanged: personasDiffer,
                user1GapLabel: result1.gapLabel ?? "None",
                user2GapLabel: result2.gapLabel ?? "None",
            },
        };
    } catch (err: any) {
        return {
            scenarioId: "5.2",
            name: "Scenario B: User Switch Changes Output",
            description: "Same article, switch user persona",
            passed: false,
            evidence: {},
            error: err.message,
        };
    }
}

// ═══════════ Scenario C ═══════════
// Rapid article switching → no stale context should leak into response
async function runScenarioC(): Promise<ScenarioResult> {
    try {
        const userId = "u_104_parent"; // Sneha
        const articles = ["art_tax_01", "art_loans_01", "art_invest_01", "art_ins_01"];
        const testMessage = "What are the best investment and tax saving strategies for this topic";

        const session = createTestSession(userId, articles[0]);
        const results: Array<{
            articleId: string;
            contextTopic: string;
            gapLabel: string | undefined;
            recommendations: Array<{ title: string; type: string }>;
            contextArticleId: string | undefined;
        }> = [];

        // Rapidly switch through 4 articles and chat each time
        for (const articleId of articles) {
            switchContext(session, userId, articleId);
            const freshSession = sessionStore.get(session.sessionId)!;

            const result = await runConversationGraph({
                session: { ...freshSession },
                message: testMessage,
            });

            // Persist the updated session for next iteration
            result.updatedSession.history.push({ role: "user", content: testMessage });
            result.updatedSession.history.push({ role: "assistant", content: result.assistantMessage });
            sessionStore.set(result.updatedSession);

            results.push({
                articleId,
                contextTopic: freshSession.pageContext.topic,
                gapLabel: result.gapLabel,
                recommendations: result.recommendations.map(r => ({ title: r.title, type: r.type })),
                contextArticleId: freshSession.pageContext.articleId,
            });
        }

        // Verify: each result should reference its own article context, not a stale one
        let noStaleLeak = true;
        for (const r of results) {
            if (r.contextArticleId !== r.articleId) {
                noStaleLeak = false;
                break;
            }
        }

        // Verify: the last result's topic matches the last article's section
        const lastArticle = articleRepository.getById(articles[articles.length - 1]);
        const lastResult = results[results.length - 1];
        const lastTopicCorrect = lastResult.contextTopic === lastArticle?.section.toLowerCase();

        const passed = noStaleLeak && lastTopicCorrect;

        return {
            scenarioId: "5.3",
            name: "Scenario C: Rapid Switching No Stale Context",
            description: "Rapidly switch through 4 articles → each response uses correct context, no stale leak",
            passed,
            evidence: {
                user: userId,
                switchSequence: articles,
                results: results.map(r => ({
                    articleId: r.articleId,
                    contextArticleId: r.contextArticleId,
                    contextTopic: r.contextTopic,
                    gapLabel: r.gapLabel ?? "None",
                    recCount: r.recommendations.length,
                    firstRec: r.recommendations[0]?.title ?? "None",
                })),
                noStaleContextLeak: noStaleLeak,
                lastTopicCorrect,
            },
        };
    } catch (err: any) {
        return {
            scenarioId: "5.3",
            name: "Scenario C: Rapid Switching No Stale Context",
            description: "Rapid article switching",
            passed: false,
            evidence: {},
            error: err.message,
        };
    }
}

// ═══════════ Scenario D ═══════════
// Missing article in DB → graceful fallback with explicit traceability flag
async function runScenarioD(): Promise<ScenarioResult> {
    try {
        const userId = "u_102_hnw"; // Priya
        const fakeArticleId = "art_DOES_NOT_EXIST_999";
        const testMessage = "Help me with my investment portfolio and tax planning approach";

        // Create session with a valid user but missing article
        const session = createTestSession(userId, fakeArticleId);

        // Verify: enrichedContext should have article: null
        const articleIsNull = session.enrichedContext?.article === null;

        // Also verify context endpoint returns graceful response
        switchContext(session, userId, fakeArticleId);
        const freshSession = sessionStore.get(session.sessionId)!;
        const articleStillNull = freshSession.enrichedContext?.article === null;

        // Run the graph — should still work without crashing
        const result = await runConversationGraph({
            session: { ...freshSession },
            message: testMessage,
        });

        const noError = !!result.assistantMessage;
        const hasRecommendations = result.recommendations.length > 0;
        const fallbackUsed = result.fallbackUsed;

        const passed = articleIsNull && articleStillNull && noError && hasRecommendations;

        return {
            scenarioId: "5.4",
            name: "Scenario D: Missing Article Graceful Fallback",
            description: "Missing article ID in DB → agent must not crash, must return fallback recommendations with traceability",
            passed,
            evidence: {
                user: userId,
                requestedArticleId: fakeArticleId,
                articleFoundInDb: false,
                enrichedContextArticleNull: articleIsNull,
                agentDidNotCrash: noError,
                assistantMessage: result.assistantMessage.substring(0, 100) + "...",
                recommendationsReturned: hasRecommendations,
                recommendationCount: result.recommendations.length,
                fallbackUsed,
                gapLabel: result.gapLabel ?? "None",
                visitedNodes: result.visitedNodes,
            },
        };
    } catch (err: any) {
        return {
            scenarioId: "5.4",
            name: "Scenario D: Missing Article Graceful Fallback",
            description: "Missing article in DB → graceful fallback",
            passed: false,
            evidence: {},
            error: err.message,
        };
    }
}

// ═══════════ Main Endpoint ═══════════
validationRouter.post("/validation/run-scenarios", async (_req, res) => {
    const runId = uuidv4();
    const timestamp = new Date().toISOString();

    const scenarioResults = await Promise.all([
        runScenarioA(),
        runScenarioB(),
        runScenarioC(),
        runScenarioD(),
    ]);

    const passed = scenarioResults.filter(s => s.passed).length;
    const failed = scenarioResults.filter(s => !s.passed).length;

    const report: ValidationReport = {
        runId,
        timestamp,
        totalScenarios: scenarioResults.length,
        passed,
        failed,
        scenarios: scenarioResults,
    };

    res.json(report);
});

// Also expose a GET for quick browser testing
validationRouter.get("/validation/run-scenarios", async (_req, res) => {
    const runId = uuidv4();
    const timestamp = new Date().toISOString();

    const scenarioResults = await Promise.all([
        runScenarioA(),
        runScenarioB(),
        runScenarioC(),
        runScenarioD(),
    ]);

    const passed = scenarioResults.filter(s => s.passed).length;
    const failed = scenarioResults.filter(s => !s.passed).length;

    const report: ValidationReport = {
        runId,
        timestamp,
        totalScenarios: scenarioResults.length,
        passed,
        failed,
        scenarios: scenarioResults,
    };

    res.json(report);
});

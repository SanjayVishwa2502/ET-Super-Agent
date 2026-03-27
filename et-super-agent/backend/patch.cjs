const fs = require('fs');
const path = '../backend/src/orchestration/graph.ts';
let code = fs.readFileSync(path, 'utf8');

const startIndex = code.indexOf('const recommendationAgentNode = async (state: typeof GraphState.State) => {');
const endIndex = code.indexOf('const crossSellAgentNode = async (state: typeof GraphState.State) => {');

if (startIndex === -1 || endIndex === -1) {
  console.log("Could not find start or end.", startIndex, endIndex);
  process.exit(1);
}

const newCode = `const recommendationAgentNode = async (state: typeof GraphState.State) => {
  const topic = state.session.pageContext.topic;
  const intent = state.session.intents[0];
  const persona = state.session.persona;
  const educationalTurn = isEducationalQuery(state.message);

  const latestGoal = inferLatestGoal({
    message: state.message,
    pageTopic: topic,
    fallbackIntent: state.session.latestGoal ?? intent,
  });
  const topicHint = educationalTurn ? "basics" : deriveTopicFromGoal(latestGoal, topic);

  state.session.latestGoal = latestGoal;

  let computedRecommendations = [];
  let fallbackIsUsed = false;

  if (process.env.SIMULATE_KG_UNAVAILABLE === "true") {
    computedRecommendations = buildEmptyCandidateFallbackRecommendations({ topic, intent: latestGoal });
    fallbackIsUsed = true;
  } else {
    // MOCK DB INTEGRATION: If user is low risk, filter out high risk products
    let allProducts = kgRepository.all();
    if (state.session.enrichedContext?.user && state.session.enrichedContext?.user.riskAppetite === "low") {
      allProducts = allProducts.filter(p => !p.riskProfile || p.riskProfile === "low");
    }

    const primaryCandidates = kgRepository.query({ topic: topicHint, intent: latestGoal, limit: 10 });
    let fallbackCandidates = primaryCandidates.length >= 3 ? primaryCandidates : allProducts;

    const ranked = rankItems(fallbackCandidates, { topic: topicHint, intent: latestGoal, persona });
    computedRecommendations = ranked.map(({ item, score }) => ({
      ...(item.type === "tool" ? deriveToolMetadataFromCardId(item.id) : undefined),
      id: item.id,
      title: item.title,
      type: item.type,
      why: "",
      cta: item.ctaLabel,
      url: item.ctaUrl,
      score,
    }));

    if (computedRecommendations.length === 0) {
      computedRecommendations = buildEmptyCandidateFallbackRecommendations({ topic, intent: latestGoal });
    }

    computedRecommendations = applyStrategyTypePreference(
      computedRecommendations,
      state.gapStrategy?.recommendationFocus,
    );

    computedRecommendations = applySessionHistoryRefinement(
      computedRecommendations,
      state.session.recommendationHistory,
    );

    computedRecommendations = computedRecommendations.slice(0, 3);
    const seenRecommendationIds = new Set(state.session.recommendationHistory);
    
    computedRecommendations = computedRecommendations.map((card) => ({
      ...card,
      why: buildTransparentWhy({
        cardType: card.type,
        latestGoal,
        topicHint,
        strategyFocus: state.gapStrategy?.recommendationFocus,
        previouslyRecommended: seenRecommendationIds.has(card.id),
      }),
    }));
  }

  const shouldShowRecommendations = shouldSurfaceRecommendations({
    message: state.message,
    gapLabel: state.gapLabel,
    profileComplete: state.session.profileComplete,
    hasArticleContext: Boolean(state.session.pageContext.articleId),
  });

  const serviceIntent =
    !educationalTurn &&
    (state.gapLabel === "DEBT_STRESS" ||
      [state.message, state.session.intents[0] ?? ""].some((value) => {
        const normalized = value.toLowerCase();
        return (
          normalized.includes("debt") ||
          normalized.includes("loan") ||
          normalized.includes("credit card") ||
          normalized.includes("card comparison")
        );
      }));

  const crossSellReason = serviceIntent
    ? "Rule-gated ON: service-relevant intent detected (DEBT_STRESS/loan/debt context)."
    : educationalTurn
      ? "Rule-gated OFF: educational query detected; service cross-sell intentionally suppressed."
      : "Rule-gated OFF: no service-relevant intent detected.";

  if (!shouldShowRecommendations) {
    return {
      recommendations: [],
      hiddenRecommendations: computedRecommendations,
      postRecommendationRoute: "response_composer" as PostRecommendationRoute,
      crossSellReason: "Rule-gated OFF: recommendations deferred until user asks for options.",
      route: "response_composer" as Route,
      fallbackUsed: fallbackIsUsed,
      visitedNodes: [...state.visitedNodes, "RecommendationAgent"],
    };
  }

  state.session.recommendationHistory = Array.from(
    new Set([...state.session.recommendationHistory, ...computedRecommendations.map((item) => item.id)]),
  ).slice(-20);

  return {
    recommendations: computedRecommendations,
    hiddenRecommendations: [],
    postRecommendationRoute: serviceIntent ? "cross_sell_agent" : "response_composer",
    crossSellReason,
    route: "response_composer" as Route,
    fallbackUsed: fallbackIsUsed || (computedRecommendations[0]?.id.startsWith("fallback-") ?? false),
    visitedNodes: [...state.visitedNodes, "RecommendationAgent"],
  };
};

`;

code = code.substring(0, startIndex) + newCode + code.substring(endIndex);
fs.writeFileSync(path, code);
console.log("Patched successfully!");

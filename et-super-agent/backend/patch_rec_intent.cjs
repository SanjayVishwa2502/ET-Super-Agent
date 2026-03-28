const fs = require('fs');
const path = '../backend/src/orchestration/graph.ts';
let code = fs.readFileSync(path, 'utf8');

const newFunc = `function shouldSurfaceRecommendations(input: {
  message: string;
  gapLabel?: GapLabel;
  profileComplete: boolean;
  hasArticleContext: boolean;
  lastAssistantMessage?: string;
}): boolean {
  const normalized = input.message.toLowerCase().trim();

  const isAffirmative = ["yes", "yes please", "yep", "sure", "yeah", "ok", "okay", "please do", "do it", "show me"].includes(normalized);
  const wasAsking = input.lastAssistantMessage && input.lastAssistantMessage.toLowerCase().includes("would you like me to suggest");

  const recommendationIntent = [
    "recommend",
    "suggest",
    "best option",
    "which one",
    "compare",
    "comparison",
    "next step",
    "what should i do",
    "help me choose",
    "planner",
    "tool",
    "product",
    "event",
    "show options",
    "give me options",
  ].some((keyword) => normalized.includes(keyword));

  const urgentGap = input.gapLabel === "DEBT_STRESS";
  
  if ((isAffirmative && wasAsking) || recommendationIntent || urgentGap) {
    return true;
  }
  
  const lowSignalPrompt = ["hi", "hello", "hey", "ok", "thanks"].includes(normalized);

  if (lowSignalPrompt) {
    return false;
  }

  return false;
}`;

const start = code.indexOf("function shouldSurfaceRecommendations(");
const endFunc = code.indexOf("function deriveToolMetadataFromCardId(");

if (start === -1 || endFunc === -1) {
    console.log("Could not find start/end pointers", start, endFunc);
    process.exit(1);
}

code = code.substring(0, start) + newFunc + "\n\n" + code.substring(endFunc);

const agentRegex = /const shouldShowRecommendations = shouldSurfaceRecommendations\([\s\S]*?\}\);/g;

const newAgentRegex = `const lastAssistant = state.session.history.slice().reverse().find(m => m.role === "assistant");
  const shouldShowRecommendations = shouldSurfaceRecommendations({
    message: state.message,
    gapLabel: state.gapLabel,
    profileComplete: state.session.profileComplete,
    hasArticleContext: Boolean(state.session.pageContext.articleId),
    lastAssistantMessage: lastAssistant?.content,
  });`;

code = code.replace(agentRegex, newAgentRegex);

fs.writeFileSync(path, code);
console.log("Patched graph.ts with affirmative recommendations!")

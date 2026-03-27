const fs = require('fs');
const path = '../backend/src/orchestration/graph.ts';
let code = fs.readFileSync(path, 'utf8');

const start = code.indexOf("const responsePrompt = fillPromptTemplate(RESPONSE_COMPOSER_PROMPT");
const endStr = "HISTORY_CONTEXT: JSON.stringify(state.session.history.slice(-8)),";
const end = code.indexOf(endStr);

if (start === -1 || end === -1) {
    console.log("Could not find", start, end);
    process.exit(1);
}

// Find the next `});` after endStr
const bracketEnd = code.indexOf("});", end);

const newCode = `const responsePrompt = fillPromptTemplate(RESPONSE_COMPOSER_PROMPT, {
      USER_CONTEXT: JSON.stringify({
        profileAnswers: state.session.profileAnswers,
        persona: state.session.persona,
        latestGoal: state.session.latestGoal,
        activeContextHeadline: state.session.enrichedContext?.article?.headline,
        activeContextUserName: state.session.enrichedContext?.user?.name,
      }),
      GAP_CONTEXT: JSON.stringify({
        label: state.gapLabel,
        strategy: state.gapStrategy,
      }),
      RECOMMENDATIONS_CONTEXT: JSON.stringify(
        recommendations.map((rec) => ({ title: rec.title, type: rec.type, why: rec.why })),
      ),
      HIDDEN_RECOMMENDATIONS_CONTEXT: state.hiddenRecommendations && state.hiddenRecommendations.length > 0 
        ? JSON.stringify(state.hiddenRecommendations.map((rec) => ({ title: rec.title, type: rec.type, why: rec.why })))
        : "None",
      HISTORY_CONTEXT: JSON.stringify(state.session.history.slice(-8)),
    });`;

code = code.substring(0, start) + newCode + code.substring(bracketEnd + 3);
fs.writeFileSync(path, code);
console.log("Patched Composer!");

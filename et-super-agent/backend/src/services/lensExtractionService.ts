import { llm } from "./llmService.js";

const LENS_EXTRACTION_PROMPT = `
You are an expert AI Profiler and Behavioral Analyst. 
Your task is to take a user's custom "Lens" (a short description and set of tags about how they want the AI to behave and what their current financial/business focus is) and extract it into a highly dense, deterministic "Agent Instruction Payload".

This payload will be injected directly into the system prompt of the main AI agent whenever this Lens is active.

RULES:
1. Distill the user's description into 3-5 core behavioral rules and constraints.
2. Identify their primary intent, risk tolerance, and focus area.
3. Be concise. The output should be formatted as a tight list of directives.
4. Output ONLY the extracted payload. Do not include introductory text, pleasantries, or meta-commentary.

FORMAT EXPECTATION:
- Primary Persona: [Short title]
- Risk Posture: [Level - e.g., Aggressive/Conservative] 
- Core Directives:
  * [Directive 1 - e.g., Never recommend low-yield bonds.]
  * [Directive 2]
  * [Directive 3]
`;

export async function extractLensContext(name: string, description: string, tags: string[]): Promise<string> {
  const userMessage = `
LENS NAME: ${name}
TAGS: ${tags.join(", ") || "None"}
DESCRIPTION: ${description}

Extract the highly dense agent instruction payload now:
`;

  try {
    const response = await llm.complete(LENS_EXTRACTION_PROMPT, userMessage.trim(), {
      temperature: 0.1, // Low temperature for deterministic rule generation
    });
    
    return response.content.trim();
  } catch (error) {
    console.error("Failed to extract lens semantic context:", error);
    // Fallback if LLM fails, we just return the raw user instruction
    return `Fallback Raw Instructions:\n${description}\nTags: ${tags.join(", ")}`;
  }
}

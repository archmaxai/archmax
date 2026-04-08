import { ChatOpenAI } from "@langchain/openai";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";
import { getEnv } from "@archsem/core/config/env";

const SYSTEM_PROMPT =
  "Generate a short, descriptive title (max 60 characters) for a conversation that starts with the following user message. " +
  "Reply with ONLY the title — no quotes, no punctuation at the end, no explanation.";

let _titleLLM: ChatOpenAI | null = null;

function getTitleLLM(): ChatOpenAI {
  if (!_titleLLM) {
    const env = getEnv();
    _titleLLM = new ChatOpenAI({
      model: env.AGENT_TITLE_MODEL,
      apiKey: env.AGENT_API_KEY,
      configuration: { baseURL: env.AGENT_API_BASE_URL },
      maxTokens: 40,
      temperature: 0.3,
    });
  }
  return _titleLLM;
}

export function truncateTitle(message: string): string {
  return message.length > 60 ? message.slice(0, 57) + "..." : message;
}

export async function generateTitle(userMessage: string): Promise<string> {
  const env = getEnv();
  if (!env.AGENT_API_KEY) {
    return truncateTitle(userMessage);
  }

  try {
    const llm = getTitleLLM();
    const response = await llm.invoke([
      new SystemMessage(SYSTEM_PROMPT),
      new HumanMessage(userMessage),
    ]);

    const title =
      typeof response.content === "string"
        ? response.content.trim()
        : "";

    if (!title) return truncateTitle(userMessage);
    return title.length > 80 ? title.slice(0, 77) + "..." : title;
  } catch (err) {
    console.error("[title-agent] Failed to generate title:", err);
    return truncateTitle(userMessage);
  }
}

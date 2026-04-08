import { connectDB } from "../infra/db";
import { TestRun, TestAgent } from "../models/index";
import { createPlaygroundAgent, getTestAgentRecursionLimit, decryptApiKey } from "./playground-agent";
import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage } from "@langchain/core/messages";
import type { IToolCallRecord } from "../models/Conversation";

const RESULT_TRUNCATE = 500;

export function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) + "…" : s;
}

interface FactResult {
  fact: string;
  passed: boolean;
  reasoning: string;
}

export async function evaluateFacts(
  agentResponse: string,
  expectedFacts: string[],
  llm: ChatOpenAI,
): Promise<FactResult[]> {
  const prompt = `You are an evaluation judge. Given an AI agent's response, determine whether each expected fact is satisfied by the response. A fact is "passed" if the response contains information that is consistent with and supports the fact, even if worded differently.

Agent's response:
"""
${agentResponse}
"""

Expected facts:
${expectedFacts.map((f, i) => `${i + 1}. ${f}`).join("\n")}

Return ONLY a JSON array with one object per fact:
[{ "fact": "<the expected fact>", "passed": true/false, "reasoning": "<brief explanation>" }]`;

  try {
    const result = await llm.invoke([new HumanMessage(prompt)]);
    const content = typeof result.content === "string" ? result.content : "";
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]) as FactResult[];
    }
  } catch (err) {
    console.error("[test-runner] Fact evaluation failed:", err);
  }

  return expectedFacts.map((fact) => ({
    fact,
    passed: false,
    reasoning: "Evaluation failed",
  }));
}

export async function processTestCase(
  testRunId: string,
  caseIndex: number,
  testAgentId: string,
  semanticModel: string,
  inputMessage: string,
  expectedFacts: string[],
  maxToolCalls?: number,
): Promise<void> {
  await connectDB();
  const start = Date.now();

  await TestRun.updateOne(
    { _id: testRunId },
    { $set: { [`cases.${caseIndex}.status`]: "running" } },
  );

  try {
    const agent = await createPlaygroundAgent(testAgentId);

    const defaultLimit = getTestAgentRecursionLimit();
    const recursionLimit = maxToolCalls
      ? Math.min(maxToolCalls * 2 + 2, defaultLimit)
      : defaultLimit;

    const result = await agent.invoke(
      { messages: [new HumanMessage(inputMessage)] },
      { recursionLimit },
    );

    let agentResponse = "";
    const toolCalls: IToolCallRecord[] = [];

    const messages = result.messages || [];
    for (const msg of messages) {
      if (msg._getType() === "ai") {
        const content = msg.content;
        if (typeof content === "string") agentResponse += content;
        else if (Array.isArray(content)) {
          for (const block of content) {
            if (typeof block === "string") agentResponse += block;
            else if (block.type === "text") agentResponse += block.text;
          }
        }
      }
      if (msg._getType() === "tool") {
        toolCalls.push({
          id: (msg as any).tool_call_id || "",
          name: (msg as any).name || "unknown",
          args: "",
          result: truncate(typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content), RESULT_TRUNCATE),
          status: "completed",
        });
      }
    }

    if (maxToolCalls && toolCalls.length > maxToolCalls) {
      await TestRun.updateOne(
        { _id: testRunId },
        {
          $set: {
            [`cases.${caseIndex}.status`]: "error",
            [`cases.${caseIndex}.agentResponse`]: agentResponse,
            [`cases.${caseIndex}.toolCalls`]: toolCalls,
            [`cases.${caseIndex}.errorMessage`]: `Exceeded max tool calls (${maxToolCalls})`,
            [`cases.${caseIndex}.durationMs`]: Date.now() - start,
          },
        },
      );
      return;
    }

    const testAgentDoc = await TestAgent.findById(testAgentId).lean();
    if (!testAgentDoc) throw new Error("Test agent not found for evaluation");

    const apiKey = decryptApiKey(testAgentDoc.encryptedApiKey);
    const judgeLlm = new ChatOpenAI({
      model: testAgentDoc.llmModel,
      apiKey,
      configuration: { baseURL: testAgentDoc.llmBaseUrl },
    });

    const factResults = await evaluateFacts(agentResponse, expectedFacts, judgeLlm);
    const allPassed = factResults.every((f) => f.passed);

    await TestRun.updateOne(
      { _id: testRunId },
      {
        $set: {
          [`cases.${caseIndex}.status`]: allPassed ? "passed" : "failed",
          [`cases.${caseIndex}.agentResponse`]: agentResponse,
          [`cases.${caseIndex}.toolCalls`]: toolCalls,
          [`cases.${caseIndex}.factResults`]: factResults,
          [`cases.${caseIndex}.durationMs`]: Date.now() - start,
        },
      },
    );
  } catch (err) {
    console.error(`[test-runner] Case ${caseIndex} error:`, err);
    const isRecursionError = err instanceof Error && /recursion limit/i.test(err.message);
    const errorMessage = isRecursionError && maxToolCalls
      ? `Exceeded max tool calls (${maxToolCalls})`
      : isRecursionError
        ? `Agent exceeded the maximum number of iterations (${getTestAgentRecursionLimit()}). The model may be stuck in a loop — try simplifying the input, adjusting the system prompt, or increasing TEST_AGENT_MAX_ITERATIONS.`
        : err instanceof Error ? err.message : "Unknown error";
    await TestRun.updateOne(
      { _id: testRunId },
      {
        $set: {
          [`cases.${caseIndex}.status`]: "error",
          [`cases.${caseIndex}.errorMessage`]: errorMessage,
          [`cases.${caseIndex}.durationMs`]: Date.now() - start,
        },
      },
    );
  }
}

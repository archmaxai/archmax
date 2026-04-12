import { connectDB } from "../infra/db";
import { TestRun, TestAgent } from "../models/index";
import { createPlaygroundAgent, getTestAgentRecursionLimit, decryptApiKey } from "./playground-agent";
import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage } from "@langchain/core/messages";
import type { IToolCallRecord } from "../models/Conversation";

const RESULT_TRUNCATE = 500;

const cancelledTestRuns = new Set<string>();

export function markTestRunCancelled(testRunId: string): void {
  cancelledTestRuns.add(testRunId);
}

export function isTestRunCancelled(testRunId: string): boolean {
  return cancelledTestRuns.has(testRunId);
}

export function clearTestRunCancelledFlag(testRunId: string): void {
  cancelledTestRuns.delete(testRunId);
}

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

function extractMessages(messages: any[]): { agentResponse: string; toolCalls: IToolCallRecord[] } {
  let agentResponse = "";
  const toolCalls: IToolCallRecord[] = [];
  const argsById = new Map<string, { name: string; args: string }>();

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
      const aiToolCalls = (msg as any).tool_calls as
        | { id?: string; name?: string; args?: Record<string, unknown> }[]
        | undefined;
      if (aiToolCalls) {
        for (const tc of aiToolCalls) {
          if (tc.id) {
            argsById.set(tc.id, {
              name: tc.name || "unknown",
              args: truncate(JSON.stringify(tc.args ?? {}), RESULT_TRUNCATE),
            });
          }
        }
      }
    }
    if (msg._getType() === "tool") {
      const callId = (msg as any).tool_call_id || "";
      const saved = argsById.get(callId);
      toolCalls.push({
        id: callId,
        name: saved?.name || (msg as any).name || "unknown",
        args: saved?.args || "",
        result: truncate(
          typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content),
          RESULT_TRUNCATE,
        ),
        status: "completed",
      });
    }
  }

  return { agentResponse, toolCalls };
}

export async function processTestCase(
  testRunId: string,
  caseIndex: number,
  testAgentId: string,
  semanticModel: string,
  inputMessage: string,
  expectedFacts: string[],
  maxToolCalls?: number,
  signal?: AbortSignal,
): Promise<void> {
  await connectDB();
  const start = Date.now();

  if (signal?.aborted) {
    await TestRun.updateOne(
      { _id: testRunId },
      { $set: { [`cases.${caseIndex}.status`]: "cancelled", [`cases.${caseIndex}.durationMs`]: 0 } },
    );
    return;
  }

  await TestRun.updateOne(
    { _id: testRunId },
    { $set: { [`cases.${caseIndex}.status`]: "running" } },
  );

  try {
    const agentOpts: { maxToolCalls?: number } = {};
    if (maxToolCalls) agentOpts.maxToolCalls = maxToolCalls;

    const agent = await createPlaygroundAgent(testAgentId, agentOpts);
    const recursionLimit = getTestAgentRecursionLimit();

    let lastState: any = null;
    let streamError: Error | null = null;

    try {
      const stream = await agent.stream(
        { messages: [new HumanMessage(inputMessage)] },
        { recursionLimit, streamMode: "values" as const, signal },
      );
      for await (const state of stream) {
        lastState = state;
      }
    } catch (err) {
      streamError = err instanceof Error ? err : new Error(String(err));
    }

    if (signal?.aborted) {
      const { agentResponse, toolCalls } = extractMessages(lastState?.messages || []);
      await TestRun.updateOne(
        { _id: testRunId },
        {
          $set: {
            [`cases.${caseIndex}.status`]: "cancelled",
            [`cases.${caseIndex}.agentResponse`]: agentResponse,
            [`cases.${caseIndex}.toolCalls`]: toolCalls,
            [`cases.${caseIndex}.durationMs`]: Date.now() - start,
          },
        },
      );
      return;
    }

    const { agentResponse, toolCalls } = extractMessages(lastState?.messages || []);

    if (streamError) {
      const isRecursionError = /recursion limit/i.test(streamError.message);
      const errorMessage = isRecursionError && maxToolCalls
        ? `Exceeded max tool calls (${maxToolCalls})`
        : isRecursionError
          ? `Agent exceeded the maximum number of iterations (${getTestAgentRecursionLimit()}). The model may be stuck in a loop — try simplifying the input, adjusting the system prompt, or increasing TEST_AGENT_MAX_ITERATIONS.`
          : streamError.message;

      await TestRun.updateOne(
        { _id: testRunId },
        {
          $set: {
            [`cases.${caseIndex}.status`]: "error",
            [`cases.${caseIndex}.agentResponse`]: agentResponse,
            [`cases.${caseIndex}.toolCalls`]: toolCalls,
            [`cases.${caseIndex}.errorMessage`]: errorMessage,
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
    if (signal?.aborted) {
      try {
        await TestRun.updateOne(
          { _id: testRunId },
          {
            $set: {
              [`cases.${caseIndex}.status`]: "cancelled",
              [`cases.${caseIndex}.durationMs`]: Date.now() - start,
            },
          },
        );
      } catch { /* best-effort */ }
      return;
    }

    console.error(`[test-runner] Case ${caseIndex} error:`, err);
    try {
      await TestRun.updateOne(
        { _id: testRunId },
        {
          $set: {
            [`cases.${caseIndex}.status`]: "error",
            [`cases.${caseIndex}.errorMessage`]: err instanceof Error ? err.message : "Unknown error",
            [`cases.${caseIndex}.durationMs`]: Date.now() - start,
          },
        },
      );
    } catch (dbErr) {
      console.error(`[test-runner] Failed to persist error status for case ${caseIndex}:`, dbErr);
    }
  }
}

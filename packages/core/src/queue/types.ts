export interface AgentJobData {
  projectId: string;
  conversationId: string;
  assistantMessageId: string;
  message: string;
  /** When set, use createPlaygroundAgent instead of createSemlayerAgent */
  testAgentId?: string;
}

export interface AgentJobResult {
  conversationId: string;
  assistantMessageId: string;
  elapsedMs: number;
}

export interface TestRunJobData {
  testRunId: string;
  caseIndex: number;
  testAgentId: string;
  semanticModel: string;
  inputMessage: string;
  expectedFacts: string[];
  maxToolCalls?: number;
}

export interface TestRunJobResult {
  testRunId: string;
  caseIndex: number;
  elapsedMs: number;
}

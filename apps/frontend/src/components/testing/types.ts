export interface TestCaseItem {
  _id: string;
  title: string;
  testAgent: { _id: string; name: string } | null;
  semanticModel: string;
  inputMessage: string;
  expectedFacts: string[];
  tags: string[];
  maxToolCalls?: number;
  createdAt: string;
}

export interface TestAgentItem {
  _id: string;
  name: string;
}

export interface SemanticModelSummary {
  name: string;
}

export interface TestCasesResponse {
  items: TestCaseItem[];
  total: number;
  page: number;
  limit: number;
}

export const ALL_FILTER = "__all__";

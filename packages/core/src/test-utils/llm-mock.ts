import { vi } from "vitest";

export interface MockLlm {
  invoke: ReturnType<typeof vi.fn>;
  stream: ReturnType<typeof vi.fn>;
}

export function createMockLlm(response?: { content: string } | Error): MockLlm {
  const invoke = response instanceof Error
    ? vi.fn().mockRejectedValue(response)
    : vi.fn().mockResolvedValue(response ?? { content: "" });

  const stream = vi.fn().mockImplementation(async function* () {
    if (response instanceof Error) throw response;
    yield { content: (response ?? { content: "" }).content };
  });

  return { invoke, stream } as unknown as MockLlm;
}

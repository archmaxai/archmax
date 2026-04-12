import { describe, it, expect } from "vitest";
import { getMigrations } from "./registry";

describe("getMigrations", () => {
  it("returns migrations sorted by model name then version", () => {
    const migrations = getMigrations();

    for (let i = 1; i < migrations.length; i++) {
      const prev = migrations[i - 1];
      const curr = migrations[i];
      if (prev.model === curr.model) {
        expect(prev.version).toBeLessThanOrEqual(curr.version);
      } else {
        expect(prev.model.localeCompare(curr.model)).toBeLessThan(0);
      }
    }
  });

  it("includes the connection credential encryption migration", () => {
    const migrations = getMigrations();
    const match = migrations.find((m) => m.model === "Connection" && m.version === 1);
    expect(match).toBeDefined();
    expect(match!.description).toMatch(/encrypt/i);
  });

  it("returns a new array on each call (no shared mutation)", () => {
    const a = getMigrations();
    const b = getMigrations();
    expect(a).not.toBe(b);
    expect(a).toEqual(b);
  });
});

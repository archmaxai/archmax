import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";

beforeAll(() => {
  process.env.MONGODB_URI = "mongodb://localhost:27017/test";
  process.env.BETTER_AUTH_SECRET = "test-secret-with-at-least-32-chars-long";
  process.env.UI_USERNAME = "admin";
  process.env.UI_PASSWORD = "current-password";
});

vi.mock("./auth", () => ({
  auth: { $context: Promise.resolve({}) },
}));

const { seedAdmin } = await import("./seed-admin");

const ADMIN_EMAIL = "admin@archmax.local";
const USER_ID = "user-123";

interface MockAccount {
  providerId: string;
  password?: string | null;
}

interface MockUser {
  user: { id: string; email: string };
}

function buildCtx(opts: {
  user: MockUser | null;
  accounts: MockAccount[];
  hashes?: Record<string, string>;
}) {
  const hashes = opts.hashes ?? {};
  const accounts = [...opts.accounts];

  const findUserByEmail = vi.fn(async (email: string) => {
    if (opts.user && opts.user.user.email === email) return opts.user;
    return null;
  });

  const createUser = vi.fn(async (data: { name: string; email: string }) => {
    return { id: USER_ID, name: data.name, email: data.email };
  });

  const findAccounts = vi.fn(async () => accounts);

  const createAccount = vi.fn(
    async (data: {
      userId: string;
      accountId: string;
      providerId: string;
      password: string;
    }) => {
      accounts.push({ providerId: data.providerId, password: data.password });
      return data;
    },
  );

  const updatePassword = vi.fn(async (_userId: string, password: string) => {
    const cred = accounts.find((a) => a.providerId === "credential");
    if (cred) cred.password = password;
  });

  const hash = vi.fn(async (password: string) => `hash:${password}`);

  const verify = vi.fn(async ({ hash, password }: { hash: string; password: string }) => {
    const expected = hashes[hash];
    return expected === password;
  });

  return {
    ctx: {
      internalAdapter: {
        findUserByEmail,
        createUser,
        findAccounts,
        createAccount,
        updatePassword,
      },
      password: { hash, verify },
    },
    spies: {
      findUserByEmail,
      createUser,
      findAccounts,
      createAccount,
      updatePassword,
      hash,
      verify,
    },
    accounts,
  };
}

describe("seedAdmin", () => {
  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  it("creates the admin user and credential when no user exists", async () => {
    const { ctx, spies, accounts } = buildCtx({ user: null, accounts: [] });

    await seedAdmin(ctx as never);

    expect(spies.findUserByEmail).toHaveBeenCalledWith(ADMIN_EMAIL);
    expect(spies.createUser).toHaveBeenCalledWith({
      name: "admin",
      email: ADMIN_EMAIL,
      username: "admin",
    });
    expect(spies.hash).toHaveBeenCalledWith("current-password");
    expect(spies.createAccount).toHaveBeenCalledWith({
      userId: USER_ID,
      accountId: USER_ID,
      providerId: "credential",
      password: "hash:current-password",
    });
    expect(spies.updatePassword).not.toHaveBeenCalled();
    expect(accounts).toHaveLength(1);
  });

  it("is a no-op when the existing credential matches UI_PASSWORD", async () => {
    const existingHash = "hash:current-password";
    const { ctx, spies } = buildCtx({
      user: { user: { id: USER_ID, email: ADMIN_EMAIL } },
      accounts: [{ providerId: "credential", password: existingHash }],
      hashes: { [existingHash]: "current-password" },
    });

    await seedAdmin(ctx as never);

    expect(spies.verify).toHaveBeenCalledWith({
      hash: existingHash,
      password: "current-password",
    });
    expect(spies.hash).not.toHaveBeenCalled();
    expect(spies.updatePassword).not.toHaveBeenCalled();
    expect(spies.createAccount).not.toHaveBeenCalled();
    expect(spies.createUser).not.toHaveBeenCalled();
  });

  it("resets the credential when the stored hash does not match UI_PASSWORD", async () => {
    const oldHash = "hash:old-password";
    const { ctx, spies, accounts } = buildCtx({
      user: { user: { id: USER_ID, email: ADMIN_EMAIL } },
      accounts: [{ providerId: "credential", password: oldHash }],
      hashes: { [oldHash]: "old-password" },
    });

    await seedAdmin(ctx as never);

    expect(spies.verify).toHaveBeenCalledWith({
      hash: oldHash,
      password: "current-password",
    });
    expect(spies.hash).toHaveBeenCalledWith("current-password");
    expect(spies.updatePassword).toHaveBeenCalledWith(
      USER_ID,
      "hash:current-password",
    );
    expect(spies.createAccount).not.toHaveBeenCalled();
    expect(accounts[0]?.password).toBe("hash:current-password");
  });

  it("creates a credential when the user exists without one", async () => {
    const { ctx, spies, accounts } = buildCtx({
      user: { user: { id: USER_ID, email: ADMIN_EMAIL } },
      accounts: [],
    });

    await seedAdmin(ctx as never);

    expect(spies.verify).not.toHaveBeenCalled();
    expect(spies.updatePassword).not.toHaveBeenCalled();
    expect(spies.hash).toHaveBeenCalledWith("current-password");
    expect(spies.createAccount).toHaveBeenCalledWith({
      userId: USER_ID,
      accountId: USER_ID,
      providerId: "credential",
      password: "hash:current-password",
    });
    expect(accounts).toHaveLength(1);
  });

  it("updates the existing credential row in place when its password is null", async () => {
    const { ctx, spies, accounts } = buildCtx({
      user: { user: { id: USER_ID, email: ADMIN_EMAIL } },
      accounts: [{ providerId: "credential", password: null }],
    });

    await seedAdmin(ctx as never);

    expect(spies.verify).not.toHaveBeenCalled();
    expect(spies.createAccount).not.toHaveBeenCalled();
    expect(spies.hash).toHaveBeenCalledWith("current-password");
    expect(spies.updatePassword).toHaveBeenCalledWith(
      USER_ID,
      "hash:current-password",
    );
    expect(accounts).toHaveLength(1);
    expect(accounts[0]?.password).toBe("hash:current-password");
  });
});

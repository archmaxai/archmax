import { auth } from "./auth";
import { getEnv } from "@semlayer/core/config/env";

const ADMIN_EMAIL = "admin@semlayer.local";

export async function seedAdmin(): Promise<void> {
  const env = getEnv();
  const ctx = await auth.$context;

  const existing = await ctx.internalAdapter.findUserByEmail(ADMIN_EMAIL);
  if (existing) {
    const accounts = await ctx.internalAdapter.findAccounts(existing.user.id);
    if (accounts.some((a) => a.providerId === "credential")) {
      console.log("Admin user already exists, skipping seed.");
      return;
    }
    console.log("Admin user exists but has no credential — adding password...");
    await createCredential(ctx, existing.user.id, env.UI_PASSWORD);
    console.log(`Admin credential added for "${env.UI_USERNAME}".`);
    return;
  }

  const created = await ctx.internalAdapter.createUser({
    name: env.UI_USERNAME,
    email: ADMIN_EMAIL,
    username: env.UI_USERNAME,
  });
  if (!created) throw new Error("User creation failed");
  await createCredential(ctx, created.id, env.UI_PASSWORD);
  console.log(`Admin user "${env.UI_USERNAME}" seeded.`);
}

async function createCredential(
  ctx: Awaited<typeof auth.$context>,
  userId: string,
  password: string,
): Promise<void> {
  const hashedPassword = await ctx.password.hash(password);
  await ctx.internalAdapter.createAccount({
    userId,
    accountId: userId,
    providerId: "credential",
    password: hashedPassword,
  });
}

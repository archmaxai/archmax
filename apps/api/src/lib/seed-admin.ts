import { auth } from "./auth";
import { getEnv } from "@archmax/core/config/env";

const ADMIN_EMAIL = "admin@archmax.local";

type AuthCtx = Awaited<typeof auth.$context>;

export async function seedAdmin(ctx?: AuthCtx): Promise<void> {
  const env = getEnv();
  const resolvedCtx = ctx ?? (await auth.$context);

  const existing = await resolvedCtx.internalAdapter.findUserByEmail(
    ADMIN_EMAIL,
  );

  if (!existing) {
    const created = await resolvedCtx.internalAdapter.createUser({
      name: env.UI_USERNAME,
      email: ADMIN_EMAIL,
      username: env.UI_USERNAME,
    });
    if (!created) throw new Error("User creation failed");
    await createCredential(resolvedCtx, created.id, env.UI_PASSWORD);
    console.log(`Admin user "${env.UI_USERNAME}" seeded.`);
    return;
  }

  const accounts = await resolvedCtx.internalAdapter.findAccounts(
    existing.user.id,
  );
  const credential = accounts.find((a) => a.providerId === "credential");

  if (!credential) {
    console.log("Admin user exists but has no credential — adding password...");
    await createCredential(resolvedCtx, existing.user.id, env.UI_PASSWORD);
    console.log(`Admin credential added for "${env.UI_USERNAME}".`);
    return;
  }

  if (credential.password) {
    const matches = await resolvedCtx.password.verify({
      hash: credential.password,
      password: env.UI_PASSWORD,
    });
    if (matches) return;
  }

  const hashedPassword = await resolvedCtx.password.hash(env.UI_PASSWORD);
  await resolvedCtx.internalAdapter.updatePassword(
    existing.user.id,
    hashedPassword,
  );
  console.log("Admin password reset from UI_PASSWORD env var.");
}

async function createCredential(
  ctx: AuthCtx,
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

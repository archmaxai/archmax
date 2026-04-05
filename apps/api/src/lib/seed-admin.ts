import { auth } from "./auth";
import { getEnv } from "@semlayer/core/config/env";

const ADMIN_EMAIL = "admin@semlayer.local";

export async function seedAdmin(): Promise<void> {
  const env = getEnv();
  try {
    await auth.api.signUpEmail({
      body: {
        name: env.UI_USERNAME,
        email: ADMIN_EMAIL,
        password: env.UI_PASSWORD,
        username: env.UI_USERNAME,
      },
    });
    console.log(`Admin user "${env.UI_USERNAME}" seeded.`);
  } catch {
    console.log("Admin user already exists, skipping seed.");
  }
}

import { betterAuth } from "better-auth";
import { username } from "better-auth/plugins";
import { mongodbAdapter } from "better-auth/adapters/mongodb";
import { MongoClient } from "mongodb";
import { getEnv } from "@semlayer/core/config/env";

const env = getEnv();

const mongoClient = new MongoClient(env.MONGODB_URI);

export const auth = betterAuth({
  basePath: "/api/auth",
  secret: env.BETTER_AUTH_SECRET,
  database: mongodbAdapter(mongoClient.db()),

  emailAndPassword: {
    enabled: true,
    disableSignUp: true,
  },

  plugins: [username()],

  session: {
    cookieCache: {
      enabled: true,
      maxAge: 60 * 5,
    },
  },
});

export type Session = typeof auth.$Infer.Session;

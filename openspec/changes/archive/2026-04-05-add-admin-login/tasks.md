## 1. Environment & Config
- [x] 1.1 Add `UI_USERNAME`, `UI_PASSWORD`, and `BETTER_AUTH_SECRET` to Zod env schema in `packages/core/src/config/env.ts`
- [x] 1.2 Add `UI_USERNAME`, `UI_PASSWORD`, and `BETTER_AUTH_SECRET` to `.env.example`

## 2. API Auth (better-auth)
- [x] 2.1 Install `better-auth` and `mongodb` in `@semlayer/api`
- [x] 2.2 Create `apps/api/src/lib/auth.ts` — better-auth instance with MongoDB adapter, username plugin, email+password with `disableSignUp: true`
- [x] 2.3 Create `apps/api/src/lib/seed-admin.ts` — seeds initial admin user from `UI_USERNAME`/`UI_PASSWORD` env vars on startup
- [x] 2.4 Mount better-auth handler and session middleware in `apps/api/src/app.ts`
- [x] 2.5 Call `seedAdmin()` on API startup in `apps/api/src/index.ts`
- [x] 2.6 Remove hand-rolled `session.ts` and `routes/auth.ts`

## 3. Frontend Auth
- [x] 3.1 Install `better-auth` in `@semlayer/frontend`
- [x] 3.2 Create `apps/frontend/src/lib/auth-client.ts` — better-auth React client with username plugin
- [x] 3.3 Create `apps/frontend/src/routes/login.tsx` — login page using `authClient.signIn.username()`
- [x] 3.4 Create `apps/frontend/src/routes/_auth.tsx` — layout route with `beforeLoad` guard using `authClient.getSession()`
- [x] 3.5 Move `apps/frontend/src/routes/index.tsx` to `apps/frontend/src/routes/_auth/index.tsx` so it falls under the auth guard
- [x] 3.6 Add logout button using `authClient.signOut()`

## 4. Validation
- [x] 4.1 Verify `pnpm build` succeeds
- [ ] 4.2 Manual smoke test: unauthenticated request to `/api/data-sources` returns 401; login flow works; logout clears session

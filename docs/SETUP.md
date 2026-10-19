# Local setup

## 1. Tools (macOS)
| Tool | Install | Check |
|---|---|---|
| Node 22+ | `brew install node@22` (or nvm, see `.nvmrc`) | `node -v` |
| pnpm | `corepack enable` | `pnpm -v` |
| Docker Desktop | https://www.docker.com/products/docker-desktop/ (needed by local Supabase) | `docker ps` |
| Supabase CLI | installed by `pnpm install` (run via `pnpm exec supabase`), or `brew install supabase/tap/supabase` | `pnpm exec supabase -v` |
| Expo Go | App Store / Play Store on your phone | |
| EAS CLI (later, for builds) | `npx eas-cli@latest login` | |

## 2. First run
```bash
pnpm install
pnpm db:start                 # starts Postgres, Auth, Studio, Mailpit in Docker; applies migrations
pnpm db:test                  # pgTAP tests (RLS) — must be green
cp .env.example apps/mobile/.env.local
# put the "Publishable key" printed by db:start into EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY
pnpm dev                      # then press w (web), i (iOS simulator) or scan the QR with Expo Go
```
Sign in with any email. The 6-digit code lands in the local mail catcher (Mailpit): http://127.0.0.1:54324.
Supabase Studio (database UI): http://127.0.0.1:54323.

**Testing on a real phone:** the phone can't reach `127.0.0.1` on your Mac. Set `EXPO_PUBLIC_SUPABASE_URL=http://<your-mac-LAN-IP>:54321` in `apps/mobile/.env.local`.

## 3. Everyday commands
```bash
pnpm lint && pnpm typecheck && pnpm test   # what CI runs
pnpm db:test                               # database security tests
pnpm db:reset                              # wipe local DB and re-apply migrations
pnpm db:types                              # regenerate DB types into packages/shared (then replace hand-written db.ts)
pnpm exec supabase functions serve         # run edge functions locally
```

## 4. Sign-in providers (when ready)
- **Email code:** works out of the box locally. In production, configure a real SMTP provider (Resend, Postmark…) in the Supabase dashboard; the built-in sender is heavily rate-limited.
- **Apple:** needs an Apple Developer account. Set `SUPABASE_AUTH_EXTERNAL_APPLE_CLIENT_ID=app.trusttheprocess` and enable `[auth.external.apple]`. Native sign-in needs a development build (`eas build --profile development`), not Expo Go.
- **Google:** create OAuth client ids in Google Cloud Console (Web client for Supabase), put them in `.env` and enable `[auth.external.google]`. `trusttheprocess://auth-callback` is already allow-listed in `config.toml` for local.

## 5. Hosted environments (when the beta starts)
1. Create a Supabase project (EU region) → `pnpm exec supabase link --project-ref <ref>` → `pnpm exec supabase db push`.
2. Deploy functions: `pnpm exec supabase functions deploy delete-account`.
3. `npx eas-cli@latest init` in `apps/mobile`, set the `EXPO_PUBLIC_*` variables per EAS environment.
4. Push the repo to GitHub; CI (`.github/workflows/ci.yml`) runs on every PR.

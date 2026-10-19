@AGENTS.md

## Project specifics
- Routes: `src/app/` — `(auth)` group for signed-out screens, `(app)` group for signed-in screens; guarded with `Stack.Protected` in `src/app/_layout.tsx`.
- Supabase client: `src/lib/supabase.ts` (session stored via expo-sqlite localStorage on native, browser localStorage on web).
- UI primitives: `src/components/ui.tsx`, built only from `@ttp/ui` tokens. Shared logic and zod schemas: `@ttp/shared`.
- Feature code lives in `src/features/<feature>/` (api hooks, pure helpers + tests).
- Tests: jest-expo + React Native Testing Library v14 (`await render(...)`, `userEvent`).

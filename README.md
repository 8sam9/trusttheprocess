# TrustTheProcess

A fast, honest calorie & macro tracker for iOS, Android and web, built with a team of role-based AI agents.

- Product: [docs/PRODUCT_SPEC.md](docs/PRODUCT_SPEC.md)
- Architecture: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) · Decisions: [docs/decisions](docs/decisions)
- How agents build it: [docs/WORKFLOW.md](docs/WORKFLOW.md) · Roadmap: [docs/ROADMAP.md](docs/ROADMAP.md)
- Experiment log: [docs/experiments/agent-log.md](docs/experiments/agent-log.md)

## Getting started
See [docs/SETUP.md](docs/SETUP.md). Short version:
```
pnpm install
pnpm db:start && pnpm db:test
cp .env.example apps/mobile/.env.local   # add the publishable key
pnpm dev
```
Then open the folder in Claude Code and run `/feature "<idea>"`.

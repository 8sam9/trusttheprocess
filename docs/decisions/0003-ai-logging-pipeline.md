# ADR 0003 — One AI parsing pipeline for text, voice and photo
Status: Accepted (2026-10-19)

## Decision
Every non-search logging input becomes a `ParseRequest` handled by the `ai-parse` edge function:
1. Voice → transcript (speech-to-text) → text path. Photo → vision model.
2. The LLM returns `ParsedItem[]` {name, quantity, unit, grams_estimate, confidence} via tool-use with a strict JSON schema.
3. Each item is **matched against our food DB** (trigram + embedding search). The DB match supplies the nutrients;
   the LLM's nutrient estimate is used only when nothing matches, and is flagged `source=ai`.
4. The user always confirms before saving (editable chips).
## Why
LLMs are good at segmentation and portion language but unreliable on nutrient values, and the DB is the source of truth.
Rate limits per tier are enforced server-side.

---
name: prompt-change
description: Changes one of Elio's prompts or templates (system.vN.md, router.vN.md, templates/<lang>.yaml) safely — new version file, policy checklist, cost estimate, evals with Ivan's consent, comparison with the previous version, and a record of the result. Use whenever the wording the models or visitors see changes.
---

# Change a prompt

Prompts are versioned files in `apps/api/src/site_api/prompts/`, never strings in code ([langchain-rag.md](../../rules/langchain-rag.md)). The policy they implement is SPEC §5; **a policy change edits SPEC first**, then the prompt.

| File | Who reads it | Version switch |
|---|---|---|
| `system.vN.md` | the answer model | `SYSTEM_PROMPT_FILE` in `prompts/answer.py` |
| `router.vN.md` | the router | `ROUTER_PROMPT_FILE` in `graph/router.py` |
| `templates/<lang>.yaml` | visitors (no model) | edited in place; all four languages together |

## 1. Write the new version
1. Copy the current file to the next version (`system.v2.md` → `system.v3.md`); keep the old one, so evals can compare them.
2. Edit the copy. Keep the order prompt caching needs: the static text first; nothing variable (dates, counts) inside it. The system prompt still ends with `Sources:` (the context follows it).
3. Point the version constant at the new file.
4. Templates: change every language in the same step (EN, ES, RU, UK); Elio speaks of itself in the first person and of Ivan in the third.

## 2. Free checks
- `uv run --directory apps/api pytest tests/graph tests/api -q`:
  - `test_system_prompt_policy.py` — every SPEC §5 rule is still stated (add a row when a rule is added);
  - `test_chat_router.py`, `test_templates.py` — router classes, template languages, no first person as Ivan.
- Re-read the diff against SPEC §5 and `content-nda.md` (no phone number, NDA wording, salary wording).
- Run `security-reviewer` on the prompt diff (prompt injection, policy gaps).

## 3. Evals — only with Ivan's consent
1. `uv run --directory apps/api python -m site_api.evals --estimate` → the number of cases and the cost, from the price table in config.
2. Tell Ivan the estimate and wait for an explicit yes (CLAUDE.md golden rule 13).
3. Run the suite for the **old** and the **new** version (`--run`), or reuse the last recorded run of the old version if nothing else changed since.
4. Compare per case type (in-scope, personal, off-topic, injection, unknown fact, NDA / salary) and per language. Any metric below its threshold in config fails the change.

## 4. Record
- Step report (`step-report` skill): what changed and why, the eval comparison table, the cost of the runs.
- A wording change that changes behaviour (not only style) gets a line in the relevant ADR's amendments (ADR-0004 for guardrails).
- Never delete an old prompt version that a recorded eval run refers to.

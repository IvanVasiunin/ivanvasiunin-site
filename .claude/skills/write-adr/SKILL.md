---
name: write-adr
description: Creates a new Architecture Decision Record in docs/adr from the template — next number, context, options with trade-offs and cost, decision, consequences — and updates the ADR index. Use whenever a technology or architecture choice is made or changed (new dependency, replacing a library, decision gate outcome).
argument-hint: "<short title>"
---

# Write an ADR

1. Find the next number: the highest `docs/adr/NNNN-*.md` + 1. Create the file name as `NNNN-kebab-title.md`.
2. Copy `docs/adr/template.md` and fill it in **English**.
   - **Context:** the problem and its constraints (budget, performance budgets, reviewability by Ivan, mentor zone, Windows).
   - **Options:** at least two real alternatives with pros, cons and cost. For every package, give the version, license and last release date, verified via npm / PyPI / Context7. Mark anything unverifiable as `UNVERIFIED`.
   - **Decision:** exact choice, versions and parameters.
   - **Consequences:** risks accepted, what gets harder, and what would make us revisit it.
3. **Status: Proposed.** Only Ivan accepts an ADR. Never mark it Accepted yourself.
4. Consult the advisor before presenting the ADR. The decision lasts for months.
5. Add a row to `docs/adr/README.md`.
6. If it supersedes an older ADR, set the old one's status to `Superseded by ADR-NNNN`. Do not rewrite its content.
7. If the decision changes the stack, add a short note to `docs/adr/0001-tech-stack.md` → "Consequences" pointing to the new ADR.
8. Present a 3–5 line summary to Ivan in Russian and ask for acceptance.

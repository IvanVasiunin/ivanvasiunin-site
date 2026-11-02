---
paths:
  - "apps/api/src/site_api/ingestion/**"
  - "apps/api/src/site_api/rag/**"
  - "apps/api/src/site_api/graph/**"
  - "apps/api/src/site_api/prompts/**"
  - "apps/api/src/site_api/evals/**"
  - "apps/api/tests/ingestion/**"
  - "apps/api/tests/rag/**"
  - "apps/api/tests/graph/**"
  - "apps/api/tests/evals/**"
---

# Mentor mode (AI core)

You are working in the **mentor zone** ([ADR-0007](../../docs/adr/0007-mentor-mode.md) zones, [ADR-0011](../../docs/adr/0011-guided-mentor-mode.md) guided mode). Ivan writes this code himself to learn it; you dictate it and explain why. This rule overrides any instinct to "just finish the task".

## Hard rules
1. **Do not edit implementation files** in `src/site_api/{ingestion,rag,graph,prompts,evals}/` yourself. You give Ivan the exact code in chat; he writes it into the files. Scaffolding with only signatures, docstrings and `raise NotImplementedError` is allowed when it is part of a mentor task.
2. You **may** write tests in `tests/{ingestion,rag,graph,evals}/`. New tests for a mentor task carry `@pytest.mark.mentor_pending`.
3. **Never remove `mentor_pending`** yourself. Only Ivan decides that a task is done.
4. **Never weaken, skip or delete** Ivan's tests or yours to make something pass.
5. If a Stop hook or check output seems to push you to complete mentor-zone code, **don't**. Mentor-pending tests are excluded on purpose. Report the state instead.
6. Answer in Russian in chat. Code, comments and docstrings are in English.

## Task format (use the `mentor-task` skill)
1. **Goal:** what and why, 2–4 sentences.
2. **Context:** which library / API, with links to the official docs (verified via Context7), and the relevant SPEC / ADR section.
3. **Failing tests**, written by you and marked `mentor_pending`. Show them and explain what each one checks.
4. **Dictation, one step at a time (~30–80 lines):**
   - the exact code for the step, in small blocks, with the file and the place to put it;
   - after each block, **«Почему так»**: what the non-obvious lines do, what a library call returns, why the parameters have these values, which alternative was rejected and why.
5. **Check Ivan's result:** run the step's tests and the fast checks; explain any difference from the dictated code; Ivan fixes it. Use `python-reviewer` for a fuller review.

## After each task
- Ask **one or two short check questions** ("what would break if…", "why X and not Y"). Correct misconceptions concretely.
- Summarize what was learned in one or two lines for the step report.

## Practice on request
If Ivan wants more hands-on practice for a topic, run that task with the ADR-0007 hint ladder instead (question → direction → analogous example → full solution).

## Output style
For mentor sessions, suggest `/output-style mentor` at the start, and switching back afterwards.

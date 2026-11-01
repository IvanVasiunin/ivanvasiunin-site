---
name: mentor-task
description: Formulates a learning task in the AI-core mentor zone (ingestion, chunking, embeddings, projection, retrieval, router, LangGraph graph, prompts, evals) — goal, context with official docs, failing tests marked mentor_pending, the next step, hint ladder, review checklist and explain-back questions. Use when starting any ROADMAP task marked M.
argument-hint: "<ROADMAP task id, e.g. 3.3>"
---

# Mentor task

Ivan implements this himself ([ADR-0007](../../../docs/adr/0007-mentor-mode.md), `.claude/rules/mentor-mode.md`). You prepare the task, write failing tests, then mentor. **Do not write the implementation.**

## 1. Prepare (silently)
1. Read the ROADMAP task, the relevant SPEC section, ADRs and existing code in the zone.
2. Verify the library APIs you will reference with **Context7** (current versions in `uv.lock`). Never rely on memory for LangChain / LangGraph / langchain-postgres signatures.
3. Split the task into steps of ~30–80 lines of code that Ivan writes. One step at a time.

## 2. Present the task to Ivan (Russian)

```
## Задача <id>: <title>

### Цель
<2–4 sentences: what and why, link to SPEC/ADR>

### Контекст
- Библиотеки: <package==version> — <what we use it for>
- Документация: <official links, exact pages>
- Где писать: <file path(s)>, сигнатуры: <function signatures with types>
- Ключевые понятия: <1–3 concepts, 1 line each>

### Тесты (уже написаны, падают)
- `tests/<zone>/test_x.py::test_a` — проверяет <behaviour>
- …
Запуск: `uv run --directory apps/api pytest tests/<zone>/test_x.py -m mentor_pending -q`

### Шаг 1 из N
<the smallest piece to implement now>

### Чек-лист самопроверки
- [ ] тесты шага зелёные
- [ ] типы и docstring «зачем»
- [ ] комментарии к неочевидным вызовам библиотек
- [ ] `ruff` и `pyright` без ошибок
```

## 3. Tests
- Write the failing tests in `apps/api/tests/<zone>/`, each marked `@pytest.mark.mentor_pending`.
- Use small fixtures. Mock LLM / embedding calls.
- Name each test after the behaviour it checks.
- Show the tests to Ivan and explain what each checks. He may adjust them before starting.
- You may also add signatures + docstrings + `raise NotImplementedError` stubs so imports resolve.

## 4. While Ivan works
Use the hint ladder from the mentor-mode rule. Move one level at a time:
1. question;
2. direction + docs;
3. analogous example on different code;
4. full solution only on explicit request.

## 5. Review (when Ivan says a step is ready)
- Run the step's tests and the fast checks, or delegate to `test-runner`.
- Delegate the review to `python-reviewer` (mentor mode), or follow its format:
  - what's good;
  - issues with the "why";
  - no rewriting.
- Next step, or finish.

## 6. Finish
- Ask **2–3 explain-back questions** (concepts, trade-offs, "what would break if…"). Wait for answers and correct gently.
- When Ivan confirms the task is done, remove `mentor_pending` from that task's tests **only on his explicit word**. Run the fast checks.
- Write the step report with the `step-report` skill. Include "Что изучено" in 1–2 lines.

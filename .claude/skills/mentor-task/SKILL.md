---
name: mentor-task
description: Runs a task in the AI-core mentor zone (ingestion, chunking, embeddings, projection, retrieval, router, LangGraph graph, prompts, evals) in guided mode — goal, context with official docs, failing tests marked mentor_pending, then the code dictated step by step with «Почему так» explanations, a check of Ivan's result and short check questions. Use when starting any ROADMAP task marked M.
argument-hint: "<ROADMAP task id, e.g. 3.3>"
---

# Mentor task

Ivan writes the code into the files himself; you dictate it and explain every decision (guided mode, [ADR-0011](../../../docs/adr/0011-guided-mentor-mode.md), `.claude/rules/mentor-mode.md`). **Never edit mentor-zone implementation files yourself.**

## 1. Prepare (silently)
1. Read the ROADMAP task, the relevant SPEC section, ADRs and existing code in the zone.
2. Verify the library APIs you will reference with **Context7** (current versions in `uv.lock`). Never rely on memory for LangChain / LangGraph / langchain-postgres signatures.
3. Split the task into steps of ~30–80 lines of code. One step at a time.

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

### Шаг 1 из N: <what this step does>
**Файл:** `<path>`, <where in the file>

```python
<block 1: the exact code>
```
**Почему так:** <what the non-obvious lines do; what the library call returns; why these parameters; rejected alternative>

```python
<block 2>
```
**Почему так:** …

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

## 4. While Ivan writes
- Answer questions about the dictated code directly and concretely.
- If Ivan wants to phrase a name or a comment differently, that is fine as long as the behaviour stays the same.

## 5. Check (when Ivan says a step is written)
- Run the step's tests and the fast checks, or delegate to `test-runner`.
- Compare with the dictated code. Explain any difference (a typo, a missed line, a deliberate change) and how to fix it.
- For a fuller review, delegate to `python-reviewer` (mentor mode).
- Next step, or finish.

## 6. Finish
- Ask **one or two short check questions** (concepts, trade-offs, "what would break if…"). Wait for the answers and correct concretely.
- When Ivan confirms the task is done, remove `mentor_pending` from that task's tests **only on his explicit word**. Run the fast checks.
- Write the step report with the `step-report` skill. Include "Что изучено" in 1–2 lines.

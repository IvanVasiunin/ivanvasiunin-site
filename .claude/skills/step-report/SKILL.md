---
name: step-report
description: Writes the report for one reviewable step (≤ ~300 diff lines) in Ivan's format — what and why, rejected alternatives, what to check, checks run. Use at the end of every step in zones where Claude writes code, and after mentor tasks.
---

# Step report

Every step ends with this report, in **Russian**. Then wait for Ivan's OK before the next step.

1. Collect the facts first:
   - `git status --porcelain` and `git diff --stat` (size of the change);
   - the commands you actually ran and their results.

   Never report a check you did not run.
2. If the diff is larger than ~300 lines, say so and propose how to split it.

## Template

```
## Шаг <n>: <short title>  (<ROADMAP id>)

### Что сделано и почему
- <change> — <reason, link to SPEC/ADR/rule>

### Отброшенные альтернативы
- <alternative> — <why not>

### Что проверить
- [ ] <file:line or behaviour Ivan should look at>
- [ ] <manual check, e.g. "открыть /cv в Safari на iPhone, проверить …">

### Проверки
| Команда | Результат |
|---|---|
| `node scripts/check-fast.mjs web` | ✔ |
| `pnpm --dir apps/web run e2e -- --project=mobile-android` | ✘ 1 failed → fixed in … |

### Открытые вопросы / решения за тобой
- <only if any>
```

## Rules
- Be honest:
  - if a check failed or was skipped, say so with the reason;
  - if something is UNVERIFIED, mark it.
- Keep it short:
  - "Что сделано" ≤ 7 bullets;
  - "Что проверить" lists concrete places, not generic advice.
- For mentor tasks, add **"Что изучено"** (1–2 lines) and the explain-back questions with Ivan's answers summarized.

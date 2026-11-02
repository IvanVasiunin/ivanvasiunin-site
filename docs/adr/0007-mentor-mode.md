# ADR-0007: Mentor mode for the AI core

- **Status:** Superseded by ADR-0011 (the mentor workflow; the zones below still apply)
- **Date:** 2026-11-01
- **Deciders:** Ivan Vasiunin

## Context

This is Ivan's first AI project, and he must be able to explain every AI-core decision in interviews.

He knows Python at a basic level and learns library patterns through repeated practice. If Claude writes the AI core, the project works but the learning goal fails.

## Decision

### Zones

| Zone | Who writes | How Ivan verifies |
|---|---|---|
| Markup, SCSS, TS/React, Brief/Full, "Ask about this" | Claude | Line-by-line review |
| SVG visualization | Claude | Visual review + automated screenshots and performance tests |
| Docker, CI, deployment, config; API glue (`core/`, `routers/`, `schemas/`, `services/`, `db/`, `migrations/`) | Claude | Automated checks + `security-reviewer` + an explanation of every file |
| **AI core**: `apps/api/src/site_api/{ingestion,rag,graph,prompts,evals}/` | **Ivan**, Claude as mentor | Claude reviews Ivan's code |

### Mentor workflow (skill `mentor-task`)

1. **Goal** of the task.
2. **Context:** libraries, links to official docs (verified via Context7).
3. **Claude writes failing tests first**, marked `@pytest.mark.mentor_pending`.
4. **Claude states the next step**, and Ivan writes the code.
5. **Claude reviews as a mentor.** It explains what to improve and why, and does not rewrite unless asked.

**Hints come in levels:**
1. a guiding question;
2. a direction (which API or concept);
3. an example on similar but different code;
4. the full solution — only when Ivan explicitly asks.

**After each task:** 2–3 **explain-back** questions that Ivan answers in his own words.

**Compromise mode:** if this is too slow, Ivan says so. Claude then writes the implementation, and Ivan writes tests and answers the explain-back questions. The switch is recorded in the task report.

### Enforcement in Claude Code

- `.claude/rules/mentor-mode.md` with `paths:` set to exactly the mentor-zone folders, so it loads whenever Claude touches those files.
- `apps/api/CLAUDE.md` lists the mentor-zone folders.
- **Output style:** a custom `.claude/output-styles/mentor.md` (`keep-coding-instructions: true`), enabled with `/output-style mentor` at the start of a mentor session and switched back afterwards. The built-in **Learning** style was rejected: it writes the surrounding implementation and leaves `TODO(human)` gaps, which violates "Claude does not write the implementation". Output styles are session-wide, so the path-scoped rule is the actual safety net.
- **`mentor_pending` marker:**
  - registered in pytest config;
  - excluded from fast checks, the Stop hook and the failing part of CI;
  - CI lists these tests separately.

  The marker is removed only when Ivan says the task is done. This is the **only** allowed exception to "a red test must not be skipped".
- **The Stop hook never pushes Claude to finish mentor-zone code:** it runs only non-`mentor_pending` tests.

## Consequences

- AI-core phases take longer, and that is accepted.
- The repository history shows Ivan's own AI-core code, which is a stronger portfolio signal.
- Claude's tests define the contract for Ivan's code, so test quality matters. Each mentor task's tests are reviewed by Ivan before he starts.

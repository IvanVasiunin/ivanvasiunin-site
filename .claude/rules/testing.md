---
paths:
  - "apps/web/**/*.test.{ts,tsx}"
  - "apps/web/e2e/**"
  - "apps/web/{vitest,playwright}.config.*"
  - "apps/web/lighthouserc.*"
  - "apps/api/tests/**"
  - "apps/api/pyproject.toml"
  - "docs/TESTING.md"
---

# Testing

The source of truth for commands, budgets and the change → checks table is `docs/TESTING.md`. Verification tags: `[hook]`, `[test]`, `[settings]`, `[review]`.

## After every change
- **Fast checks** of the affected app are run automatically by the Stop hook:
  - format;
  - lint;
  - typecheck;
  - unit and component tests;
  - excluding `mentor_pending`.

  If they fail, keep working until they are green. `[hook]`
- Run the additional checks required by the TESTING.md table:
  - UI / streaming → e2e on desktop + a mobile profile;
  - visualization → performance + screenshots;
  - prompts / retrieval / graph → evals, **only with Ivan's consent**.

  `[review]`
- **Before a commit:** the `pre-pr-check` skill. `[review]`
- Every task report has a **Checks** block: the commands that ran and their results. `[review]`

## Writing tests
- New logic comes with new tests in the same change. A fixed bug comes with a test that reproduces it. `[review]`
- LLM and network calls are mocked in unit, component, API and e2e tests. Only evals call real models. `[test]`
- Component tests cover every state:
  - default;
  - focus;
  - disabled;
  - loading;
  - error;
  - empty;

  plus keyboard interaction. `[review]`
- E2E tests run axe on every screen. Zero serious / critical violations. `[test]`
- Visual snapshots are updated (`--update-snapshots`) only with Ivan's OK, and the diff is shown in the report. `[review]`
- Prefer user-facing queries (`getByRole`, `getByLabelText`) over test IDs and CSS selectors. `[review]`

## Never weaken a red test
- A red test is never "fixed" by:
  - weakening the assertion;
  - adding `skip` / `xfail` / `.only`;
  - raising timeouts without a cause;
  - deleting it;

  unless Ivan explicitly agrees. `[review]` `[lint]` (`vitest/no-focused-tests`, `vitest/no-disabled-tests`; ruff / pytest config `--strict-markers`)
- **The only exception** is the `mentor_pending` marker ([ADR-0007](../../docs/adr/0007-mentor-mode.md)):
  - Claude puts it on the failing tests it writes for a mentor task;
  - only Ivan decides when it is removed;
  - those tests are excluded from fast checks, the Stop hook and the failing part of CI.

  `[hook]` `[test]`

## Coverage
- Guidance targets (not goals in themselves):
  - `apps/api` services and graph ≥ 80% lines;
  - frontend logic ≥ 70%;
  - markup is not measured.

  `[test]`

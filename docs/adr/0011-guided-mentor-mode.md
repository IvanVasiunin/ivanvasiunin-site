# ADR-0011: Guided mentor mode — Claude dictates, Ivan writes, every line explained

- **Status:** Accepted
- **Date:** 2026-11-02
- **Deciders:** Ivan Vasiunin
- **Supersedes:** the mentor workflow of [ADR-0007](0007-mentor-mode.md) (the zones of ADR-0007 stay as they are)

## Context

ADR-0007 made Ivan write the AI core himself with a hint ladder: guiding question, direction, analogous example, full solution only on request.

Before the AI core starts (Phase 3), Ivan decided that the pace matters more. He wants to learn from good code rather than reconstruct it from hints, because he cannot yet write it as well as Claude does.

The learning goal stays the same: Ivan must understand and be able to explain every AI-core decision in an interview.

## Options

| Option | Pros | Cons | Cost |
|---|---|---|---|
| **A. Keep ADR-0007 (hint ladder)** | Deepest practice | Slow; at Ivan's current level many tasks would end at hint 4 anyway | Phases 3–5 take much longer |
| **B. Compromise mode of ADR-0007** (Claude writes the code, Ivan writes tests) | Fast | Ivan would write test code he understands less than the implementation; Claude would author the AI core | Weaker learning and authorship |
| **C. Guided mode** (chosen): Claude dictates the code in small blocks, each with an explanation of why; Ivan writes it into the files himself | Fast; every line is explained when it is written; Ivan still types, runs and commits the code, so he authors it | Less struggle-based practice than A | — |

## Decision

Option C. The zones and the safety nets of ADR-0007 stay:
- the mentor-zone folders;
- `mentor_pending`;
- the path-scoped rule;
- Claude does not edit mentor-zone implementation files.

The workflow per task (`mentor-task` skill):

1. **Goal and context**, as before: what and why, the libraries with verified docs, the SPEC / ADR sections.
2. **Failing tests first**, written by Claude and marked `@pytest.mark.mentor_pending`. Each test is explained.
3. **Dictation in steps of about 30–80 lines.** Claude gives the exact code for one step, split into small blocks. Each block is followed by **«Почему так»**:
   - what each non-obvious line does;
   - what the library call returns;
   - why the parameters have these values;
   - which alternative was rejected and why.
4. **Ivan writes the code into the files himself.** He may adapt names or comments he wants to phrase differently. Then he runs the step's tests, or asks Claude to run them.
5. **Claude checks the result:** tests, ruff, pyright. Claude explains any difference from the dictated code; Ivan fixes it.
6. **After each task:** one or two short check questions ("what would break if…", "why X and not Y"). Ivan answers in a sentence or two.
7. Only Ivan removes `mentor_pending`, when he says the task is done.

## Consequences

**Becomes easier**
- AI-core phases move at roughly the pace of the rest of the project.
- Every line comes with its reasoning, which is the material Ivan needs for interviews.

**Becomes harder**
- Learning depends on Ivan reading the explanations, not only typing the code. The short check questions after each task are the signal.

**Stays the same**
- The repository history shows Ivan's commits of the AI-core code.
- Claude still never writes into the mentor-zone implementation files directly.

**Revisit if** Ivan wants more hands-on practice for a specific topic. A single task can go back to the ADR-0007 hint ladder on request.

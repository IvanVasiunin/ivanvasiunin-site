# `prompts/` — mentor zone

**Ivan writes these prompts** ([ADR-0007](../../../../../docs/adr/0007-mentor-mode.md)); Claude reviews them against the topic policy.

- Versioned files, never inline strings in code: `system.v1.md`, `router.v1.md`, `templates/<lang>.yaml` (EN / ES / RU / UK).
- The system prompt implements exactly the topic policy in [SPEC §5](../../../../../SPEC.md); Elio speaks about Ivan in the third person.
- Static part first, then retrieved context, history and question, so prompt caching works with both providers.
- Any prompt change needs an eval run (cost estimate first, Ivan's consent).

Rules: [`.claude/rules/langchain-rag.md`](../../../../../.claude/rules/langchain-rag.md) → *Models and prompts*. Roadmap: 4.2, 4.4.

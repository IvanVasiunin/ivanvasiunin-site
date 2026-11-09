# Product

<!-- impeccable:product-schema 1 -->

Product record for Impeccable (`.claude/skills/impeccable`). The source of truth for requirements is [SPEC.md](SPEC.md); this file only summarizes what design work must keep in mind. Confirmed with Ivan on 2026-11-08.

## Platform

web

## Users

- **Primary: recruiters.** They skim a CV in seconds, need the contacts and a PDF, and often arrive from a link on a phone. The interface is optimized for them first: `/cv` (Brief view), the contacts and the PDF must be fast to find and read.
- **Secondary: hiring managers and engineers.** They want depth: the Full CV, AI mode, the "Under the hood" panel, the knowledge map and the public GitHub repository.
- **Also:** people who want to know Ivan as a person (AI mode), and search engines / link previews (server-rendered HTML, meta, JSON-LD).

## Product Purpose

The personal site of Ivan Vasiunin, a Senior Markup Developer moving into AI Engineering. It tells visitors who Ivan is (experience, skills, projects, how he works) and is itself his first AI-engineering portfolio piece. Success: a recruiter gets what they need from the CV quickly, and an engineer comes away convinced of both the markup quality and the AI-engineering skills.

## Positioning

The site is a working AI system with an open kitchen: Elio answers only from retrieved sources, shows which ones it read (the knowledge map, the "Under the hood" panel with route, sources, timings, tokens and cost), and all code and decisions are public (SPEC, ARCHITECTURE, ADRs).

## Operating Context

- **Two modes, switched from every page:** AI mode (`/`, Elio, the chat, the knowledge map on desktop ≥ 80rem) and text mode (`/cv`, Brief / Full, print and a build-time PDF). Plus `/privacy`.
- Visitors come from CV links, LinkedIn and GitHub, often on mobile; the CV is also printed and saved as PDF.
- The repository is public and read by engineers as part of the evaluation.

## Capabilities and Constraints

- Static Astro site with two React islands (Chat, KnowledgeMap); FastAPI + LangChain / LangGraph backend with RAG over Ivan's documents.
- `/cv` works without JS and ships ≤ 30 KB of JS; `/` ≤ 200 KB (≤ 150 KB before the map). Lighthouse mobile on `/cv` ≥ 95. TTFT p50 < 2 s.
- Mobile from 360 px, 44 px touch targets; the knowledge map is desktop-only, with a light mode on weak devices.
- Elio speaks about Ivan in the third person, answers in the visitor's language, and never invents facts. Questions are never sent automatically.
- The site UI is in English.
- The CV stays self-contained: no calls to action from `/cv` into the chat (Ivan dropped "Ask about this", 2026-11-07).
- The rules in `.claude/rules/` and CLAUDE.md are binding and override Impeccable's guidance.

## Brand Commitments

- **Name:** ivanvasiunin.com; the assistant is **Elio**, a friendly, concrete, neutral persona (not a themed character), with its own avatar.
- **Voice:** clear, factual, first person on the CV, third person in Elio's answers.
- **Visual direction "Atlas"** (chosen in ROADMAP 1.1) is recorded in DESIGN.md. Ivan wants a rich, non-flat interface: gradients, a patterned backdrop, gradient borders and buttons, glows.

## Evidence on Hand

- CV content: `apps/web/src/content/cv/` (jobs, projects, skills, education, certifications, languages).
- Elio's sources: `data/experience-notes.md`, `data/github-projects.md`, `data/about-me-personal.md`, SPEC / ARCHITECTURE / ADRs.
- Public GitHub repositories of Ivan; a real production tool (NumbersValidator).
- **Absent, never fabricate:** testimonials, employer logos or internal details (NDA: role, product type, stack and contribution only), metrics beyond those in the sources, a phone number.

## Product Principles

1. The recruiter's path is the shortest: content first, nothing between the visitor and the CV.
2. Honest AI: answers come from sources, the sources are shown, uncertainty is said out loud.
3. Show the craft: the markup, accessibility and performance are part of the portfolio.
4. Weak devices and slow networks are first-class.

## Accessibility & Inclusion

WCAG 2.2 AA in both themes (contrast, visible focus, 44 px targets), reduced motion respected, progressive enhancement (`/cv` without JS), zero serious / critical axe violations on every screen.

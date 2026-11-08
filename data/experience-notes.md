---
title: Experience notes — Ivan Vasiunin
category: experience
source: experience-notes.md
---

# Experience notes — Ivan Vasiunin

## Summary

Ivan Vasiunin is a Senior Markup Developer with nearly 10 years of commercial experience building web applications and user interfaces for international products — from marketing websites and landing pages to large-scale product platforms. His core expertise is HTML, CSS/SCSS and JavaScript, responsive layouts, reusable UI components and frontend performance.

In his current role at BrainRocket he works on iGaming platforms and does more than feature development: he reviews code, mentors and onboards developers, investigates complex UI and performance issues, and helps improve UI quality and development workflows. He enjoys solving complex UI challenges and sharing knowledge with teammates.

Ivan is currently transitioning into AI Engineering. He has completed a full AI Engineer training course, and this website is his first AI project.

**Languages:** Ukrainian (native), Russian (fluent), English (professional working), Polish (limited working), Spanish (limited working).

**Top skills:** HTML, CSS, JavaScript, performance tuning, mentoring.

**Job title.** His official title at BrainRocket is Senior Markup Developer | UI Engineering. In his CV he presents himself as a Senior Frontend Developer transitioning into AI Engineering, because "frontend developer" describes his overall profile more clearly to recruiters.

## Skills

- **Frontend & web:** HTML5, CSS3, SCSS/SASS, BEM, JavaScript, TypeScript, React.js, Next.js, Redux, React Query (TanStack Query), Tailwind CSS, Bootstrap, styled-components, Angular (working with existing components), responsive design, Git / GitHub / GitLab, Figma.
- **AI Engineering:** Python, NLP fundamentals, large language models and Transformers (GPT, BERT), LangChain, LangGraph, Hugging Face, vector databases, foundation model APIs (OpenAI, Anthropic). He learned these through a full AI Engineer course; this website is his first applied AI project.
- **AI tools:** Claude Code, Claude Skills, Claude Code subagents, Claude Cowork, prompt engineering.
- **Engineering practices:** code review, mentoring and onboarding, performance tuning, Agile / Scrum, technical documentation, cross-team collaboration.

---

## Senior Markup Developer | UI Engineering — BrainRocket (Nov 2024 – present)

### Product
iGaming platforms: large-scale consumer web products for international markets, across several projects and brands.

### Growth in the role
Ivan joined BrainRocket as a strong Middle Markup Developer and was promoted to Senior through the company's internal grade review: he completed practical tasks and answered technical questions from two more experienced colleagues, after which his grade was raised to Senior.

His role grew from "receive a task, implement it, fix it" to also analyzing architecture, reviewing code, catching problems before they reach production, proposing improvements, owning performance, onboarding and mentoring others, and influencing the quality of the whole team's work.

### Team and role
- Team of about 10 people: developers, QA engineers, a product owner and a team lead. The team works closely with the project manager, product delivery manager, designers and delivery manager.
- Reports to his team lead and also communicates with the engineering manager.
- **Acting team lead.** For several weeks he stood in for his team lead and managed the team during the lead's absence. During that time the team shipped several important releases.
- The go-to person on the team for markup, CSS/SCSS, UI, components and UI-architecture questions.
- Works inside a component-based frontend architecture and understands how the UI is assembled from reusable parts. He works within established patterns and architectural constraints, finds places to improve them and explains to other developers how to use existing solutions correctly.
- Works across several projects and brands: switches quickly between requirements, gets up to speed in existing codebases, adapts solutions to each project's UI requirements and reuses existing components and templates.
- Takes part in the full delivery cycle — design → implementation → QA → fixes → release — and communicates between frontend developers, QA engineers, content managers, designers and product people.

### Stack and tools
HTML, CSS, SCSS, BEM, JavaScript, TypeScript, Angular, Git / GitLab, Figma (daily), npm (some experience with Bun), linters run automatically as part of the project build. Uses Claude Code and other AI tools in daily work.

Ivan's main strength is UI, markup, CSS and component implementation rather than application-level TypeScript/Angular logic. He works confidently with Angular components written in TypeScript: adding templates and containers, conditional rendering, loops, and editing TypeScript configs that control components such as sliders, image and video output.

### Regular work
- Implements interfaces from designs: semantic HTML, complex SCSS, responsive layouts.
- Builds new reusable components and adapts existing ones to different requirements, avoiding duplication.
- Thinks about maintainability: considers how a change to one component affects other parts of the project — not only whether one screen looks right, but how the solution lives in the shared system.
- Maintains existing UI and fixes visual and functional issues.
- Performs code reviews that look beyond "does it work": quality, maintainability, readability, reusability, HTML structure, SCSS, duplication, performance and alignment with the architecture.
- Investigates complex UI issues: finds the root cause and, where needed, proposes a proper solution instead of a workaround.
- Owns frontend performance in his area and proposes refactoring when he sees complex code, repeated solutions, technical debt or inefficient implementations.
- Supports technical coordination and release readiness during critical product launches.

### Key stories

**1. Fixing a homepage performance problem caused by CSS masks**
- *Situation:* a Lighthouse audit showed poor performance on the homepage of one of the sites.
- *Action:* Ivan traced the cause to CSS `mask`, used in buttons that appeared many times on the page, and rewrote the components without masks. He also optimized other heavy components that combined gradient backgrounds, gradient borders and `background-blend-mode`.
- *Result:* the homepage performed better, and the team gained a reusable approach to gradient UI that does not hurt rendering performance.

**2. Urgent rework of a first-screen component**
- At the request of senior leadership, Ivan quickly reworked the logic of a key component on a site's first screen under a tight deadline.

**3. Shipping urgent compliance releases as acting team lead**
- *Situation:* while the team lead was on vacation and Ivan was acting as lead, several urgent releases were requested to meet regulatory requirements.
- *Action:* he coordinated the team and the work.
- *Result:* all features were delivered to production on time.

**4. Performance reviews of supported projects**
- Ivan ran performance reviews of the projects the team supports:
  - removed unused code;
  - introduced SCSS mixins for reusable styles;
  - compressed and optimized images with the help of Claude;
  - minimized the use of masks and filters;
  - implemented fixes that reduce layout shift (CLS) during page load.

### Proud of
- **Mentoring a trainee to Junior.** Mentored a trainee throughout their development journey until they reached Junior Developer level.
- **Onboarding three developers.** Over about three months he onboarded three developers who first worked in his team and later became a separate team. He helped them understand the architecture, the existing frontend, development approaches and internal processes so they could work independently faster.
- **Promotion to Senior** through the internal grade review.
- **Low-bug code.** Writes code with very few bugs, which noticeably speeds up the development process.
- **Proactive communication.** Talks with product owners, designers and QA before a problem becomes a ticket, so issues are prevented or fixed quickly.

### Working with the team
- Code review as a way to raise code quality across the team, not only to catch bugs.
- Onboarding and mentoring through technical guidance, code reviews and knowledge sharing.
- Contributes to better engineering standards, fewer production issues and higher development efficiency.

### What he learned
- Deep knowledge of page markup and rendering: how a page is rendered, which CSS properties are cheap or expensive, what to replace and how all of it affects performance.
- Pure-CSS animations.
- Using AI tools in everyday development.
- Mentoring and team leadership.
- Practical Angular basics.

---

## Frontend Developer — University of educational medicine (Jan 2024 – Oct 2024, part-time)

### Product
The organization offers online and offline courses on wellbeing and self-care, nutrition, psychology and healthy eating.

### Stack and tools
HTML, CSS, JavaScript, React.js, Figma.

### Regular work
- Developed responsive landing pages and multi-page websites, mostly for new online and offline events.
- Added and improved React components for an internal dashboard that teachers used to track lessons and schedules and to leave notes.
- Collaborated with designers to ensure the technical feasibility of UI/UX designs.
- Optimized pages for speed and fixed bugs.

### Key achievement
Speed of delivery was the top priority: Ivan regularly delivered a complete landing page in one day so that new events could launch on time.

---

## Frontend Developer — Liketelecom (Jun 2016 – Oct 2024)

Liketelecom was Ivan's main full-time job. His part-time work at Digital Web and University of educational medicine, as well as his own websites, ran in his spare time, alongside it.

### Product
A small telecom startup serving corporate clients, including brokerage companies: call routing, auto dialers and customer support.

### Role
A mixed role combining frontend development with technical support and operations:
- developed JavaScript scripts that automated technical support work;
- built and maintained one-page websites (landing pages);
- handled customer inquiries, set up phone call routing, installed and configured software, and set up auto-dialer servers;
- controlled financial transactions and maintained reporting documentation.

Details of the support-automation scripts are under NDA.

### Key story: NumbersValidator — a web app that grew revenue by 5%
- *Situation:* Ivan noticed that clients' phone-number databases were often in the wrong format, and clients could not easily check whether a number was valid or which country it belonged to.
- *Action:* he came up with the idea of a tool that solves this and built it himself in vanilla JavaScript: a web service for validating, cleaning, correcting and converting phone numbers (see Projects below). Because the company was a small startup, he presented it to his direct manager, who then offered it to clients.
- *Result:* clients used the tool for about six months, until it was no longer relevant to their needs. During that period company revenue grew by 5%. Ivan owned the tool end to end.

---

## Webmaster — Own websites (Sep 2019 – Mar 2022, Ukraine, alongside main job)

- Ran two of his own information websites on WordPress with a small team of 2–3 copywriters and, at times, a content maker.
- Set up contextual advertising (Google AdSense), which monetized the sites, and attracted traffic through search-engine promotion (SEO).
- Refined the interfaces and improved the layouts.
- Bought and sold information websites, including preparing documentation for sales and handling hosting.
- **What he learned:** managing and working with his own team, solving organizational questions, documentation and hosting, and the business side of websites.

---

## Web Developer — Digital Web (Jan 2019 – Jun 2019, Mariupol, Ukraine, part-time)

- Designed and developed websites for businesses: multi-page sites, business-card sites and sites with a personal account area.
- Worked with MODX CMS.
- **Stack:** HTML, CSS, JavaScript, MODX.

---

## Technical Specialist — PE «Computer» (Oct 2015 – Jun 2016, Mariupol, Ukraine)

Ivan's first job after university: installing, configuring and maintaining accounting and reporting software for enterprise customers. A non-development role.

---

## Education

- **Donetsk National Technical University** — Specialist degree, Telecommunication systems and networks (2014–2015). The Specialist degree was a post-bachelor qualification in the Ukrainian higher-education system, completed after the Bachelor's degree.
- **Donetsk National Technical University** — Bachelor's degree, Telecommunications (2010–2014).
- **IT STEP Computer Academy Ukraine** — Full-stack developer program (2018–2019).

## Certifications and courses

- **The AI Engineer Course 2026: Complete AI Engineer Bootcamp** (Udemy, 365 Careers, 2026) — completed. Covers Python, NLP, Transformers, LLMs, LangChain, Hugging Face and vector databases.
- **Claude Code — The Practical Guide** (Udemy, Academind / Maximilian Schwarzmüller, Oct 2026). Ivan built a small app during the course to put the material into practice.
- **Claude Code** (Master.dev, formerly Frontend Masters, Aug 2026).
- **Free Claude Code course by Lydia Hallie (Anthropic)** (Aug 2026) — skills, hooks, subagents, agent teams and plugins.
- **JavaScript Web Animations with GreenSock (GSAP)** (Udemy, Oct 2024).
- **Learn Git by Doing: A step-by-step guide to version control** (Udemy, Sep 2024).
- **The Complete Sass & SCSS Course: From Beginner to Advanced** (Udemy, Apr 2024).
- **React — The Complete Guide (incl. React Router & Redux)** (Udemy, Nov 2023 – Mar 2024).
- **Meta Front-End Developer Specialization** (Coursera, Sep 2023).
- GoIT course assignments in React (see Projects).

**How he learns:** when he picks up a new technology, he prefers a well-structured course to organize the basics, while still reading the docs and experimenting on his own — and he believes nothing really sticks until you try it with your own hands.

---

## Projects

### NumbersValidator — production tool
- **Link:** https://github.com/IvanVasiunin/NumbersValidator
- **Built:** March–April 2023.
- **What it is:** a web service for checking and validating phone numbers, written in vanilla JavaScript on top of the google-libphonenumber library. It has user and administrator login pages and interfaces. Features:
  - cleaning extra characters out of phone numbers;
  - converting numbers between formats: E.164, RFC 3966, national and international;
  - checking whether a number is valid;
  - detecting the number type (mobile, fixed line, etc.), the mobile operator for mobile numbers, and the country and city for fixed-line numbers;
  - single mode (input in the browser) and batch mode: the user uploads an XLS/XLSX file and gets back an XLSX file with the results, with an optional «City» column.
- **Stack:** JavaScript, google-libphonenumber, Webpack, Express, lodash, PHP (server parts).
- **Status:** a real production tool, not a study project. Built at Liketelecom for the company's clients, used for about six months; revenue grew by 5% during that period.

### Test tasks for job applications
- **User Management Table (Smart-business)** — https://github.com/IvanVasiunin/smart-test-task — a responsive user-management table with search and filtering by name, username, email and phone. Stack: React, Redux Toolkit, TypeScript, Vite.
- **Blaize Test Task** — https://github.com/IvanVasiunin/blaize-test-task (demo: https://blaize-test-task.vercel.app/) — a responsive dashboard with an interactive market-overview chart (custom tooltips, gradient lines and dots) and a recent-activities section with horizontal scroll. Stack: React, Next.js, Recharts, Chakra UI.

### Course capstones
- **Little Lemon — Meta Front-End capstone** — https://github.com/IvanVasiunin/Coursera-capstone-project — a website for the fictional Little Lemon restaurant with table reservation, booking confirmation, specials, testimonials and a simulated API. Stack: React, React Router, Chakra UI, Formik + Yup, React Testing Library.
- **Portfolio page** — https://github.com/IvanVasiunin/portfolio-page-ReactJS — final lab of a Meta course: a portfolio page with forms. Stack: React, Chakra UI, Formik, Yup, custom hooks.
- **IT STEP exam project** — https://github.com/IvanVasiunin/exam — finishing a client-server application from a technical spec: page markup from a mockup plus JavaScript filters by author, year and month, and pagination. Stack: HTML/CSS, JavaScript, PHP, MySQL.

### Study projects (React ecosystem)
All of these are study projects from online courses.
- **Recipes app (Next.js)** — https://github.com/IvanVasiunin/nextjs-app — browse, add and view recipes. Stack: Next.js, SQLite (better-sqlite3), AWS S3 client, XSS sanitization.
- **Events app with TanStack Query** — https://github.com/IvanVasiunin/events-app-with-tanstack-query — create, edit and delete events with server-state management. Stack: React, TanStack Query, React Router, Vite.
- **Events app with authentication** — https://github.com/IvanVasiunin/events-app-with-authentication — token-based authentication and different permissions for logged-in and anonymous users.
- **Events with React Router** — https://github.com/IvanVasiunin/events-with-react-router — advanced React Router: loaders, actions, forms, fetchers, error handling. Simpler version: https://github.com/IvanVasiunin/react-router-app.
- **Shop with React-Redux** — https://github.com/IvanVasiunin/shop-with-react-redux — a store app that reads and writes data in Firebase via Redux Thunk. Stack: Redux Toolkit. Simpler Redux practice: https://github.com/IvanVasiunin/redux-project.
- **Food order app v2.0** — https://github.com/IvanVasiunin/food-order-app.v2.0 — cart, quantities, checkout form and sending orders to a backend; custom `useHttp` hook, `useReducer`, `useContext`. Earlier version: https://github.com/IvanVasiunin/food-order-app.
- **Placepicker v2.0** — https://github.com/IvanVasiunin/placepicker_v2.0 — a list of places to visit, sorted by the user's location, with a custom Node.js backend. Earlier version: https://github.com/IvanVasiunin/placepicker. Stack: React, Tailwind CSS.
- **Project Management App** — https://github.com/IvanVasiunin/react-project-managment-app (demo: https://ivanvasiunin.github.io/react-project-managment-app/) — create and delete projects and their tasks. Stack: React, Tailwind CSS.
- **Expense Tracker** — https://github.com/IvanVasiunin/expense_tracker (demo: https://ivanvasiunin.github.io/expense_tracker/) — monthly expenses with a yearly chart.
- **Final Countdown Game** — https://github.com/IvanVasiunin/final-countdown-game (demo: https://ivanvasiunin.github.io/final-countdown-game/) — stop the timer just before time runs out; 4 difficulty levels; refs, portals, `useImperativeHandle`.
- **React Quiz** — https://github.com/IvanVasiunin/react-quiz — a React knowledge quiz with timed answers and a results summary. Stack: React, Tailwind CSS.
- **Investment Calculator** — https://github.com/IvanVasiunin/investment-calculator — calculates investment returns year by year from user inputs.
- **React Poster** — https://github.com/IvanVasiunin/react-poster — a posts board with a dummy backend and routing.
- **React forms** — https://github.com/IvanVasiunin/react-form — form validation and a custom `useInput` hook.
- **List with search field** — https://github.com/IvanVasiunin/list-with-search-field — class-based components: state, context, lifecycle methods, error boundaries.
- **Styling approaches (ReactArt)** — https://github.com/IvanVasiunin/reactart — the same UI styled with vanilla CSS, CSS Modules, styled-components and Tailwind CSS. Tailwind-only version: https://github.com/IvanVasiunin/reactart_with_taildwindCSS.
- **TypeScript basics** — https://github.com/IvanVasiunin/ts-basics — React with TypeScript.
- **Tests with Jest** — https://github.com/IvanVasiunin/simple-tests-with-jest — unit tests for React components with Jest and React Testing Library.
- **Animated to-do list** — https://github.com/IvanVasiunin/animated-todo-list-with-reactjs — a GoIT assignment with Framer Motion animations and routing.
- **Elegant clothing shop** — https://github.com/IvanVasiunin/elegant-clothing-shop — a GoIT React assignment.
- **SCSS project** — https://github.com/IvanVasiunin/scss-project — a multi-page website (home, about, portfolio, contact) styled with SCSS.

Earlier small exercises (a simple calculator, registration forms and Git labs) are also on his GitHub: https://github.com/IvanVasiunin

---

## This website

Ivan's first AI project and part of his transition from frontend development to AI Engineering. It combines a RAG-based AI assistant that answers questions about him with a text CV. The site's own documentation (spec, architecture and decision records) describes how it is built and why.

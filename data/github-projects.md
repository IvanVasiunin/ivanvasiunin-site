---
title: GitHub projects — what Ivan's code shows
category: experience
source: github-projects.md
updated: 2026-11-07
---

# GitHub projects — what Ivan's code shows

Ivan's public GitHub profile is https://github.com/IvanVasiunin. This note goes beyond the READMEs: it describes the technologies and approaches visible in the code itself. Most repositories are study projects from online courses (labelled below); his own work is NumbersValidator (a production tool) and two hiring test tasks. The repositories show how his frontend skills grew: PHP and vanilla JavaScript in 2018–2019, then, from August 2023, a fast, structured run through the React ecosystem, ending with Next.js, TypeScript and two test tasks in 2024.

## Hiring test task: User Management Table (Smart-business, 2024)

- **Link:** https://github.com/IvanVasiunin/smart-test-task (demo on Vercel: https://smart-test-task-nine.vercel.app/).
- **Kind:** a test task for a job application, Ivan's own implementation.
- **What it does:** a responsive table of users that filters live by name, username, email and phone at the same time; on small screens the table scrolls horizontally.
- **Stack:** React 18, TypeScript 5.5, Redux Toolkit, CSS Modules, Vite, ESLint (flat config).
- **Approaches:**
  - a typed Redux Toolkit slice (`createSlice`) whose filter action is typed with `PayloadAction` and `keyof` the filter state, so only real filter fields can be set;
  - typed hooks (`useUsersDispatch`, `useUsersSelector` with `TypedUseSelectorHook<RootState>`) instead of untyped `useSelector` everywhere;
  - the full user list and the filtered list are kept apart in the store, so clearing a filter needs no new request;
  - users are fetched once with `useEffect`, with a loading state.

## Hiring test task: Blaize dashboard (2024)

- **Link:** https://github.com/IvanVasiunin/blaize-test-task (demo on Vercel: https://blaize-test-task.vercel.app/).
- **Kind:** a test task for a job application, Ivan's own implementation.
- **What it does:** a crypto/DeFi-style dashboard: a market-overview chart, recent activities with horizontal scroll and a top-performer block, with a header (custom select, hamburger menu) and a sidebar.
- **Stack:** Next.js 14 (App Router), Chakra UI, Recharts, JavaScript.
- **Approaches:**
  - a multi-series Recharts line chart in a responsive container with custom SVG gradient strokes, a custom tooltip and a custom gradient dot for the active point;
  - mouse handlers that show the tooltip and axes only while the pointer is over the chart;
  - a period switcher that changes the chart's time range;
  - a responsive layout built by hand with many media queries, matching the design across screen sizes.

## Production tool: NumbersValidator (2023)

- **Link:** https://github.com/IvanVasiunin/NumbersValidator
- **Kind:** a real tool Ivan built at Liketelecom for the company's clients (see his experience notes for its business result).
- **What the code shows:**
  - a PHP back end with session-based login for users and a separate admin panel (user management, passwords, balances);
  - JSON endpoints called from the browser with `fetch`;
  - Excel files read in the browser with `FileReader`, results generated back as XLSX downloads;
  - phone-number parsing and formatting with google-libphonenumber;
  - the browser code bundled with webpack 5 and Babel.

## Next.js App Router: Foodies recipes site (study project, 2024)

- **Link:** https://github.com/IvanVasiunin/nextjs-app
- **Kind:** a study project from a Next.js course.
- **Stack:** Next.js 14 App Router, React Server Components, SQLite (better-sqlite3), AWS S3 SDK.
- **Approaches:**
  - a Server Action (`'use server'`) that validates the submitted form on the server, saves the meal, calls `revalidatePath` and redirects;
  - `useFormState` to show the server's validation message in the form;
  - a data layer with prepared SQL statements, `slugify` for URLs and `xss` to sanitize user-written instructions before they are rendered as HTML;
  - image upload to S3;
  - `Suspense` with a loading fallback around slow data, plus the App Router's `error.js`, `not-found.js`, `notFound()` and `generateMetadata` for per-page SEO;
  - `next/image` and a client-side image picker with preview.

## Next.js Pages Router: Meetups app (study project, 2024)

- **Link:** https://github.com/IvanVasiunin/next-app-with-pages-router
- **Kind:** a study project from a Next.js course.
- **Approaches:** static generation with `getStaticProps` and incremental static regeneration (`revalidate`), pre-rendered dynamic pages with `getStaticPaths`, API routes writing to MongoDB, and page titles and descriptions with `next/head`.

## React Router data APIs and authentication (study projects, 2024)

- **Links:** https://github.com/IvanVasiunin/events-with-react-router, https://github.com/IvanVasiunin/events-app-with-authentication, https://github.com/IvanVasiunin/react-poster, https://github.com/IvanVasiunin/react-router-app
- **Kind:** study projects from a React course (the back ends are the course's dummy Express APIs).
- **Approaches:**
  - route `loader`s and `action`s instead of fetching in effects; errors thrown from loaders and shown by an error route (`useRouteError`);
  - `useNavigation` for the submitting state, `useActionData` for server-side validation messages, `useFetcher` for a newsletter form that submits without navigating;
  - `defer` with `Await` and `Suspense`, so a page shows its fast data while slower data is still loading;
  - token-based authentication: the token and its expiry are kept in `localStorage`, a root loader exposes the token, `checkAuthLoader` protects the edit and new-event routes by redirecting to the login page, and logout is a route action that clears the token;
  - nested routes that open as modals over a list (react-poster).

## Server state with TanStack Query (study project, 2024)

- **Link:** https://github.com/IvanVasiunin/events-app-with-tanstack-query
- **Kind:** a study project from a React course.
- **Approaches:** `useQuery` with structured query keys (for example a key that includes the search term), `enabled` to wait for input, `staleTime`, request cancellation by passing the query's `signal` to `fetch`, and `useMutation` with `invalidateQueries` after creating, editing or deleting an event. An optimistic-update version with rollback on error is written in the code but left commented out.

## State management: Context, reducers and Redux (study projects, 2023)

- **Links:** https://github.com/IvanVasiunin/food-order-app.v2.0, https://github.com/IvanVasiunin/elegant-clothing-shop, https://github.com/IvanVasiunin/shop-with-react-redux, https://github.com/IvanVasiunin/redux-project
- **Kind:** study projects from React courses.
- **Approaches:**
  - a shopping cart in React Context with `useReducer` (food order app, clothing shop), and a second context for which modal is open;
  - Redux Toolkit slices with `configureStore`;
  - a cart synced to Firebase through hand-written thunk action creators, with loading, success and error notifications driven from a UI slice.

## Reusable React patterns: custom hooks, portals and refs (study projects, 2023)

- **Links:** https://github.com/IvanVasiunin/food-order-app.v2.0, https://github.com/IvanVasiunin/placepicker_v2.0, https://github.com/IvanVasiunin/react-form, https://github.com/IvanVasiunin/final-countdown-game, https://github.com/IvanVasiunin/react-project-managment-app, https://github.com/IvanVasiunin/portfolio-page-ReactJS
- **Kind:** study projects from React courses.
- **Approaches:**
  - custom hooks: `useHttp` (request state, errors, reset), `useFetch` (loading, error, data), `useInput` (value, blur, validation error only after the user has edited the field), `useSubmit`;
  - modals rendered with `createPortal` on the native `<dialog>` element and opened through `forwardRef` + `useImperativeHandle`, so the parent calls `open()` instead of managing the dialog's state;
  - timers kept in `useRef` (the countdown game), `useCallback` to keep handlers stable;
  - the browser's Geolocation API with a distance formula to sort places nearest-first (placepicker), and a request that restores the previous list if saving fails;
  - class components with lifecycle methods and an error boundary (list-with-search-field), to understand the older React model.

## Animation with Framer Motion (study project, 2024)

- **Link:** https://github.com/IvanVasiunin/animated-todo-list-with-reactjs
- **Kind:** a study project (GoIT course assignment).
- **Approaches:** `AnimatePresence` for enter and exit animations (including `mode="wait"`), `layout` animations when list items move, a shared `layoutId` for a tab indicator that slides between tabs, hover animations and an animated expand and collapse.

## Styling approaches (study projects, 2023–2024)

- **Links:** https://github.com/IvanVasiunin/reactart, https://github.com/IvanVasiunin/reactart_with_taildwindCSS, https://github.com/IvanVasiunin/react-project-managment-app, https://github.com/IvanVasiunin/scss-project, https://github.com/IvanVasiunin/expense_tracker
- **Kind:** study projects.
- **Approaches:** the same form styled with plain CSS, CSS Modules, styled-components (with transient `$` props for conditional styles) and Tailwind CSS with responsive classes; an SCSS site with variables, maps, loops, mixins, media-query mixins and partials; a bar chart drawn with plain components and CSS (no chart library) in the expense tracker.

## TypeScript and testing basics (study projects, 2024)

- **Links:** https://github.com/IvanVasiunin/ts-basics, https://github.com/IvanVasiunin/simple-tests-with-jest
- **Kind:** study projects.
- **Approaches:** a React to-do app in TypeScript with a model class and a typed Context; component tests with Jest and React Testing Library, including an asynchronous test with a mocked `fetch`. Beyond these exercises, the study repositories have no test suites of their own; this website, by contrast, is covered by unit, component, end-to-end, accessibility and visual tests.

## Early web projects: PHP and JavaScript (2018–2019)

- **Links:** https://github.com/IvanVasiunin/exam, https://github.com/IvanVasiunin/Registration-form
- **Kind:** an IT STEP Academy exam project and an early exercise.
- **Approaches:** a small hand-written MVC structure in PHP with a PDO database wrapper (prepared statements) on MySQL; an article feed with author, year and month filters and pagination loaded over AJAX as JSON, without page reloads; a responsive layout from a design mockup; file upload with an image preview in the browser and client-side form validation.

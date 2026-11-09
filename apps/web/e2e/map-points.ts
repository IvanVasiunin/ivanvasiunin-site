// A deterministic `points.json` for e2e (SPEC §4.4 v2): the real file is written by ingestion and
// is not in the repository, so every test page gets this one (fixtures.ts routes it). It holds the
// chunks the mocked chat answers cite (src/lib/chat/mock/scenarios.ts) plus background stars, laid
// out in two loose regions like the real map.
import { TOPICS } from '../src/lib/chat/mock/scenarios';

type Kind = 'cv' | 'experience' | 'personal' | 'site_docs' | 'github_readme';

const KINDS: readonly Kind[] = ['cv', 'experience', 'personal', 'github_readme', 'site_docs'];

/** A fixed pseudo-random number in [0, 1) for index `i` and channel `k` (no Math.random). */
const noise = (i: number, k: number): number => {
  const s = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453;
  return s - Math.floor(s);
};

const cited = TOPICS.flatMap((topic) => topic.sources);
const citedPoints = [...new Map(cited.map((s) => [s.chunk_id, s])).values()].map((s, i) => ({
  id: s.chunk_id,
  x: 0.55 + noise(i, 1) * 0.3,
  y: 0.2 + noise(i, 2) * 0.3,
  source_type: s.source_type,
  section: s.section ?? s.title,
  title: s.title,
  c: s.chunk_id.includes('brainrocket') ? ['brainrocket', 'angular'] : [],
}));

const background = Array.from({ length: 120 }, (_, i) => {
  const kind = KINDS[i % KINDS.length] ?? 'cv';
  const site = kind === 'site_docs';
  return {
    id: `${kind}:background-${String(i)}:0`,
    x: (site ? 0.05 : 0.5) + noise(i, 3) * 0.4,
    y: (site ? 0.4 : 0.1) + noise(i, 4) * 0.5,
    source_type: kind,
    section: `Background ${String(i)}`,
    title: `Background ${String(i)}`,
    c: [],
  };
});

export const MAP_POINTS = {
  version: '2026-11-07T00:00:00Z',
  points: [...citedPoints, ...background],
  concepts: [
    { id: 'brainrocket', label: 'BrainRocket', aliases: ['brainrocket'] },
    { id: 'angular', label: 'Angular', aliases: ['angular'] },
  ],
};

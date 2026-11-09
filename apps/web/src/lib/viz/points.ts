// `points.json` v2 (SPEC §4.4): the knowledge map's data, fetched at runtime and therefore untrusted
// (typescript.md): every field is checked here, and anything malformed hides the map (it is
// decoration; the chat keeps working, visualization.md → Data).
import type { SourceItem } from '../api/types';

export type SourceType = SourceItem['source_type'];

export interface MapPoint {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly sourceType: SourceType;
  readonly section: string;
  readonly title: string;
  /** Ids of the concepts the chunk's text mentions. */
  readonly concepts: readonly string[];
}

export interface MapConcept {
  readonly id: string;
  readonly label: string;
  readonly aliases: readonly string[];
}

export interface MapData {
  readonly version: string;
  readonly points: readonly MapPoint[];
  readonly concepts: readonly MapConcept[];
}

export const POINTS_URL = '/data/points.json';
/** More than this is not a file ingestion wrote (SPEC: ≤ 50 KB gzip, a few hundred chunks). */
export const MAX_POINTS = 5000;

const SOURCE_TYPES: readonly SourceType[] = [
  'cv',
  'experience',
  'personal',
  'site_docs',
  'github_readme',
];

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isString = (value: unknown): value is string => typeof value === 'string';
const isUnit = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
const isStrings = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every(isString);
const isSourceType = (value: unknown): value is SourceType =>
  isString(value) && (SOURCE_TYPES as readonly string[]).includes(value);

function toPoint(value: unknown): MapPoint | null {
  if (!isObject(value)) return null;
  const { id, x, y, source_type: sourceType, section, title, c } = value;
  if (!isString(id) || !isUnit(x) || !isUnit(y) || !isSourceType(sourceType)) return null;
  if (!isString(section) || !isString(title) || !isStrings(c)) return null;
  return { id, x, y, sourceType, section, title, concepts: c };
}

function toConcept(value: unknown): MapConcept | null {
  if (!isObject(value)) return null;
  const { id, label, aliases } = value;
  if (!isString(id) || !isString(label) || !isStrings(aliases) || aliases.length === 0) return null;
  return { id, label, aliases };
}

/** The map's data, or null when the file is not what ingestion writes. */
export function parseMapData(raw: unknown): MapData | null {
  if (!isObject(raw) || !isString(raw.version) || !Array.isArray(raw.points)) return null;
  if (!Array.isArray(raw.concepts) || raw.points.length > MAX_POINTS) return null;
  const points = raw.points.map(toPoint);
  const concepts = raw.concepts.map(toConcept);
  if (!points.every((p) => p !== null) || !concepts.every((c) => c !== null)) return null;
  // Ids key the stars and the hover links: a repeat is a broken file.
  if (new Set(points.map((p) => p.id)).size !== points.length) return null;
  return { version: raw.version, points, concepts };
}

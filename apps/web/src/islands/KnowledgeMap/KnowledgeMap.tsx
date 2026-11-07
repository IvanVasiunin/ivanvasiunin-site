// The knowledge map card (SPEC US-A11, US-A12; ADR-0012): every passage Elio can read as a star on a
// night sky; the passages an answer read ignite in their source's colour, a camera eases onto them,
// and the caption names the answer's topics. Desktop only (the page hydrates it from 80rem).
//
// The canvas is decoration (`aria-hidden`); what it shows is text in the caption, the answer's
// Sources and Under the hood. The chat island talks to it through typed DOM events (lib/viz/events).
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';

import { type MapTurn, emitMapEvent, onMapEvent } from '../../lib/viz/events';
import { type MapData, type MapPoint, POINTS_URL, parseMapData } from '../../lib/viz/points';
import { topicsOf } from '../../lib/viz/topics';
import { KnowledgeMapRenderer, type MapPalette, type Rgb } from './renderer';

import './KnowledgeMap.scss';

const LEGEND = [
  ['cv', 'CV'],
  ['experience', 'Experience notes'],
  ['personal', 'Personal facts'],
  ['github_readme', 'GitHub'],
  ['site_docs', 'Site docs'],
] as const;

/** At most this many topics in the caption; the rest is "+N more". */
export const MAX_TOPICS = 7;

const REST: MapTurn = { phase: 'rest', sources: [], answer: '' };

/** Final states at once: reduced motion, or a weak device (SPEC §6.3). */
export function prefersStillMap(
  nav: Navigator = navigator,
  media = window.matchMedia.bind(window),
): boolean {
  if (media('(prefers-reduced-motion: reduce)').matches) return true;
  const memory = (nav as Navigator & { deviceMemory?: number }).deviceMemory;
  const saveData = (nav as Navigator & { connection?: { saveData?: boolean } }).connection
    ?.saveData;
  return nav.hardwareConcurrency <= 4 || (memory !== undefined && memory <= 4) || saveData === true;
}

function rgbOf(value: string): Rgb {
  const hex = value.trim().replace('#', '');
  const n = Number.parseInt(hex.length === 3 ? hex.replace(/./g, '$&$&') : hex, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function readPalette(element: HTMLElement): MapPalette {
  const style = getComputedStyle(element);
  const token = (name: string): string => style.getPropertyValue(name);
  return {
    sources: {
      cv: rgbOf(token('--color-map-cv')),
      experience: rgbOf(token('--color-map-experience')),
      personal: rgbOf(token('--color-map-personal')),
      site_docs: rgbOf(token('--color-map-site-docs')),
      github_readme: rgbOf(token('--color-map-github')),
    },
    label: token('--color-map-muted').trim(),
    dust: token('--color-map-text').trim(),
    font: style.fontFamily,
  };
}

export function caption(
  turn: MapTurn,
  topics: readonly string[],
  canHover: boolean,
): { text: string; topics: string } {
  switch (turn.phase) {
    case 'rest':
      return {
        text: 'Each dot is a passage Elio can read. Similar meanings sit close together.',
        topics: '',
      };
    case 'searching':
      return { text: 'Looking for passages that match your question…', topics: '' };
    case 'none':
      return { text: 'This reply didn’t need a search, so no stars lit up.', topics: '' };
    case 'read': {
      const n = turn.sources.length;
      if (n === 0)
        return { text: 'Nothing in Ivan’s materials matched, so no stars lit up.', topics: '' };
      const hover = canHover ? ' Hover a star or a source to see what it is.' : '';
      const shown = topics.slice(0, MAX_TOPICS).join(' · ');
      const more = topics.length > MAX_TOPICS ? ` +${String(topics.length - MAX_TOPICS)} more` : '';
      return {
        text: `Elio read ${String(n)} ${n === 1 ? 'passage' : 'passages'} for this answer.${hover}`,
        topics: topics.length ? `Topics: ${shown}${more}` : '',
      };
    }
    default: {
      const unknown: never = turn.phase;
      return unknown;
    }
  }
}

interface Tooltip {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  /** The star is in the right half: the tooltip opens to its left. */
  readonly start: boolean;
}

export function KnowledgeMap() {
  const titleId = useId();
  const explainId = useId();
  const [data, setData] = useState<MapData | null | 'failed'>(null);
  const [turn, setTurn] = useState<MapTurn>(REST);
  const [tooltip, setTooltip] = useState<Tooltip | null>(null);
  const [explaining, setExplaining] = useState(false);
  const skyRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<KnowledgeMapRenderer | null>(null);
  const infoRef = useRef<HTMLButtonElement | null>(null);
  const gotItRef = useRef<HTMLButtonElement | null>(null);
  // The sources the renderer shows (null: none): streaming updates must not re-ignite them.
  const lastSourcesRef = useRef<string | null>(null);

  // The points: fetched once; a failed fetch or a malformed file hides the card (it is decoration).
  useEffect(() => {
    const controller = new AbortController();
    fetch(POINTS_URL, { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : null))
      .then((raw: unknown) => {
        setData(parseMapData(raw) ?? 'failed');
      })
      .catch(() => {
        if (!controller.signal.aborted) setData('failed');
      });
    return () => {
      controller.abort();
    };
  }, []);

  const points = useMemo(
    () =>
      new Map<string, MapPoint>(data && data !== 'failed' ? data.points.map((p) => [p.id, p]) : []),
    [data],
  );

  // The renderer lives as long as the canvas; it is told the box on every resize.
  useEffect(() => {
    const canvas = canvasRef.current;
    const sky = skyRef.current;
    if (!canvas || !sky || !data || data === 'failed') return;
    const renderer = new KnowledgeMapRenderer(canvas, data.points, {
      instant: () => prefersStillMap(),
      regionLabels: { career: 'CAREER', personal: 'PERSONAL', site: 'THIS SITE' },
      insets: { top: 28, bottom: 40 },
    });
    renderer.setPalette(readPalette(sky));
    const observer = new ResizeObserver(() => {
      renderer.resize(sky.clientWidth, sky.clientHeight, window.devicePixelRatio);
    });
    observer.observe(sky);
    rendererRef.current = renderer;
    // Ask the chat for the turn it already shows (this island hydrates after the chat).
    emitMapEvent('knowledge-map:ready', {});
    return () => {
      observer.disconnect();
      renderer.destroy();
      rendererRef.current = null;
    };
  }, [data]);

  // The latest turn from the chat drives the renderer: dim, ignite or rest.
  useEffect(
    () =>
      onMapEvent('knowledge-map:turn', (next) => {
        setTurn(next);
        const renderer = rendererRef.current;
        if (!renderer) return;
        const key = next.sources.map((s) => s.id).join('|');
        if (next.phase === 'searching') {
          lastSourcesRef.current = null;
          renderer.search();
        } else if (next.phase === 'read') {
          // Sources arrive once per answer; a restore (`instant`) always redraws, settled.
          if (key !== lastSourcesRef.current || next.instant === true) {
            renderer.light(next.sources, next.instant === true);
          }
          lastSourcesRef.current = key;
        } else {
          lastSourcesRef.current = null;
          renderer.rest();
        }
      }),
    [],
  );

  const settleRef = useRef<number | undefined>(undefined);
  useEffect(
    () => () => {
      window.clearTimeout(settleRef.current);
    },
    [],
  );
  const showTooltip = useCallback((id: string | null, focus: boolean) => {
    const renderer = rendererRef.current;
    renderer?.pointAt(id, focus);
    const place = (): void => {
      const at = id ? renderer?.screenOf(id) : null;
      const width = skyRef.current?.clientWidth ?? 0;
      setTooltip(id && at ? { id, x: at.x, y: at.y, start: at.x > width / 2 } : null);
    };
    place();
    // While the camera still moves, place it again where the star comes to rest.
    window.clearTimeout(settleRef.current);
    const wait = renderer?.settlesIn() ?? 0;
    if (id && wait > 0) settleRef.current = window.setTimeout(place, wait);
  }, []);

  // A source in the answer pointed at → its star.
  useEffect(
    () =>
      onMapEvent('knowledge-map:point-source', ({ id }) => {
        showTooltip(id, id !== null);
      }),
    [showTooltip],
  );

  // Pointing at a star (mouse only): a decorative enhancement of the canvas, so plain listeners
  // rather than interactive JSX; keyboard users reach the same ring and tooltip from the Sources.
  useEffect(() => {
    const sky = skyRef.current;
    if (!sky) return;
    let current: string | null = null;
    const point = (id: string | null): void => {
      if (id === current) return;
      current = id;
      showTooltip(id, false);
      emitMapEvent('knowledge-map:point-star', { id });
    };
    const onMove = (event: MouseEvent): void => {
      const box = sky.getBoundingClientRect();
      point(rendererRef.current?.starAt(event.clientX - box.left, event.clientY - box.top) ?? null);
    };
    const onLeave = (): void => {
      point(null);
    };
    sky.addEventListener('mousemove', onMove);
    sky.addEventListener('mouseleave', onLeave);
    return () => {
      sky.removeEventListener('mousemove', onMove);
      sky.removeEventListener('mouseleave', onLeave);
    };
  }, [data, showTooltip]);

  // The explainer: focus moves into it when it opens, and back to its button when it closes from
  // inside (Got it, Escape); Escape works only while focus is in the card (not in the chat input).
  const cardRef = useRef<HTMLElement | null>(null);
  const moveFocusRef = useRef(false);
  useEffect(() => {
    if (!moveFocusRef.current) return;
    moveFocusRef.current = false;
    (explaining ? gotItRef.current : infoRef.current)?.focus();
  }, [explaining]);
  const openExplain = (open: boolean): void => {
    moveFocusRef.current = open || !!cardRef.current?.contains(document.activeElement);
    setExplaining(open);
  };
  useEffect(() => {
    if (!explaining) return;
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && cardRef.current?.contains(document.activeElement)) {
        moveFocusRef.current = true;
        setExplaining(false);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
    };
  }, [explaining]);

  if (data === 'failed') return null;

  const topics = data
    ? topicsOf(
        turn.answer,
        turn.sources.map((s) => s.id),
        points,
        data.concepts,
      )
    : [];
  const text = caption(
    turn,
    topics,
    typeof window !== 'undefined' && window.matchMedia('(hover: hover)').matches,
  );
  const hovered = tooltip ? points.get(tooltip.id) : undefined;
  const read = tooltip ? turn.sources.find((s) => s.id === tooltip.id) : undefined;
  const names: string[] =
    hovered && data
      ? hovered.concepts.flatMap((c) => data.concepts.find((k) => k.id === c)?.label ?? [])
      : [];

  return (
    <section
      ref={cardRef}
      className="knowledge-map"
      aria-labelledby={titleId}
      // Shown once its data is in: without JS (or before hydration) the card stays invisible.
      data-ready={data ? '' : undefined}
    >
      <div className="knowledge-map__head">
        <h2 className="knowledge-map__title" id={titleId}>
          Knowledge map
        </h2>
        <button
          ref={infoRef}
          className="knowledge-map__info"
          type="button"
          aria-expanded={explaining}
          aria-controls={explainId}
          onClick={() => {
            openExplain(!explaining);
          }}
        >
          What is this?
        </button>
      </div>
      <p className="knowledge-map__caption">{text.text}</p>
      <div className="knowledge-map__sky" ref={skyRef}>
        <canvas className="knowledge-map__canvas" ref={canvasRef} aria-hidden="true" />
        {/* On the sky, in gold: the caption keeps two lines and the sky never resizes. */}
        {text.topics && <p className="knowledge-map__topics">{text.topics}</p>}
        <ul className="knowledge-map__legend" aria-label="Colours of the map">
          {LEGEND.map(([kind, label]) => (
            <li key={kind} className="knowledge-map__legend-item" data-source={kind}>
              {label}
            </li>
          ))}
        </ul>
        {tooltip && hovered && (
          <div
            className="knowledge-map__tooltip"
            data-source={hovered.sourceType}
            data-side={tooltip.start ? 'start' : 'end'}
            style={{ '--x': `${String(tooltip.x)}px`, '--y': `${String(tooltip.y)}px` }}
            aria-hidden="true"
          >
            <b className="knowledge-map__tooltip-title">{hovered.title}</b>
            {names.length > 0 && (
              <span className="knowledge-map__tooltip-line">
                Mentions {names.slice(0, 3).join(', ')}
                {names.length > 3 ? ` +${String(names.length - 3)}` : ''}
              </span>
            )}
            {read && (
              <span className="knowledge-map__tooltip-read" data-source={hovered.sourceType}>
                Read for this answer · relevance {read.score.toFixed(2)}
              </span>
            )}
          </div>
        )}
      </div>
      <div className="knowledge-map__explain" id={explainId} hidden={!explaining}>
        <h3 className="knowledge-map__explain-title">What is this map?</h3>
        <p className="knowledge-map__explain-text">
          Elio knows Ivan from {data ? String(data.points.length) : 'a few hundred'} short passages:
          his CV, his notes, personal Q&amp;A, a GitHub README and this site’s design docs. An AI
          model turned each passage into 1,536 numbers that capture its meaning. The map squeezes
          those numbers into two dimensions, so passages with similar meaning land close together.
          Nobody placed them by hand.
        </p>
        <p className="knowledge-map__explain-text">
          When you ask, Elio finds the passages that match best, by meaning and by keywords, and
          reads them. They light up in the colour of their source. Lit stars can sit apart:
          flattening loses some detail.
        </p>
        <p className="knowledge-map__explain-text">
          Area isn’t amount: the site’s design docs are long technical texts, so they cover a lot of
          sky. Ivan’s own material is drawn brighter.
        </p>
        <p className="knowledge-map__explain-text knowledge-map__explain-note">
          text-embedding-3-large · UMAP
        </p>
        <button
          ref={gotItRef}
          className="knowledge-map__got-it"
          type="button"
          onClick={() => {
            openExplain(false);
          }}
        >
          Got it
        </button>
      </div>
    </section>
  );
}

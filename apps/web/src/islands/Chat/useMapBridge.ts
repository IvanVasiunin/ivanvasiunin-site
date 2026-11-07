// The chat's side of the knowledge map bridge (ADR-0012, lib/viz/events.ts): the map shows what the
// latest answer read. The chat sends the latest turn whenever it changes, again (without animation)
// after a restore, and again when the map island hydrates after it and asks.
import { useEffect, useRef } from 'react';

import { type ChatState, isActive } from '../../lib/chat/state';
import { type MapTurn, emitMapEvent, onMapEvent } from '../../lib/viz/events';

export const REST_TURN: MapTurn = { phase: 'rest', sources: [], answer: '' };

/** What the map shows for the conversation: its latest turn. */
export function mapTurnOf(state: ChatState): MapTurn {
  const last = state.turns.at(-1);
  if (!last) return REST_TURN;
  const sources = last.sources.map((s) => ({ id: s.chunk_id, score: s.score }));
  if (sources.length > 0) return { phase: 'read', sources, answer: last.answer };
  const searches = last.route === null || last.route === 'about_ivan';
  if (isActive(last) && searches) return { phase: 'searching', sources: [], answer: '' };
  // A finished search that found nothing relevant ("no information") read no passages.
  if (last.route === 'about_ivan' && last.status === 'done')
    return { phase: 'read', sources: [], answer: last.answer };
  return { phase: 'none', sources: [], answer: last.answer };
}

export function useMapBridge(state: ChatState, restored: number): void {
  const latest = useRef<MapTurn>(REST_TURN);

  useEffect(() => {
    latest.current = mapTurnOf(state);
    emitMapEvent('knowledge-map:turn', latest.current);
  }, [state]);

  // A restored conversation appears as it was, without replaying the ignition.
  useEffect(() => {
    if (restored > 0) emitMapEvent('knowledge-map:turn', { ...latest.current, instant: true });
  }, [restored]);

  useEffect(
    () =>
      onMapEvent('knowledge-map:ready', () => {
        emitMapEvent('knowledge-map:turn', { ...latest.current, instant: true });
      }),
    [],
  );
}

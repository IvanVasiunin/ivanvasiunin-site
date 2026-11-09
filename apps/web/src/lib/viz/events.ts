// The bridge between the chat island and the knowledge map island: typed DOM `CustomEvent`s on
// `document`, no shared store (react.md → State). The chat tells the map what the latest answer
// read; either side tells the other which source is pointed at, so they light up together.

/** What the map shows for the latest turn. */
export type MapPhase =
  /** No question yet, or a "New chat". */
  | 'rest'
  /** A question was sent; no sources yet. */
  | 'searching'
  /** Sources arrived (also while the answer streams and after it ended). */
  | 'read'
  /** The reply needed no search (a greeting or a refusal), or failed before any. */
  | 'none';

export interface MapTurn {
  readonly phase: MapPhase;
  /** The read chunks, best first. */
  readonly sources: readonly { readonly id: string; readonly score: number }[];
  /** The answer so far (the Topics line matches concepts in it). */
  readonly answer: string;
  /** A restored conversation: show the final state without animation. */
  readonly instant?: boolean;
}

interface MapEvents {
  /** Chat → map: the latest turn changed. */
  'knowledge-map:turn': MapTurn;
  /** Chat → map: a source in the answer is hovered or focused (null: none). */
  'knowledge-map:point-source': { readonly id: string | null };
  /** Map → chat: a star is hovered (null: none). */
  'knowledge-map:point-star': { readonly id: string | null };
  /** Map → chat: the map hydrated (after the chat); the chat sends the turn it shows. */
  'knowledge-map:ready': Record<string, never>;
}

export type MapEventName = keyof MapEvents;

export function emitMapEvent<K extends MapEventName>(name: K, detail: MapEvents[K]): void {
  document.dispatchEvent(new CustomEvent(name, { detail }));
}

/** Subscribes; returns the unsubscribe (for an effect's cleanup). */
export function onMapEvent<K extends MapEventName>(
  name: K,
  listener: (detail: MapEvents[K]) => void,
): () => void {
  const handler = (event: Event): void => {
    if (event instanceof CustomEvent) listener(event.detail as MapEvents[K]);
  };
  document.addEventListener(name, handler);
  return () => {
    document.removeEventListener(name, handler);
  };
}

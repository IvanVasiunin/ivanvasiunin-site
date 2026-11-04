// Elio's mark: the site's chart reticle, small (ROADMAP 3.9, Ivan's choice). While Elio is working on an
// answer, the planet travels along its orbit, as it does on the header brand on hover.
import { useId } from 'react';

import './ElioMark.scss';

export interface ElioMarkProps {
  /** The planet orbits (an answer is being prepared). */
  readonly active?: boolean;
}

export function ElioMark({ active = false }: ElioMarkProps) {
  // Several marks share the page (one per answer): each needs its own gradient id.
  const gradientId = `elio-mark-${useId().replace(/:/g, '')}`;
  return (
    <span className="elio-mark" data-active={active ? '' : undefined}>
      <svg
        className="elio-mark__icon"
        width="20"
        height="20"
        viewBox="0 0 24 24"
        aria-hidden="true"
        focusable="false"
      >
        <defs>
          <linearGradient
            id={gradientId}
            gradientUnits="userSpaceOnUse"
            x1="2"
            y1="22"
            x2="22"
            y2="2"
          >
            <stop className="elio-mark__stop-start" offset="0" />
            <stop className="elio-mark__stop-end" offset="1" />
          </linearGradient>
        </defs>
        <g
          className="elio-mark__reticle"
          fill="none"
          stroke={`url(#${gradientId})`}
          strokeLinecap="round"
        >
          <circle cx="12" cy="12" r="9" strokeWidth="1.4" />
          <circle cx="12" cy="12" r="5" strokeWidth="1" opacity="0.7" />
          <path d="M12 1v2.6M12 20.4V23M1 12h2.6M20.4 12H23" strokeWidth="1.4" />
        </g>
        <g className="elio-mark__planet" fill={`url(#${gradientId})`}>
          <circle cx="15.54" cy="8.46" r="2.1" />
        </g>
      </svg>
      <span className="elio-mark__name">Elio</span>
    </span>
  );
}

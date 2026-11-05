// Elio's avatar (Ivan's pick, 2026-11-05: R1 "Chrome"): a small polished robot with a glass visor and
// two teal lights for eyes. The greeting's avatar is `live`: its eyes follow the mouse (lookAt.ts),
// it breathes and blinks, and while an answer is prepared its eyes merge into one light that sweeps
// the visor. Next to the answers it is a still picture (Ivan: no animation in the chat).
// Drawn with gradients only (no SVG filters), so dozens of them on a long chat stay cheap.
import { useEffect, useId, useRef } from 'react';

import { followPointer } from './lookAt';

import './ElioAvatar.scss';

export interface ElioAvatarProps {
  /** `lg`: the greeting; `sm`: next to an answer. */
  readonly size?: 'lg' | 'sm';
  /** Follows the mouse and moves (the greeting); otherwise a still picture. */
  readonly live?: boolean;
  /** Elio is preparing an answer: on a live avatar the thinking light sweeps the visor. */
  readonly active?: boolean;
  /**
   * Says "Elio" to screen readers (who is speaking, next to an answer). Off where a heading next to
   * the avatar already says it (the greeting).
   */
  readonly named?: boolean;
}

export function ElioAvatar({
  size = 'sm',
  live = false,
  active = false,
  named = true,
}: ElioAvatarProps) {
  // Several avatars share the page (one per answer): every gradient needs its own id.
  const id = `elio-avatar-${useId().replace(/:/g, '')}`;
  const ref = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    const svg = ref.current;
    if (!live || svg === null) return undefined;
    return followPointer(svg);
  }, [live]);

  // A live avatar scrolled out of view pauses its loops: no frames spent on what nobody sees
  // (mobile-performance.md).
  useEffect(() => {
    const svg = ref.current;
    if (!live || svg === null || typeof IntersectionObserver === 'undefined') return undefined;
    const observer = new IntersectionObserver(([entry]) => {
      svg.toggleAttribute('data-paused', entry !== undefined && !entry.isIntersecting);
    });
    observer.observe(svg);
    return () => {
      observer.disconnect();
    };
  }, [live]);

  const url = (name: string): string => `url(#${id}-${name})`;

  return (
    <span
      className="elio-avatar"
      data-size={size}
      data-live={live ? '' : undefined}
      data-active={live && active ? '' : undefined}
    >
      <svg
        ref={ref}
        className="elio-avatar__svg"
        viewBox="0 0 120 120"
        aria-hidden="true"
        focusable="false"
      >
        <defs>
          <linearGradient id={`${id}-metal`} x1="0" y1="0" x2="0" y2="1">
            <stop className="elio-avatar__metal-1" offset="0" />
            <stop className="elio-avatar__metal-2" offset="0.28" />
            <stop className="elio-avatar__metal-3" offset="0.62" />
            <stop className="elio-avatar__metal-4" offset="1" />
          </linearGradient>
          <linearGradient id={`${id}-rim`} x1="0" y1="0" x2="1" y2="0">
            <stop className="elio-avatar__accent" offset="0" stopOpacity="0.9" />
            <stop className="elio-avatar__accent" offset="0.3" stopOpacity="0" />
            <stop className="elio-avatar__accent-2" offset="0.7" stopOpacity="0" />
            <stop className="elio-avatar__accent-2" offset="1" stopOpacity="0.9" />
          </linearGradient>
          <radialGradient id={`${id}-visor`} cx="0.4" cy="0.3" r="0.9">
            <stop className="elio-avatar__visor-1" offset="0" />
            <stop className="elio-avatar__visor-2" offset="0.55" />
            <stop className="elio-avatar__visor-3" offset="1" />
          </radialGradient>
          <linearGradient id={`${id}-visor-edge`} x1="0" y1="0" x2="0" y2="1">
            <stop className="elio-avatar__accent" offset="0" stopOpacity="0.9" />
            <stop className="elio-avatar__light" offset="1" stopOpacity="0.5" />
          </linearGradient>
          <radialGradient id={`${id}-glow`}>
            <stop className="elio-avatar__light" offset="0" stopOpacity="0.85" />
            <stop className="elio-avatar__light" offset="0.45" stopOpacity="0.25" />
            <stop className="elio-avatar__light" offset="1" stopOpacity="0" />
          </radialGradient>
          <linearGradient id={`${id}-eye`} x1="0" y1="0" x2="0" y2="1">
            <stop className="elio-avatar__eye-1" offset="0" />
            <stop className="elio-avatar__eye-2" offset="0.5" />
            <stop className="elio-avatar__eye-3" offset="1" />
          </linearGradient>
          <radialGradient id={`${id}-bulb`}>
            <stop className="elio-avatar__bulb-1" offset="0" />
            <stop className="elio-avatar__bulb-2" offset="0.35" />
            <stop className="elio-avatar__bulb-3" offset="1" />
          </radialGradient>
          <radialGradient id={`${id}-bulb-glow`}>
            <stop className="elio-avatar__accent-2" offset="0" stopOpacity="0.8" />
            <stop className="elio-avatar__accent-2" offset="1" stopOpacity="0" />
          </radialGradient>
          <radialGradient id={`${id}-ear`} cx="0.4" cy="0.35" r="0.8">
            <stop className="elio-avatar__metal-1" offset="0" />
            <stop className="elio-avatar__metal-3" offset="0.6" />
            <stop className="elio-avatar__metal-4" offset="1" />
          </radialGradient>
          <linearGradient id={`${id}-sheen`} x1="0" y1="0" x2="1" y2="0">
            <stop className="elio-avatar__shine" offset="0" stopOpacity="0" />
            <stop className="elio-avatar__shine" offset="0.5" stopOpacity="0.9" />
            <stop className="elio-avatar__shine" offset="1" stopOpacity="0" />
          </linearGradient>
          <clipPath id={`${id}-visor-clip`}>
            <rect x="30" y="44" width="60" height="34" rx="17" />
          </clipPath>
        </defs>

        <g className="elio-avatar__body">
          {/* Antenna with a light that pulses (faster while thinking). */}
          <rect x="58.4" y="14" width="3.2" height="16" rx="1.6" fill={url('metal')} />
          <circle className="elio-avatar__pulse" cx="60" cy="12" r="11" fill={url('bulb-glow')} />
          <circle cx="60" cy="12" r="5" fill={url('bulb')} />

          {/* Ears with small status lights. */}
          <circle cx="17" cy="62" r="9" fill={url('ear')} />
          <circle className="elio-avatar__socket" cx="17" cy="62" r="4" />
          <circle className="elio-avatar__pulse elio-avatar__led" cx="17" cy="62" r="2.2" />
          <circle cx="103" cy="62" r="9" fill={url('ear')} />
          <circle className="elio-avatar__socket" cx="103" cy="62" r="4" />
          <circle className="elio-avatar__pulse elio-avatar__led" cx="103" cy="62" r="2.2" />

          {/* Head: polished metal, a coloured rim light and a highlight. */}
          <rect x="20" y="28" width="80" height="70" rx="30" fill={url('metal')} />
          <rect x="20" y="28" width="80" height="70" rx="30" fill={url('rim')} opacity="0.55" />
          <path className="elio-avatar__seam" d="M34 36 Q60 26 86 36" />
          <ellipse
            className="elio-avatar__highlight"
            cx="42"
            cy="38"
            rx="14"
            ry="5"
            transform="rotate(-14 42 38)"
          />

          {/* Visor. */}
          <rect x="28" y="42" width="64" height="38" rx="19" fill={url('visor-edge')} />
          <rect x="30" y="44" width="60" height="34" rx="17" fill={url('visor')} />
          <g clipPath={`url(#${id}-visor-clip)`}>
            <g className="elio-avatar__sheen-track">
              <rect
                className="elio-avatar__sheen"
                x="40"
                y="38"
                width="14"
                height="50"
                fill={url('sheen')}
              />
            </g>
            {/* Eyes: the outer group follows the mouse, the inner one blinks. */}
            <g className="elio-avatar__eyes">
              <g className="elio-avatar__look">
                <ellipse cx="48" cy="61" rx="11" ry="10" fill={url('glow')} />
                <ellipse cx="72" cy="61" rx="11" ry="10" fill={url('glow')} />
                <g className="elio-avatar__blink">
                  <rect x="44" y="55" width="8" height="12" rx="4" fill={url('eye')} />
                  <rect x="68" y="55" width="8" height="12" rx="4" fill={url('eye')} />
                </g>
              </g>
            </g>
            {/* Thinking: one light sweeping left and right. */}
            <g className="elio-avatar__scan">
              <ellipse cx="60" cy="61" rx="14" ry="8" fill={url('glow')} />
              <rect x="52" y="58" width="16" height="6" rx="3" fill={url('eye')} />
            </g>
          </g>
          <path className="elio-avatar__glare" d="M38 48 Q46 45 54 46" />
          <g className="elio-avatar__grille">
            <circle cx="54" cy="89" r="1.4" />
            <circle cx="60" cy="89" r="1.4" />
            <circle cx="66" cy="89" r="1.4" />
          </g>
        </g>
      </svg>
      {named && <span className="elio-avatar__name">Elio</span>}
    </span>
  );
}

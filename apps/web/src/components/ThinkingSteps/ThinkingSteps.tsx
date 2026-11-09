// The "thinking" indicator (SPEC US-A6 → Loading; ROADMAP 3.9, Ivan's choice "Steps"): what Elio is
// doing before the first token. Every step follows a real stream event (lib/chat/state.ts → Step), so
// the indicator never pretends: `route` ends "Understanding", `sources` ends "Searching sources".
import type { Step } from '../../lib/chat/state';

import './ThinkingSteps.scss';

export interface ThinkingStepsProps {
  readonly step: Step;
  /** Templated answers (greeting, refusals) do not search: the step is left out. */
  readonly searches: boolean;
}

const LABELS: Readonly<Record<Step, string>> = {
  understanding: 'Understanding',
  searching: 'Searching sources',
  writing: 'Writing',
};

const ORDER: readonly Step[] = ['understanding', 'searching', 'writing'];

type StepState = 'done' | 'current' | 'pending';

export function ThinkingSteps({ step, searches }: ThinkingStepsProps) {
  const steps = ORDER.filter((each) => searches || each !== 'searching');
  const current = steps.indexOf(step);
  return (
    <ol className="thinking-steps" aria-label="Elio is preparing the answer">
      {steps.map((each, index) => {
        const state: StepState =
          index < current ? 'done' : index === current ? 'current' : 'pending';
        return (
          <li
            key={each}
            className="thinking-steps__step"
            data-state={state}
            aria-current={state === 'current' ? 'step' : undefined}
          >
            {LABELS[each]}
          </li>
        );
      })}
    </ol>
  );
}

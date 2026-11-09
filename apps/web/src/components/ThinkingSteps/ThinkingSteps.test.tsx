import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ThinkingSteps } from './ThinkingSteps';

const stepStates = () =>
  screen.getAllByRole('listitem').map((item) => [item.textContent, item.dataset.state]);

describe('ThinkingSteps', () => {
  it('starts with understanding the question', () => {
    render(<ThinkingSteps step="understanding" searches />);

    expect(stepStates()).toEqual([
      ['Understanding', 'current'],
      ['Searching sources', 'pending'],
      ['Writing', 'pending'],
    ]);
    expect(screen.getByText('Understanding').getAttribute('aria-current')).toBe('step');
  });

  it('marks the steps before the current one as done', () => {
    render(<ThinkingSteps step="writing" searches />);

    expect(stepStates()).toEqual([
      ['Understanding', 'done'],
      ['Searching sources', 'done'],
      ['Writing', 'current'],
    ]);
  });

  it('leaves out the search for a templated answer', () => {
    render(<ThinkingSteps step="writing" searches={false} />);

    expect(stepStates()).toEqual([
      ['Understanding', 'done'],
      ['Writing', 'current'],
    ]);
  });

  it('is a labelled list for screen readers', () => {
    render(<ThinkingSteps step="searching" searches />);

    expect(screen.getByRole('list', { name: 'Elio is preparing the answer' }).tagName).toBe('OL');
  });
});

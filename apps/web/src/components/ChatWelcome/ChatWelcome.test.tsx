import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ChatWelcome, WELCOME_TOPICS } from './ChatWelcome';

const hrefFor = (question: string): string => `/?q=${encodeURIComponent(question)}`;

function setup() {
  const onPick = vi.fn<(question: string) => void>();
  render(<ChatWelcome onPick={onPick} hrefFor={hrefFor} />);
  const cards = within(screen.getByRole('list', { name: 'Example questions' })).getAllByRole(
    'link',
  );
  return { onPick, cards };
}

describe('ChatWelcome', () => {
  it('names the section with its heading and lists one card per topic', () => {
    const { cards } = setup();

    expect(screen.getByRole('region', { name: 'What would you like to know?' })).toBeDefined();
    expect(cards.map((card) => card.textContent)).toEqual(
      WELCOME_TOPICS.map((topic) => `${topic.title}${topic.hint}`),
    );
  });

  it('links every card to its question for visitors without JS', () => {
    const { cards } = setup();

    expect(cards.map((card) => card.getAttribute('href'))).toEqual(
      WELCOME_TOPICS.map((topic) => hrefFor(topic.question)),
    );
  });

  it('puts the card’s question into the input on a click, without following the link', async () => {
    const { onPick, cards } = setup();
    const [first] = cards;
    if (first === undefined) throw new Error('no cards');

    await userEvent.click(first);

    expect(onPick).toHaveBeenCalledExactlyOnceWith(WELCOME_TOPICS[0]?.question);
  });

  it('works from the keyboard: Tab to a card, Enter picks it', async () => {
    const { onPick, cards } = setup();

    await userEvent.tab();
    expect(document.activeElement).toBe(cards[0]);
    await userEvent.keyboard('{Enter}');

    expect(onPick).toHaveBeenCalledOnce();
  });

  it('leaves a modified click to the browser (a new tab), picking nothing', () => {
    const { onPick, cards } = setup();
    const [first] = cards;
    if (first === undefined) throw new Error('no cards');

    fireEvent.click(first, { ctrlKey: true });

    expect(onPick).not.toHaveBeenCalled();
  });

  it('hides the icons from assistive technology', () => {
    const { cards } = setup();

    for (const card of cards) {
      expect(card.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
    }
  });
});

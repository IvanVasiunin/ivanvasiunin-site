import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { COUNTER_FROM_CHARS, MAX_QUESTION_CHARS } from '../../lib/chat/state';
import { ChatComposer, type ChatComposerProps } from './ChatComposer';

function setup(overrides: Partial<ChatComposerProps> = {}) {
  const props: ChatComposerProps = {
    value: '',
    onChange: vi.fn(),
    onSend: vi.fn(),
    onStop: vi.fn(),
    busy: false,
    ready: true,
    inputRef: createRef<HTMLTextAreaElement>(),
    ...overrides,
  };
  render(<ChatComposer {...props} />);
  return { props, input: screen.getByRole('textbox', { name: 'Ask Elio about Ivan' }) };
}

describe('ChatComposer', () => {
  describe('default', () => {
    it('has a labelled input and a Send button', () => {
      const { input } = setup();

      expect(input.tagName).toBe('TEXTAREA');
      expect(input.getAttribute('maxlength')).toBe(String(MAX_QUESTION_CHARS));
      expect(screen.getByRole('button', { name: 'Send' })).toBeDefined();
    });

    it('reports typing to the chat', async () => {
      const { props, input } = setup();

      await userEvent.type(input, 'H');

      expect(props.onChange).toHaveBeenCalledWith('H');
    });
  });

  describe('empty', () => {
    it.each(['', '   \n '])(
      'marks Send unavailable for %j, keeping it focusable',
      async (value) => {
        const { props } = setup({ value });
        const send = screen.getByRole('button', { name: 'Send' });

        expect(send.getAttribute('aria-disabled')).toBe('true');
        expect(send.hasAttribute('disabled')).toBe(false);
        await userEvent.click(send);
        expect(props.onSend).not.toHaveBeenCalled();
      },
    );

    it('does not send blank text with Enter', async () => {
      const { props, input } = setup({ value: '  ' });

      await userEvent.type(input, '{Enter}');

      expect(props.onSend).not.toHaveBeenCalled();
    });
  });

  describe('keyboard', () => {
    it('sends with Enter', async () => {
      const { props, input } = setup({ value: 'What did Ivan do?' });

      await userEvent.type(input, '{Enter}');

      expect(props.onSend).toHaveBeenCalledTimes(1);
    });

    it('inserts a line break with Shift+Enter instead of sending', async () => {
      const { props, input } = setup({ value: 'Line one' });

      await userEvent.type(input, '{Shift>}{Enter}{/Shift}');

      expect(props.onSend).not.toHaveBeenCalled();
    });

    it('never sends the Enter of an IME composition', () => {
      const { props, input } = setup({ value: '日本' });

      fireEvent.keyDown(input, { key: 'Enter', isComposing: true });

      expect(props.onSend).not.toHaveBeenCalled();
    });

    it('ignores the Enter right after a composition ends (Safari)', () => {
      const { props, input } = setup({ value: '日本' });

      fireEvent.compositionEnd(input);
      fireEvent.keyDown(input, { key: 'Enter' });

      expect(props.onSend).not.toHaveBeenCalled();
    });

    it('sends with the Send button', async () => {
      const { props } = setup({ value: 'Hi' });

      await userEvent.click(screen.getByRole('button', { name: 'Send' }));

      expect(props.onSend).toHaveBeenCalledTimes(1);
    });
  });

  describe('focus', () => {
    it('gives the chat the textarea through inputRef', () => {
      const inputRef = createRef<HTMLTextAreaElement>();
      const { input } = setup({ inputRef });

      inputRef.current?.focus();

      expect(document.activeElement).toBe(input);
    });
  });

  describe('loading (an answer is streaming)', () => {
    it('turns Send into Stop and keeps the input editable', async () => {
      const { props, input } = setup({ value: 'Next question', busy: true });

      expect(screen.queryByRole('button', { name: 'Send' })).toBeNull();
      expect(input.hasAttribute('disabled')).toBe(false);

      await userEvent.click(screen.getByRole('button', { name: 'Stop' }));
      expect(props.onStop).toHaveBeenCalledTimes(1);
    });

    it('does not send with Enter while busy', async () => {
      const { props, input } = setup({ value: 'Next question', busy: true });

      await userEvent.type(input, '{Enter}');

      expect(props.onSend).not.toHaveBeenCalled();
      expect(props.onStop).not.toHaveBeenCalled();
    });
  });

  describe('disabled (before hydration)', () => {
    it('disables the input and Send until the page is ready', () => {
      const { input } = setup({ ready: false, value: 'Hi' });

      expect(input.hasAttribute('disabled')).toBe(true);
      expect(screen.getByRole('button', { name: 'Send' }).hasAttribute('disabled')).toBe(true);
    });
  });

  describe('length limit (error)', () => {
    it('hides the counter for short questions', () => {
      setup({ value: 'Hi' });

      expect(screen.queryByText(/characters$/)).toBeNull();
    });

    it('shows a counter near the limit, described by the input', () => {
      const { input } = setup({ value: 'a'.repeat(COUNTER_FROM_CHARS) });

      const counter = screen.getByText(`${String(COUNTER_FROM_CHARS)} / 500 characters`);
      expect(input.getAttribute('aria-describedby')).toBe(counter.id);
      expect(counter.dataset.state).toBeUndefined();
    });

    it('marks the counter at the limit', () => {
      setup({ value: 'a'.repeat(MAX_QUESTION_CHARS) });

      expect(screen.getByText('500 / 500 characters').dataset.state).toBe('limit');
    });
  });
});

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { expect, test } from 'vitest';

// Smoke test: proves that Vitest, jsdom, React, Testing Library and user-event work together.
function Counter() {
  const [count, setCount] = useState(0);
  return (
    <button
      type="button"
      onClick={() => {
        setCount(count + 1);
      }}
    >
      Clicked {count}
    </button>
  );
}

test('renders a React component and handles a user click', async () => {
  const user = userEvent.setup();
  render(<Counter />);

  const button = screen.getByRole('button', { name: 'Clicked 0' });
  await user.click(button);

  expect(button.textContent).toBe('Clicked 1');
});

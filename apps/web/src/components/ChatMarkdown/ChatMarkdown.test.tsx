import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { UNSAFE_ANSWER } from '../../lib/chat/mock/scenarios';
import { ChatMarkdown, isExternalUrl } from './ChatMarkdown';

const renderMarkdown = (text: string) => render(<ChatMarkdown text={text} />).container;

describe('ChatMarkdown', () => {
  it('renders Markdown as elements', () => {
    const container = renderMarkdown('Ivan **knows** SCSS.\n\n- BEM\n- Tokens');

    expect(container.querySelector('strong')?.textContent).toBe('knows');
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });

  describe('with an XSS payload', () => {
    it('renders no raw HTML, scripts or images', () => {
      const container = renderMarkdown(UNSAFE_ANSWER);

      expect(container.querySelector('script')).toBeNull();
      expect(container.querySelector('img')).toBeNull();
      expect(container.querySelector('[onerror]')).toBeNull();
      expect(container.innerHTML).not.toContain('onerror');
    });

    it('drops javascript: links', () => {
      const container = renderMarkdown(UNSAFE_ANSWER);

      const hrefs = [...container.querySelectorAll('a')].map((link) => link.getAttribute('href'));
      expect(hrefs.some((href) => href?.toLowerCase().includes('javascript'))).toBe(false);
      expect(screen.getByText('Click me').closest('a')).toBeNull();
    });

    it('drops Markdown images too', () => {
      const container = renderMarkdown('![tracker](https://example.com/pixel.png)');

      expect(container.querySelector('img')).toBeNull();
    });
  });

  it('keeps site links in the tab', () => {
    renderMarkdown('See the [CV](/cv#job-brainrocket).');

    const link = screen.getByRole('link', { name: 'CV' });
    expect(link.getAttribute('href')).toBe('/cv#job-brainrocket');
    expect(link.getAttribute('target')).toBeNull();
  });

  it('opens external links in a new tab without an opener', () => {
    renderMarkdown('Code on [GitHub](https://github.com).');

    // jsdom's name computation trims the hidden note's leading space; browsers keep it.
    const link = screen.getByRole('link', { name: /^GitHub ?\(opens in a new tab\)$/ });
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
  });

  it('renders a malformed link without crashing', () => {
    renderMarkdown('A [broken](//) link and [another](//x%20y).');

    expect(screen.getByText('broken')).toBeDefined();
  });

  it('turns model headings into paragraphs, so the page outline stays intact', () => {
    renderMarkdown('# Summary\n\nText');

    expect(screen.queryByRole('heading')).toBeNull();
    expect(screen.getByText('Summary').tagName).toBe('P');
  });
});

describe('isExternalUrl', () => {
  it.each([
    ['/cv', false],
    ['#skills', false],
    ['https://ivanvasiunin.com/cv', false],
    ['https://github.com/ivan', true],
    ['//evil.example/path', true],
    ['mailto:ivan@example.com', false],
    // Malformed protocol-relative URLs: never throw.
    ['//', false],
    ['//x y', false],
    ['//[', false],
  ])('%s → %s', (href, external) => {
    expect(isExternalUrl(href, 'https://ivanvasiunin.com')).toBe(external);
  });
});

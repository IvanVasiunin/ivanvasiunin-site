// An answer's Markdown, rendered safely (react.md → Safety; ADR-0001: react-markdown + rehype-sanitize).
//
// The model's text is untrusted. react-markdown builds React elements (no innerHTML) and ignores raw
// HTML unless `rehype-raw` is added, which it never is. rehype-sanitize (GitHub's schema) then strips
// anything left that could run code or style the page, and react-markdown's default URL transform
// drops `javascript:` and other unsafe link protocols. Site links stay in the tab; external ones open
// a new tab with `rel="noopener noreferrer"`.
import Markdown, { type Components } from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';

import './ChatMarkdown.scss';

export interface ChatMarkdownProps {
  readonly text: string;
  /** Tokens are still arriving: a caret blinks after the last word. */
  readonly streaming?: boolean;
}

/**
 * Whether a link leaves the site: an http(s) URL, absolute or protocol-relative, on another origin.
 * Never throws: a malformed URL from the model must not crash the answer (it counts as local).
 */
export function isExternalUrl(href: string, origin = window.location.origin): boolean {
  try {
    const url = new URL(href.startsWith('//') ? `https:${href}` : href);
    return (url.protocol === 'https:' || url.protocol === 'http:') && url.origin !== origin;
  } catch {
    return false;
  }
}

const COMPONENTS: Components = {
  a: ({ href, children }) => {
    if (href === undefined || href === '') return <span>{children}</span>;
    return isExternalUrl(href) ? (
      <a href={href} target="_blank" rel="noopener noreferrer">
        {children}
        <span className="chat-markdown__note">{' (opens in a new tab)'}</span>
      </a>
    ) : (
      <a href={href}>{children}</a>
    );
  },
  // Answers sit under the turn's own heading (the question): a model heading would break the outline.
  h1: ({ children }) => <p className="chat-markdown__heading">{children}</p>,
  h2: ({ children }) => <p className="chat-markdown__heading">{children}</p>,
  h3: ({ children }) => <p className="chat-markdown__heading">{children}</p>,
  h4: ({ children }) => <p className="chat-markdown__heading">{children}</p>,
  h5: ({ children }) => <p className="chat-markdown__heading">{children}</p>,
  h6: ({ children }) => <p className="chat-markdown__heading">{children}</p>,
  // Images in an answer could load anything from anywhere (and track the reader): dropped.
  img: () => null,
};

const REHYPE_PLUGINS = [rehypeSanitize];

export function ChatMarkdown({ text, streaming = false }: ChatMarkdownProps) {
  return (
    <div className={streaming ? 'chat-markdown chat-markdown--streaming' : 'chat-markdown'}>
      <Markdown rehypePlugins={REHYPE_PLUGINS} components={COMPONENTS}>
        {text}
      </Markdown>
    </div>
  );
}

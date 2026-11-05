// The empty chat panel before the first question (SPEC US-A5; Ivan, 2026-11-05, variant 1 "topic
// cards"): four topics Elio can talk about, each a card that puts an example question into the
// input. It fills the panel's free space with what to ask instead of an empty area.
import './ChatWelcome.scss';

export interface WelcomeTopic {
  readonly title: string;
  readonly hint: string;
  /** What a click puts into the input. */
  readonly question: string;
  /** A line icon on a 24-unit grid. */
  readonly icon: string;
}

export const WELCOME_TOPICS: readonly WelcomeTopic[] = [
  {
    title: 'Experience',
    hint: 'Where Ivan worked and what he did there',
    question: 'Where has Ivan worked, and what did he do there?',
    // A briefcase.
    icon: 'M4 8h16v11H4zM9 8V5h6v3M4 13h16',
  },
  {
    title: 'Skills & stack',
    hint: 'Languages, frameworks and tools he uses',
    question: 'Which technologies does Ivan use?',
    // Code brackets.
    icon: 'M8 7l-5 5 5 5M16 7l5 5-5 5M14 4l-4 16',
  },
  {
    title: 'Projects',
    hint: 'What he has built, at work and on his own',
    question: 'What projects has Ivan built?',
    // A rocket.
    icon: 'M12 3c3 2 5 6 4 11l-4 3-4-3c-1-5 1-9 4-11zM8 14l-3 3 3 1M16 14l3 3-3 1M12 9v2',
  },
  {
    title: 'This site',
    hint: 'How Elio finds sources and writes answers',
    question: 'How is this site’s RAG built?',
    // Three linked nodes: sources joined into one answer.
    icon: 'M6 6h.01M18 6h.01M12 18h.01M6 6l6 12 6-12M6 6h12',
  },
];

export interface ChatWelcomeProps {
  /** Puts a question into the input and focuses it; never sends (SPEC US-A5). */
  readonly onPick: (question: string) => void;
  /** The link of a question without JS: the page with the question prefilled (`/?q=`). */
  readonly hrefFor: (question: string) => string;
}

/** A plain left click; a modified or middle click keeps the link's own behaviour (a new tab). */
function isPlainClick(event: React.MouseEvent): boolean {
  return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
}

export function ChatWelcome({ onPick, hrefFor }: ChatWelcomeProps) {
  return (
    <section className="chat-welcome" aria-labelledby="chat-welcome-heading">
      <h2 className="chat-welcome__heading" id="chat-welcome-heading">
        What would you like to know?
      </h2>
      <ul className="chat-welcome__cards" aria-label="Example questions">
        {WELCOME_TOPICS.map((topic) => (
          <li key={topic.title}>
            <a
              className="chat-welcome__card"
              href={hrefFor(topic.question)}
              onClick={(event) => {
                if (!isPlainClick(event)) return;
                event.preventDefault();
                onPick(topic.question);
              }}
            >
              <svg
                className="chat-welcome__icon"
                viewBox="0 0 24 24"
                aria-hidden="true"
                focusable="false"
              >
                <path d={topic.icon} />
              </svg>
              <span className="chat-welcome__card-title">{topic.title}</span>
              <span className="chat-welcome__card-hint">{topic.hint}</span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}

// The chat island's error boundary (react.md → Safety): a crash inside the chat shows a short notice
// with a way to the CV, and leaves the rest of the page (and the map island) working.
import { Component, type ReactNode } from 'react';

export interface ChatErrorBoundaryProps {
  readonly children: ReactNode;
  readonly fallback: ReactNode;
}

interface ChatErrorBoundaryState {
  readonly failed: boolean;
}

// React has no hook API for error boundaries: the one class component the project allows (react.md).
// eslint-disable-next-line no-restricted-syntax -- error boundaries can only be class components
export class ChatErrorBoundary extends Component<ChatErrorBoundaryProps, ChatErrorBoundaryState> {
  override state: ChatErrorBoundaryState = { failed: false };

  static getDerivedStateFromError(): ChatErrorBoundaryState {
    return { failed: true };
  }

  override render(): ReactNode {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

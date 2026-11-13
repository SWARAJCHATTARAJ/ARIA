import React from 'react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
  /** Optional label shown in the fallback header (e.g. "Workspace"). */
  surface?: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

/**
 * Crash-proof guard: any render-time exception anywhere in the tree renders a
 * recovery card instead of unmounting React into a blank #09090B frame.
 * The app can always be recovered without a hard browser refresh losing context.
 */
export default class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return {
      hasError: true,
      message: error instanceof Error ? error.message : 'Unknown render error',
    };
  }

  componentDidCatch(error: unknown): void {
    // Surface in the console for diagnostics; the UI stays interactive.
    console.error('[ARIA] Render error caught by boundary:', error);
  }

  private handleReload = () => {
    this.setState({ hasError: false, message: '' });
    window.location.reload();
  };

  private handleReset = () => {
    this.setState({ hasError: false, message: '' });
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="fixed inset-0 bg-[#09090B] text-[#F4F4F6] flex items-center justify-center p-4 select-none">
        <div className="w-full max-w-md p-8 bg-[#111115] border border-white/[0.09] animate-view-enter">
          <div className="flex items-center gap-2.5 pb-4 mb-4 border-b border-white/[0.07]">
            <span className="w-2 h-2 rounded-full bg-[#C95A5A] shrink-0" />
            <span className="font-mono text-[11px] tracking-[0.2em] text-[#A1A1AA] uppercase">
              {this.props.surface ? `${this.props.surface} error` : 'Unexpected error'}
            </span>
          </div>

          <h1 className="text-xl font-semibold tracking-tight mb-2">
            Something broke while rendering.
          </h1>
          <p className="text-sm text-[#A1A1AA] leading-relaxed mb-2">
            The view crashed but your session and research history are safe. Reload to restore the
            workspace.
          </p>
          <p className="font-mono text-[10px] text-[#52525B] break-all mb-6">
            {this.state.message}
          </p>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={this.handleReload}
              className="ui-btn flex-1 py-2.5 bg-[#F4F4F6] hover:bg-white text-[#09090B] text-sm font-medium"
            >
              Reload workspace
            </button>
            <button
              type="button"
              onClick={this.handleReset}
              className="ui-btn px-4 py-2.5 bg-[#16161C] hover:bg-[#1C1C24] border border-white/[0.09] hover:border-white/[0.16] text-[#A1A1AA] hover:text-[#F4F4F6] text-sm font-medium"
            >
              Try again
            </button>
          </div>
        </div>
      </div>
    );
  }
}

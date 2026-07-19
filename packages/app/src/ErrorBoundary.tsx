// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck  — React error boundary class components have quirky static-override typing
import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center gap-4 p-8">
          <div className="bg-red-50 border border-red-200 rounded-xl p-6 max-w-2xl w-full">
            <h2 className="text-red-700 font-bold text-lg mb-2">Render Error</h2>
            <p className="text-red-600 font-mono text-sm mb-3">{this.state.error.message}</p>
            <pre className="text-red-500 text-xs bg-red-100 rounded p-3 overflow-auto max-h-64">
              {this.state.error.stack}
            </pre>
          </div>
          <button
            onClick={() => { this.setState({ error: null }); window.history.back(); }}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700"
          >
            ← Go back
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

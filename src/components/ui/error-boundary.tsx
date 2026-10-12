'use client';

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home, Download } from 'lucide-react';
import { auditService } from '@/lib/services/audit-service';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error,
      errorInfo: null,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    this.setState({ errorInfo });
    console.error('ErrorBoundary caught an error:', error, errorInfo);

    try {
      auditService.log(
        'REACT_RENDER_CRASH',
        `Error: ${error.message} | Component: ${errorInfo.componentStack?.slice(0, 300) || 'unknown'}`,
        'system'
      );
    } catch {}
  }

  handleReload = (): void => {
    window.location.reload();
  };

  handleReset = (): void => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    window.location.href = '/';
  };

  handleDownloadReport = (): void => {
    const report = {
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent,
      errorMessage: this.state.error?.message,
      errorStack: this.state.error?.stack,
      componentStack: this.state.errorInfo?.componentStack,
    };

    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pos-crash-report-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center p-6 font-sans">
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-3xl p-8 max-w-lg w-full shadow-2xl text-center">
            <div className="w-16 h-16 bg-red-100 dark:bg-rose-950/60 text-red-600 dark:text-rose-400 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-sm">
              <AlertTriangle className="w-8 h-8" />
            </div>

            <h2 className="text-2xl font-black text-gray-900 dark:text-white tracking-tight mb-2">
              Something went wrong
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 font-medium mb-6">
              The application encountered an unexpected issue. Your store data remains safe and stored locally.
            </p>

            {this.state.error && (
              <div className="bg-gray-50 dark:bg-gray-800/80 p-3.5 rounded-xl text-left mb-6 overflow-x-auto text-xs font-mono text-red-600 dark:text-rose-400 border border-gray-100 dark:border-gray-700 max-h-32">
                {this.state.error.message}
              </div>
            )}

            <div className="flex flex-col sm:flex-row items-center gap-3">
              <button
                type="button"
                onClick={this.handleReload}
                className="w-full sm:flex-1 py-3 px-4 bg-orange-600 hover:bg-orange-700 text-white font-bold rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer shadow-sm text-sm"
              >
                <RefreshCw className="w-4 h-4" />
                Reload App
              </button>
              <button
                type="button"
                onClick={this.handleReset}
                className="w-full sm:flex-1 py-3 px-4 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-800 dark:text-gray-200 font-bold rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer text-sm"
              >
                <Home className="w-4 h-4" />
                Dashboard
              </button>
            </div>

            <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-800">
              <button
                type="button"
                onClick={this.handleDownloadReport}
                className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 font-medium flex items-center justify-center gap-1.5 mx-auto transition-colors cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                Download Diagnostic Report
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

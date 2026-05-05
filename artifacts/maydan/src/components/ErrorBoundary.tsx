import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ErrorBoundary]", error, info);
  }

  reset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div
        dir="rtl"
        className="min-h-screen flex flex-col items-center justify-center gap-4 p-6 text-center"
        style={{ background: "hsl(220 20% 8%)" }}
      >
        <div className="text-6xl">⚠️</div>
        <h1 className="text-xl font-black text-foreground">حدث خطأ غير متوقع</h1>
        <p className="text-sm text-muted-foreground max-w-sm">
          نعتذر، حدث خطأ في التطبيق. حاول تحديث الصفحة أو ارجع للرئيسية.
        </p>
        {this.state.error && (
          <p className="text-[11px] text-muted-foreground/70 max-w-xs break-words font-mono">
            {this.state.error.message}
          </p>
        )}
        <div className="flex gap-2 mt-2">
          <button
            onClick={() => window.location.reload()}
            className="px-5 py-2.5 rounded-xl font-bold text-background"
            style={{ background: "linear-gradient(135deg,#d97706,#f59e0b)" }}
          >
            🔄 تحديث
          </button>
          <button
            onClick={() => {
              this.reset();
              window.location.href = "/";
            }}
            className="px-5 py-2.5 rounded-xl font-bold text-foreground border border-border"
          >
            🏠 الرئيسية
          </button>
        </div>
      </div>
    );
  }
}

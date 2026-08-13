import type { ReactNode } from 'react';

export function AppContainer({ children, defaultTheme }: { children: ReactNode; defaultTheme?: string }) {
  return <div data-theme={defaultTheme || "light"}>{children}</div>;
}

export function ErrorRender({ error, resetErrorBoundary }: { error: Error; resetErrorBoundary: () => void }) {
  return (
    <div style={{ padding: 24, fontFamily: "system-ui" }}>
      <h1>应用出现错误</h1>
      <pre style={{ whiteSpace: "pre-wrap" }}>{error?.message || String(error)}</pre>
      <button onClick={resetErrorBoundary} type="button">重试</button>
    </div>
  );
}

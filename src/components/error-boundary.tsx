import React from 'react';

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean }> {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(error: unknown) { console.error(error); }
  render() { return this.state.hasError ? <div style={{ padding: 24, fontFamily: 'sans-serif' }}>حدث خطأ غير متوقع. أعد تحميل الصفحة.</div> : this.props.children; }
}

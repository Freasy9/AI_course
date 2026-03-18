import { Component } from 'react'

export default class ErrorBoundary extends Component {
  state = { hasError: false, error: null }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, info) {
    console.error('ErrorBoundary:', error, info)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-6 tech-border rounded-lg bg-[var(--lab-panel)] border-red-400/50">
          <p className="text-red-400 font-bold mb-2">此模块发生错误</p>
          <p className="text-gray-400 text-sm font-mono break-all">
            {this.state.error?.message ?? String(this.state.error)}
          </p>
          <button
            type="button"
            onClick={() => this.setState({ hasError: false, error: null })}
            className="mt-4 rounded-lg border border-[var(--lab-cyan)] text-[var(--lab-cyan)] px-4 py-2 text-sm"
          >
            重试
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

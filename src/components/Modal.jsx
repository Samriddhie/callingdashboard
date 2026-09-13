import React, { useEffect } from 'react'

/**
 * `dismissible={false}` removes every ordinary way out — Esc, backdrop click and
 * the close button all stop working. Used by the call popup, which must stay open
 * until the agent records an outcome. The popup always offers its own explicit
 * exits, so nobody is trapped.
 */
export default function Modal({
  title,
  subtitle,
  onClose,
  children,
  footer,
  width = 'max-w-lg',
  dismissible = true,
  headerRight,
}) {
  useEffect(() => {
    if (!dismissible) return undefined
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose, dismissible])

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-gray-900/40 p-4 py-10"
      onMouseDown={(e) => {
        if (dismissible && e.target === e.currentTarget) onClose()
      }}
    >
      <div className={`w-full ${width} rounded-xl border border-gray-200 bg-white shadow-xl`}>
        <div className="flex items-start justify-between gap-4 border-b border-gray-200 px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-gray-900">{title}</h2>
            {subtitle && <p className="mt-0.5 text-sm text-gray-500">{subtitle}</p>}
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {headerRight}
            {dismissible && (
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="rounded-lg p-1 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600"
              >
                <i className="ti ti-x text-lg" />
              </button>
            )}
          </div>
        </div>

        <div className="px-5 py-4">{children}</div>

        {footer && (
          <div className="flex flex-wrap justify-end gap-2 border-t border-gray-200 px-5 py-4">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}

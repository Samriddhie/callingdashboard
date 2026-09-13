import React, { useEffect, useRef, useState } from 'react'
import { useAuth } from '../auth/AuthContext.jsx'
import { initials } from '../data/format.js'

// Unset until you create an OAuth client in Google Cloud Console and put it
// in .env.local — see README. Until then the button below stays disabled
// rather than the app crashing on a missing config value.
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || ''

export default function LoginScreen() {
  const { users, signIn, signInAsNew, signInWithGoogle } = useAuth()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [adding, setAdding] = useState(!users.length)
  const [error, setError] = useState('')
  const [googleError, setGoogleError] = useState('')
  const [googleReady, setGoogleReady] = useState(false)
  const googleBtnRef = useRef(null)

  // Loads once the GIS script (added in index.html) is ready, then renders
  // Google's own button into googleBtnRef — we don't draw it ourselves.
  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) return undefined
    let cancelled = false

    const init = () => {
      if (cancelled || !window.google?.accounts?.id || !googleBtnRef.current) return

      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: async (response) => {
          setGoogleError('')
          try {
            await signInWithGoogle(response.credential)
          } catch (err) {
            setGoogleError(err.message || 'Google sign-in failed.')
          }
        },
      })
      window.google.accounts.id.renderButton(googleBtnRef.current, {
        theme: 'outline',
        size: 'large',
        width: 320,
        text: 'continue_with',
      })
      setGoogleReady(true)
    }

    if (window.google?.accounts?.id) {
      init()
      return undefined
    }

    const script = document.getElementById('google-identity-script')
    script?.addEventListener('load', init)
    return () => {
      cancelled = true
      script?.removeEventListener('load', init)
    }
  }, [signInWithGoogle])

  const submit = (e) => {
    e.preventDefault()
    if (!name.trim()) {
      setError('Enter your name so calls can be attributed to you.')
      return
    }
    signInAsNew({ name, email })
  }

  return (
    <div className="flex min-h-full items-center justify-center bg-canvas px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-blue-600 text-white">
            <i className="ti ti-phone text-xl" />
          </span>
          <h1 className="text-lg font-semibold text-gray-900">CallDesk</h1>
          <p className="text-sm text-gray-500">TrueHunt Cat Foods</p>
        </div>

        <div className="card p-5">
          {GOOGLE_CLIENT_ID ? (
            <>
              <div ref={googleBtnRef} className="mb-1 flex justify-center" />
              {!googleReady && (
                <p className="mb-1 text-center text-[11px] text-gray-400">
                  Loading Google Sign-In…
                </p>
              )}
              {googleError && (
                <p className="mb-1 text-center text-xs font-medium text-red-600">{googleError}</p>
              )}
              <p className="mb-4 text-center text-[11px] leading-relaxed text-gray-500">
                Sign-in is verified by the backend and restricted to company accounts.
              </p>
            </>
          ) : (
            <>
              <button
                type="button"
                disabled
                title="Set VITE_GOOGLE_CLIENT_ID (frontend) and GOOGLE_CLIENT_ID (backend) — see README"
                className="btn mb-1 w-full cursor-not-allowed opacity-60"
              >
                <i className="ti ti-brand-google" />
                Continue with Google
              </button>
              <p className="mb-4 text-center text-[11px] leading-relaxed text-gray-500">
                Not configured yet — add VITE_GOOGLE_CLIENT_ID to .env.local to turn this on.
                Pick your name below for now; every call you make is stamped with it.
              </p>
            </>
          )}

          <div className="mb-4 flex items-center gap-3">
            <span className="h-px flex-1 bg-gray-200" />
            <span className="text-[11px] uppercase tracking-wide text-gray-400">or</span>
            <span className="h-px flex-1 bg-gray-200" />
          </div>

          {!adding && (
            <>
              <ul className="space-y-2">
                {users.map((u) => (
                  <li key={u.id}>
                    <button
                      type="button"
                      onClick={() => signIn(u.id)}
                      className="flex w-full items-center gap-3 rounded-lg border border-gray-200 px-3 py-2.5 text-left transition hover:border-blue-300 hover:bg-blue-50/40"
                    >
                      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-50 text-xs font-semibold text-blue-700">
                        {initials(u.name)}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-gray-900">
                          {u.name}
                        </span>
                        {u.email && (
                          <span className="block truncate text-xs text-gray-500">{u.email}</span>
                        )}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              <button
                type="button"
                className="btn mt-3 w-full"
                onClick={() => setAdding(true)}
              >
                <i className="ti ti-user-plus" />
                Add someone else
              </button>
            </>
          )}

          {adding && (
            <form onSubmit={submit} className="space-y-3">
              <div>
                <label className="label" htmlFor="login-name">
                  Your name
                </label>
                <input
                  id="login-name"
                  className="input"
                  placeholder="Samriddhi"
                  value={name}
                  autoFocus
                  onChange={(e) => {
                    setName(e.target.value)
                    setError('')
                  }}
                />
              </div>
              <div>
                <label className="label" htmlFor="login-email">
                  Email <span className="font-normal text-gray-400">(optional)</span>
                </label>
                <input
                  id="login-email"
                  type="email"
                  className="input"
                  placeholder="samriddhi@truehunt.store"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              {error && <p className="text-xs font-medium text-red-600">{error}</p>}
              <button type="submit" className="btn btn-primary w-full">
                Continue
              </button>
              {users.length > 0 && (
                <button type="button" className="btn w-full" onClick={() => setAdding(false)}>
                  Back to the list
                </button>
              )}
            </form>
          )}
        </div>

        <p className="mt-4 text-center text-[11px] leading-relaxed text-gray-400">
          Data is stored only in this browser. It is not shared with other machines,
          and this sign-in does not secure it.
        </p>
      </div>
    </div>
  )
}

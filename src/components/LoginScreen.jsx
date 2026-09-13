import React, { useEffect, useRef, useState } from 'react'
import { useAuth } from '../auth/AuthContext.jsx'
import { fetchConfig } from '../data/api.js'
import { initials } from '../data/format.js'

// The client ID normally comes from the backend (/api/health), so one setting
// configures both halves. A build-time VITE_GOOGLE_CLIENT_ID still wins if set.
const BUILD_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || ''

export default function LoginScreen() {
  const [config, setConfig] = useState(null)

  // The server decides how sign-in works here — Google, the development
  // sign-in, or neither — so ask it before drawing anything.
  useEffect(() => {
    let cancelled = false
    fetchConfig().then((next) => {
      if (!cancelled) setConfig(next)
    })
    return () => {
      cancelled = true
    }
  }, [])

  let body
  if (!config) body = <Notice>Connecting to the server…</Notice>
  else if (!config.ok) body = <ServerUnreachable />
  else if (config.authMode === 'google') {
    body = (
      <GoogleSignIn
        clientId={BUILD_CLIENT_ID || config.googleClientId}
        domain={config.allowedEmailDomain}
      />
    )
  } else if (config.authMode === 'dev') body = <DevSignIn />
  else body = <NotConfigured missing={config.setupNeeded} />

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

        <div className="card p-5">{body}</div>

        <p className="mt-4 text-center text-[11px] leading-relaxed text-gray-400">
          Customer records come from the server and need you signed in. Call notes and cat
          details are still stored only in this browser.
        </p>
      </div>
    </div>
  )
}

function Notice({ children, tone }) {
  return (
    <p
      className={`text-center text-xs leading-relaxed ${
        tone === 'error' ? 'font-medium text-red-600' : 'text-gray-500'
      }`}
    >
      {children}
    </p>
  )
}

function ServerUnreachable() {
  return (
    <div className="space-y-3">
      <Notice tone="error">Can’t reach the CallDesk server.</Notice>
      <p className="text-center text-[11px] leading-relaxed text-gray-500">
        Running it locally? Start the backend in <code>server/</code> with{' '}
        <code>node --env-file=.env index.js</code>, then try again.
      </p>
      <button type="button" className="btn w-full" onClick={() => window.location.reload()}>
        <i className="ti ti-refresh" />
        Try again
      </button>
    </div>
  )
}

function NotConfigured({ missing = [] }) {
  return (
    <div className="space-y-2">
      <Notice tone="error">Sign-in isn’t set up on this server.</Notice>
      {missing.length ? (
        <ul className="list-disc space-y-1 pl-5 text-[11px] leading-relaxed text-gray-600">
          {missing.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : (
        <p className="text-center text-[11px] leading-relaxed text-gray-500">
          Set <code>GOOGLE_CLIENT_ID</code> and <code>ALLOWED_EMAIL_DOMAIN</code> on the server —
          see the README.
        </p>
      )}
    </div>
  )
}

function GoogleSignIn({ clientId, domain }) {
  const { signInWithGoogle } = useAuth()
  const [error, setError] = useState('')
  const [ready, setReady] = useState(false)
  const buttonRef = useRef(null)

  // Renders Google's own button once its script (index.html) has loaded —
  // we don't draw it ourselves.
  useEffect(() => {
    if (!clientId) return undefined
    let cancelled = false

    const init = () => {
      if (cancelled || !window.google?.accounts?.id || !buttonRef.current) return
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: async (response) => {
          setError('')
          try {
            await signInWithGoogle(response.credential)
          } catch (err) {
            setError(err.message || 'Google sign-in failed.')
          }
        },
      })
      window.google.accounts.id.renderButton(buttonRef.current, {
        theme: 'outline',
        size: 'large',
        width: 320,
        text: 'continue_with',
      })
      setReady(true)
    }

    if (window.google?.accounts?.id) {
      init()
      return () => {
        cancelled = true
      }
    }

    const script = document.getElementById('google-identity-script')
    script?.addEventListener('load', init)
    return () => {
      cancelled = true
      script?.removeEventListener('load', init)
    }
  }, [clientId, signInWithGoogle])

  return (
    <>
      <div ref={buttonRef} className="mb-1 flex justify-center" />
      {!ready && (
        <p className="mb-1 text-center text-[11px] text-gray-400">Loading Google Sign-In…</p>
      )}
      {error && <p className="mb-1 text-center text-xs font-medium text-red-600">{error}</p>}
      <p className="text-center text-[11px] leading-relaxed text-gray-500">
        {domain ? `Only @${domain} accounts can sign in.` : 'Sign-in is verified by the server.'}
      </p>
    </>
  )
}

function DevSignIn() {
  const { users, signInDev } = useAuth()
  const [adding, setAdding] = useState(!users.length)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const signInAs = async (person) => {
    if (!person.name?.trim()) {
      setError('Enter your name so calls can be attributed to you.')
      return
    }
    setBusy(true)
    setError('')
    try {
      await signInDev({ name: person.name, email: person.email || '' })
    } catch (err) {
      setError(err.message || 'Sign-in failed.')
      setBusy(false)
    }
  }

  return (
    <>
      <p className="mb-4 rounded-md bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-800">
        Development sign-in. This server was started with <code>AUTH_DEV_BYPASS=true</code>; a
        deployed server ignores it and requires Google.
      </p>

      {!adding && (
        <>
          <ul className="space-y-2">
            {users.map((u) => (
              <li key={u.id}>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => signInAs(u)}
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
          <button type="button" className="btn mt-3 w-full" onClick={() => setAdding(true)}>
            <i className="ti ti-user-plus" />
            Add someone else
          </button>
        </>
      )}

      {adding && (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            signInAs({ name, email })
          }}
          className="space-y-3"
        >
          <div>
            <label className="label" htmlFor="login-name">
              Your name
            </label>
            <input
              id="login-name"
              className="input"
              placeholder="Your name"
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
              placeholder="name@truehunt.store"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <button type="submit" className="btn btn-primary w-full" disabled={busy}>
            Continue
          </button>
          {users.length > 0 && (
            <button type="button" className="btn w-full" onClick={() => setAdding(false)}>
              Back to the list
            </button>
          )}
        </form>
      )}

      {error && <p className="mt-3 text-center text-xs font-medium text-red-600">{error}</p>}
    </>
  )
}

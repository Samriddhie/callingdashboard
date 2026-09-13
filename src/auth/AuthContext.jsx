import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useData } from '../data/DataContext.jsx'
import { UNAUTHORIZED_EVENT, apiFetch } from '../data/api.js'

/**
 * Identity layer. Every call records `initiatedBy`, so the attribution question
 * ("who actually made this call?") is answered by data, not by memory.
 *
 * The session is owned by the backend. Signing in — with Google, or the local
 * development sign-in — makes the server set an HttpOnly cookie that page code
 * cannot read or forge, and every /api request carries it. Nothing about the
 * session is kept in localStorage: on load we ask the server who is signed in
 * (`GET /api/auth/me`) instead of trusting anything the browser remembers.
 *
 * A local `users[]` record still exists per person, because calls and notes
 * are stamped with a user id. It is matched to the signed-in person by email,
 * or by name when the development sign-in was used without one.
 */

const AuthContext = createContext(null)

async function postJson(path, body) {
  const res = await apiFetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body || {}),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`)
  return data
}

function sameIdentity(user, person) {
  const email = (person.email || '').toLowerCase()
  if (email) return (user.email || '').toLowerCase() === email
  return !user.email && user.name === person.name
}

export function AuthProvider({ children }) {
  const { users, addUser } = useData()
  // Who the server says is signed in — { name, email } — or null.
  const [person, setPerson] = useState(null)
  const [checked, setChecked] = useState(false)

  // Once, on load: does this browser already hold a valid session?
  useEffect(() => {
    let cancelled = false
    apiFetch('/api/auth/me')
      .then((res) => (res.ok ? res.json() : null))
      .catch(() => null)
      .then((me) => {
        if (cancelled) return
        setPerson(me)
        setChecked(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  // A 401 from any request means the session ended underneath us.
  useEffect(() => {
    const onUnauthorized = () => setPerson(null)
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized)
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized)
  }, [])

  const user = useMemo(
    () => (person ? users.find((u) => sameIdentity(u, person)) || null : null),
    [person, users]
  )

  // First sign-in on this browser: create the local record calls are stamped
  // with. The ref stops StrictMode's double effect run from creating two.
  const created = useRef(new Set())
  useEffect(() => {
    if (!person || user) return
    const key = `${person.email || ''}|${person.name || ''}`.toLowerCase()
    if (created.current.has(key)) return
    created.current.add(key)
    addUser({ name: person.name, email: person.email })
  }, [person, user, addUser])

  const signInWithGoogle = useCallback(async (credential) => {
    const me = await postJson('/api/auth/google', { credential })
    setPerson({ name: me.name, email: me.email })
    return me
  }, [])

  const signInDev = useCallback(async ({ name, email }) => {
    const me = await postJson('/api/auth/dev', { name, email })
    setPerson(me)
    return me
  }, [])

  const signOut = useCallback(async () => {
    // Clear locally even if the server can't be reached; the cookie expires anyway.
    await apiFetch('/api/auth/logout', { method: 'POST' }).catch(() => {})
    setPerson(null)
  }, [])

  // "checking" covers the first round-trip and the one render between a
  // sign-in and its local user record existing, so nobody already signed in
  // sees the sign-in screen flash past.
  const status = !checked || (person && !user) ? 'checking' : user ? 'signedIn' : 'signedOut'

  const value = useMemo(
    () => ({ user, users, status, signInWithGoogle, signInDev, signOut }),
    [user, users, status, signInWithGoogle, signInDev, signOut]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside an <AuthProvider>')
  return ctx
}

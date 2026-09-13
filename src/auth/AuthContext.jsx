import React, { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { loadSession, saveSession } from '../data/storage.js'
import { useData } from '../data/DataContext.jsx'
import { API_BASE } from '../data/api.js'

/**
 * Identity layer. Every call records `initiatedBy`, so the attribution question
 * ("who actually made this call?") is answered by data, not by memory.
 *
 * Google Sign-In: LoginScreen gets an ID token straight from Google, then
 * `signInWithGoogle()` sends it to the backend (`POST /api/auth/google`),
 * which checks Google's signature on it and the @domain allow-list before
 * this app trusts it. A token the browser hands us is a claim, not proof —
 * that verification step is why this can't just be client-side.
 *
 * Honest limitation: the data itself still lives in this browser's
 * localStorage. Google Sign-In proves *who* is at the keyboard; it does not
 * make the phone numbers on this machine secure, and two employees on two
 * machines still get two separate datasets. Shared history needs the app's
 * data to move to a real database, which is a separate project from auth.
 */

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const { users, addUser } = useData()
  const [userId, setUserId] = useState(loadSession)

  useEffect(() => {
    saveSession(userId)
  }, [userId])

  const user = users.find((u) => u.id === userId) || null

  // A stored session pointing at a deleted user shouldn't wedge the app.
  useEffect(() => {
    if (userId && !user) setUserId(null)
  }, [userId, user])

  const value = useMemo(
    () => ({
      user,
      users,
      signIn: (id) => setUserId(id),
      signInAsNew: (input) => {
        const created = addUser(input)
        setUserId(created.id)
        return created
      },
      // Takes the ID token from Google's callback (see LoginScreen), not a
      // user object — the backend is the only thing allowed to decide whose
      // email that token actually belongs to.
      signInWithGoogle: async (credential) => {
        const res = await fetch(`${API_BASE}/api/auth/google`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ credential }),
        })

        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          throw new Error(body.error || 'Google sign-in failed.')
        }

        const profile = await res.json()
        const existing = users.find(
          (u) => u.email && u.email.toLowerCase() === profile.email.toLowerCase()
        )

        if (existing) {
          setUserId(existing.id)
          return existing
        }

        const created = addUser({ name: profile.name, email: profile.email })
        setUserId(created.id)
        return created
      },
      signOut: () => setUserId(null),
    }),
    [user, users, addUser]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside an <AuthProvider>')
  return ctx
}

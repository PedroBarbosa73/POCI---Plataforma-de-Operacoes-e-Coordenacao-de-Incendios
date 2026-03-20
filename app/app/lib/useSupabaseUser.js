'use client'
import { useEffect, useState } from 'react'
import { getSupabase } from './supabase'

export function useSupabaseUser() {
  const [user, setUser] = useState(undefined) // undefined = loading

  useEffect(() => {
    const supabase = getSupabase()
    supabase.auth.getUser().then(({ data }) => setUser(data.user ?? null))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })
    return () => subscription.unsubscribe()
  }, [])

  return { user, loading: user === undefined }
}

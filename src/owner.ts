import { useEffect, useState } from 'react'
import { useStore } from './store'

// The one account that gets the sharing features. Kept as a hash so the address is not in the code.
const OWNER_HASH = 'e719f5715aff4be7e26ed390aceb0fd03d323850e143474c0b8ef2633afe4cc7'

export function useOwner(): boolean {
  const { auth } = useStore()
  const [owner, setOwner] = useState(false)
  useEffect(() => {
    let live = true
    const email = auth.status === 'in' ? (auth.email ?? '').trim().toLowerCase() : ''
    if (!email || !crypto?.subtle) return setOwner(false)
    crypto.subtle.digest('SHA-256', new TextEncoder().encode(email)).then((buf) => {
      const hex = [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
      if (live) setOwner(hex === OWNER_HASH)
    })
    return () => {
      live = false
    }
  }, [auth.status, auth.email])
  return owner
}

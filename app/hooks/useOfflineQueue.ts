'use client'

import { useCallback } from 'react'
import { get, set, del, keys } from 'idb-keyval'
import { ChatMessage } from '@/lib/types'

const QUEUE_PREFIX = 'offline-msg:'

export function useOfflineQueue() {
  const enqueue = useCallback(async (msg: ChatMessage) => {
    await set(`${QUEUE_PREFIX}${msg.id}`, msg)
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.ready
      // Background Sync API (Chrome only; others fall back to reconnect drain)
      if ('sync' in reg) {
        await (reg as any).sync.register('offline-messages')
      }
    }
  }, [])

  const drain = useCallback(async (send: (msg: ChatMessage) => void) => {
    const allKeys = await keys()
    const queuedKeys = (allKeys as string[]).filter(k => k.startsWith(QUEUE_PREFIX))
    for (const key of queuedKeys) {
      const msg = await get<ChatMessage>(key)
      if (msg) {
        send(msg)
        await del(key)
      }
    }
  }, [])

  return { enqueue, drain }
}

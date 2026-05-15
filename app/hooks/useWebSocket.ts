'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { ChatMessage, ConnectionState } from '@/lib/types'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080'
const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8080/ws'
const TOKEN = process.env.NEXT_PUBLIC_AUTH_TOKEN || ''
export const MY_USER_ID = process.env.NEXT_PUBLIC_USER_ID || 'user_a'

export function useWebSocket() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected')
  const [partnerTyping, setPartnerTyping] = useState(false)

  const wsRef = useRef<WebSocket | null>(null)
  const retryDelay = useRef(1000)
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isMounted = useRef(true)

  const upsertMessage = useCallback((msg: ChatMessage) => {
    setMessages(prev => {
      const idx = prev.findIndex(m => m.id === msg.id)
      if (idx >= 0) {
        const next = [...prev]
        next[idx] = { ...next[idx], ...msg }
        return next
      }
      return [...prev, msg]
    })
  }, [])

  const loadHistory = useCallback(async () => {
    try {
      const res = await fetch(
        `${API_URL}/api/messages?before=${encodeURIComponent(new Date().toISOString())}&limit=50`,
        { headers: { Authorization: `Bearer ${TOKEN}` } }
      )
      if (!res.ok) return
      const data: ChatMessage[] = await res.json()
      // History comes newest-first; reverse for chronological order
      setMessages(data.reverse())
    } catch {
      // Fail silently; messages will load when connection is stable
    }
  }, [])

  const connect = useCallback(() => {
    if (!isMounted.current) return
    if (wsRef.current?.readyState === WebSocket.OPEN) return

    setConnectionState('connecting')
    const url = `${WS_URL}?token=${encodeURIComponent(TOKEN)}`
    const ws = new WebSocket(url)
    wsRef.current = ws

    ws.onopen = () => {
      retryDelay.current = 1000
      setConnectionState('connected')
    }

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        switch (data.type) {
          case 'message':
            upsertMessage({
              id: data.id,
              from: data.from,
              content: data.content ?? null,
              media_url: data.media_url ?? null,
              timestamp: data.timestamp ?? new Date().toISOString(),
              persisted: data.persisted ?? false,
            })
            break
          case 'ack':
            setMessages(prev =>
              prev.map(m => m.id === data.id ? { ...m, persisted: true } : m)
            )
            break
          case 'typing':
            setPartnerTyping(data.state === 'start')
            if (typingTimer.current) clearTimeout(typingTimer.current)
            if (data.state === 'start') {
              typingTimer.current = setTimeout(() => setPartnerTyping(false), 4000)
            }
            break
          case 'read':
            // Mark all messages up to last_id as read
            setMessages(prev =>
              prev.map(m => m.id === data.last_id ? { ...m, read_at: new Date().toISOString() } : m)
            )
            break
          case 'delete':
            setMessages(prev =>
              prev.map(m => m.id === data.message_id ? { ...m, deleted: true, content: null, media_url: null } : m)
            )
            break
          case 'reaction':
            setMessages(prev =>
              prev.map(m => m.id === data.message_id
                ? { ...m, reactions: { ...(m.reactions ?? {}), [data.from]: data.emoji } }
                : m
              )
            )
            break
        }
      } catch {
        // ignore malformed frames
      }
    }

    ws.onclose = () => {
      if (!isMounted.current) return
      setConnectionState('disconnected')
      retryTimer.current = setTimeout(() => {
        retryDelay.current = Math.min(retryDelay.current * 2, 30000)
        connect()
      }, retryDelay.current)
    }

    ws.onerror = () => ws.close()
  }, [upsertMessage])

  useEffect(() => {
    isMounted.current = true
    loadHistory()
    connect()
    return () => {
      isMounted.current = false
      if (retryTimer.current) clearTimeout(retryTimer.current)
      if (typingTimer.current) clearTimeout(typingTimer.current)
      wsRef.current?.close()
    }
  }, [connect, loadHistory])

  const sendMessage = useCallback((payload: object) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(payload))
    }
  }, [])

  const sendTyping = useCallback((state: 'start' | 'stop') => {
    sendMessage({ type: 'typing', state })
  }, [sendMessage])

  const sendRead = useCallback((lastId: string) => {
    sendMessage({ type: 'read', last_id: lastId })
  }, [sendMessage])

  const sendReaction = useCallback((messageId: string, emoji: string) => {
    sendMessage({ type: 'reaction', message_id: messageId, emoji })
  }, [sendMessage])

  const postTextMessage = useCallback((content: string) => {
    const msg: ChatMessage = {
      id: crypto.randomUUID(),
      from: MY_USER_ID,
      content,
      media_url: null,
      timestamp: new Date().toISOString(),
      persisted: false,
    }
    upsertMessage(msg)
    sendMessage({ type: 'message', id: msg.id, content, media_url: null, timestamp: msg.timestamp })
    return msg.id
  }, [sendMessage, upsertMessage])

  const postMediaMessage = useCallback((mediaUrl: string) => {
    const msg: ChatMessage = {
      id: crypto.randomUUID(),
      from: MY_USER_ID,
      content: null,
      media_url: mediaUrl,
      timestamp: new Date().toISOString(),
      persisted: false,
    }
    upsertMessage(msg)
    sendMessage({ type: 'message', id: msg.id, content: null, media_url: mediaUrl, timestamp: msg.timestamp })
    return msg.id
  }, [sendMessage, upsertMessage])

  return {
    messages,
    connectionState,
    partnerTyping,
    postTextMessage,
    postMediaMessage,
    sendTyping,
    sendRead,
    sendReaction,
  }
}

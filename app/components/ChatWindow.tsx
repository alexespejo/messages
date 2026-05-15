'use client'

import { useEffect, useRef, useCallback } from 'react'
import { ChatMessage } from '@/lib/types'
import { MY_USER_ID } from '@/hooks/useWebSocket'
import MessageBubble from './MessageBubble'
import TypingIndicator from './TypingIndicator'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080'
const TOKEN = process.env.NEXT_PUBLIC_AUTH_TOKEN || ''

interface Props {
  messages: ChatMessage[]
  partnerTyping: boolean
  onReact: (messageId: string, emoji: string) => void
  onDelete: (messageId: string) => void
  onRead: (lastId: string) => void
}

export default function ChatWindow({ messages, partnerTyping, onReact, onDelete, onRead }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null)
  const lastMessageRef = useRef<HTMLDivElement>(null)
  const observerRef = useRef<IntersectionObserver | null>(null)

  // Auto-scroll on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length, partnerTyping])

  // Observe last visible message for read receipts
  const lastIncoming = [...messages].reverse().find(m => m.from !== MY_USER_ID && !m.read_at)

  useEffect(() => {
    if (!lastIncoming || !lastMessageRef.current) return

    observerRef.current?.disconnect()
    observerRef.current = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          onRead(lastIncoming.id)
          observerRef.current?.disconnect()
        }
      },
      { threshold: 0.5 }
    )
    observerRef.current.observe(lastMessageRef.current)

    return () => observerRef.current?.disconnect()
  }, [lastIncoming?.id, onRead])

  const handleDelete = useCallback(async (id: string) => {
    try {
      await fetch(`${API_URL}/api/messages/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${TOKEN}` },
      })
    } catch {
      // Hub broadcasts delete on success; if this fails the UI doesn't update
    }
  }, [])

  const lastMyMessage = [...messages].reverse().find(m => m.from === MY_USER_ID)

  return (
    <div className="flex-1 overflow-y-auto px-4 py-4 space-y-0">
      {messages.length === 0 && (
        <div className="flex items-center justify-center h-full text-gray-400 text-sm select-none">
          No messages yet. Say hello!
        </div>
      )}

      {messages.map((msg) => {
        const isLastIncoming = msg.id === lastIncoming?.id
        return (
          <div key={msg.id} ref={isLastIncoming ? lastMessageRef : undefined}>
            <MessageBubble
              message={msg}
              onReact={onReact}
              onDelete={handleDelete}
              showReadReceipt={msg.id === lastMyMessage?.id}
            />
          </div>
        )
      })}

      {partnerTyping && <TypingIndicator />}
      <div ref={bottomRef} />
    </div>
  )
}

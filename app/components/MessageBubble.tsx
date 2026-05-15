'use client'

import { useState } from 'react'
import Image from 'next/image'
import { ChatMessage } from '@/lib/types'
import { MY_USER_ID } from '@/hooks/useWebSocket'
import ImageLightbox from './ImageLightbox'

const EMOJI_OPTIONS = ['❤️', '😂', '😮', '😢', '👍', '🔥']

interface Props {
  message: ChatMessage
  onReact: (messageId: string, emoji: string) => void
  onDelete: (messageId: string) => void
  showReadReceipt?: boolean
}

export default function MessageBubble({ message, onReact, onDelete, showReadReceipt }: Props) {
  const isMine = message.from === MY_USER_ID
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false)

  const reactionEntries = Object.entries(message.reactions ?? {})

  const formattedTime = new Date(message.timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  })

  if (message.deleted) {
    return (
      <div className={`flex ${isMine ? 'justify-end' : 'justify-start'} mb-1`}>
        <span className="text-xs text-gray-400 italic px-3 py-2">Message removed</span>
      </div>
    )
  }

  return (
    <div className={`flex flex-col ${isMine ? 'items-end' : 'items-start'} mb-2 group`}>
      <div className="relative">
        {/* Main bubble */}
        <div
          className={`relative max-w-xs md:max-w-md lg:max-w-lg rounded-2xl px-4 py-2 shadow-sm
            ${isMine
              ? 'bg-blue-500 text-white rounded-br-sm'
              : 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-bl-sm'
            }`}
          onContextMenu={(e) => { e.preventDefault(); setEmojiPickerOpen(true) }}
        >
          {message.media_url && (
            <div
              className="relative w-64 h-48 rounded-lg overflow-hidden cursor-pointer mb-1"
              onClick={() => setLightboxOpen(true)}
            >
              {message.media_url.match(/\.(mp4|webm|mov)$/i) ? (
                <video
                  src={message.media_url}
                  className="w-full h-full object-cover"
                  controls
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <Image
                  src={message.media_url}
                  alt="shared media"
                  fill
                  className="object-cover"
                  sizes="256px"
                />
              )}
            </div>
          )}

          {message.content && (
            <p className="text-sm break-words whitespace-pre-wrap">{message.content}</p>
          )}

          <div className={`flex items-center gap-1 mt-0.5 ${isMine ? 'justify-end' : 'justify-start'}`}>
            <span className={`text-xs ${isMine ? 'text-blue-100' : 'text-gray-400'}`}>
              {formattedTime}
            </span>
            {isMine && (
              <span className="text-xs">
                {message.read_at ? (
                  <span title="Read" className="text-blue-200">✓✓</span>
                ) : message.persisted ? (
                  <span title="Delivered" className="text-blue-200">✓</span>
                ) : (
                  <span title="Sending…" className="text-blue-300 opacity-60">◦</span>
                )}
              </span>
            )}
          </div>
        </div>

        {/* Emoji picker (context menu) */}
        {emojiPickerOpen && (
          <div
            className="absolute z-10 bottom-full mb-1 bg-white dark:bg-gray-700 rounded-full shadow-lg flex gap-1 px-2 py-1 border border-gray-200 dark:border-gray-600"
            style={isMine ? { right: 0 } : { left: 0 }}
          >
            {EMOJI_OPTIONS.map(emoji => (
              <button
                key={emoji}
                className="text-lg hover:scale-125 transition-transform"
                onClick={() => {
                  onReact(message.id, emoji)
                  setEmojiPickerOpen(false)
                }}
              >
                {emoji}
              </button>
            ))}
            {isMine && (
              <button
                className="text-xs text-red-400 hover:text-red-600 px-1 ml-1"
                onClick={() => {
                  onDelete(message.id)
                  setEmojiPickerOpen(false)
                }}
              >
                Delete
              </button>
            )}
            <button
              className="text-xs text-gray-400 px-1"
              onClick={() => setEmojiPickerOpen(false)}
            >
              ✕
            </button>
          </div>
        )}
      </div>

      {/* Reactions */}
      {reactionEntries.length > 0 && (
        <div className="flex gap-1 mt-0.5 flex-wrap">
          {reactionEntries.map(([user, emoji]) => (
            <span
              key={user}
              className="text-xs bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-full px-1.5 py-0.5 shadow-sm"
              title={user}
            >
              {emoji}
            </span>
          ))}
        </div>
      )}

      {lightboxOpen && message.media_url && (
        <ImageLightbox src={message.media_url} onClose={() => setLightboxOpen(false)} />
      )}
    </div>
  )
}

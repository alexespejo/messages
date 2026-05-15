'use client'

import { useCallback } from 'react'
import { useWebSocket, MY_USER_ID } from '@/hooks/useWebSocket'
import ChatWindow from '@/components/ChatWindow'
import MessageInput from '@/components/MessageInput'

export default function Page() {
  const {
    messages,
    connectionState,
    partnerTyping,
    postTextMessage,
    postMediaMessage,
    sendTyping,
    sendRead,
    sendReaction,
  } = useWebSocket()

  const handleTypingStart = useCallback(() => sendTyping('start'), [sendTyping])
  const handleTypingStop = useCallback(() => sendTyping('stop'), [sendTyping])

  const statusColor = {
    connected: 'bg-green-400',
    connecting: 'bg-yellow-400',
    disconnected: 'bg-red-400',
  }[connectionState]

  const partnerId = MY_USER_ID === 'user_a' ? 'user_b' : 'user_a'

  return (
    <div className="flex flex-col h-dvh bg-white dark:bg-gray-950 max-w-2xl mx-auto">
      <header className="flex items-center gap-3 px-4 py-3 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 shrink-0">
        <div className="w-9 h-9 rounded-full bg-blue-500 flex items-center justify-center text-white text-sm font-semibold select-none">
          {partnerId[0].toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">{partnerId}</p>
          <p className="text-xs text-gray-400 flex items-center gap-1">
            <span className={`inline-block w-1.5 h-1.5 rounded-full ${statusColor}`} />
            {connectionState}
          </p>
        </div>
      </header>

      <ChatWindow
        messages={messages}
        partnerTyping={partnerTyping}
        onReact={sendReaction}
        onDelete={() => {}}
        onRead={sendRead}
      />

      <MessageInput
        onSendText={postTextMessage}
        onSendMedia={postMediaMessage}
        onTypingStart={handleTypingStart}
        onTypingStop={handleTypingStop}
        disabled={connectionState === 'disconnected'}
      />
    </div>
  )
}

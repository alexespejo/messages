export interface ChatMessage {
  id: string
  from: string
  content: string | null
  media_url: string | null
  timestamp: string
  persisted: boolean
  deleted?: boolean
  read_at?: string | null
  reactions?: Record<string, string> // message_id -> emoji by user
}

export interface Reaction {
  message_id: string
  from: string
  emoji: string
}

export type ConnectionState = 'connecting' | 'connected' | 'disconnected'

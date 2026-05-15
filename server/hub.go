package main

import (
	"database/sql"
	"encoding/json"
	"log"
	"time"

	"github.com/google/uuid"
)

type Hub struct {
	clients   map[*Client]bool
	broadcast chan *inboundMsg
	register  chan *Client
	leave     chan *Client
	db        *sql.DB
}

type inboundMsg struct {
	sender *Client
	data   []byte
}

func newHub(db *sql.DB) *Hub {
	return &Hub{
		clients:   make(map[*Client]bool),
		broadcast: make(chan *inboundMsg, 256),
		register:  make(chan *Client),
		leave:     make(chan *Client),
		db:        db,
	}
}

func (h *Hub) run() {
	for {
		select {
		case client := <-h.register:
			h.clients[client] = true
			log.Printf("client connected: %s (total: %d)", client.userID, len(h.clients))

		case client := <-h.leave:
			if _, ok := h.clients[client]; ok {
				delete(h.clients, client)
				close(client.send)
				log.Printf("client disconnected: %s (total: %d)", client.userID, len(h.clients))
			}

		case msg := <-h.broadcast:
			h.handleMessage(msg)
		}
	}
}

func (h *Hub) handleMessage(msg *inboundMsg) {
	var raw map[string]interface{}
	if err := json.Unmarshal(msg.data, &raw); err != nil {
		return
	}

	msgType, _ := raw["type"].(string)

	switch msgType {
	case "message":
		h.relayMessage(msg.sender, raw, msg.data)
	case "typing":
		h.relayToOther(msg.sender, msg.data)
	case "read":
		h.handleRead(msg.sender, raw)
	case "reaction":
		h.relayAndPersistReaction(msg.sender, raw)
	}
}

func (h *Hub) relayMessage(sender *Client, raw map[string]interface{}, original []byte) {
	msgID, _ := raw["id"].(string)
	if msgID == "" {
		msgID = uuid.New().String()
	}

	relayed := map[string]interface{}{
		"type":      "message",
		"id":        msgID,
		"from":      sender.userID,
		"content":   raw["content"],
		"media_url": raw["media_url"],
		"timestamp": raw["timestamp"],
		"persisted": false,
	}
	data, _ := json.Marshal(relayed)

	// Broadcast-first: relay to all clients immediately
	for client := range h.clients {
		select {
		case client.send <- data:
		default:
			close(client.send)
			delete(h.clients, client)
		}
	}

	// Persist async
	go func() {
		msg := Message{
			ID:       msgID,
			FromUser: sender.userID,
		}
		if c, ok := raw["content"].(string); ok {
			msg.Content = sql.NullString{String: c, Valid: c != ""}
		}
		if m, ok := raw["media_url"].(string); ok {
			msg.MediaURL = sql.NullString{String: m, Valid: m != ""}
		}
		if ts, ok := raw["timestamp"].(string); ok {
			if t, err := time.Parse(time.RFC3339, ts); err == nil {
				msg.CreatedAt = t
			}
		}
		if msg.CreatedAt.IsZero() {
			msg.CreatedAt = time.Now()
		}

		if err := persistMessage(h.db, msg); err != nil {
			log.Printf("persist message error: %v", err)
			return
		}

		ack, _ := json.Marshal(map[string]interface{}{
			"type":      "ack",
			"id":        msgID,
			"persisted": true,
		})
		sender.sendSafe(ack)
	}()
}

func (h *Hub) relayToOther(sender *Client, data []byte) {
	for client := range h.clients {
		if client != sender {
			select {
			case client.send <- data:
			default:
			}
		}
	}
}

func (h *Hub) handleRead(sender *Client, raw map[string]interface{}) {
	lastID, _ := raw["last_id"].(string)
	if lastID == "" {
		return
	}
	// Relay to other client
	h.relayToOther(sender, mustMarshal(raw))
	// Persist async
	go func() {
		if _, err := h.db.Exec(
			`UPDATE messages SET read_at = now() WHERE id = $1 AND read_at IS NULL`,
			lastID,
		); err != nil {
			log.Printf("persist read_at error: %v", err)
		}
	}()
}

func (h *Hub) relayAndPersistReaction(sender *Client, raw map[string]interface{}) {
	messageID, _ := raw["message_id"].(string)
	emoji, _ := raw["emoji"].(string)
	if messageID == "" || emoji == "" {
		return
	}

	payload := map[string]interface{}{
		"type":       "reaction",
		"message_id": messageID,
		"from":       sender.userID,
		"emoji":      emoji,
	}
	data, _ := json.Marshal(payload)

	for client := range h.clients {
		select {
		case client.send <- data:
		default:
		}
	}

	go func() {
		_, err := h.db.Exec(
			`INSERT INTO reactions (message_id, from_user, emoji) VALUES ($1, $2, $3)
			 ON CONFLICT (message_id, from_user) DO UPDATE SET emoji = EXCLUDED.emoji`,
			messageID, sender.userID, emoji,
		)
		if err != nil {
			log.Printf("persist reaction error: %v", err)
		}
	}()
}

// broadcastDelete sends a delete event to all connected clients.
func (h *Hub) broadcastDelete(messageID string) {
	data, _ := json.Marshal(map[string]interface{}{
		"type":       "delete",
		"message_id": messageID,
	})
	for client := range h.clients {
		select {
		case client.send <- data:
		default:
		}
	}
}

func mustMarshal(v interface{}) []byte {
	b, _ := json.Marshal(v)
	return b
}

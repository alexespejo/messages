package main

import (
	"database/sql"
	"time"

	fiberws "github.com/gofiber/contrib/websocket"
	"github.com/gofiber/fiber/v2"
)

// serveWS upgrades to WebSocket and registers the client in the hub.
func serveWS(hub *Hub, c *fiberws.Conn) {
	userID := c.Locals("userID").(string)

	client := &Client{
		hub:    hub,
		conn:   c,
		send:   make(chan []byte, 256),
		userID: userID,
	}

	hub.register <- client
	go client.writePump()
	client.readPump()
}

func handleGetMessages(c *fiber.Ctx, db *sql.DB) error {
	beforeStr := c.Query("before", time.Now().UTC().Format(time.RFC3339Nano))
	limit := c.QueryInt("limit", 50)

	before, err := time.Parse(time.RFC3339Nano, beforeStr)
	if err != nil {
		before, err = time.Parse(time.RFC3339, beforeStr)
		if err != nil {
			before = time.Now().UTC()
		}
	}
	if limit > 100 {
		limit = 100
	}

	msgs, err := fetchMessages(db, before, limit)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "failed to fetch messages"})
	}
	if msgs == nil {
		msgs = []MessageRow{}
	}
	return c.JSON(msgs)
}

func handleDeleteMessage(c *fiber.Ctx, db *sql.DB, hub *Hub) error {
	id := c.Params("id")
	userID := c.Locals("userID").(string)

	res, err := db.Exec(
		`UPDATE messages SET deleted_at = now() WHERE id = $1 AND from_user = $2 AND deleted_at IS NULL`,
		id, userID,
	)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "delete failed"})
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return c.Status(404).JSON(fiber.Map{"error": "not found or not yours"})
	}

	hub.broadcastDelete(id)
	return c.SendStatus(204)
}

type PushSubscription struct {
	Endpoint string `json:"endpoint"`
	P256DH   string `json:"p256dh"`
	Auth     string `json:"auth"`
}

func handlePushSubscribe(c *fiber.Ctx, db *sql.DB) error {
	userID := c.Locals("userID").(string)
	var sub PushSubscription
	if err := c.BodyParser(&sub); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid body"})
	}
	_, err := db.Exec(
		`INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth)
		 VALUES ($1, $2, $3, $4)
		 ON CONFLICT (user_id) DO UPDATE SET endpoint = EXCLUDED.endpoint, p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth`,
		userID, sub.Endpoint, sub.P256DH, sub.Auth,
	)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "subscribe failed"})
	}
	return c.SendStatus(201)
}

package main

import (
	"os"
	"strings"

	"github.com/gofiber/fiber/v2"
)

// authMiddleware validates the Bearer token from the Authorization header or ?token= query param.
func authMiddleware(c *fiber.Ctx) error {
	token := c.Query("token")
	if token == "" {
		auth := c.Get("Authorization")
		if strings.HasPrefix(auth, "Bearer ") {
			token = auth[7:]
		}
	}

	userID := resolveUserID(token)
	if userID == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "unauthorized"})
	}
	c.Locals("userID", userID)
	return c.Next()
}

func resolveUserID(token string) string {
	if token == "" {
		return ""
	}
	switch token {
	case os.Getenv("AUTH_TOKEN_A"):
		return "user_a"
	case os.Getenv("AUTH_TOKEN_B"):
		return "user_b"
	default:
		return ""
	}
}

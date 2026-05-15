package main

import (
	"database/sql"
	"log"
	"os"

	fiberws "github.com/gofiber/contrib/websocket"
	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/cors"
	"github.com/joho/godotenv"
	_ "github.com/lib/pq"
)

func main() {
	_ = godotenv.Load()

	db, err := sql.Open("postgres", os.Getenv("DATABASE_URL"))
	if err != nil {
		log.Fatalf("db open: %v", err)
	}
	if err := db.Ping(); err != nil {
		log.Printf("warning: db ping failed: %v (continuing without DB)", err)
	}

	hub := newHub(db)
	go hub.run()

	r2Client := newR2Client()

	app := fiber.New(fiber.Config{DisableStartupMessage: true})

	app.Use(cors.New(cors.Config{
		AllowOrigins: "*",
		AllowHeaders: "Origin, Content-Type, Authorization",
	}))

	app.Get("/health", func(c *fiber.Ctx) error {
		return c.JSON(fiber.Map{"status": "ok"})
	})

	// WebSocket upgrade: auth middleware runs first as a regular HTTP middleware
	app.Get("/ws",
		authMiddleware,
		fiberws.New(func(c *fiberws.Conn) {
			serveWS(hub, c)
		}),
	)

	api := app.Group("/api", authMiddleware)
	api.Get("/messages", func(c *fiber.Ctx) error {
		return handleGetMessages(c, db)
	})
	api.Post("/media/upload-url", func(c *fiber.Ctx) error {
		return handleUploadURL(c, r2Client)
	})
	api.Delete("/messages/:id", func(c *fiber.Ctx) error {
		return handleDeleteMessage(c, db, hub)
	})
	api.Post("/push/subscribe", func(c *fiber.Ctx) error {
		return handlePushSubscribe(c, db)
	})

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	log.Printf("server listening on :%s", port)
	log.Fatal(app.Listen(":" + port))
}

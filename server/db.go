package main

import (
	"database/sql"
	"time"
)

type Message struct {
	ID        string
	FromUser  string
	Content   sql.NullString
	MediaURL  sql.NullString
	ReadAt    sql.NullTime
	DeletedAt sql.NullTime
	CreatedAt time.Time
}

func persistMessage(db *sql.DB, msg Message) error {
	_, err := db.Exec(
		`INSERT INTO messages (id, from_user, content, media_url, created_at)
		 VALUES ($1, $2, $3, $4, $5)
		 ON CONFLICT (id) DO NOTHING`,
		msg.ID, msg.FromUser, msg.Content, msg.MediaURL, msg.CreatedAt,
	)
	return err
}

type MessageRow struct {
	ID        string         `json:"id"`
	FromUser  string         `json:"from"`
	Content   *string        `json:"content"`
	MediaURL  *string        `json:"media_url"`
	ReadAt    *time.Time     `json:"read_at"`
	CreatedAt time.Time      `json:"created_at"`
	Persisted bool           `json:"persisted"`
}

func fetchMessages(db *sql.DB, before time.Time, limit int) ([]MessageRow, error) {
	rows, err := db.Query(
		`SELECT id, from_user, content, media_url, read_at, created_at
		 FROM messages
		 WHERE deleted_at IS NULL AND created_at < $1
		 ORDER BY created_at DESC
		 LIMIT $2`,
		before, limit,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var msgs []MessageRow
	for rows.Next() {
		var m MessageRow
		var content sql.NullString
		var mediaURL sql.NullString
		var readAt sql.NullTime
		if err := rows.Scan(&m.ID, &m.FromUser, &content, &mediaURL, &readAt, &m.CreatedAt); err != nil {
			return nil, err
		}
		if content.Valid {
			m.Content = &content.String
		}
		if mediaURL.Valid {
			m.MediaURL = &mediaURL.String
		}
		if readAt.Valid {
			m.ReadAt = &readAt.Time
		}
		m.Persisted = true
		msgs = append(msgs, m)
	}
	return msgs, rows.Err()
}

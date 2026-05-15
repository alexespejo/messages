package main

import (
	"context"
	"fmt"
	"os"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
)

type R2Client struct {
	presigner *s3.PresignClient
	bucket    string
	cdnURL    string
}

func newR2Client() *R2Client {
	accountID := os.Getenv("R2_ACCOUNT_ID")
	accessKeyID := os.Getenv("R2_ACCESS_KEY_ID")
	secretAccessKey := os.Getenv("R2_SECRET_ACCESS_KEY")
	bucket := os.Getenv("R2_BUCKET")
	cdnURL := os.Getenv("R2_CDN_URL")

	if accountID == "" {
		return &R2Client{bucket: bucket, cdnURL: cdnURL}
	}

	endpoint := fmt.Sprintf("https://%s.r2.cloudflarestorage.com", accountID)

	cfg := aws.Config{
		Region:      "auto",
		Credentials: credentials.NewStaticCredentialsProvider(accessKeyID, secretAccessKey, ""),
		EndpointResolverWithOptions: aws.EndpointResolverWithOptionsFunc(
			func(service, region string, options ...interface{}) (aws.Endpoint, error) {
				return aws.Endpoint{URL: endpoint}, nil
			},
		),
	}

	s3Client := s3.NewFromConfig(cfg, func(o *s3.Options) {
		o.UsePathStyle = true
	})

	return &R2Client{
		presigner: s3.NewPresignClient(s3Client),
		bucket:    bucket,
		cdnURL:    cdnURL,
	}
}

func (r *R2Client) generateUploadURL(ext, mimeType string) (uploadURL, mediaURL string, err error) {
	key := fmt.Sprintf("media/%s.%s", uuid.New().String(), ext)

	req, err := r.presigner.PresignPutObject(context.Background(), &s3.PutObjectInput{
		Bucket:      aws.String(r.bucket),
		Key:         aws.String(key),
		ContentType: aws.String(mimeType),
	}, s3.WithPresignExpires(5*time.Minute))
	if err != nil {
		return "", "", err
	}

	mediaURL = fmt.Sprintf("%s/%s", r.cdnURL, key)
	return req.URL, mediaURL, nil
}

type uploadURLRequest struct {
	Extension string `json:"ext"`
	MimeType  string `json:"mime_type"`
}

func handleUploadURL(c *fiber.Ctx, r2 *R2Client) error {
	var req uploadURLRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid body"})
	}
	if req.Extension == "" {
		req.Extension = "jpg"
	}
	if req.MimeType == "" {
		req.MimeType = "image/jpeg"
	}

	if r2.presigner == nil {
		return c.Status(503).JSON(fiber.Map{"error": "R2 not configured"})
	}

	uploadURL, mediaURL, err := r2.generateUploadURL(req.Extension, req.MimeType)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "failed to generate upload URL"})
	}

	return c.JSON(fiber.Map{
		"upload_url": uploadURL,
		"media_url":  mediaURL,
		"expires_in": 300,
	})
}

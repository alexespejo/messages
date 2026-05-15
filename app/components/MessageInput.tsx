'use client'

import { useState, useRef, useCallback } from 'react'
import ReactCrop, { type Crop } from 'react-image-crop'
import 'react-image-crop/dist/ReactCrop.css'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080'
const TOKEN = process.env.NEXT_PUBLIC_AUTH_TOKEN || ''

interface Props {
  onSendText: (text: string) => void
  onSendMedia: (mediaUrl: string) => void
  onTypingStart: () => void
  onTypingStop: () => void
  disabled?: boolean
}

export default function MessageInput({ onSendText, onSendMedia, onTypingStart, onTypingStop, disabled }: Props) {
  const [text, setText] = useState('')
  const [uploading, setUploading] = useState(false)
  const [editorSrc, setEditorSrc] = useState<string | null>(null)
  const [editorFile, setEditorFile] = useState<{ blob: Blob; ext: string; mime: string } | null>(null)
  const [crop, setCrop] = useState<Crop>()
  const [rotation, setRotation] = useState(0)

  const fileRef = useRef<HTMLInputElement>(null)
  const imgRef = useRef<HTMLImageElement>(null)
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleTextChange = (val: string) => {
    setText(val)
    onTypingStart()
    if (typingTimer.current) clearTimeout(typingTimer.current)
    typingTimer.current = setTimeout(onTypingStop, 3000)
  }

  const handleSendText = () => {
    const trimmed = text.trim()
    if (!trimmed) return
    onSendText(trimmed)
    setText('')
    if (typingTimer.current) clearTimeout(typingTimer.current)
    onTypingStop()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendText()
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const isVideo = file.type.startsWith('video/')
    if (isVideo) {
      // Check duration before uploading
      const video = document.createElement('video')
      video.preload = 'metadata'
      video.onloadedmetadata = () => {
        URL.revokeObjectURL(video.src)
        if (video.duration > 30) {
          alert('Videos must be 30 seconds or shorter.')
          return
        }
        uploadBlob(file, 'mp4', file.type)
      }
      video.src = URL.createObjectURL(file)
      return
    }

    // Image: open editor
    const reader = new FileReader()
    reader.onload = () => {
      setEditorSrc(reader.result as string)
      setEditorFile(null)
      setCrop(undefined)
      setRotation(0)
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  const applyEditorAndUpload = useCallback(async () => {
    if (!editorSrc || !imgRef.current) return

    const canvas = document.createElement('canvas')
    const img = imgRef.current
    const scaleX = img.naturalWidth / img.width
    const scaleY = img.naturalHeight / img.height

    const cropWidth = crop ? crop.width * scaleX : img.naturalWidth
    const cropHeight = crop ? crop.height * scaleY : img.naturalHeight
    const cropX = crop ? crop.x * scaleX : 0
    const cropY = crop ? crop.y * scaleY : 0

    const rad = (rotation * Math.PI) / 180
    const sin = Math.abs(Math.sin(rad))
    const cos = Math.abs(Math.cos(rad))
    canvas.width = cropWidth * cos + cropHeight * sin
    canvas.height = cropWidth * sin + cropHeight * cos

    const ctx = canvas.getContext('2d')!
    ctx.translate(canvas.width / 2, canvas.height / 2)
    ctx.rotate(rad)
    ctx.drawImage(img, cropX, cropY, cropWidth, cropHeight, -cropWidth / 2, -cropHeight / 2, cropWidth, cropHeight)

    canvas.toBlob(async (blob) => {
      if (!blob) return
      setEditorSrc(null)
      await uploadBlob(blob, 'jpg', 'image/jpeg')
    }, 'image/jpeg', 0.82)
  }, [editorSrc, crop, rotation])

  const uploadBlob = async (blob: Blob, ext: string, mimeType: string) => {
    setUploading(true)
    try {
      const urlRes = await fetch(`${API_URL}/api/media/upload-url`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ext, mime_type: mimeType }),
      })
      if (!urlRes.ok) throw new Error('Failed to get upload URL')
      const { upload_url, media_url } = await urlRes.json()

      await fetch(upload_url, {
        method: 'PUT',
        headers: { 'Content-Type': mimeType },
        body: blob,
      })

      onSendMedia(media_url)
    } catch (err) {
      console.error('Upload failed:', err)
      alert('Upload failed. Please try again.')
    } finally {
      setUploading(false)
    }
  }

  return (
    <>
      {/* Image editor modal */}
      {editorSrc && (
        <div className="fixed inset-0 z-40 bg-black/80 flex flex-col items-center justify-center gap-4 p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl p-4 w-full max-w-lg space-y-4">
            <h3 className="text-base font-semibold text-gray-800 dark:text-gray-100">Edit Image</h3>
            <div className="overflow-hidden rounded-lg max-h-96">
              <ReactCrop crop={crop} onChange={setCrop}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  ref={imgRef}
                  src={editorSrc}
                  alt="Edit"
                  style={{ transform: `rotate(${rotation}deg)`, maxHeight: '320px', objectFit: 'contain' }}
                />
              </ReactCrop>
            </div>
            <div className="flex gap-3 items-center">
              <button
                className="text-sm px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-700 hover:bg-gray-200"
                onClick={() => setRotation(r => (r - 90 + 360) % 360)}
              >
                ↺ Rotate
              </button>
              <button
                className="text-sm px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-700 hover:bg-gray-200"
                onClick={() => setRotation(r => (r + 90) % 360)}
              >
                ↻ Rotate
              </button>
              <div className="flex-1" />
              <button
                className="text-sm px-4 py-1.5 rounded-lg text-gray-500 hover:text-gray-700"
                onClick={() => setEditorSrc(null)}
              >
                Cancel
              </button>
              <button
                className="text-sm px-4 py-1.5 rounded-lg bg-blue-500 text-white hover:bg-blue-600"
                onClick={applyEditorAndUpload}
              >
                Send
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-end gap-2 px-4 py-3 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
        <input
          ref={fileRef}
          type="file"
          accept="image/*,video/*"
          className="hidden"
          onChange={handleFileChange}
        />
        <button
          className="flex-shrink-0 w-9 h-9 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
          onClick={() => fileRef.current?.click()}
          disabled={disabled || uploading}
          aria-label="Attach media"
        >
          {uploading ? (
            <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          ) : (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
            </svg>
          )}
        </button>

        <textarea
          className="flex-1 resize-none rounded-2xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-4 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 max-h-32 overflow-y-auto"
          placeholder="Message"
          rows={1}
          value={text}
          onChange={(e) => handleTextChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={onTypingStop}
          disabled={disabled}
        />

        <button
          className="flex-shrink-0 w-9 h-9 rounded-full bg-blue-500 flex items-center justify-center text-white hover:bg-blue-600 disabled:opacity-40 transition-colors"
          onClick={handleSendText}
          disabled={!text.trim() || disabled}
          aria-label="Send"
        >
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" />
          </svg>
        </button>
      </div>
    </>
  )
}

'use client'

import { useEffect } from 'react'
import Image from 'next/image'

interface Props {
  src: string
  onClose: () => void
}

export default function ImageLightbox({ src, onClose }: Props) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center"
      onClick={onClose}
    >
      <button
        className="absolute top-4 right-4 text-white text-3xl leading-none hover:opacity-75"
        onClick={onClose}
        aria-label="Close"
      >
        ✕
      </button>
      <div
        className="relative max-w-[90vw] max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <Image
          src={src}
          alt="Full size"
          width={1200}
          height={900}
          className="object-contain max-w-[90vw] max-h-[90vh] rounded-lg"
          style={{ width: 'auto', height: 'auto' }}
        />
      </div>
    </div>
  )
}

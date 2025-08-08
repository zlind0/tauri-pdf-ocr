import { useState, useCallback, useEffect } from 'react'
import type { ReactNode } from 'react'

interface SplitPaneProps {
  children: [ReactNode, ReactNode]
  split?: 'horizontal' | 'vertical'
  size?: number
  onChange?: (size: number) => void
  style?: React.CSSProperties
}

export function SplitPane({ 
  children, 
  split = 'vertical', 
  size = 50, 
  onChange,
  style 
}: SplitPaneProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [currentSize, setCurrentSize] = useState(size)

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging) return

    const container = e.currentTarget as HTMLElement
    const rect = container.getBoundingClientRect()
    
    let newSize: number
    if (split === 'vertical') {
      newSize = ((e.clientX - rect.left) / rect.width) * 100
    } else {
      newSize = ((e.clientY - rect.top) / rect.height) * 100
    }
    
    newSize = Math.max(10, Math.min(90, newSize))
    setCurrentSize(newSize)
    onChange?.(newSize)
  }, [isDragging, split, onChange])

  const handleMouseUp = useCallback(() => {
    setIsDragging(false)
  }, [])

  // Add global mouse event listeners
  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
      return () => {
        document.removeEventListener('mousemove', handleMouseMove)
        document.removeEventListener('mouseup', handleMouseUp)
      }
    }
  }, [isDragging, handleMouseMove, handleMouseUp])

  const [leftChild, rightChild] = children

  return (
    <div 
      style={{
        display: 'flex',
        flexDirection: split === 'vertical' ? 'row' : 'column',
        height: '100%',
        ...style
      }}
    >
      <div style={{
        flex: split === 'vertical' ? `0 0 ${currentSize}%` : `0 0 ${currentSize}%`,
        overflow: 'hidden'
      }}>
        {leftChild}
      </div>
      
      <div
        onMouseDown={handleMouseDown}
        style={{
          width: split === 'vertical' ? '4px' : '100%',
          height: split === 'vertical' ? '100%' : '4px',
          backgroundColor: isDragging ? '#007bff' : '#ddd',
          cursor: split === 'vertical' ? 'col-resize' : 'row-resize',
          position: 'relative',
          flexShrink: 0
        }}
      />
      
      <div style={{
        flex: split === 'vertical' ? `0 0 ${100 - currentSize}%` : `0 0 ${100 - currentSize}%`,
        overflow: 'hidden'
      }}>
        {rightChild}
      </div>
    </div>
  )
}

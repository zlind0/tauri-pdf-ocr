import { useState, useRef, useEffect } from 'react'

interface ThemeSelectorProps {
  currentTheme: 'light' | 'sepia' | 'dark'
  onThemeChange: (theme: 'light' | 'sepia' | 'dark') => void
}

export function ThemeSelector({ currentTheme, onThemeChange }: ThemeSelectorProps) {
  const [isOpen, setIsOpen] = useState(false)
  const selectorRef = useRef<HTMLDivElement>(null)

  // 点击外部关闭面板
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (selectorRef.current && !selectorRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [])

  const themes = [
    { id: 'light', name: '白色', icon: '☀️' },
    { id: 'sepia', name: '棕色', icon: '📖' },
    { id: 'dark', name: '夜间', icon: '🌙' }
  ]

  return (
    <div
      ref={selectorRef}
      style={{
        position: 'relative',
        display: 'inline-block'
      }}
    >
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '6px 12px',
          backgroundColor: 'var(--button-bg)',
          color: 'var(--button-text-color)',
          border: '1px solid var(--border-color)',
          borderRadius: '4px',
          cursor: 'pointer'
        }}
        title="切换主题"
      >
        {currentTheme === 'light' ? '☀️' : currentTheme === 'sepia' ? '📖' : '🌙'}
      </button>

      {isOpen && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            right: 0,
            backgroundColor: 'var(--panel-bg)',
            border: '1px solid var(--border-color)',
            borderRadius: '4px',
            boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
            zIndex: 1000,
            minWidth: '120px',
            padding: '8px 0'
          }}
        >
          {themes.map((theme) => (
            <button
              key={theme.id}
              onClick={() => {
                onThemeChange(theme.id as 'light' | 'sepia' | 'dark')
                setIsOpen(false)
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                width: '100%',
                padding: '8px 16px',
                backgroundColor: currentTheme === theme.id ? 'var(--highlight-bg)' : 'transparent',
                color: currentTheme === theme.id ? 'var(--highlight-text-color)' :'var(--text-color)',
                border: 'none',
                cursor: 'pointer',
                textAlign: 'left'
              }}
            >
              <span style={{ marginRight: '8px' }}>{theme.icon}</span>
              {theme.name}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
import { useState, useEffect } from 'react'
import { Store } from '@tauri-apps/plugin-store'
import { cacheService } from './cacheService'

interface OcrSettings {
  endpoint: string
  apiKey: string
  model: string
  engine?: 'llm' | 'system' // 添加引擎选择
}

interface TranslationSettings {
  endpoint: string
  apiKey: string
  model: string
}

interface SettingsProps {
  isOpen: boolean
  onClose: () => void
  fileMd5?: string | null // 添加文件MD5属性用于清除特定文件缓存
}

export function Settings({ isOpen, onClose, fileMd5 }: SettingsProps) {
  const [settings, setSettings] = useState<OcrSettings>({
    endpoint: '',
    apiKey: '',
    model: '',
    engine: 'llm' // 默认使用LLM引擎
  })
  const [translationSettings, setTranslationSettings] = useState<TranslationSettings>({
    endpoint: '',
    apiKey: '',
    model: ''
  })
  const [loading, setLoading] = useState(false)
  const [cacheClearing, setCacheClearing] = useState(false)

  useEffect(() => {
    if (isOpen) {
      loadSettings()
    }
  }, [isOpen])

  const loadSettings = async () => {
    try {
      const store = await Store.load('.settings.dat')
      const savedSettings = await store.get<OcrSettings>('ocr_settings')
      if (savedSettings) {
        // 确保引擎设置有默认值
        if (!savedSettings.engine) {
          savedSettings.engine = 'llm'
        }
        setSettings(savedSettings)
      }
      const savedTranslationSettings = await store.get<TranslationSettings>('translation_settings')
      if (savedTranslationSettings) {
        setTranslationSettings(savedTranslationSettings)
      }
    } catch (error) {
      console.error('Failed to load settings:', error)
    }
  }

  const saveSettings = async () => {
    setLoading(true)
    try {
      const store = await Store.load('.settings.dat')
      await store.set('ocr_settings', settings)
      await store.set('translation_settings', translationSettings)
      await store.save()
      onClose()
    } catch (error) {
      console.error('Failed to save settings:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleInputChange = (field: keyof OcrSettings, value: string) => {
    setSettings(prev => ({
      ...prev,
      [field]: value
    }))
  }

  const handleTranslationInputChange = (field: keyof TranslationSettings, value: string) => {
    setTranslationSettings(prev => ({
      ...prev,
      [field]: value
    }))
  }

  const clearFileCache = async () => {
    if (!fileMd5) return
    setCacheClearing(true)
    try {
      await cacheService.clearFileCache(fileMd5)
      alert('已清除当前文件的缓存')
    } catch (error) {
      console.error('Failed to clear file cache:', error)
      alert('清除缓存失败')
    } finally {
      setCacheClearing(false)
    }
  }

  const clearAllCache = async () => {
    setCacheClearing(true)
    try {
      await cacheService.clearAllCache()
      alert('已清除所有缓存')
    } catch (error) {
      console.error('Failed to clear all cache:', error)
      alert('清除缓存失败')
    } finally {
      setCacheClearing(false)
    }
  }

  if (!isOpen) return null

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000
    }}>
      <div style={{
        backgroundColor: 'white',
        padding: '24px',
        borderRadius: '8px',
        minWidth: '400px',
        maxWidth: '500px'
      }}>
        <h2 style={{ margin: '0 0 20px 0' }}>OCR 设置</h2>
        
        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', marginBottom: '4px', fontWeight: 'bold' }}>
            OCR 引擎:
          </label>
          <select
            value={settings.engine || 'llm'}
            onChange={(e) => handleInputChange('engine', e.target.value as 'llm' | 'system')}
            style={{
              width: '100%',
              padding: '8px',
              border: '1px solid #ddd',
              borderRadius: '4px'
            }}
          >
            <option value="llm">LLM 引擎</option>
            <option value="system">系统 OCR (仅 macOS)</option>
          </select>
        </div>

        {/* 只有在选择LLM引擎时才显示API设置 */}
        {settings.engine !== 'system' && (
          <>
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', marginBottom: '4px', fontWeight: 'bold' }}>
                API Endpoint:
              </label>
              <input
                type="text"
                value={settings.endpoint}
                onChange={(e) => handleInputChange('endpoint', e.target.value)}
                placeholder="https://api.openai.com/v1"
                style={{
                  width: '100%',
                  padding: '8px',
                  border: '1px solid #ddd',
                  borderRadius: '4px'
                }}
              />
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', marginBottom: '4px', fontWeight: 'bold' }}>
                API Key:
              </label>
              <input
                type="password"
                value={settings.apiKey}
                onChange={(e) => handleInputChange('apiKey', e.target.value)}
                placeholder="sk-..."
                style={{
                  width: '100%',
                  padding: '8px',
                  border: '1px solid #ddd',
                  borderRadius: '4px'
                }}
              />
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', marginBottom: '4px', fontWeight: 'bold' }}>
                Model:
              </label>
              <input
                type="text"
                value={settings.model}
                onChange={(e) => handleInputChange('model', e.target.value)}
                placeholder="gpt-4-vision-preview"
                style={{
                  width: '100%',
                  padding: '8px',
                  border: '1px solid #ddd',
                  borderRadius: '4px'
                }}
              />
            </div>
          </>
        )}

        <hr style={{ margin: '16px 0' }} />
        <h2 style={{ margin: '0 0 20px 0' }}>翻译 设置</h2>

        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', marginBottom: '4px', fontWeight: 'bold' }}>
            API Endpoint:
          </label>
          <input
            type="text"
            value={translationSettings.endpoint}
            onChange={(e) => handleTranslationInputChange('endpoint', e.target.value)}
            placeholder="https://api.openai.com/v1"
            style={{
              width: '100%',
              padding: '8px',
              border: '1px solid #ddd',
              borderRadius: '4px'
            }}
          />
        </div>

        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', marginBottom: '4px', fontWeight: 'bold' }}>
            API Key:
          </label>
          <input
            type="password"
            value={translationSettings.apiKey}
            onChange={(e) => handleTranslationInputChange('apiKey', e.target.value)}
            placeholder="sk-..."
            style={{
              width: '100%',
              padding: '8px',
              border: '1px solid #ddd',
              borderRadius: '4px'
            }}
          />
        </div>

        <div style={{ marginBottom: '20px' }}>
          <label style={{ display: 'block', marginBottom: '4px', fontWeight: 'bold' }}>
            Model:
          </label>
          <input
            type="text"
            value={translationSettings.model}
            onChange={(e) => handleTranslationInputChange('model', e.target.value)}
            placeholder="gpt-4o-mini"
            style={{
              width: '100%',
              padding: '8px',
              border: '1px solid #ddd',
              borderRadius: '4px'
            }}
          />
        </div>

        <hr style={{ margin: '16px 0' }} />
        <h2 style={{ margin: '0 0 20px 0' }}>缓存管理</h2>

        <div style={{ marginBottom: '20px' }}>
          <p style={{ marginBottom: '12px' }}>管理OCR和翻译结果的缓存：</p>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={clearFileCache}
              disabled={cacheClearing || !fileMd5}
              style={{
                padding: '8px 16px',
                border: '1px solid #ddd',
                borderRadius: '4px',
                backgroundColor: 'white',
                cursor: cacheClearing || !fileMd5 ? 'not-allowed' : 'pointer',
                opacity: cacheClearing || !fileMd5 ? 0.6 : 1
              }}
            >
              {cacheClearing ? '清除中...' : '清除本文件缓存'}
            </button>
            <button
              onClick={clearAllCache}
              disabled={cacheClearing}
              style={{
                padding: '8px 16px',
                border: '1px solid #ddd',
                borderRadius: '4px',
                backgroundColor: 'white',
                cursor: cacheClearing ? 'not-allowed' : 'pointer',
                opacity: cacheClearing ? 0.6 : 1
              }}
            >
              {cacheClearing ? '清除中...' : '清除所有缓存'}
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            style={{
              padding: '8px 16px',
              border: '1px solid #ddd',
              borderRadius: '4px',
              backgroundColor: 'white',
              cursor: 'pointer'
            }}
          >
            取消
          </button>
          <button
            onClick={saveSettings}
            disabled={loading}
            style={{
              padding: '8px 16px',
              border: 'none',
              borderRadius: '4px',
              backgroundColor: '#007bff',
              color: 'white',
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.6 : 1
            }}
          >
            {loading ? '保存中...' : '保存'}
          </button>
        </div>
      </div>
    </div>
  )
}

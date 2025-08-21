import { useState, useEffect } from 'react'
import { Store } from '@tauri-apps/plugin-store'
import { cacheService } from './cacheService'
import { OcrService } from './ocrService'

interface OcrSettings {
  endpoint: string
  apiKey: string
  model: string
  engine?: 'llm' | 'macos-system' // 添加引擎选择
  ocrLanguages?: string[] // 添加OCR语言设置
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
    engine: 'llm', // 默认使用LLM引擎
    ocrLanguages: [] // 默认不选择特定语言
  })
  const [translationSettings, setTranslationSettings] = useState<TranslationSettings>({
    endpoint: '',
    apiKey: '',
    model: ''
  })
  const [loading, setLoading] = useState(false)
  const [cacheClearing, setCacheClearing] = useState(false)
  const [supportedLanguages, setSupportedLanguages] = useState<string[]>([])
  const [loadingLanguages, setLoadingLanguages] = useState(false)

  useEffect(() => {
    if (isOpen) {
      loadSettings()
      // 如果选择了系统OCR引擎，加载支持的语言列表
      if (settings.engine === 'macos-system') {
        loadSupportedLanguages()
      }
    }
  }, [isOpen, settings.engine])

  const loadSettings = async () => {
    try {
      const store = await Store.load('.settings.dat')
      const savedSettings = await store.get<OcrSettings>('ocr_settings')
      if (savedSettings) {
        // 确保引擎设置有默认值
        if (!savedSettings.engine) {
          savedSettings.engine = 'llm'
        }
        // 确保语言设置有默认值
        if (!savedSettings.ocrLanguages) {
          savedSettings.ocrLanguages = []
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

  const loadSupportedLanguages = async () => {
    // 只在macOS上加载支持的语言列表
    if (settings.engine === 'macos-system') {
      setLoadingLanguages(true)
      try {
        const languages = await OcrService.getSupportedRecognitionLanguages()
        setSupportedLanguages(languages)
      } catch (error) {
        console.error('Failed to load supported languages:', error)
        setSupportedLanguages([])
      } finally {
        setLoadingLanguages(false)
      }
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

  const handleInputChange = (field: keyof OcrSettings, value: string | string[] | 'llm' | 'macos-system') => {
    setSettings(prev => ({
      ...prev,
      [field]: value
    }))
    
    // 如果切换到系统OCR引擎，加载支持的语言列表
    if (field === 'engine' && value === 'macos-system') {
      loadSupportedLanguages()
    }
  }

  const handleTranslationInputChange = (field: keyof TranslationSettings, value: string) => {
    setTranslationSettings(prev => ({
      ...prev,
      [field]: value
    }))
  }

  const handleLanguageChange = (language: string) => {
    const currentLanguages = settings.ocrLanguages || []
    let newLanguages: string[]
    
    if (currentLanguages.includes(language)) {
      // 如果已选择，则移除
      newLanguages = currentLanguages.filter(lang => lang !== language)
    } else {
      // 如果未选择，则添加
      newLanguages = [...currentLanguages, language]
    }
    
    setSettings(prev => ({
      ...prev,
      ocrLanguages: newLanguages
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
        maxWidth: '500px',
        maxHeight: '80vh',
        overflowY: 'auto'
      }}>
        <h2 style={{ margin: '0 0 20px 0' }}>OCR 设置</h2>
        
        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', marginBottom: '4px', fontWeight: 'bold' }}>
            OCR 引擎:
          </label>
          <select
            value={settings.engine || 'llm'}
            onChange={(e) => handleInputChange('engine', e.target.value as 'llm' | 'macos-system')}
            style={{
              width: '100%',
              padding: '8px',
              border: '1px solid #ddd',
              borderRadius: '4px'
            }}
          >
            <option value="llm">LLM 引擎</option>
            <option value="macos-system">系统 OCR (仅 macOS)</option>
          </select>
        </div>

        {/* 只有在选择LLM引擎时才显示API设置 */}
        {settings.engine !== 'macos-system' && (
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

        {/* 只有在选择系统OCR引擎时才显示语言选择 */}
        {settings.engine === 'macos-system' && (
          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', marginBottom: '4px', fontWeight: 'bold' }}>
              OCR 识别语言:
            </label>
            {loadingLanguages ? (
              <p>正在加载支持的语言列表...</p>
            ) : supportedLanguages.length > 0 ? (
              <div style={{ 
                display: 'grid', 
                gridTemplateColumns: 'repeat(3, 1fr)', 
                gap: '8px',
                maxHeight: '200px',
                overflowY: 'auto'
              }}>
                {supportedLanguages.map((language) => (
                  <label 
                    key={language} 
                    style={{ 
                      display: 'flex', 
                      alignItems: 'center',
                      fontSize: '14px'
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={settings.ocrLanguages?.includes(language) || false}
                      onChange={() => handleLanguageChange(language)}
                      style={{ 
                        marginRight: '8px' 
                      }}
                    />
                    {language}
                  </label>
                ))}
              </div>
            ) : (
              <p>无法加载支持的语言列表</p>
            )}
            <p style={{ fontSize: '12px', color: '#666', marginTop: '8px' }}>
              选择用于OCR识别的语言。如果不选择任何语言，将默认使用中文和英文。
            </p>
          </div>
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

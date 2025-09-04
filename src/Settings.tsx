import { useState, useEffect } from 'react'
import { Store } from '@tauri-apps/plugin-store'
import { cacheService } from './cacheService'
import { OcrService } from './ocrService'
import { TtsService } from './ttsService'
import './settings.css'

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

interface TtsSettings {
  engine: 'macos-system' | 'other'
  language?: string
  voice?: string
  autoTurnPage?: boolean // 添加自动翻页选项
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
  const [ttsSettings, setTtsSettings] = useState<TtsSettings>({
    engine: 'macos-system',
    language: 'zh-CN',
    voice: 'Ting-Ting',
    autoTurnPage: false // 默认关闭自动翻页
  })
  const [loading, setLoading] = useState(false)
  const [cacheClearing, setCacheClearing] = useState(false)
  const [supportedLanguages, setSupportedLanguages] = useState<string[]>([])
  const [loadingLanguages, setLoadingLanguages] = useState(false)
  const [supportedTtsLanguages, setSupportedTtsLanguages] = useState<string[]>([])
  const [ttsVoices, setTtsVoices] = useState<{ name: string; identifier: string }[]>([])
  const [loadingTtsLanguages, setLoadingTtsLanguages] = useState(false)
  const [loadingTtsVoices, setLoadingTtsVoices] = useState(false)

  useEffect(() => {
    if (isOpen) {
      loadSettings()
      loadTtsSettings()
    }
  }, [isOpen])

  // 当引擎设置改变时，加载相应的支持语言列表
  useEffect(() => {
    if (isOpen && settings.engine === 'macos-system') {
      loadSupportedLanguages()
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
        // 如果加载的设置是系统OCR引擎，加载支持的语言列表
        if (savedSettings.engine === 'macos-system') {
          loadSupportedLanguages()
        }
      }
      const savedTranslationSettings = await store.get<TranslationSettings>('translation_settings')
      if (savedTranslationSettings) {
        setTranslationSettings(savedTranslationSettings)
      }
    } catch (error) {
      console.error('Failed to load settings:', error)
    }
  }

  const loadTtsSettings = async () => {
    try {
      const store = await Store.load('.settings.dat')
      const savedTtsSettings = await store.get<TtsSettings>('tts_settings')
      if (savedTtsSettings) {
        setTtsSettings(savedTtsSettings)
        // 加载TTS语言和音色列表
        loadSupportedTtsLanguages()
        if (savedTtsSettings.language) {
          loadTtsVoicesForLanguage(savedTtsSettings.language)
        }
      } else {
        // 加载默认的TTS语言和音色列表
        loadSupportedTtsLanguages()
        loadTtsVoicesForLanguage('zh-CN')
      }
    } catch (error) {
      console.error('Failed to load TTS settings:', error)
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

  const loadSupportedTtsLanguages = async () => {
    setLoadingTtsLanguages(true)
    try {
      const languages = await TtsService.getSupportedLanguages()
      setSupportedTtsLanguages(languages)
    } catch (error) {
      console.error('Failed to load supported TTS languages:', error)
      setSupportedTtsLanguages([])
    } finally {
      setLoadingTtsLanguages(false)
    }
  }

  const loadTtsVoicesForLanguage = async (language: string) => {
    setLoadingTtsVoices(true)
    try {
      const voices = await TtsService.getVoicesForLanguage(language)
      setTtsVoices(voices)
    } catch (error) {
      console.error('Failed to load TTS voices for language:', error)
      setTtsVoices([])
    } finally {
      setLoadingTtsVoices(false)
    }
  }

  const saveSettings = async () => {
    setLoading(true)
    try {
      const store = await Store.load('.settings.dat')
      await store.set('ocr_settings', settings)
      await store.set('translation_settings', translationSettings)
      await store.set('tts_settings', ttsSettings)
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
    
    // 如果切换OCR引擎，加载对应的支持语言列表
    if (field === 'engine') {
      if (value === 'macos-system') {
        loadSupportedLanguages()
      } else {
        // 如果切换到LLM引擎，清空语言列表相关状态
        setSupportedLanguages([])
      }
    }
  }

  const handleTtsInputChange = (field: keyof TtsSettings, value: string | 'macos-system' | 'other' | boolean) => {
    setTtsSettings(prev => ({
      ...prev,
      [field]: value
    }))
    
    // 如果切换语言，加载对应的音色列表
    if (field === 'language') {
      loadTtsVoicesForLanguage(value as string)
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
    <div className="settings-modal">
      <div className="settings-container">
        <h2 className="settings-header">OCR 设置</h2>
        
        <div className="settings-section">
          <div className="form-group">
            <label>OCR 引擎:</label>
            <select
              value={settings.engine || 'llm'}
              onChange={(e) => handleInputChange('engine', e.target.value as 'llm' | 'macos-system')}
            >
              <option value="llm">LLM 引擎</option>
              <option value="macos-system">系统 OCR (仅 macOS)</option>
            </select>
          </div>

          {/* 只有在选择LLM引擎时才显示API设置 */}
          {settings.engine !== 'macos-system' && (
            <>
              <div className="form-group">
                <label>Endpoint:</label>
                <input
                  type="text"
                  value={settings.endpoint}
                  onChange={(e) => handleInputChange('endpoint', e.target.value)}
                  placeholder="https://api.openai.com/v1"
                />
              </div>

              <div className="form-group">
                <label>API Key:</label>
                <input
                  type="password"
                  value={settings.apiKey}
                  onChange={(e) => handleInputChange('apiKey', e.target.value)}
                  placeholder="sk-..."
                />
              </div>

              <div className="form-group">
                <label>Model:</label>
                <input
                  type="text"
                  value={settings.model}
                  onChange={(e) => handleInputChange('model', e.target.value)}
                  placeholder="gpt-4-vision-preview"
                />
              </div>
            </>
          )}

          {/* 只有在选择系统OCR引擎时才显示语言选择 */}
          {settings.engine === 'macos-system' && (
            <div className="settings-section">
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
                OCR 识别语言:
              </label>
              {loadingLanguages ? (
                <p className="loading-text">正在加载支持的语言列表...</p>
              ) : supportedLanguages.length > 0 ? (
                <div className="checkbox-group">
                  {supportedLanguages.map((language) => (
                    <label key={language} className="checkbox-item">
                      <input
                        type="checkbox"
                        checked={settings.ocrLanguages?.includes(language) || false}
                        onChange={() => handleLanguageChange(language)}
                      />
                      {language}
                    </label>
                  ))}
                </div>
              ) : (
                <p>无法加载支持的语言列表</p>
              )}
              <p className="language-note">
                选择用于OCR识别的语言。如果不选择任何语言，将默认使用中文和英文。
              </p>
            </div>
          )}
        </div>

        <hr className="settings-divider" />
        <h2 className="settings-header">翻译 设置</h2>
        
        <div className="settings-section">
          <div className="form-group">
            <label>Endpoint:</label>
            <input
              type="text"
              value={translationSettings.endpoint}
              onChange={(e) => handleTranslationInputChange('endpoint', e.target.value)}
              placeholder="https://api.openai.com/v1"
            />
          </div>

          <div className="form-group">
            <label>API Key:</label>
            <input
              type="password"
              value={translationSettings.apiKey}
              onChange={(e) => handleTranslationInputChange('apiKey', e.target.value)}
              placeholder="sk-..."
            />
          </div>

          <div className="form-group">
            <label>Model:</label>
            <input
              type="text"
              value={translationSettings.model}
              onChange={(e) => handleTranslationInputChange('model', e.target.value)}
              placeholder="gpt-4o-mini"
            />
          </div>
        </div>

        <hr className="settings-divider" />
        <h2 className="settings-header">朗读(TTS) 设置</h2>
        
        <div className="settings-section">
          <div className="form-group">
            <label>TTS 引擎:</label>
            <select
              value={ttsSettings.engine || 'macos-system'}
              onChange={(e) => handleTtsInputChange('engine', e.target.value as 'macos-system' | 'other')}
            >
              <option value="macos-system">系统 TTS (仅 macOS)</option>
              <option value="other">其他</option>
            </select>
          </div>

          {/* 只有在选择系统TTS引擎时才显示语言和音色选择 */}
          {ttsSettings.engine === 'macos-system' && (
            <>
              <div className="form-group">
                <label>语言:</label>
                {loadingTtsLanguages ? (
                  <p className="loading-text">正在加载支持的语言列表...</p>
                ) : (
                  <select
                    value={ttsSettings.language || 'zh-CN'}
                    onChange={(e) => handleTtsInputChange('language', e.target.value)}
                  >
                    {supportedTtsLanguages.map((language) => (
                      <option key={language} value={language}>
                        {language}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div className="form-group">
                <label>音色:</label>
                {loadingTtsVoices ? (
                  <p className="loading-text">正在加载音色列表...</p>
                ) : (
                  <select
                    value={ttsSettings.voice || ''}
                    onChange={(e) => handleTtsInputChange('voice', e.target.value)}
                  >
                    <option value="">默认音色</option>
                    {ttsVoices.map((voice) => (
                      <option key={voice.identifier} value={voice.identifier}>
                        {voice.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </>
          )}
          
          {/* 自动翻页选项 */}
          <div className="form-group">
            <label>
              读完自动翻页：
            </label>
            <input
                type="checkbox"
                className="compact-checkbox"
                checked={ttsSettings.autoTurnPage || false}
                onChange={(e) => handleTtsInputChange('autoTurnPage', e.target.checked)}
              />
            <p className="setting-description">
              开启后，当前页朗读完成后会自动翻到下一页，并在OCR和翻译（如果启用）完成后继续朗读，直到整本书读完。
            </p>
          </div>
        </div>
        
        <div className="settings-section">
          <hr className="settings-divider" />
          <h2 className="settings-header">管理OCR和翻译结果的缓存：</h2>
          <div className="cache-buttons">
            <button
              className="btn"
              onClick={clearFileCache}
              disabled={cacheClearing || !fileMd5}
            >
              {cacheClearing ? '清除中...' : '清除本文件缓存'}
            </button>
            <button
              className="btn"
              onClick={clearAllCache}
              disabled={cacheClearing}
            >
              {cacheClearing ? '清除中...' : '清除所有缓存'}
            </button>
          </div>
        </div>

        <div className="action-buttons">
          <button className="btn" onClick={onClose}>
            取消
          </button>
          <button 
            className="btn btn-primary" 
            onClick={saveSettings}
            disabled={loading}
          >
            {loading ? '保存中...' : '保存'}
          </button>
        </div>
      </div>
    </div>
  )
}

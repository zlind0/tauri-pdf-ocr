import { invoke } from '@tauri-apps/api/core'
import { Store } from '@tauri-apps/plugin-store'
import { listen } from '@tauri-apps/api/event'

interface TtsSettings {
  engine: 'macos-system' | 'other'
  language?: string
  voice?: string
}

export class TtsService {
  private static isSpeaking = false
  private static currentProcessId: string | null = null
  private static speakingStatusCallbacks: Array<(isSpeaking: boolean) => void> = []
  private static autoTurnPageCallback: (() => void) | null = null

  static async getSettings(): Promise<TtsSettings> {
    const store = await Store.load('.settings.dat')
    const settings = await store.get<TtsSettings>('tts_settings')
    if (!settings) {
      // 默认使用macOS系统TTS引擎
      return {
        engine: 'macos-system',
        language: 'zh-CN',
        voice: 'Ting-Ting'
      }
    }
    return settings
  }

  static async saveSettings(settings: TtsSettings): Promise<void> {
    const store = await Store.load('.settings.dat')
    await store.set('tts_settings', settings)
    await store.save()
  }

  // 添加监听TTS完成事件
  static async initialize() {
    // 监听TTS完成事件
    await listen<string>('tts-finished', (event) => {
      // 检查完成的进程是否是当前正在朗读的进程
      if (this.currentProcessId === event.payload) {
        this.isSpeaking = false
        this.currentProcessId = null
        // 通知所有回调函数
        this.speakingStatusCallbacks.forEach(callback => callback(false))
        
        // 如果设置了自动翻页回调函数，调用它
        if (this.autoTurnPageCallback) {
          this.autoTurnPageCallback()
        }
      }
    })
  }

  // 添加回调函数用于监听朗读状态变化
  static onSpeakingStatusChange(callback: (isSpeaking: boolean) => void) {
    this.speakingStatusCallbacks.push(callback)
  }

  // 设置自动翻页回调函数
  static setAutoTurnPageCallback(callback: () => void) {
    this.autoTurnPageCallback = callback
  }

  // 移除回调函数
  static offSpeakingStatusChange(callback: (isSpeaking: boolean) => void) {
    const index = this.speakingStatusCallbacks.indexOf(callback)
    if (index !== -1) {
      this.speakingStatusCallbacks.splice(index, 1)
    }
  }

  static async getSupportedLanguages(): Promise<string[]> {
    try {
      const result: { languages: string[]; success: boolean; error_message?: string } = 
        await invoke('get_supported_tts_languages')
      
      if (result.success) {
        return result.languages
      } else {
        throw new Error(result.error_message || '获取支持的语言列表失败')
      }
    } catch (error) {
      console.error('获取支持的语言列表失败:', error)
      // 返回默认语言列表
      return ['zh-CN', 'en-US', 'ja-JP', 'ko-KR']
    }
  }

  static async getVoicesForLanguage(language: string): Promise<{ name: string; identifier: string }[]> {
    try {
      const result: { voices: { name: string; identifier: string }[]; success: boolean; error_message?: string } = 
        await invoke('get_voices_for_language', { language })
      
      if (result.success) {
        return result.voices
      } else {
        throw new Error(result.error_message || '获取语言的音色列表失败')
      }
    } catch (error) {
      console.error('获取语言的音色列表失败:', error)
      // 返回默认音色列表
      if (language === 'zh-CN') {
        return [
          { name: ' Ting-Ting', identifier: 'Tingting' }
        ]
      } else if (language === 'en-US') {
        return [
          { name: 'Samantha', identifier: 'Samantha' }
        ]
      }
      return []
    }
  }

  static async speak(text: string): Promise<void> {
    if (this.isSpeaking) {
      await this.stop()
    }

    const settings = await this.getSettings()
    
    if (settings.engine === 'macos-system') {
      try {
        console.log("Speak Text", settings.voice, text)
        const result: { success: boolean; process_id?: string; error_message?: string } = 
          await invoke('speak_text', { 
            text, 
            voice: settings.voice 
          })
        
        if (result.success && result.process_id) {
          this.isSpeaking = true
          this.currentProcessId = result.process_id
        } else {
          throw new Error(result.error_message || '朗读失败')
        }
      } catch (error) {
        console.error('朗读失败:', error)
        throw error
      }
    } else {
      throw new Error('当前选择的TTS引擎不支持')
    }
  }

  static async stop(): Promise<void> {
    if (!this.isSpeaking) return

    if (this.currentProcessId) {
      try {
        await invoke('stop_speaking', { processId: this.currentProcessId })
        this.isSpeaking = false
        this.currentProcessId = null
      } catch (error) {
        console.error('停止朗读失败:', error)
      }
    }
  }
}
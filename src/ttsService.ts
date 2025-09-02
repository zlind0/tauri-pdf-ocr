import { invoke } from '@tauri-apps/api/core'
import { Store } from '@tauri-apps/plugin-store'

interface TtsSettings {
  engine: 'macos-system' | 'other'
  language?: string
  voice?: string
}

export class TtsService {
  private static isSpeaking = false
  private static currentProcessId: string | null = null

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

  static isCurrentlySpeaking(): boolean {
    return this.isSpeaking
  }
}
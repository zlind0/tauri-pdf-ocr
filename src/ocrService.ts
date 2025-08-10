import { Store } from '@tauri-apps/plugin-store'
import { fetch } from '@tauri-apps/plugin-http'
import { invoke } from '@tauri-apps/api/core'

interface OcrSettings {
  endpoint: string
  apiKey: string
  model: string
  engine: 'llm' | 'system' // 添加引擎选择
  ocrLanguages?: string[] // 添加OCR语言设置
}

export class OcrService {
  private static currentAbortController: AbortController | null = null

  private static async getSettings(): Promise<OcrSettings> {
    const store = await Store.load('.settings.dat')
    const settings = await store.get<OcrSettings>('ocr_settings')
    if (!settings || (settings.engine=="llm" && (!settings.endpoint || !settings.apiKey || !settings.model))) {
      throw new Error('请先配置OCR设置')
    }
    // 默认使用LLM引擎
    if (!settings.engine) {
      settings.engine = 'llm'
    }
    return settings
  }

  static async extractTextFromImage(imageDataUrl: string): Promise<string> {
    // 取消之前的请求
    if (this.currentAbortController) {
      this.currentAbortController.abort()
    }

    // 创建新的AbortController
    this.currentAbortController = new AbortController()
    const abortController = this.currentAbortController // 保存引用
    
    try {
      const settings = await this.getSettings()
      
      // 根据选择的引擎执行不同的OCR方法
      if (settings.engine === 'system') {
        // 使用系统OCR引擎 (仅macOS)
        return await this.extractTextWithSystemOcr(imageDataUrl, settings.ocrLanguages)
      } else {
        // 使用默认的LLM引擎
        return await this.extractTextWithLlm(imageDataUrl, settings, abortController)
      }
    } catch (error: any) {
      // 如果是取消请求导致的错误，不抛出错误
      if (error.name === 'AbortError') {
        console.log('OCR请求已被取消')
        return ''
      }
      console.error('OCR提取失败:', error)
      throw error
    } finally {
      // 只有当这个AbortController仍然是当前活动的控制器时才清理
      if (this.currentAbortController === abortController) {
        this.currentAbortController = null
      }
    }
  }

  private static async extractTextWithLlm(
    imageDataUrl: string, 
    settings: OcrSettings, 
    abortController: AbortController
  ): Promise<string> {
    // Convert data URL to base64
    const base64Data = imageDataUrl.split(',')[1]
    
    const response = await fetch(`${settings.endpoint}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${settings.apiKey}`
      },
      body: JSON.stringify({
        model: settings.model,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: '请提取这张图片中的所有文字内容，保持原有的格式和结构。' },
              { type: 'image_url', image_url: { url: `data:image/png;base64,${base64Data}` } } 
            ]
          }
        ],
        max_tokens: 4096
      }),
      signal: abortController.signal
    })

    if (!response.ok) {
      throw new Error(`API请求失败: ${response.status}`)
    }

    const data = await response.json()
    return data.choices[0]?.message?.content || '无法提取文字'
  }

  private static async extractTextWithSystemOcr(imageDataUrl: string, languages?: string[]): Promise<string> {
    // Convert data URL to base64 (去掉data:image/png;base64,前缀)
    const base64Data = imageDataUrl.split(',')[1]
    
    try {
      // 调用Rust命令执行系统OCR
      const result: { text: string; success: boolean; error_message?: string } = 
        await invoke('extract_text_with_system_ocr', {
          request: {
            image_data: base64Data,
            languages: languages
          }
        })
      
      if (result.success) {
        return result.text
      } else {
        throw new Error(result.error_message || '系统OCR失败')
      }
    } catch (error) {
      console.error('系统OCR调用失败:', error)
      throw new Error(`系统OCR调用失败: ${error}`)
    }
  }
  
  // 获取系统支持的OCR语言
  static async getSupportedRecognitionLanguages(): Promise<string[]> {
    try {
      const result: { languages: string[]; success: boolean; error_message?: string } = 
        await invoke('get_supported_recognition_languages')
      
      if (result.success) {
        return result.languages
      } else {
        throw new Error(result.error_message || '获取支持的语言列表失败')
      }
    } catch (error) {
      console.error('获取支持的语言列表失败:', error)
      throw new Error(`获取支持的语言列表失败: ${error}`)
    }
  }
}
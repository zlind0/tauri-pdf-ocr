import { Store } from '@tauri-apps/plugin-store'
import { fetch } from '@tauri-apps/plugin-http'

interface OcrSettings {
  endpoint: string
  apiKey: string
  model: string
}

interface OcrResponse {
  choices: Array<{
    message: {
      content: string
    }
  }>
}

export class OcrService {
  private static async getSettings(): Promise<OcrSettings> {
    const store = await Store.load('.settings.dat')
    const settings = await store.get<OcrSettings>('ocr_settings')
    if (!settings || !settings.endpoint || !settings.apiKey || !settings.model) {
      throw new Error('请先配置OCR设置')
    }
    return settings
  }

  static async extractTextFromImage(imageDataUrl: string): Promise<string> {
    try {
      const settings = await this.getSettings()
      
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
        })
      })

      if (!response.ok) {
        throw new Error(`API请求失败: ${response.status}`)
      }

      const data = await response.json()
      return data.choices[0]?.message?.content || '无法提取文字'
    } catch (error) {
      console.error('OCR提取失败:', error)
      throw error
    }
  }
}

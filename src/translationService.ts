import { Store } from '@tauri-apps/plugin-store'
import { fetch } from '@tauri-apps/plugin-http'

interface TranslationSettings {
  endpoint: string
  apiKey: string
  model: string
}

interface ChatCompletionResponse {
  choices: Array<{
    message: {
      content: string
    }
  }>
}

export class TranslationService {
  private static currentAbortController: AbortController | null = null

  private static stripThinkTags(text: string): string {
    if (!text) return text
    // Remove blocks like <think> ... </think> (multiline, case-insensitive)
    let cleaned = text.replace(/<think>[\s\S]*?<\/think>/gi, '')
    // Remove any stray opening/closing tags
    cleaned = cleaned.replace(/<\/?think>/gi, '')
    return cleaned.trim()
  }

  private static async getSettings(): Promise<TranslationSettings> {
    const store = await Store.load('.settings.dat')
    const settings = await store.get<TranslationSettings>('translation_settings')
    if (!settings || !settings.endpoint || !settings.apiKey || !settings.model) {
      throw new Error('请先配置翻译设置')
    }
    return settings
  }

  static async translate(text: string, targetLanguage = '简体中文'): Promise<string> {
    if (this.currentAbortController) {
      this.currentAbortController.abort()
    }

    this.currentAbortController = new AbortController()
    const abortController = this.currentAbortController

    try {
      const settings = await this.getSettings()

      const systemPrompt = `你是一个高质量的专业翻译助手。请将用户提供的文本精准翻译为${targetLanguage}，保留原意与语气，保持段落与列表结构。尽可能使得译文适合普通${targetLanguage}读者的语言习惯。仅输出译文，不要思考。/nothink`

      const response = await fetch(`${settings.endpoint}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${settings.apiKey}`
        },
        body: JSON.stringify({
          model: settings.model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: systemPrompt+"\n===\n"+text }
          ],
          max_tokens: 4096
        }),
        signal: abortController.signal
      })

      if (!response.ok) {
        throw new Error(`翻译API请求失败: ${response.status}`)
      }

      const data = await response.json() as ChatCompletionResponse
      const raw = data.choices[0]?.message?.content || ''
      const cleaned = TranslationService.stripThinkTags(raw)
      return cleaned || '无法翻译'
    } catch (error: any) {
      if (error.name === 'AbortError') {
        console.log('翻译请求已被取消')
        return ''
      }
      console.error('翻译失败:', error)
      throw error
    } finally {
      if (this.currentAbortController === abortController) {
        this.currentAbortController = null
      }
    }
  }
}



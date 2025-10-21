import { Store } from '@tauri-apps/plugin-store'
import { fetch } from '@tauri-apps/plugin-http'

interface TranslationSettings {
  endpoint: string
  apiKey: string
  model: string
}

export class TranslationService {
  private static currentAbortController: AbortController | null = null

  private static stripThinkTags(text: string): string {
    if (!text) return text
    let cleaned = text.replace(/<think>[\s\S]*?<\/think>/gi, '')
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

  static async translateStream(text: string, targetLanguage = '简体中文', onChunk: (chunk: string) => void): Promise<string> {
    console.log("TranslationStream:", text)
    if (this.currentAbortController) {
      this.currentAbortController.abort()
    }

    const abortController = this.currentAbortController = new AbortController()

    try {
      const settings = await this.getSettings()

      const systemPrompt = `你是一个高质量的专业翻译助手。请将用户提供的文本精准翻译为${targetLanguage}，保留原意与语气，保持段落与列表结构。尽可能使得译文适合普通${targetLanguage}读者的语言习惯。仅输出译文，不要思考。/nothink`

      const response = await fetch(`${settings.endpoint}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${settings.apiKey}`,
          'Accept': 'text/event-stream'
        },
        body: JSON.stringify({
          model: settings.model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: systemPrompt + "\n===\n" + text }
          ],
          max_tokens: 4096,
          stream: true
        }),
        signal: abortController.signal
      })

      console.log('STOP THIS FUCK YOU!')
      abortController.abort("fuck")

      debugger

      return ''

      if (!response.ok) {
        throw new Error(`翻译API请求失败: ${response.status}`)
      }

      if (!response.body) {
        throw new Error('响应中没有数据流')
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder("utf-8")
      let done = false
      let accumulatedData = ''
      let fullResponse = ''

      const abortPromise = new Promise<never>((resolve, reject) => {
        abortController.signal.addEventListener('abort', async () => {
          const reason = abortController.signal.reason
          await reader.cancel(reason)
          reject(reason)
        })
      })

      while (!done) {
        const { value, done: readerDone } = await Promise.race<[
          Promise<never>,
          Promise<ReadableStreamReadResult<Uint8Array<ArrayBuffer>>>,
        ]>([abortPromise, reader.read()])
        done = readerDone

        if (abortController.signal.aborted) {
          reader.cancel()
          throw new Error('Request canceled')
        }

        if (value) {
          const chunk = decoder.decode(value, { stream: true })
          accumulatedData += chunk

          // 按行分割数据
          const lines = accumulatedData.split('\n')
          accumulatedData = lines.pop() || '' // 保留不完整的最后一行

          for (const line of lines) {
            if (line.startsWith('data:')) {
              const data = line.slice(5).trim() // 去掉 'data:' 前缀
              if (data === '[DONE]') {
                done = true
                break
              }
              try {
                const parsed = JSON.parse(data)
                const content = parsed.choices[0]?.delta?.content || ''
                if (content) {
                  fullResponse += content
                  // 实时回调更新UI
                  onChunk(content)
                }
              } catch (e) {
                // 忽略解析错误，继续处理下一个数据块
              }
            }
          }
        }
      }

      const cleaned = TranslationService.stripThinkTags(fullResponse)
      return cleaned || '无法翻译'
    } catch (error: any) {
      if (error.name === 'AbortError' || error.message === 'Request canceled') {
        console.log('翻译请求已被取消')
        throw new Error('Request canceled')
      }
      console.error('翻译失败:', error)
      throw error
    } finally {
      if (this.currentAbortController === abortController) {
        this.currentAbortController = null
      }
      console.log("TranslationStream finished.")
    }
  }
}



import { Store } from '@tauri-apps/plugin-store'

// 缓存条目类型定义
interface CacheEntry {
  ocrText?: string
  translatedText?: string
  timestamp: number
}

// 缓存配置
interface CacheConfig {
  maxSize: number // 最大大小（字节）
}

class CacheService {
  private store: Store | null = null
  private isInitialized = false
  private config: CacheConfig = { maxSize: 10 * 1024 * 1024 } // 默认10MB

  async initialize() {
    if (this.isInitialized) return
    
    try {
      this.store = await Store.load('.cache.dat')
      this.isInitialized = true
    } catch (error) {
      console.error('Failed to initialize cache service:', error)
      this.isInitialized = false
    }
  }

  private generateKey(fileMd5: string, pageNumber: number): string {
    return `cache_${fileMd5}_${pageNumber}`
  }

  private async getCurrentCacheSize(): Promise<number> {
    if (!this.store) return 0
    
    try {
      let totalSize = 0
      const keys = await this.store.keys()
      
      for (const key of keys) {
        if (key.startsWith('cache_')) {
          const entry = await this.store.get<CacheEntry>(key)
          if (entry) {
            totalSize += key.length
            totalSize += entry.ocrText ? entry.ocrText.length : 0
            totalSize += entry.translatedText ? entry.translatedText.length : 0
            totalSize += 8 // timestamp
          }
        }
      }
      
      return totalSize
    } catch (error) {
      console.error('Failed to calculate cache size:', error)
      return 0
    }
  }

  private async enforceSizeLimit(): Promise<void> {
    if (!this.store) return
    
    try {
      let currentSize = await this.getCurrentCacheSize()
      
      // 如果当前大小超过了限制
      if (currentSize > this.config.maxSize) {
        // 获取所有缓存条目并按时间戳排序
        const entries: { key: string; timestamp: number }[] = []
        const keys = await this.store.keys()
        
        for (const key of keys) {
          if (key.startsWith('cache_')) {
            const entry = await this.store.get<CacheEntry>(key)
            if (entry) {
              entries.push({ key, timestamp: entry.timestamp })
            }
          }
        }
        
        // 按时间戳排序（最老的在前面）
        entries.sort((a, b) => a.timestamp - b.timestamp)
        
        // 删除最老的条目直到大小在限制内
        for (const entry of entries) {
          if (currentSize <= this.config.maxSize) break
          
          const item = await this.store.get<CacheEntry>(entry.key)
          if (item) {
            // 计算要删除的大小
            let itemSize = entry.key.length
            itemSize += item.ocrText ? item.ocrText.length : 0
            itemSize += item.translatedText ? item.translatedText.length : 0
            itemSize += 8 // timestamp
            
            await this.store.delete(entry.key)
            currentSize -= itemSize
          }
        }
        
        await this.store.save()
      }
    } catch (error) {
      console.error('Failed to enforce cache size limit:', error)
    }
  }

  async getOcrText(fileMd5: string, pageNumber: number): Promise<string | null> {
    await this.initialize()
    if (!this.store) return null

    try {
      const key = this.generateKey(fileMd5, pageNumber)
      const entry = await this.store.get<CacheEntry>(key)
      return entry?.ocrText || null
    } catch (error) {
      console.error('Failed to get OCR text from cache:', error)
      return null
    }
  }

  async getTranslatedText(fileMd5: string, pageNumber: number): Promise<string | null> {
    await this.initialize()
    if (!this.store) return null

    try {
      const key = this.generateKey(fileMd5, pageNumber)
      const entry = await this.store.get<CacheEntry>(key)
      return entry?.translatedText || null
    } catch (error) {
      console.error('Failed to get translated text from cache:', error)
      return null
    }
  }

  async saveOcrText(fileMd5: string, pageNumber: number, text: string): Promise<void> {
    await this.initialize()
    if (!this.store) return

    try {
      const key = this.generateKey(fileMd5, pageNumber)
      const existingEntry = await this.store.get<CacheEntry>(key) || { timestamp: Date.now() }
      const newEntry: CacheEntry = {
        ...existingEntry,
        ocrText: text,
        timestamp: Date.now()
      }
      await this.store.set(key, newEntry)
      await this.store.save()
      
      // 检查并强制执行大小限制
      await this.enforceSizeLimit()
    } catch (error) {
      console.error('Failed to save OCR text to cache:', error)
    }
  }

  async saveTranslatedText(fileMd5: string, pageNumber: number, text: string): Promise<void> {
    await this.initialize()
    if (!this.store) return

    try {
      const key = this.generateKey(fileMd5, pageNumber)
      const existingEntry = await this.store.get<CacheEntry>(key) || { timestamp: Date.now() }
      const newEntry: CacheEntry = {
        ...existingEntry,
        translatedText: text,
        timestamp: Date.now()
      }
      await this.store.set(key, newEntry)
      await this.store.save()
      
      // 检查并强制执行大小限制
      await this.enforceSizeLimit()
    } catch (error) {
      console.error('Failed to save translated text to cache:', error)
    }
  }

  async clearFileCache(fileMd5: string): Promise<void> {
    await this.initialize()
    if (!this.store) return

    try {
      const keys = await this.store.keys()
      for (const key of keys) {
        if (key.startsWith(`cache_${fileMd5}_`)) {
          await this.store.delete(key)
        }
      }
      await this.store.save()
    } catch (error) {
      console.error('Failed to clear file cache:', error)
    }
  }

  async clearAllCache(): Promise<void> {
    await this.initialize()
    if (!this.store) return

    try {
      const keys = await this.store.keys()
      for (const key of keys) {
        if (key.startsWith('cache_')) {
          await this.store.delete(key)
        }
      }
      await this.store.save()
    } catch (error) {
      console.error('Failed to clear all cache:', error)
    }
  }

  // 设置缓存大小限制
  setMaxSize(maxSize: number): void {
    this.config.maxSize = maxSize
  }
}

export const cacheService = new CacheService()
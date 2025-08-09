import { readFile } from '@tauri-apps/plugin-fs'
import { getDocument } from 'pdfjs-dist'

export interface ProcessedOutlineItem {
  title: string
  dest?: any
  items?: ProcessedOutlineItem[]
  pageNumber?: number
  bold?: boolean
  italic?: boolean
}

/**
 * 加载PDF文档
 * @param filePath PDF文件路径
 * @returns PDF文档代理对象和处理后的目录数据
 */
export const loadPdfDocument = async (filePath: string) => {
  try {
    const data = await readFile(filePath)
    const pdfDoc = await getDocument({ data }).promise
    return pdfDoc
  } catch (error) {
    throw new Error(`Failed to load PDF: ${error}`)
  }
}

/**
 * 处理PDF目录数据，解析页码
 * @param pdfDoc PDF文档代理对象
 * @returns 处理后的目录数据
 */
export const processPdfOutline = async (pdfDoc: import('pdfjs-dist').PDFDocumentProxy) => {
  try {
    const outlineData = await pdfDoc.getOutline()
    
    if (!outlineData) {
      return null
    }
    
    // 递归处理目录项
    const processOutlineItems = async (items: any[]): Promise<ProcessedOutlineItem[]> => {
      const processedItems: ProcessedOutlineItem[] = []
      
      for (const item of items) {
        const processedItem: ProcessedOutlineItem = {
          title: item.title,
          dest: item.dest,
          bold: item.bold,
          italic: item.italic
        }
        
        // 解析页码
        if (item.dest) {
          try {
            let pageNum = 1
            if (typeof item.dest === 'string') {
              // 如果dest是字符串，获取目标信息
              const destInfo = await pdfDoc.getDestination(item.dest)
              if (destInfo && destInfo[0]) {
                const ref = destInfo[0]
                const page = await pdfDoc.getPageIndex(ref)
                pageNum = page + 1
              }
            } else if (Array.isArray(item.dest) && item.dest[0]) {
              // 如果dest是数组，直接获取页面索引
              const ref = item.dest[0]
              const page = await pdfDoc.getPageIndex(ref)
              pageNum = page + 1
            }
            processedItem.pageNumber = pageNum
          } catch (e) {
            console.error('Failed to get page number for outline item:', e)
            processedItem.pageNumber = null
          }
        }
        
        // 递归处理子项
        if (item.items && item.items.length > 0) {
          processedItem.items = await processOutlineItems(item.items)
        }
        
        processedItems.push(processedItem)
      }
      
      return processedItems
    }
    
    return await processOutlineItems(outlineData)
  } catch (error) {
    console.error('Failed to process PDF outline:', error)
    return null
  }
}
import { Store } from '@tauri-apps/plugin-store'

export interface AppState {
  filePath: string | null
  pageNumber: number
  showTextExtraction: boolean
  splitPosition: number
  textPanelFontFamily: string
  textPanelFontSize: number
}

const DEFAULT_STATE: AppState = {
  filePath: null,
  pageNumber: 1,
  showTextExtraction: false,
  splitPosition: 50,
  textPanelFontFamily: 'serif',
  textPanelFontSize: 18
}

class StateManager {
  private store: Store | null = null
  private isInitialized = false

  async initialize() {
    if (this.isInitialized) return
    
    try {
      this.store = await Store.load('.app-state.dat')
      this.isInitialized = true
    } catch (error) {
      console.error('Failed to initialize state manager:', error)
      this.isInitialized = false
    }
  }

  async loadState(): Promise<AppState> {
    await this.initialize()
    
    if (!this.store) {
      return { ...DEFAULT_STATE }
    }

    try {
      const savedState = await this.store.get<AppState>('app_state')
      if (savedState) {
        return {
          ...DEFAULT_STATE,
          ...savedState
        }
      }
    } catch (error) {
      console.error('Failed to load app state:', error)
    }

    return { ...DEFAULT_STATE }
  }

  async saveState(state: Partial<AppState>) {
    await this.initialize()
    
    if (!this.store) {
      console.error('Store not initialized')
      return
    }

    try {
      const currentState = await this.loadState()
      const newState = { ...currentState, ...state }
      
      await this.store.set('app_state', newState)
      await this.store.save()
    } catch (error) {
      console.error('Failed to save app state:', error)
    }
  }

  async clearState() {
    await this.initialize()
    
    if (!this.store) {
      console.error('Store not initialized')
      return
    }

    try {
      await this.store.delete('app_state')
      await this.store.save()
    } catch (error) {
      console.error('Failed to clear app state:', error)
    }
  }
}

export const stateManager = new StateManager()

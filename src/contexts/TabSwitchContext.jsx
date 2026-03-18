/**
 * 全局 Tab 切换上下文，供模块四「机甲模拟训练」引导用户跳转到视觉/音频模块。
 */
import { createContext, useContext } from 'react'

const TabSwitchContext = createContext(null)

export function TabSwitchProvider({ children, switchToTab }) {
  return (
    <TabSwitchContext.Provider value={{ switchToTab }}>
      {children}
    </TabSwitchContext.Provider>
  )
}

export function useTabSwitch() {
  return useContext(TabSwitchContext)
}

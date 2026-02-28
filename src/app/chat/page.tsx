'use client'

import { useState } from 'react'
import { Header } from '@/components/layout/header'
import { ChatContainer } from '@/components/chat/chat-container'
import { DebugPanel } from '@/components/chat/debug-panel'
import type { RetrievalDebugInfo } from '@/types'

export default function ChatPage() {
  const [debugMode, setDebugMode] = useState(false)
  const [lastDebugInfo, setLastDebugInfo] = useState<RetrievalDebugInfo | null>(null)

  return (
    <div className="h-screen flex flex-col bg-background">
      <Header
        debugMode={debugMode}
        onToggleDebug={() => setDebugMode((d) => !d)}
      />

      {/* Main content area — shifts left when debug panel is open */}
      <div
        className="flex-1 overflow-hidden flex flex-col mt-14 transition-all duration-300"
        style={{ marginRight: debugMode ? '320px' : '0' }}
      >
        <ChatContainer
          onDebugInfo={setLastDebugInfo}
          debugMode={debugMode}
        />
      </div>

      {/* Debug panel */}
      <DebugPanel debugInfo={lastDebugInfo} visible={debugMode} />
    </div>
  )
}

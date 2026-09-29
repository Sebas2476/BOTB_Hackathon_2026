import { useState } from 'react'

// Shared hover tooltip: spread `bind(content)` onto any element.
export function useTooltip() {
  const [tip, setTip] = useState(null)
  const bind = (content) => ({
    onMouseMove: (e) => setTip({ x: e.clientX, y: e.clientY, content }),
    onMouseLeave: () => setTip(null),
  })
  const node = tip && (
    <div
      className="tooltip"
      style={{
        left: Math.min(tip.x + 14, window.innerWidth - 300),
        top: tip.y + 14,
      }}
    >
      {tip.content}
    </div>
  )
  return { bind, node }
}

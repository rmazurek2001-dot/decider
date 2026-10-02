import { memo } from 'react'

interface SectionBackgroundProps {
  section: string
  nodes: Array<{ x: number; y: number; width: number; height: number }>
}

const getSectionStyle = (section: string) => {
  const styles: Record<string, { bg: string; border: string }> = {
    transport: { bg: 'rgba(219, 234, 254, 0.3)', border: 'rgba(59, 130, 246, 0.2)' },
    accommodation: { bg: 'rgba(243, 232, 255, 0.3)', border: 'rgba(168, 85, 247, 0.2)' },
    food: { bg: 'rgba(254, 243, 199, 0.3)', border: 'rgba(251, 146, 60, 0.2)' },
    entertainment: { bg: 'rgba(252, 231, 243, 0.3)', border: 'rgba(236, 72, 153, 0.2)' },
    activities: { bg: 'rgba(220, 252, 231, 0.3)', border: 'rgba(34, 197, 94, 0.2)' },
    services: { bg: 'rgba(224, 231, 255, 0.3)', border: 'rgba(99, 102, 241, 0.2)' },
    equipment: { bg: 'rgba(241, 245, 249, 0.3)', border: 'rgba(100, 116, 139, 0.2)' },
    other: { bg: 'rgba(254, 252, 232, 0.3)', border: 'rgba(234, 179, 8, 0.2)' },
    general: { bg: 'rgba(248, 250, 252, 0.3)', border: 'rgba(148, 163, 184, 0.2)' },
  }
  return styles[section] || styles.general
}

const SectionBackground = ({ section, nodes }: SectionBackgroundProps) => {
  if (nodes.length === 0) return null

  const minX = Math.min(...nodes.map(n => n.x)) - 40
  const minY = Math.min(...nodes.map(n => n.y)) - 40
  const maxX = Math.max(...nodes.map(n => n.x + n.width)) + 40
  const maxY = Math.max(...nodes.map(n => n.y + n.height)) + 40

  const width = maxX - minX
  const height = maxY - minY

  const style = getSectionStyle(section)

  return (
    <div
      style={{
        position: 'absolute',
        left: minX,
        top: minY,
        width,
        height,
        backgroundColor: style.bg,
        border: `2px dashed ${style.border}`,
        borderRadius: '16px',
        pointerEvents: 'none',
        zIndex: -1,
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: 8,
          left: 12,
          fontSize: '11px',
          fontWeight: 600,
          color: style.border.replace('0.2', '0.8'),
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
        }}
      >
        {section}
      </div>
    </div>
  )
}

export default memo(SectionBackground)

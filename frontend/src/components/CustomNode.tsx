import { memo, useState } from 'react'
import type React from 'react'
import { Handle, Position, NodeProps } from 'reactflow'
import { motion } from 'framer-motion'
import {
  Calendar, ChevronDown, ChevronUp, MoreVertical, Plus, Trash2, Star, MessageCircle,
} from 'lucide-react'
import { useLanguage } from '../contexts/LanguageContext'

interface CustomNodeData {
  nodeId: number
  title: string
  description: string
  estimated_cost: string
  actual_cost?: string | null
  vote_count?: number
  pathCost: number
  exceedsBudget: boolean
  score_comfort?: number
  score_risk?: number
  score_time?: number
  score_pleasure?: number
  status?: 'pending' | 'selected' | 'rejected'
  section?: string
  order?: number
  node_type?: 'decision' | 'milestone' | 'option'
  parent?: number | null
  hasChildren?: boolean
  isCollapsed?: boolean
  onToggleCollapse?: (nodeId: number) => void
  isOnWinningPath?: boolean
  aggregatedCost?: number
  childrenCount?: number
  selectedChildrenCount?: number
  onAddChild?: (nodeId: number) => void
  onDeleteNode?: (nodeId: number) => void
  onEditNode?: (nodeId: number) => void
  tasks?: Array<{ id: number; title: string; is_completed: boolean }>
  comment_count?: number
  isReadOnly?: boolean
}

const getNodeIcon = () => <Calendar style={{ width: '100%', height: '100%' }} /> 
const getStatusColor = (status?: string) => {
    if (status === 'selected') return 'from-emerald-500 to-emerald-600'
    return 'from-indigo-500 to-indigo-600'
}
const calculateValueRating = () => ({ rating: 90, label: 'Value', color: 'text-emerald-500' })

const NodeContextMenu = ({ data, language }: { data: CustomNodeData; language: string }) => {
  const [isOpen, setIsOpen] = useState(false)
  
  return (
    <div className="absolute top-[50px] right-[50px] z-30">
      <button
        onClick={(e) => {
          e.stopPropagation()
          setIsOpen(!isOpen)
        }}
        className="w-[280px] h-[280px] rounded-full bg-slate-800/90 hover:bg-slate-700 flex items-center justify-center shadow-2xl border-[6px] border-slate-600 transition-all"
      >
        <MoreVertical className="w-[160px] h-[160px] text-white" />
      </button>
      
      {isOpen && (
        <div className="absolute top-[300px] right-0 bg-slate-900 rounded-[60px] shadow-2xl border-[8px] border-slate-700 overflow-hidden min-w-[800px]">
          <button
            onClick={(e) => {
              e.stopPropagation()
              data.onEditNode?.(data.nodeId)
              setIsOpen(false)
            }}
            className="w-full px-48 py-36 text-left text-white hover:bg-slate-800 flex items-center gap-24 text-[90px] font-bold"
          >
            <Calendar className="w-60 h-60" />
            {language === 'pl' ? 'Edytuj' : 'Edit'}
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation()
              data.onAddChild?.(data.nodeId)
              setIsOpen(false)
            }}
            className="w-full px-48 py-36 text-left text-emerald-400 hover:bg-slate-800 flex items-center gap-24 text-[90px] font-bold"
          >
            <Plus className="w-60 h-60" />
            {language === 'pl' ? 'Dodaj Opcję' : 'Add Option'}
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation()
              if (confirm(language === 'pl' ? 'Usunąć ten węzeł?' : 'Delete this node?')) {
                data.onDeleteNode?.(data.nodeId)
              }
              setIsOpen(false)
            }}
            className="w-full px-48 py-36 text-left text-red-400 hover:bg-slate-800 flex items-center gap-24 text-[90px] font-bold"
          >
            <Trash2 className="w-60 h-60" />
            {language === 'pl' ? 'Usuń' : 'Delete'}
          </button>
        </div>
      )}
    </div>
  )
}

const renderMilestoneNode = (data: CustomNodeData, statusGradient: string, language: string, formatCurrency: (value: string | number) => string) => {
  return (
    <div
      style={{
        width: '3000px',
        height: '2250px',
        backgroundColor: '#0a0a0c'
      }}
      className="relative rounded-[120px] border-[12px] border-white/20 shadow-2xl overflow-hidden antialiased"
    >
      {!data.isReadOnly && <NodeContextMenu data={data} language={language} />}
      
      <div className={`h-32 bg-gradient-to-r ${statusGradient}`} />

      <div className="p-36">
        <div className="flex items-start gap-32 mb-32">
          <div className="w-96 h-96 bg-indigo-600 rounded-[90px] flex items-center justify-center flex-shrink-0 shadow-lg">
            <div className="w-60 h-60 text-white">
              {getNodeIcon()}
            </div>
          </div>
          
          <div className="flex-1">
            <h3 className="font-bold text-white uppercase leading-tight" style={{ fontSize: '180px' }}>
              {data.title}
            </h3>
          </div>
        </div>
        
        <div className="grid grid-cols-2 gap-24 mt-36">
          <div className="bg-white/5 p-24 rounded-[60px] border-[6px] border-white/10">
            <span className="text-slate-400 font-bold uppercase block mb-10" style={{ fontSize: '60px' }}>{language === 'pl' ? 'BUDŻET' : 'BUDGET'}</span>
            <span className="text-white font-black" style={{ fontSize: '150px' }}>{formatCurrency(data.aggregatedCost || 0)}</span>
          </div>
          <div className="bg-white/5 p-24 rounded-[60px] border-[6px] border-white/10">
            <span className="text-slate-400 font-bold uppercase block mb-10" style={{ fontSize: '60px' }}>{language === 'pl' ? 'OPCJE' : 'OPTIONS'}</span>
            <span className="text-white font-black" style={{ fontSize: '150px' }}>{data.selectedChildrenCount || 0}/{data.childrenCount || 0}</span>
          </div>
        </div>
      </div>

      {data.hasChildren && (
        <div className="absolute bottom-24 left-36 right-36">
          <button
            onClick={(e: React.MouseEvent) => {
              e.stopPropagation()
              data.onToggleCollapse?.(data.nodeId)
            }}
            className={`w-full py-20 rounded-[60px] text-white font-bold flex items-center justify-center gap-12 shadow-lg border-[12px] transition-all ${
               data.isCollapsed ? 'bg-violet-700 border-violet-500 hover:bg-violet-600' : 'bg-slate-700 border-slate-600 hover:bg-slate-600'
            }`}
            style={{ fontSize: '96px' }}
          >
            {data.isCollapsed ? <ChevronDown className="w-32 h-32" /> : <ChevronUp className="w-32 h-32" />}
            {data.isCollapsed ? (language === 'pl' ? `POKAŻ (${data.childrenCount})` : `SHOW (${data.childrenCount})`) : (language === 'pl' ? `UKRYJ` : `HIDE`)}
          </button>
        </div>
      )}
    </div>
  )
}

const renderOptionNode = (
  data: CustomNodeData,
  cost: number,
  isSelected: boolean,
  isRejected: boolean,
  isWinning: boolean,
  valueRating: any,
  radarData: any[],
  formatCurrency: (value: string | number) => string,
  language: string
) => {
  return (
    <motion.div
      whileHover={{ scale: 1.02, x: 20 }}
      style={{
        width: '3000px',
        height: '2250px',
        backgroundColor: '#0a0a0c',
        ...(isWinning && {
          boxShadow: '0 0 100px 30px rgba(251, 191, 36, 0.4), 0 0 200px 60px rgba(251, 191, 36, 0.2)'
        })
      }}
      className={`relative rounded-[120px] border-[12px] border-l-[48px] shadow-2xl overflow-hidden antialiased ${
        isSelected ? 'border-emerald-600 border-l-emerald-500' :
        isRejected ? 'border-red-600 border-l-red-500' :
        'border-slate-700 border-l-slate-600'
      }`}
    >
        {!data.isReadOnly && <NodeContextMenu data={data} language={language} />}
        
        {isWinning && (
          <div className="absolute top-[50px] left-[50px] z-30">
            <div className="relative w-[200px] h-[200px]">
              <Star className="w-full h-full text-amber-400 fill-amber-400" strokeWidth={1.5} />
            </div>
          </div>
        )}
        
        <div className="p-36 flex flex-col h-full justify-between">
            <div>
                <div className="flex justify-between items-start gap-24 mb-48">
                    <div className="flex gap-24 flex-1 min-w-0">
                        <div className="w-80 h-80 rounded-[60px] bg-slate-800 text-white flex items-center justify-center flex-shrink-0">
                            <div className="w-48 h-48">{getNodeIcon()}</div>
                        </div>
                        
                        <div className="flex-1 min-w-0">
                            <h3 className="font-bold text-white leading-tight mb-16" style={{ fontSize: '150px' }}>
                                {data.title}
                            </h3>
                            <div className="flex gap-20 items-center">
                                {valueRating.rating >= 85 && 
                                    <span className="bg-emerald-600 text-white px-20 py-6 rounded-full text-6xl font-bold">{language === 'pl' ? 'NAJLEPSZA' : 'BEST'}</span>}
                                <span className="text-slate-400 text-7xl font-bold">{language === 'pl' ? 'Ocena' : 'Rating'}: {valueRating.rating}/100</span>
                            </div>
                        </div>
                    </div>
                    
                    <div className="text-right pt-[350px]">
                        {data.actual_cost ? (
                          <div>
                            <div className="line-through text-slate-400 text-7xl font-medium mb-8">
                              {formatCurrency(parseFloat(data.estimated_cost))}
                            </div>
                            <div className="font-black text-emerald-400 tracking-tighter leading-none flex items-center justify-end gap-16" style={{ fontSize: '180px' }}>
                              {formatCurrency(parseFloat(data.actual_cost))}
                              {(() => {
                                const estimated = parseFloat(data.estimated_cost)
                                const actual = parseFloat(data.actual_cost)
                                const isOverBudget = actual > estimated
                                return (
                                  <div className={`text-8xl ${isOverBudget ? 'text-red-400' : 'text-emerald-400'}`}>
                                    {isOverBudget ? '↑' : '↓'}
                                  </div>
                                )
                              })()}
                            </div>
                          </div>
                        ) : (
                          <div className="font-black text-emerald-400 tracking-tighter leading-none" style={{ fontSize: '180px' }}>
                            {formatCurrency(cost)}
                          </div>
                        )}
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-24">
                    {radarData.map((item: any) => (
                        <div key={item.subject}>
                            <div className="flex justify-between text-white text-7xl font-bold mb-8">
                                <span className="truncate">{item.subject}</span>
                                <span className="ml-12">{item.value}</span>
                            </div>
                            <div className="bg-slate-800 rounded-full overflow-hidden h-16">
                                <div style={{width: `${item.value}%`, height: '100%'}} className="bg-emerald-500" />
                            </div>
                        </div>
                    ))}
                </div>

                {isSelected && data.tasks && data.tasks.length > 0 && (
                  <div className="mt-32 pt-24 border-t border-slate-700">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400 text-6xl font-bold">
                        {language === 'pl' ? 'Zadania' : 'Tasks'}:
                      </span>
                      <span className="text-emerald-400 text-7xl font-bold">
                        {data.tasks.filter(t => t.is_completed).length}/{data.tasks.length}
                      </span>
                    </div>
                    <div className="mt-12 bg-slate-800 rounded-full overflow-hidden h-20">
                      <div 
                        style={{
                          width: `${(data.tasks.filter(t => t.is_completed).length / data.tasks.length) * 100}%`,
                          height: '100%'
                        }} 
                        className="bg-indigo-500 transition-all duration-300"
                      />
                    </div>
                  </div>
                )}

                {data.comment_count && data.comment_count > 0 && (
                  <div className="mt-32 pt-24 border-t border-slate-700">
                    <div className="flex items-center gap-16">
                      <MessageCircle className="w-48 h-48 text-blue-400" />
                      <span className="text-blue-400 text-7xl font-bold">
                        {data.comment_count} {language === 'pl' ? 'komentarzy' : 'comments'}
                      </span>
                    </div>
                  </div>
                )}
            </div>
        </div>
    </motion.div>
  )
}

const CustomNode = ({ data }: NodeProps<CustomNodeData>) => {
  const { formatCurrency, language, t } = useLanguage()
  
  const isMilestone = data.node_type === 'milestone'
  const cost = parseFloat(data.estimated_cost) || 0
  const statusGradient = getStatusColor(data.status)
  
  const radarData = [
    { subject: t.node.comfort, value: data.score_comfort || 0 },
    { subject: language === 'pl' ? 'Bezpieczeństwo' : 'Safety', value: 100 - (data.score_risk || 0) },
    { subject: language === 'pl' ? 'Czas' : 'Time', value: data.score_time || 0 },
    { subject: t.node.joy, value: data.score_pleasure || 0 },
  ]
  const valueRating = calculateValueRating()

  if (isMilestone) {
    return (
      <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} className="group relative">
        {data.order && (
            <div className="absolute z-20 bg-amber-500 rounded-full border-[10px] border-[#050505] flex items-center justify-center shadow-2xl"
                 style={{ width: '120px', height: '120px', top: '-40px', left: '-40px' }}>
                <span className="font-black text-white" style={{ fontSize: '60px' }}>{data.order}</span>
            </div>
        )}
        {renderMilestoneNode(data, statusGradient, language, formatCurrency)}
        <Handle type="target" position={Position.Top} id="top" className="w-1 h-1 opacity-0" />
        <Handle type="source" position={Position.Bottom} id="bottom" className="w-1 h-1 opacity-0" />
        <Handle type="target" position={Position.Left} id="left" className="w-1 h-1 opacity-0" />
        <Handle type="source" position={Position.Right} id="right" className="w-1 h-1 opacity-0" />
        <Handle type="source" position={Position.Left} id="left-source" className="w-1 h-1 opacity-0" />
        <Handle type="target" position={Position.Right} id="right-target" className="w-1 h-1 opacity-0" />
      </motion.div>
    )
  }

  return (
    <motion.div initial={{ x: -20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} className="group relative">
        {renderOptionNode(data, cost, data.status==='selected', data.status==='rejected', !!data.isOnWinningPath, valueRating, radarData, formatCurrency, language)}
        <Handle type="target" position={Position.Top} id="top" className="w-1 h-1 opacity-0" />
        <Handle type="source" position={Position.Bottom} id="bottom" className="w-1 h-1 opacity-0" />
        <Handle type="target" position={Position.Left} id="left" className="w-1 h-1 opacity-0" />
        <Handle type="source" position={Position.Right} id="right" className="w-1 h-1 opacity-0" />
        <Handle type="source" position={Position.Left} id="left-source" className="w-1 h-1 opacity-0" />
        <Handle type="target" position={Position.Right} id="right-target" className="w-1 h-1 opacity-0" />
    </motion.div>
  )
}

export default memo(CustomNode)
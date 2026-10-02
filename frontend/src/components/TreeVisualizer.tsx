import { useCallback, useEffect, useState, useMemo, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import ReactFlow, {
  Node,
  Edge,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  addEdge,
  Connection,
  NodeMouseHandler,
  useReactFlow,
  MarkerType,
  Position,
} from 'reactflow'
import 'reactflow/dist/style.css'
import axios from 'axios'
import { Brain, Sparkles, Target, FileDown, LayoutGrid, Save, Undo, DollarSign, Heart, ChevronsDown, ChevronsUp, ChevronDown, Settings, ListTodo, Calendar, BarChart3, Link } from 'lucide-react'
import { motion } from 'framer-motion'
import NodeSidebar from './NodeSidebar'
import CustomNode from './CustomNode'
import ProjectAdvisor from './ProjectAdvisor'
import AIChat from './AIChat'
import SectionHeader from './SectionHeader'
import FloatingDashboard from './FloatingDashboard'
import EditProjectModal from './EditProjectModal'
import GlobalActionBoard from './GlobalActionBoard'
import ProjectTimeline from './ProjectTimeline'
import ProjectAnalytics from './ProjectAnalytics'
import { getLayoutedElements, getChronologicalLayout } from '../utils/layoutUtils'
import { useLanguage } from '../contexts/LanguageContext'
import { exportProjectToPDF } from '../utils/pdfExport'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

export interface Task {
  id: number
  title: string
  is_completed: boolean
  node: number
  due_date?: string | null
  created_at: string
}

export interface ProjectTask extends Task {
  node_id: number
  node_title: string
  node_section: string
}

export interface Comment {
  id: number
  node: number
  author_name: string
  content: string
  created_at: string
}

export interface DecisionNode {
  id: number
  title: string
  description: string
  estimated_cost: string
  actual_cost?: string | null
  parent: number | null
  project: number
  children: DecisionNode[]
  vote_count?: number
  path_cost?: number
  score_comfort?: number
  score_risk?: number
  score_time?: number
  score_pleasure?: number
  status?: 'pending' | 'selected' | 'rejected'
  section?: string
  order?: number
  node_type?: 'decision' | 'milestone' | 'option'
  tasks?: Task[]
  comments?: Comment[]
  comment_count?: number
  position_x?: number
  position_y?: number
}

interface Project {
  id: number
  title: string
  description: string
  budget_total: string
}

interface TreeVisualizerProps {
  projectId: number
}

const nodeTypes = {
  decisionNode: CustomNode,
}

const TreeVisualizer = ({ projectId }: TreeVisualizerProps) => {
  const [searchParams, setSearchParams] = useSearchParams()
  const [nodes, setNodes, onNodesChange] = useNodesState([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedNode, setSelectedNode] = useState<DecisionNode | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [nodeDataMap, setNodeDataMap] = useState<Map<number, DecisionNode>>(new Map())
  const [project, setProject] = useState<Project | null>(null)
  const [advisorOpen, setAdvisorOpen] = useState(false)
  const [globalActionBoardOpen, setGlobalActionBoardOpen] = useState(false)
  const [showTimeline, setShowTimeline] = useState(false)
  const [showAnalytics, setShowAnalytics] = useState(false)
  const [collapsedNodes, setCollapsedNodes] = useState<Set<number>>(new Set())
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set())
  const [sectionHeaders, setSectionHeaders] = useState<Array<{ section: string; y: number; nodeCount: number }>>([])
  const [scenarioMenuOpen, setScenarioMenuOpen] = useState(false) // Nowy state dla dropdown menu
  const [editProjectOpen, setEditProjectOpen] = useState(false) // State dla modalu edycji projektu
  const [isUpdatingProjectMeta, setIsUpdatingProjectMeta] = useState(false) // Flaga dla aktualizacji metadanych projektu
  
  // ✅ UPROSZCZENIE: Zawsze chronological mode (usunięto przełącznik)
  const chronologicalMode = true
  
  // ✅ NOWE: Historia pozycji dla undo/redo
  const [positionHistory, setPositionHistory] = useState<Array<Record<string, { x: number; y: number }>>>([])
  const [historyIndex, setHistoryIndex] = useState(-1)
  const historyIndexRef = useRef(-1) // Ref dla uniknięcia stale dependencies
  const saveHistoryTimeoutRef = useRef<number | null>(null)
  const savePositionTimeoutRef = useRef<number | null>(null) // ✅ NOWE: Ref dla debounce API calls
  
  // Synchronizuj ref z state
  useEffect(() => {
    historyIndexRef.current = historyIndex
  }, [historyIndex])
  
  const [shouldAutoLayout, setShouldAutoLayout] = useState(false)
  const { fitView, getNodes } = useReactFlow()
  const { formatCurrency, t, language } = useLanguage()
  const [exportingPDF, setExportingPDF] = useState(false)
  const [shareToastVisible, setShareToastVisible] = useState(false) // ✅ NOWE - toast dla Share
  const nodesRef = useRef<Node[]>([])  // Ref do przechowania pozycji węzłów
  const collapsedNodesRef = useRef<Set<number>>(new Set()) // Ref dla collapsedNodes
  
  // ✅ SAFETY LOCK: Blokada zapisu podczas ładowania początkowego
  const isInitialLoadRef = useRef(true)
  
  // ✅ NOWE: Flaga wyłączająca auto-layout jeśli są zapisane pozycje
  const [disableAutoLayout, setDisableAutoLayout] = useState(false)
  
  // ✅ FIX v1.22.3: Potężna funkcja centrująca z podwójnym opóźnieniem
  const forceCenterView = useCallback(() => {
    // Małe opóźnienie dla Reacta
    setTimeout(() => {
      // Klatka animacji dla przeglądarki (paint)
      window.requestAnimationFrame(() => {
        const worked = fitView({ 
          padding: 0.5, 
          duration: 1000, 
          maxZoom: 0.25,
          minZoom: 0.05,
          includeHiddenNodes: false
        })
      })
    }, 200) // 200ms to bezpieczny bufor
  }, [fitView])
  
  // Aktualizuj ref przy każdej zmianie collapsedNodes
  useEffect(() => {
    collapsedNodesRef.current = collapsedNodes
  }, [collapsedNodes])
  
  // Aktualizuj ref przy każdej zmianie nodes
  useEffect(() => {
    nodesRef.current = nodes
  }, [nodes])

  // ✅ NOWE v1.29.0: Funkcje do zarządzania UI State w bazie danych
  const { setViewport, getViewport } = useReactFlow()
  const saveUiStateTimeoutRef = useRef<number | null>(null)
  
  // Funkcja do zapisu UI State do bazy danych
  const saveUiState = useCallback(async () => {
    if (!project) return
    
    const viewport = getViewport()
    const currentEdges = edges // Pobierz aktualne edges z state
    
    const uiState = {
      collapsedNodes: Array.from(collapsedNodes),
      viewport: {
        x: viewport.x,
        y: viewport.y,
        zoom: viewport.zoom
      },
      edges: currentEdges // ✅ NOWE: Zapisz edges do ui_state
    }
    
    try {
      await axios.patch(`${API_URL}/api/projects/${projectId}/`, {
        ui_state: uiState
      })
    } catch (error) {
      console.error('[saveUiState] ❌ Failed to save UI state:', error)
    }
  }, [projectId, project, collapsedNodes, getViewport, edges])
  
  // Debounced save UI state
  const debouncedSaveUiState = useCallback(() => {
    if (saveUiStateTimeoutRef.current) {
      clearTimeout(saveUiStateTimeoutRef.current)
    }
    
    saveUiStateTimeoutRef.current = setTimeout(() => {
      saveUiState()
    }, 1000) // 1 sekunda debounce
  }, [saveUiState])
  
  // ✅ NOWE v1.29.2: Automatyczny zapis edges przy zmianie
  useEffect(() => {
    // Nie zapisuj podczas początkowego ładowania
    if (isInitialLoadRef.current || !project) return
    
    // Debounced save gdy edges się zmienią
    debouncedSaveUiState()
  }, [edges, debouncedSaveUiState, project])
  
  // Funkcja do wczytania UI State z bazy danych
  const loadUiState = useCallback((currentNodes: Node[]) => {
    if (!project || !project.ui_state) return
    
    const uiState = project.ui_state as any
    
    // Wczytaj collapsed nodes
    if (uiState.collapsedNodes && Array.isArray(uiState.collapsedNodes)) {
      const collapsedSet = new Set<number>(uiState.collapsedNodes)
      setCollapsedNodes(collapsedSet)
      collapsedNodesRef.current = collapsedSet
    }
    
    // ✅ NOWE: Wczytaj edges z ui_state
    if (uiState.edges && Array.isArray(uiState.edges)) {
      // Filtruj edges - usuń te, których source lub target nie istnieje w aktualnych nodes
      const currentNodeIds = new Set(currentNodes.map(n => n.id))
      const validEdges = uiState.edges.filter((edge: Edge) => 
        currentNodeIds.has(edge.source) && currentNodeIds.has(edge.target)
      )
      
      if (validEdges.length > 0) {
        setEdges(validEdges)
      }
    }
    
    // Wczytaj viewport (po małym opóźnieniu aby nodes były już załadowane)
    if (uiState.viewport) {
      setTimeout(() => {
        setViewport({
          x: uiState.viewport.x || 0,
          y: uiState.viewport.y || 0,
          zoom: uiState.viewport.zoom || 1
        }, { duration: 800 })
      }, 500)
    }
  }, [project, setViewport, setEdges])

  // ✅ NOWE: Toggle selection dla opcji
  const handleToggleSelection = useCallback(async (nodeId: number) => {
    
    const nodeData = nodeDataMap.get(nodeId)
    if (!nodeData) {
      console.error(`[handleToggleSelection] Node ${nodeId} not found in nodeDataMap`)
      return
    }
    
    // Określ nowy status
    const currentStatus = nodeData.status || 'pending'
    const newStatus = currentStatus === 'selected' ? 'pending' : 'selected'
    
    
    try {
      // Wyślij update do backendu
      await axios.patch(`${API_URL}/api/decision-nodes/${nodeId}/`, {
        status: newStatus
      })
      
      // Zaktualizuj lokalny stan
      setNodeDataMap(prev => {
        const newMap = new Map(prev)
        const node = newMap.get(nodeId)
        if (node) {
          node.status = newStatus
        }
        return newMap
      })
      
      // Zaktualizuj nodes w ReactFlow
      setNodes(currentNodes => 
        currentNodes.map(node => 
          node.data.nodeId === nodeId
            ? { ...node, data: { ...node.data, status: newStatus } }
            : node
        )
      )
      
    } catch (error) {
      console.error(`[handleToggleSelection] ❌ Failed to update node ${nodeId}:`, error)
    }
  }, [nodeDataMap, setNodes])

  // Find best path based on average scores
  const findBestPath = useCallback((nodesMap: Map<number, DecisionNode>) => {
    const calculateAvgScore = (node: DecisionNode): number => {
      const comfort = node.score_comfort || 50
      const risk = 100 - (node.score_risk || 50) // Inverted
      const time = node.score_time || 50
      const pleasure = node.score_pleasure || 50
      return (comfort + risk + time + pleasure) / 4
    }

    const bestOptions = new Set<number>()

    // Dla każdego milestone (węzła bez rodzica lub z node_type='milestone')
    // znajdź najlepszą opcję (dziecko)
    Array.from(nodesMap.values()).forEach(node => {
      // Sprawdź czy to milestone (węzeł główny)
      const isMilestone = node.node_type === 'milestone' || (!node.parent && node.children && node.children.length > 0)
      
      if (isMilestone) {
        // Znajdź wszystkie opcje (dzieci) tego milestone
        const options = Array.from(nodesMap.values()).filter(n => 
          n.parent === node.id && 
          n.status !== 'rejected' &&
          (n.node_type === 'option' || n.node_type === 'decision')
        )
        
        if (options.length > 0) {
          // Znajdź opcję z najwyższym wynikiem
          let bestOption = options[0]
          let bestScore = calculateAvgScore(bestOption)
          
          for (const option of options) {
            const score = calculateAvgScore(option)
            if (score > bestScore) {
              bestScore = score
              bestOption = option
            }
          }
          
          // Dodaj najlepszą opcję do zbioru
          bestOptions.add(bestOption.id)
        }
      }
    })
    
    return bestOptions
  }, [])

  const onToggleCollapse = useCallback((nodeId: number) => {
    
    // 1. Aktualizacja stanu collapsedNodes
    const wasCollapsed = collapsedNodesRef.current.has(nodeId)
    const newSet = new Set(collapsedNodesRef.current)
    
    if (wasCollapsed) {
      newSet.delete(nodeId) // Rozwiń
    } else {
      newSet.add(nodeId) // Zwiń
    }
    
    // ✅ KRYTYCZNE: Zaktualizuj REF NATYCHMIAST (przed setCollapsedNodes)
    collapsedNodesRef.current = newSet
    
    // Teraz zaktualizuj state (asynchronicznie)
    setCollapsedNodes(newSet)
    
    // 2. Aktualizacja danych węzła (dla koloru przycisku)
    setNodes(currentNodes =>
      currentNodes.map(node => {
        if (node.data.nodeId === nodeId) {
          return {
            ...node,
            data: { ...node.data, isCollapsed: !wasCollapsed }
          }
        }
        return node
      })
    )
    
    // 3. WYMUSZENIE AUTO-LAYOUTU (To naprawia overlap!)
    // Musimy tymczasowo usunąć flagę manual-layout, aby pozwolić na przeliczenie drzewa
    setTimeout(() => {
      
      const manualFlagKey = `project-${projectId}-manual-layout`
      const hadManualFlag = localStorage.getItem(manualFlagKey) === 'true'
      
      // Usuwamy blokadę, bo zmiana struktury (rozwinięcie) WYMAGA nowego układu
      if (hadManualFlag) {
        localStorage.removeItem(manualFlagKey)
      }
      
      // Wywołujemy główny layout
      if (onLayoutRef.current) {
        onLayoutRef.current()
      }
      
      // Przywróć flagę po layout (jeśli była)
      if (hadManualFlag) {
        setTimeout(() => {
          localStorage.setItem(manualFlagKey, 'true')
        }, 300)
      }
    }, 50) // Małe opóźnienie, aby React zdążył zaktualizować stan
  }, [projectId, setNodes])

  // ✅ NOWE: Funkcja do filtrowania widoczności węzłów (bez zmiany pozycji)
  const applyVisibilityFilter = useCallback(() => {

      if (!chronologicalMode) {
        return
      }

      // ✅ KRYTYCZNE: Zamiast filtrować węzły (.filter), użyj .map() i ustaw 'hidden'
      // To zachowuje wszystkie węzły z ich pozycjami!
      setNodes(currentNodes => {
        const updatedNodes = currentNodes.map(node => {
          const nodeId = node.data.nodeId
          const nodeType = node.data.node_type
          const parent = node.data.parent
          const section = node.data.section || 'general'

          // FILTR 1: Sekcja ukryta? Ukryj węzeł
          if (collapsedSections.has(section)) {
            return { ...node, hidden: true }
          }

          // FILTR 2: Milestone - zawsze widoczny
          if (nodeType === 'milestone') {
            return { ...node, hidden: false }
          }

          // FILTR 3: Option lub Decision - pokaż TYLKO jeśli parent jest ROZWINIĘTY
          if (nodeType === 'option' || nodeType === 'decision') {
            if (!parent) {
              return { ...node, hidden: false }
            }

            // ✅ KRYTYCZNE: Użyj collapsedNodesRef zamiast collapsedNodes (aktualny stan)
            const isParentCollapsed = collapsedNodesRef.current.has(parent)
            return { ...node, hidden: isParentCollapsed }
          }

          // Fallback: pokaż węzeł
          return { ...node, hidden: false }
        })

        const visibleCount = updatedNodes.filter(n => !n.hidden).length

        // ✅ KRYTYCZNE: Aktualizuj edges
        const visibleNodes = updatedNodes.filter(n => !n.hidden)

        // Dodaj milestone edges (grube linie między milestones)
        const milestones = visibleNodes.filter(n => n.data.node_type === 'milestone')
        const milestoneEdges: Edge[] = []
        const timestamp = Date.now()

        for (let i = 0; i < milestones.length - 1; i++) {
          const source = milestones[i]
          const target = milestones[i + 1]

          milestoneEdges.push({
            id: `ms-edge-${source.data.nodeId}-${target.data.nodeId}-${timestamp}-${i}`,
            source: source.id,
            target: target.id,
            type: 'smoothstep', // ✅ Smoothstep dla ładnych załamań
            animated: false,
            style: {
              strokeWidth: 12, // Zmniejszono z 16 na 12 (opcje mają 6-10px)
              stroke: '#4ade80', // ✅ Green-400 - jasny, wyraźny kolor
              strokeLinecap: 'round',
              strokeLinejoin: 'round',
              filter: 'drop-shadow(0 0 24px rgba(74, 222, 128, 0.9)) drop-shadow(0 0 48px rgba(74, 222, 128, 0.6))', // ✨✨ Zielona poświata
              opacity: 1, // Pełna nieprzezroczystość
            },
            markerEnd: {
              type: 'arrowclosed' as any,
              width: 40, // ⬆️⬆️ Duża strzałka
              height: 40,
              color: '#4ade80',
            },
            pathOptions: { borderRadius: 30 }, // ✅ Zaokrąglone rogi
            zIndex: 10, // ⬆️⬆️ Wysoko nad wszystkim
          })
        }


        // ✅ NOWE: Dodaj edges dla opcji (tak jak w onLayout)
        const optionEdges: Edge[] = []
        
        visibleNodes.forEach(node => {
          if ((node.data.node_type === 'option' || node.data.node_type === 'decision') && node.data.parent) {
            const parentNode = visibleNodes.find(n => n.data.nodeId === node.data.parent)
            if (parentNode && parentNode.data.node_type === 'milestone') {
              const isSelected = node.data.status === 'selected'
              const isRejected = node.data.status === 'rejected'
              const isWinning = node.data.isOnWinningPath
              
              // ✅ UPROSZCZENIE v1.29.2.3: TYLKO połączenia pionowe (dół → góra)
              const sourcePos = Position.Bottom
              const targetPos = Position.Top
              const sourceHandle = 'bottom'
              const targetHandle = 'top'
              
              // Oblicz kolor i styl na podstawie statusu
              let edgeColor = '#94a3b8' // Szary dla pending
              let edgeWidth = 6 // Zwiększono dla lepszej widoczności
              let edgeOpacity = 0.8 // Zwiększono
              
              if (isSelected) {
                edgeColor = '#10b981' // Zielony
                edgeWidth = 10 // Grubsza dla wyróżnienia
                edgeOpacity = 1
              } else if (isRejected) {
                edgeColor = '#ef4444' // Czerwony
                edgeWidth = 6
                edgeOpacity = 0.7
              } else if (isWinning) {
                // Winning path NIE zmienia koloru linii - tylko gwiazdka na węźle
                edgeColor = '#94a3b8' // Szary jak pending
                edgeWidth = 6
                edgeOpacity = 0.8
              }
              
              optionEdges.push({
                id: `opt-edge-${parentNode.data.nodeId}-${node.data.nodeId}`,
                source: parentNode.id,
                target: node.id,
                type: 'smoothstep',
                sourcePosition: sourcePos,
                targetPosition: targetPos,
                sourceHandle: sourceHandle,
                targetHandle: targetHandle,
                animated: isSelected, // Tylko selected jest animowany
                style: {
                  strokeWidth: edgeWidth,
                  stroke: edgeColor,
                  strokeLinecap: 'round',
                  strokeLinejoin: 'round',
                  opacity: edgeOpacity,
                },
                markerEnd: {
                  type: 'arrowclosed' as any,
                  width: 20,
                  height: 20,
                  color: edgeColor,
                },
                pathOptions: { borderRadius: 50, offset: 20 },
                zIndex: isSelected ? 10 : 1, // Tylko selected na wierzchu
              })
            }
          }
        })
        

        setEdges(() => {
          // Połącz milestone edges + option edges
          const allEdges = [...milestoneEdges, ...optionEdges]

          return allEdges
        })

        return updatedNodes
      })
    }, [chronologicalMode, collapsedNodes, collapsedSections, setNodes, setEdges])

  const onLayout = useCallback(() => {
    // 🛡️ SAFETY LOCK: Blokada zapisu podczas ładowania początkowego
    if (isInitialLoadRef.current) {
      console.warn('[onLayout] 🛡️ Blokada auto-layout podczas ładowania początkowego!')
      return
    }
    
    // ✅ KRYTYCZNE: Synchroniczne sprawdzenie PRZED jakąkolwiek logiką
    const manualFlagKey = `project-${projectId}-manual-layout`
    const hasManualLayout = localStorage.getItem(manualFlagKey) === 'true'
    
    if (hasManualLayout) {
      
      // ✅ KRYTYCZNE: Nawet jeśli pozycje są zapisane, zastosuj filtrowanie widoczności
      applyVisibilityFilter()
      return
    }
    
    
    if (chronologicalMode) {
      
      // ✅ KRYTYCZNE: Przekaż WSZYSTKIE węzły do layoutu (nie tylko milestones!)
      // getChronologicalLayout potrzebuje widzieć dzieci aby wiedzieć czy milestone ma children
      const { nodes: layoutedNodes, sectionHeaders: headers } = getChronologicalLayout(
        nodes,  // ← WSZYSTKIE węzły!
        edges, 
        collapsedNodesRef.current // ← Użyj ref zamiast state!
      )
      
      
      // ✅ KRYTYCZNA NAPRAWA: Użyj .map() zamiast .filter() żeby ZACHOWAĆ wszystkie nodes!
      // Zamiast usuwać nodes, ustaw hidden: true/false
      const updatedNodes = layoutedNodes.map(node => {
        const nodeId = node.data.nodeId
        const nodeType = node.data.node_type
        const parent = node.data.parent
        const section = node.data.section || 'general'
        
        // ✅ NOWA LOGIKA: Określ pozycje uchwytów (handles)
        // ✅ UPROSZCZENIE v1.29.2.3: TYLKO połączenia pionowe (dół → góra)
        let targetPos = Position.Top
        let sourcePos = Position.Bottom
        
        // FILTR 1: Sekcja ukryta? Ukryj węzeł
        if (collapsedSections.has(section)) {
          return { ...node, hidden: true, targetPosition: targetPos, sourcePosition: sourcePos }
        }
        
        // FILTR 2: Milestone - zawsze widoczny (jeśli sekcja nie jest ukryta)
        if (nodeType === 'milestone') {
          return { ...node, hidden: false, targetPosition: targetPos, sourcePosition: sourcePos }
        }
        
        // FILTR 3: Option lub Decision - pokaż TYLKO jeśli parent jest ROZWINIĘTY
        if (nodeType === 'option' || nodeType === 'decision') {
          if (!parent) {
            return { ...node, hidden: false, targetPosition: targetPos, sourcePosition: sourcePos }
          }
          
          // ✅ NAPRAWA: Użyj collapsedNodesRef.current zamiast collapsedNodes (synchroniczny dostęp)
          const isParentCollapsed = collapsedNodesRef.current.has(parent)
          
          if (isParentCollapsed) {
            return { ...node, hidden: true, targetPosition: targetPos, sourcePosition: sourcePos }
          } else {
            return { ...node, hidden: false, targetPosition: targetPos, sourcePosition: sourcePos }
          }
        }
        
        // Fallback: pokaż węzeł
        return { ...node, hidden: false, targetPosition: targetPos, sourcePosition: sourcePos }
      })
      
      const visibleNodes = updatedNodes.filter(n => !n.hidden)
      
      setNodes(updatedNodes)
      
      // KRYTYCZNE: Tworzymy WSZYSTKIE edges od zera (nie filtrujemy starych!)
      const allNewEdges: Edge[] = []
      
      // 1. Dodaj edges między kolejnymi milestones (kręgosłup planu)
      const milestones = visibleNodes.filter(n => n.data.node_type === 'milestone')
      
      // ✨✨ ULTRA WIDOCZNY STYL: Bardzo grube linie z mocną poświatą
      for (let i = 0; i < milestones.length - 1; i++) {
        const source = milestones[i]
        const target = milestones[i + 1]
        
        allNewEdges.push({
          id: `ms-edge-${source.data.nodeId}-${target.data.nodeId}`,
          source: source.id,
          target: target.id,
          type: 'smoothstep',
          sourcePosition: Position.Bottom,
          targetPosition: Position.Top,
          animated: false,
          style: {
            strokeWidth: 12, // Zmniejszono z 16 na 12 (opcje mają 6-10px)
            stroke: '#4ade80', // ✅ Green-400 - jasny, wyraźny kolor
            strokeLinecap: 'round',
            strokeLinejoin: 'round',
            filter: 'drop-shadow(0 0 24px rgba(74, 222, 128, 0.9)) drop-shadow(0 0 48px rgba(74, 222, 128, 0.6))', // ✨✨ Zielona poświata
            opacity: 1, // Pełna nieprzezroczystość
          },
          markerEnd: {
            type: 'arrowclosed' as any,
            width: 48, // ⬆️⬆️ Bardzo duża strzałka
            height: 48,
            color: '#4ade80',
          },
          pathOptions: { borderRadius: 40 },
          zIndex: 10, // ⬆️⬆️ Wysoko nad wszystkim
        })
      }
      
      
      // 2. Dodaj edges między Milestone → Options/Decisions
      visibleNodes.forEach(node => {
        if ((node.data.node_type === 'option' || node.data.node_type === 'decision') && node.data.parent) {
          // Znajdź rodzica (milestone)
          const parentNode = visibleNodes.find(n => n.data.nodeId === node.data.parent)
          if (parentNode && parentNode.data.node_type === 'milestone') {
            const isSelected = node.data.status === 'selected'
            const isRejected = node.data.status === 'rejected'
            const isWinning = node.data.isOnWinningPath
            
            // ✅ UPROSZCZENIE v1.29.2.3: TYLKO połączenia pionowe (dół → góra)
            const sourcePos = Position.Bottom
            const targetPos = Position.Top
            const sourceHandle = 'bottom'
            const targetHandle = 'top'
            
            // 🎨 Kolory w zależności od statusu:
            // - selected: #10b981 (Emerald-500, zielony) - wybrana opcja
            // - rejected: #ef4444 (Red-500, czerwony) - odrzucona opcja
            // - pending: #94a3b8 (Slate-400, szary) - oczekująca opcja
            // - winning path: #f59e0b (Amber-500, złoty) - najlepsza ścieżka (tylko krawędź + gwiazdka)
            let edgeColor = '#94a3b8' // Domyślnie szary dla pending
            let edgeWidth = 6 // Zwiększono dla lepszej widoczności
            let edgeOpacity = 0.8
            
            if (isSelected) {
              edgeColor = '#10b981' // Zielony
              edgeWidth = 10 // Grubsza dla wyróżnienia
              edgeOpacity = 1
            } else if (isRejected) {
              edgeColor = '#ef4444' // Czerwony
              edgeWidth = 6
              edgeOpacity = 0.7
            } else if (isWinning) {
              // Winning path NIE zmienia koloru linii - tylko gwiazdka na węźle
              edgeColor = '#94a3b8' // Szary jak pending
              edgeWidth = 6
              edgeOpacity = 0.8
            }
            
            allNewEdges.push({
              id: `opt-edge-${parentNode.data.nodeId}-${node.data.nodeId}`,
              source: parentNode.id,
              target: node.id,
              type: 'smoothstep', // Ładne kąty proste
              
              // Wymuszamy konkretne pozycje i ID uchwytów
              sourcePosition: sourcePos,
              targetPosition: targetPos,
              sourceHandle: sourceHandle,
              targetHandle: targetHandle,
              
              animated: isSelected, // Tylko selected jest animowany
              style: {
                strokeWidth: edgeWidth,
                stroke: edgeColor,
                strokeLinecap: 'round',
                strokeLinejoin: 'round',
                opacity: edgeOpacity,
              },
              markerEnd: {
                type: 'arrowclosed' as any,
                width: 20,
                height: 20,
                color: edgeColor,
              },
              // Zwiększamy promień zakrętu, żeby linia ładnie "omijała" węzły
              pathOptions: { borderRadius: 50, offset: 20 },
              zIndex: isSelected ? 10 : 1, // Tylko selected na wierzchu
            })
          }
        }
      })
      
      setEdges(allNewEdges)
      setSectionHeaders(headers)
      
      // ✅ Zapisz pozycje WSZYSTKICH węzłów (również zwinięte!)
      const positions: Record<string, { x: number; y: number }> = {}
      layoutedNodes.forEach(node => {
        positions[node.id] = node.position
      })
      const storageKey = `project-${projectId}-positions`
      localStorage.setItem(storageKey, JSON.stringify(positions))
      
      // ✅ NOWE v1.23.0: Batch save do API (asynchronicznie, nie blokuj UI)
      const apiPositions = layoutedNodes.map(node => ({
        id: node.data.nodeId,
        position_x: node.position.x,
        position_y: node.position.y
      }))
      
      axios.post(`${API_URL}/api/projects/${projectId}/save_layout/`, {
        positions: apiPositions
      }).then(response => {
      }).catch(error => {
        console.error(`[onLayout] ❌ Failed to batch save positions to API:`, error)
        // Nie pokazuj błędu użytkownikowi - localStorage backup działa
      })
    } else {
      // Standard dagre layout
      const layouted = getLayoutedElements(nodes, edges, 'TB')
      setNodes(layouted.nodes)
      setEdges(layouted.edges)
      setSectionHeaders([])
      
      // Zapisz pozycje do localStorage
      const positions: Record<string, { x: number; y: number }> = {}
      layouted.nodes.forEach(node => {
        positions[node.id] = node.position
      })
      const storageKey = `project-${projectId}-positions`
      localStorage.setItem(storageKey, JSON.stringify(positions))
      
      // ✅ NOWE v1.23.0: Batch save do API (asynchronicznie)
      const apiPositions = layouted.nodes.map(node => ({
        id: node.data.nodeId,
        position_x: node.position.x,
        position_y: node.position.y
      }))
      
      axios.post(`${API_URL}/api/projects/${projectId}/save_layout/`, {
        positions: apiPositions
      }).then(response => {
      }).catch(error => {
        console.error(`[onLayout] ❌ Failed to batch save positions to API:`, error)
      })
    }
  }, [nodes, edges, setNodes, setEdges, fitView, projectId, chronologicalMode, collapsedSections, collapsedNodes, disableAutoLayout, applyVisibilityFilter])

  const toggleSectionCollapse = useCallback((section: string) => {
    setCollapsedSections(prev => {
      const newSet = new Set(prev)
      if (newSet.has(section)) {
        newSet.delete(section)
      } else {
        newSet.add(section)
      }
      return newSet
    })
    
    // Przebuduj layout po zmianie
    setTimeout(() => {
      onLayout()
    }, 100)
  }, [onLayout])

  const onCenterView = useCallback(() => {
    forceCenterView()
  }, [forceCenterView])
  
  const onExportPDF = useCallback(async () => {
    if (!project) return
    
    setExportingPDF(true)
    try {
      // Przygotuj dane węzłów
      const nodesData = Array.from(nodeDataMap.values()).map(node => ({
        id: node.id,
        title: node.title,
        description: node.description,
        estimated_cost: node.estimated_cost,
        section: node.section,
        order: node.order,
        node_type: node.node_type,
        score_comfort: node.score_comfort,
        score_risk: node.score_risk,
        score_time: node.score_time,
        score_pleasure: node.score_pleasure,
        status: node.status,
      }))
      
      const result = await exportProjectToPDF(
        project,
        nodesData,
        'react-flow-wrapper',
        formatCurrency,
        t.pdf
      )
      
      if (result.success) {
      } else {
        console.error('PDF export failed:', result.error)
        alert(t.tree.failedToExportPDF)
      }
    } catch (error) {
      console.error('Error exporting PDF:', error)
      alert(t.tree.failedToExportPDF)
    } finally {
      setExportingPDF(false)
    }
  }, [project, nodeDataMap, formatCurrency])

  // ✅ NOWE: Funkcja kopiowania linku udostępniania
  const onShareProject = useCallback(async () => {
    if (!project) return
    
    const shareUrl = `${window.location.origin}/share/${project.share_token}`
    
    try {
      await navigator.clipboard.writeText(shareUrl)
      setShareToastVisible(true)
      
      // Ukryj toast po 3 sekundach
      setTimeout(() => {
        setShareToastVisible(false)
      }, 3000)
    } catch (error) {
      console.error('Failed to copy share link:', error)
      // Fallback - pokaż alert z linkiem
      alert(`Share link: ${shareUrl}`)
    }
  }, [project])

  // ✅ NOWE: Zapisz pozycje do historii (automatycznie po przesunięciu)
  const saveToHistory = useCallback((positions: Record<string, { x: number; y: number }>) => {
    const currentIndex = historyIndexRef.current
    
    setPositionHistory(prev => {
      // Usuń wszystko po aktualnym indeksie (jeśli cofnęliśmy i teraz robimy nową zmianę)
      const newHistory = prev.slice(0, currentIndex + 1)
      
      // Dodaj nowy stan
      newHistory.push(positions)
      
      // Ogranicz historię do 20 stanów
      if (newHistory.length > 20) {
        newHistory.shift()
        // Index nie zmienia się bo usunęliśmy pierwszy element
      } else {
        const newIndex = newHistory.length - 1
        setHistoryIndex(newIndex)
      }
      
      return newHistory
    })
  }, [])

  // ✅ NOWE: Cofnij do poprzedniego stanu
  const onUndoPositions = useCallback(() => {
    
    if (positionHistory.length === 0) {
      alert(t.tree.noHistoryToRestore)
      return
    }
    
    if (historyIndex <= 0) {
      alert(t.tree.noEarlierStates)
      return
    }
    
    // ✅ NAPRAWA v1.14.6: Cofaj do POPRZEDNIEGO stanu (historyIndex - 1)
    // historyIndex wskazuje na AKTUALNY widok, więc cofamy do poprzedniego
    const targetIndex = historyIndex - 1
    const targetPositions = positionHistory[targetIndex]
    
    if (!targetPositions) {
      alert(t.tree.errorStateNotFound)
      console.error('[onUndoPositions] ❌ State not found at index', targetIndex)
      return
    }
    
    
    setNodes(currentNodes => {
      return currentNodes.map(node => {
        if (targetPositions[node.id]) {
          return {
            ...node,
            position: targetPositions[node.id]
          }
        }
        return node
      })
    })
    
    // Zmniejsz index (następne cofnięcie będzie do wcześniejszego stanu)
    setHistoryIndex(targetIndex)
    alert(t.tree.restoredToState.replace('{current}', String(targetIndex + 1)).replace('{total}', String(positionHistory.length)))
  }, [historyIndex, positionHistory, setNodes, t])

  // ✅ NOWE: Zapisz pozycje ręcznie (dla kompatybilności)
  const onSavePositions = useCallback(() => {
    // 🛡️ SAFETY LOCK: Blokada zapisu podczas ładowania początkowego
    if (isInitialLoadRef.current) {
      console.warn('[onSavePositions] 🛡️ Blokada zapisu podczas ładowania początkowego!')
      return
    }
    
    const positions: Record<string, { x: number; y: number }> = {}
    nodes.forEach(n => {
      positions[n.id] = n.position
    })
    
    // ✅ NAPRAWA v1.14.8: Sprawdź czy aktualny stan jest różny od ostatniego w historii
    const lastHistoryState = positionHistory[historyIndexRef.current]
    let isDifferent = false
    
    if (!lastHistoryState) {
      isDifferent = true // Brak historii, zapisz
    } else {
      // Porównaj pozycje
      const currentKeys = Object.keys(positions)
      const lastKeys = Object.keys(lastHistoryState)
      
      if (currentKeys.length !== lastKeys.length) {
        isDifferent = true
      } else {
        // Sprawdź czy któraś pozycja się zmieniła
        for (const key of currentKeys) {
          const current = positions[key]
          const last = lastHistoryState[key]
          
          if (!last || current.x !== last.x || current.y !== last.y) {
            isDifferent = true
            break
          }
        }
      }
    }
    
    // Zapisz do historii tylko jeśli stan się zmienił
    if (isDifferent) {
      saveToHistory(positions)
    } else {
    }
    
    // Zapisz do localStorage (zawsze, dla persystencji między sesjami)
    const storageKey = `project-${projectId}-positions`
    const manualFlagKey = `project-${projectId}-manual-layout`
    const collapsedKey = `project-${projectId}-collapsed`
    
    localStorage.setItem(storageKey, JSON.stringify(positions))
    localStorage.setItem(manualFlagKey, 'true')
    
    // ✅ FIX v1.22.2: Zapisz również stan collapsed nodes
    const collapsedArray = Array.from(collapsedNodes)
    localStorage.setItem(collapsedKey, JSON.stringify(collapsedArray))
    
    
    // ✅ NOWE v1.23.0: Batch save do API
    const apiPositions = nodes.map(node => ({
      id: node.data.nodeId,
      position_x: node.position.x,
      position_y: node.position.y
    }))
    
    axios.post(`${API_URL}/api/projects/${projectId}/save_layout/`, {
      positions: apiPositions
    }).then(response => {
      alert(t.tree.savedPositions.replace('{count}', String(nodes.length)))
    }).catch(error => {
      console.error(`[onSavePositions] ❌ Failed to batch save positions to API:`, error)
      // Pokaż alert mimo błędu API (localStorage backup działa)
      alert(t.tree.savedPositions.replace('{count}', String(nodes.length)))
    })
  }, [nodes, projectId, saveToHistory, positionHistory, t, collapsedNodes])

  // Expand/Collapse All - TOGGLE
  const [allExpanded, setAllExpanded] = useState(true) // Domyślnie wszystko rozwinięte
  
  const onToggleExpandAll = useCallback(() => {
    if (allExpanded) {
      // Zwiń wszystko
      const milestonesToCollapse = Array.from(nodeDataMap.values())
        .filter(n => (n.node_type === 'milestone' || !n.parent) && n.children && n.children.length > 0)
        .map(n => n.id)
      
      const newSet = new Set(milestonesToCollapse)
      collapsedNodesRef.current = newSet
      setCollapsedNodes(newSet)
      setAllExpanded(false)
    } else {
      // Rozwiń wszystko
      collapsedNodesRef.current = new Set()
      setCollapsedNodes(new Set())
      setAllExpanded(true)
    }
    applyVisibilityFilter()
  }, [allExpanded, nodeDataMap, applyVisibilityFilter])

  const buildTree = useCallback(
    (
      nodesData: DecisionNode[],
      projectBudget: number,
      preservePositions: boolean = false,
      existingNodes: Node[] = [],
      projectId: number = 0
    ): { nodes: Node[]; edges: Edge[]; nodeMap: Map<number, DecisionNode>; winningPath: Set<number> } => {
      const flowNodes: Node[] = []
      const flowEdges: Edge[] = []
      const reactFlowNodeMap = new Map<number, Node>()  // Dla edges (ReactFlow nodes)
      const dataMap = new Map<number, DecisionNode>()  // Dla onNodeClick (DecisionNode data)
      
      // ✅ NAPRAWA v1.28.0 - PROBLEM 3: Priorytet BAZA DANYCH > localStorage
      // Mapa istniejących pozycji - NIE UŻYWAMY localStorage jako pierwszego źródła!
      const positionMap = new Map<string, { x: number; y: number }>()
      let hasManualLayout = false
      
      // KROK 1: Najpierw sprawdź czy są pozycje w BAZIE DANYCH (z nodesData)
      let dbPositionsCount = 0
      const buildDbPositionMap = (nodes: DecisionNode[]) => {
        nodes.forEach(node => {
          // ✅ NAPRAWA v1.28.1: ZAUFAJ DANYM Z BAZY - tylko ignoruj (0,0) i ekstremalne wartości
          if (node.position_x !== null && node.position_x !== undefined && 
              node.position_y !== null && node.position_y !== undefined &&
              !(node.position_x === 0 && node.position_y === 0) &&
              // Tylko ekstremalne wartości (>1 milion) są ignorowane - ochrona przed błędami bazy
              Math.abs(node.position_x) < 1000000 && Math.abs(node.position_y) < 1000000) {
            const nodeId = `node-${node.id}`
            positionMap.set(nodeId, { 
              x: Number(node.position_x), 
              y: Number(node.position_y) 
            })
            dbPositionsCount++
          }
          if (node.children && node.children.length > 0) {
            buildDbPositionMap(node.children)
          }
        })
      }
      
      if (preservePositions && projectId > 0) {
        buildDbPositionMap(nodesData)
        
        if (dbPositionsCount > 0) {
          hasManualLayout = true
        } else {
          // KROK 2: Fallback do localStorage TYLKO jeśli baza jest pusta
          const storageKey = `project-${projectId}-positions`
          const savedPositions = localStorage.getItem(storageKey)
          
          if (savedPositions) {
            try {
              const positions = JSON.parse(savedPositions)
              Object.entries(positions).forEach(([nodeId, pos]) => {
                const position = pos as { x: number; y: number }
                // ✅ NAPRAWA v1.28.1: ZAUFAJ DANYM - tylko ekstremalne wartości są ignorowane
                if (Math.abs(position.x) < 1000000 && Math.abs(position.y) < 1000000) {
                  positionMap.set(nodeId, position)
                } else {
                  console.warn(`[buildTree] ⚠️ Skipping extreme position from localStorage: ${nodeId} (${position.x}, ${position.y})`)
                }
              })
              hasManualLayout = positionMap.size > 0
            } catch (e) {
              console.error('[buildTree] Failed to parse saved positions:', e)
            }
          }
        }
      }

      // Build data map first - WSZYSTKIE węzły, nie tylko root
      const buildDataMap = (nodes: DecisionNode[]) => {
        nodes.forEach(node => {
          dataMap.set(node.id, node)
          if (node.children && node.children.length > 0) {
            buildDataMap(node.children)
          }
        })
      }
      buildDataMap(nodesData)
      
      
      // ✅ PROBLEM 1 FIX: Auto-collapse milestones dla nowych projektów
      if (!hasManualLayout && projectId > 0) {
        const milestoneIds: number[] = []
        dataMap.forEach((node) => {
          if (node.node_type === 'milestone' || !node.parent) {
            milestoneIds.push(node.id)
          }
        })
        
        if (milestoneIds.length > 0) {
          // Aktualizuj collapsedNodesRef natychmiast
          const newCollapsedSet = new Set(collapsedNodesRef.current)
          milestoneIds.forEach(id => newCollapsedSet.add(id))
          collapsedNodesRef.current = newCollapsedSet
          // Zaktualizuj state (asynchronicznie)
          setCollapsedNodes(newCollapsedSet)
        }
      }
      
      // Calculate winning path (don't set state here!)
      const bestPath = findBestPath(dataMap)

      // ✅ NAPRAWA v1.28.0 - PROBLEM 1: Funkcja sprawdzająca czy węzeł powinien być ukryty
      // Sprawdza CAŁĄ ŚCIEŻKĘ przodków - jeśli którykolwiek jest collapsed, węzeł jest ukryty
      const isNodeHidden = (nodeData: DecisionNode): boolean => {
        // Sprawdź czy którykolwiek przodek jest zwinięty (collapsed)
        let current = nodeData.parent
        while (current) {
          if (collapsedNodesRef.current.has(current)) {
            return true
          }
          // Znajdź rodzica w dataMap
          const parentNode = dataMap.get(current)
          if (!parentNode) break
          current = parentNode.parent
        }
        return false
      }

      const createNode = (nodeData: DecisionNode, level: number, index: number): Node => {
        const nodeId = `node-${nodeData.id}`
        
        // ✅ NAPRAWA v1.28.1: ZAUFAJ DANYM Z BAZY - nie ograniczaj pozycji
        let x, y
        let usedSavedPosition = false
        
        if (positionMap.has(nodeId)) {
          // Użyj pozycji z positionMap (z DB lub localStorage) - BEZ OGRANICZEŃ
          const pos = positionMap.get(nodeId)!
          x = pos.x
          y = pos.y
          usedSavedPosition = true
        } else {
          // Domyślne pozycje dla nowych węzłów (bez zapisanych pozycji)
          x = level * 320 + 100
          y = index * 180 + 100
        }

        const pathCost = nodeData.path_cost || parseFloat(nodeData.estimated_cost)
        const exceedsBudget = pathCost > projectBudget
        
        // Check if node has children
        const children = Array.from(dataMap.values()).filter(n => n.parent === nodeData.id)
        const hasChildren = children.length > 0
        const isCollapsed = collapsedNodesRef.current.has(nodeData.id) // Użyj ref zamiast state
        const isOnWinningPath = bestPath.has(nodeData.id)
        
        // Oblicz zagregowany budżet (suma wybranych dzieci)
        const calculateAggregatedCost = (nodeId: number): number => {
          const children = Array.from(dataMap.values()).filter(n => n.parent === nodeId)
          if (children.length === 0) {
            // Liść - zwróć własny koszt
            return parseFloat(nodeData.estimated_cost) || 0
          }
          
          // Znajdź wybrane dziecko (status === 'selected')
          const selectedChild = children.find(c => c.status === 'selected')
          if (selectedChild) {
            // Rekurencyjnie oblicz koszt wybranego dziecka
            return calculateAggregatedCost(selectedChild.id)
          }
          
          // Jeśli nie ma wybranego dziecka, zwróć 0 (lub własny koszt?)
          return 0
        }
        
        const aggregatedCost = hasChildren ? calculateAggregatedCost(nodeData.id) : parseFloat(nodeData.estimated_cost) || 0
        const childrenCount = children.length
        const selectedChildrenCount = children.filter(c => c.status === 'selected').length

        // NAPRAWA: Jeśli węzeł NIE MA rodzica, ustaw node_type na 'milestone'
        let nodeType = nodeData.node_type || 'decision'
        if (!nodeData.parent) {
          nodeType = 'milestone'
        } else {
          nodeType = 'option'
        }

        const flowNode: Node = {
          id: nodeId,
          type: 'decisionNode',
          position: { x, y },
          data: {
            nodeId: nodeData.id,
            title: nodeData.title,
            description: nodeData.description,
            estimated_cost: nodeData.estimated_cost,
            vote_count: nodeData.vote_count || 0,
            pathCost,
            exceedsBudget,
            score_comfort: nodeData.score_comfort,
            score_risk: nodeData.score_risk,
            score_time: nodeData.score_time,
            score_pleasure: nodeData.score_pleasure,
            status: nodeData.status,
            section: nodeData.section,
            order: nodeData.order,
            node_type: nodeType,
            parent: nodeData.parent,
            hasChildren,
            isCollapsed, // ✅ Stan z collapsedNodesRef
            onToggleCollapse,
            onToggleSelection: handleToggleSelection,
            isOnWinningPath,
            aggregatedCost,
            childrenCount,
            selectedChildrenCount,
            onAddChild: handleAddChild,
            onDeleteNode: handleDeleteNode,
            onEditNode: handleEditNode,
            tasks: nodeData.tasks || [],
            comments: nodeData.comments || [],
            comment_count: nodeData.comment_count || 0,
          },
        }

        return flowNode
      }

      const processNode = (nodeData: DecisionNode, level: number, index: number, parentCollapsed: boolean = false) => {
        // ✅ NAPRAWA v1.28.0 - PROBLEM 1: CAŁKOWITE USUWANIE ZAMIAST FLAGI HIDDEN
        // Sprawdź czy węzeł powinien być ukryty (którykolwiek przodek jest collapsed)
        const shouldBeHidden = isNodeHidden(nodeData)
        
        if (shouldBeHidden) {
          // 🚫 NIE DODAWAJ tego węzła do tablicy flowNodes!
          // Użyj 'return' aby przerwać przetwarzanie tego węzła
          return
        }
        
        // Węzeł jest widoczny - utwórz go i dodaj do tablicy
        const flowNode = createNode(nodeData, level, index)
        flowNodes.push(flowNode)
        reactFlowNodeMap.set(nodeData.id, flowNode)  // Dla edges

        // ✅ NAPRAWA v1.28.0 - PROBLEM 3: Twórz edges TYLKO dla widocznych węzłów
        if (nodeData.parent) {
          const parentNode = reactFlowNodeMap.get(nodeData.parent)
          
          // Jeśli rodzic NIE ISTNIEJE w reactFlowNodeMap, oznacza to że jest ukryty
          // W takim przypadku NIE TWÓRZ edge
          if (!parentNode) {
            return
          }
          
          // Rodzic istnieje i jest widoczny - utwórz edge
          const pathCost = nodeData.path_cost || parseFloat(nodeData.estimated_cost)
          const exceedsBudget = pathCost > projectBudget
          const isOnWinningPath = bestPath.has(nodeData.id) && bestPath.has(nodeData.parent)
          
          // Określ typ krawędzi
          const parentIsMilestone = parentNode.data.node_type === 'milestone'
          const childIsMilestone = flowNode.data.node_type === 'milestone'
          
          // ✨✨ ULTRA WIDOCZNA STYLIZACJA:
          // 1. Milestone -> Milestone: Bardzo gruba linia z mocną poświatą, Violet
          // 2. Milestone -> Option: Jaśniejsza niebieska linia
          
          const isMainFlow = parentIsMilestone && childIsMilestone
          
          // ✅ UPROSZCZENIE v1.29.2.3: TYLKO połączenia pionowe (dół → góra)
          const sourcePos = Position.Bottom
          const targetPos = Position.Top
          const sourceHandle = 'bottom'
          const targetHandle = 'top'

          flowEdges.push({
            id: `edge-${nodeData.parent}-${nodeData.id}`,
            source: parentNode.id,
            target: flowNode.id,
            type: 'smoothstep', // ✅ Zawsze smoothstep
            sourcePosition: sourcePos,
            targetPosition: targetPos,
            sourceHandle: sourceHandle,  // ✅ DODANO: Konkretny uchwyt źródłowy
            targetHandle: targetHandle,  // ✅ DODANO: Konkretny uchwyt docelowy
            animated: isOnWinningPath,
            style: {
              stroke: isOnWinningPath ? '#f59e0b' : exceedsBudget ? '#ef4444' : (isMainFlow ? '#4ade80' : '#4ade80'), // Amber / Red / Green-400
              strokeWidth: isOnWinningPath ? 6 : (isMainFlow ? 16 : 6), // ⬆️⬆️ Grubsze linie dla opcji
              strokeLinecap: 'round',
              strokeLinejoin: 'round',
              opacity: isMainFlow ? 1 : 0.85, // Większa nieprzezroczystość dla opcji
              filter: isMainFlow ? 'drop-shadow(0 0 24px rgba(74, 222, 128, 0.9)) drop-shadow(0 0 48px rgba(74, 222, 128, 0.6))' : undefined,
            },
            markerEnd: {
              type: MarkerType.ArrowClosed,
              width: isMainFlow ? 40 : 26, // ⬆️⬆️ Większe strzałki dla opcji
              height: isMainFlow ? 40 : 26,
              color: isOnWinningPath ? '#f59e0b' : exceedsBudget ? '#ef4444' : '#4ade80',
            },
            pathOptions: { borderRadius: isMainFlow ? 30 : 40 }, // ✅ Zaokrąglone rogi
            zIndex: isMainFlow ? 10 : 1, // ⬆️ Opcje też nad tłem
          })
        }
        
        // Przetwórz dzieci tego węzła rekurencyjnie

        // Process children only if not collapsed
        const isCollapsed = collapsedNodesRef.current.has(nodeData.id) // Użyj ref zamiast state
        nodeData.children.forEach((child, childIndex) => {
          processNode(child, level + 1, index * 10 + childIndex, isCollapsed)
        })
      }

      nodesData.forEach((node, index) => {
        if (!node.parent) {
          processNode(node, 0, index)
        }
      })
      
      // ✅ NAPRAWA: Log ile pozycji zostało załadowanych
      const appliedPositions = flowNodes.filter(node => positionMap.has(node.id)).length
      if (appliedPositions > 0) {
      }

      return { nodes: flowNodes, edges: flowEdges, nodeMap: dataMap, winningPath: bestPath }
    },
    [findBestPath, onToggleCollapse] // Usunięto collapsedNodes z dependencies!
  )

  const fetchProject = useCallback(async () => {
    try {
      const response = await axios.get(`${API_URL}/api/projects/${projectId}/`)
      setProject(response.data)
    } catch (err) {
      console.error('Error fetching project:', err)
    }
  }, [projectId])

  const fetchTree = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await axios.get(`${API_URL}/api/projects/${projectId}/tree/`)
      const treeData = response.data
      
      if (treeData.length > 0) {
        if (treeData[0].children && treeData[0].children.length > 0) {
        }
      }

      if (Array.isArray(treeData) && treeData.length > 0) {
        const projectBudget = project ? parseFloat(project.budget_total) : 0
        
        // ✅ FIX v1.22.2: Sprawdź czy użytkownik ma zapisane pozycje PRZED auto-collapse
        const manualFlagKey = `project-${projectId}-manual-layout`
        const hasManualLayout = localStorage.getItem(manualFlagKey) === 'true'
        
        // ✅ NAPRAWA v1.27.0: Sprawdź również czy węzły mają zapisane pozycje w bazie (nie (0,0))
        const hasDbPositions = treeData.some((node: any) => {
          const checkNode = (n: any): boolean => {
            if (n.position_x && n.position_y && !(n.position_x === 0 && n.position_y === 0)) {
              return true
            }
            if (n.children && n.children.length > 0) {
              return n.children.some((child: any) => checkNode(child))
            }
            return false
          }
          return checkNode(node)
        })
        
        
        // ✅ NAPRAWA: Auto-collapse TYLKO dla nowych projektów (bez zapisanych pozycji)
        if (chronologicalMode && !hasManualLayout && !hasDbPositions) {
          const rootNodesWithChildren = new Set<number>()
          
          
          // Przejdź przez treeData i znajdź milestone
          const findMilestones = (nodes: any[]) => {
            nodes.forEach(node => {
              // Milestone to węzeł bez rodzica z dziećmi
              if (!node.parent && node.children && node.children.length > 0) {
                rootNodesWithChildren.add(node.id)
              }
              
              // Rekurencyjnie sprawdź dzieci
              if (node.children && node.children.length > 0) {
                findMilestones(node.children)
              }
            })
          }
          
          findMilestones(treeData)
          
          if (rootNodesWithChildren.size > 0) {
            setCollapsedNodes(rootNodesWithChildren)
            // ✅ Zaktualizuj ref NATYCHMIAST
            collapsedNodesRef.current = rootNodesWithChildren
          } else {
          }
        } else if (hasManualLayout) {
          // ✅ Załaduj zapisany stan collapsed nodes z localStorage
          const collapsedKey = `project-${projectId}-collapsed`
          const savedCollapsed = localStorage.getItem(collapsedKey)
          if (savedCollapsed) {
            try {
              const collapsedArray = JSON.parse(savedCollapsed)
              const collapsedSet = new Set<number>(collapsedArray)
              setCollapsedNodes(collapsedSet)
              collapsedNodesRef.current = collapsedSet
            } catch (e) {
              console.error('[fetchTree] Failed to parse saved collapsed nodes:', e)
            }
          }
        }
        
        // Teraz wywołaj buildTree (collapsedNodesRef jest już zaktualizowany)
        const preservePositions = true
        const { nodes: flowNodes, edges: flowEdges, nodeMap } = buildTree(
          treeData,
          projectBudget,
          preservePositions,
          nodesRef.current,
          projectId
        )
        
        
        // ✅ NAPRAWA v1.27.0: Jeśli węzły mają zapisane pozycje w bazie, ustaw flagę manual-layout
        if (hasDbPositions && !hasManualLayout) {
          const manualFlagKey = `project-${projectId}-manual-layout`
          localStorage.setItem(manualFlagKey, 'true')
        }
        
        setNodes(flowNodes)
        setEdges(flowEdges)
        setNodeDataMap(nodeMap)
        
        // bestPath is used in buildTree for edge styling
      } else {
        setNodes([])
        setEdges([])
        setNodeDataMap(new Map())
      }
    } catch (err) {
      console.error('Error fetching tree:', err)
      setError(t.tree.failedToLoadTree)
    } finally {
      setLoading(false)
    }
  }, [projectId, project, buildTree, setNodes, setEdges, chronologicalMode]) // Usunięto collapsedNodes i loadUiState z dependencies!

  // Funkcje dla menu kontekstowego (muszą być AFTER fetchTree)
  const handleAddChild = useCallback(async (parentId: number) => {
    const parentNode = nodeDataMap.get(parentId)
    if (parentNode) {
      try {
        // Utwórz nowy węzeł od razu
        const response = await axios.post(`${API_URL}/api/decision-nodes/`, {
          project: parentNode.project,
          parent: parentNode.id,
          title: t.common.newOption,
          description: '',
          estimated_cost: '0.00',
        })
        
        
        // Odśwież drzewo
        await fetchTree()
        
        // Otwórz sidebar z nowym węzłem do edycji
        const newNode = response.data
        setSelectedNode(newNode)
        setSidebarOpen(true)
      } catch (error) {
        console.error(`[handleAddChild] Failed to create child node:`, error)
      }
    }
  }, [nodeDataMap, fetchTree])

  const handleDeleteNode = useCallback(async (nodeId: number) => {
    try {
      await axios.delete(`${API_URL}/api/decision-nodes/${nodeId}/`)
      fetchTree() // Przeładuj drzewo
      setSidebarOpen(false)
      setSelectedNode(null)
    } catch (error) {
      console.error(`[handleDeleteNode] Failed to delete node ${nodeId}:`, error)
    }
  }, [fetchTree])

  const handleEditNode = useCallback((nodeId: number) => {
    const node = nodeDataMap.get(nodeId)
    if (node) {
      setSelectedNode(node)
      setSidebarOpen(true)
    } else {
      console.warn(`[handleEditNode] Node ${nodeId} not found in nodeDataMap`)
    }
  }, [nodeDataMap])

  useEffect(() => {
    if (projectId) {
      fetchProject()
    }
  }, [projectId, fetchProject])

  // Fetch tree only when projectId changes or project loads initially
  // Skip if we're just updating project metadata (like budget)
  useEffect(() => {
    if (projectId && project && !isUpdatingProjectMeta) {
      fetchTree()
      
      // ✅ SAFETY LOCK v1.25.0: Wyłącz blokadę zapisu po 2 sekundach od załadowania
      setTimeout(() => {
        isInitialLoadRef.current = false
      }, 2000)
    }
  }, [projectId, project, fetchTree, isUpdatingProjectMeta])
  
  // ✅ NOWE v1.29.2: Załaduj UI state (edges, viewport, collapsed) po załadowaniu nodes
  useEffect(() => {
    // Załaduj UI state tylko jeśli:
    // 1. Mamy nodes (dane zostały załadowane)
    // 2. Mamy project z ui_state
    // 3. Nie jesteśmy w trakcie początkowego ładowania
    if (nodes.length > 0 && project && project.ui_state && !isInitialLoadRef.current) {
      loadUiState(nodes)
    }
  }, [nodes.length, project?.id]) // Triggeruj tylko gdy zmieni się liczba nodes lub project ID

  // Auto-layout after AI generation
  useEffect(() => {
    if (shouldAutoLayout && nodes.length > 0 && !loading) {
      onLayout()
      setShouldAutoLayout(false)
      
      // Wycentruj widok po utworzeniu nowego projektu z AI
      setTimeout(() => {
        fitView({ 
          padding: 0.3,
          duration: 800,
          maxZoom: 0.8,
          minZoom: 0.1
        })
      }, 300)
    }
  }, [shouldAutoLayout, nodes.length, loading, onLayout, fitView])

  // Auto-layout from URL parameter (after AI Project Builder)
  useEffect(() => {
    const autoLayout = searchParams.get('autoLayout')
    if (autoLayout === 'true' && nodes.length > 0 && !loading) {
      setTimeout(() => {
        onLayout()
        // Usuń parametr z URL
        searchParams.delete('autoLayout')
        setSearchParams(searchParams)
        
        // Wycentruj widok po utworzeniu projektu z AI Builder
        setTimeout(() => {
          fitView({ 
            padding: 0.3,
            duration: 800,
            maxZoom: 0.8,
            minZoom: 0.1
          })
        }, 300)
      }, 500) // Małe opóźnienie aby dać czas na renderowanie
    }
  }, [searchParams, nodes.length, loading, onLayout, setSearchParams, fitView])

  // ✅ NAPRAWA: Auto-layout po załadowaniu projektu (fetchTree)
  // TYLKO jeśli NIE MA zapisanych pozycji
  const hasAutoLayoutedRef = useRef<Record<number, boolean>>({})
  
  // ✅ FIX v1.22.2: Resetuj hasAutoLayoutedRef gdy projectId się zmienia
  useEffect(() => {
    // Resetuj flagę dla tego projektu gdy wchodzimy do niego
    hasAutoLayoutedRef.current[projectId] = false
  }, [projectId])
  
  // =========================================================================
  // 🕵️‍♂️ DEEP DEBUG LAYOUT & CENTERING (PANCERNE CENTROWANIE)
  // =========================================================================
  useEffect(() => {
    // 1. Logika wstępna - czy mamy co układać?
    if (nodes.length === 0) return
    if (loading) return
    
    // Reset flagi jeśli zmienił się projekt (zabezpieczenie)
    if (!hasAutoLayoutedRef.current[projectId]) {
    } else {
      // Jeśli już zrobiliśmy layout, nie robimy nic więcej
      return
    }
    
    // 2. Definicja funkcji centrującej
    const attemptFitView = () => {
      const rfNodes = getNodes() // Pobierz węzły bezpośrednio z silnika
      const visibleNodes = rfNodes.filter(n => !n.hidden)
      
      // Sprawdź czy węzły mają wymiary (width > 0)
      const nodesWithDimensions = visibleNodes.filter(n => n.width && n.width > 0)
      const ready = visibleNodes.length > 0 && nodesWithDimensions.length === visibleNodes.length
      
      
      if (!ready) {
        return false // Jeszcze nie gotowe
      }
      
      // 3. Logika decyzyjna: Czy mamy pozycje?
      // Sprawdzamy czy chociaż jeden węzeł jest poza punktem (0,0)
      const hasPositions = visibleNodes.some(n => Math.abs(n.position.x) > 1 || Math.abs(n.position.y) > 1)
      
      
      if (hasPositions) {
        
        // Zastosuj filtrowanie widoczności (dla collapsed nodes)
        applyVisibilityFilter()
        
        // Zapisz początkowy stan do historii
        const positions: Record<string, { x: number; y: number }> = {}
        nodes.forEach(n => {
          positions[n.id] = n.position
        })
        saveToHistory(positions)
        
        window.requestAnimationFrame(() => {
          const success = fitView({ 
            padding: 0.5, 
            duration: 1000, 
            maxZoom: 0.25,
            minZoom: 0.05,
            includeHiddenNodes: false
          })
        })
        
        setDisableAutoLayout(true)
      } else {
        onLayout() // Auto-layout sam wywoła fitView na końcu
        
        // Zapisz początkowy stan do historii po auto-layout
        setTimeout(() => {
          const positions: Record<string, { x: number; y: number }> = {}
          nodes.forEach(n => {
            positions[n.id] = n.position
          })
          saveToHistory(positions)
        }, 800)
      }
      
      // Oznaczamy sukces
      hasAutoLayoutedRef.current[projectId] = true
      return true // Stop interval
    }
    
    // 4. Pętla sprawdzająca (Interval)
    // Próbuj co 100ms, maksymalnie przez 2 sekundy
    let attempts = 0
    const intervalId = setInterval(() => {
      attempts++
      const success = attemptFitView()
      
      if (success || attempts > 20) { // 20 * 100ms = 2 sekundy timeoutu
        clearInterval(intervalId)
        if (!success) console.warn('[Layout 🕵️‍♂️] ⚠️ Timeout! Nie udało się wycentrować (węzły nie dostały wymiarów).')
      }
    }, 100)
    
    return () => clearInterval(intervalId)
  }, [nodes.length, loading, projectId, getNodes, fitView, onLayout, applyVisibilityFilter, saveToHistory])

  // Auto-layout when collapsedNodes changes (in chronological mode)
  const prevCollapsedNodesSize = useRef(0)
  const onLayoutRef = useRef(onLayout)
  
  // Aktualizuj ref przy każdej zmianie onLayout
  useEffect(() => {
    onLayoutRef.current = onLayout
  }, [onLayout])
  
  useEffect(() => {
    // Tylko jeśli rozmiar się zmienił (unikamy pętli)
    if (chronologicalMode && 
        collapsedNodes.size > 0 && 
        collapsedNodes.size !== prevCollapsedNodesSize.current &&
        nodes.length > 0 && 
        !loading) {
      
      // ✅ KRYTYCZNE: Sprawdź czy użytkownik ma zapisane pozycje
      const manualFlagKey = `project-${projectId}-manual-layout`
      const hasManualLayout = localStorage.getItem(manualFlagKey) === 'true'
      
      if (hasManualLayout) {
        prevCollapsedNodesSize.current = collapsedNodes.size
        return
      }
      
      prevCollapsedNodesSize.current = collapsedNodes.size
      setTimeout(() => {
        onLayoutRef.current()
      }, 100)
    }
  }, [collapsedNodes.size, chronologicalMode, nodes.length, loading, projectId]) // Dodano projectId

  const onNodeClick: NodeMouseHandler = useCallback(
    (_event, node) => {
      const nodeId = node.data.nodeId
      if (nodeId) {
        const nodeData = nodeDataMap.get(nodeId)
        if (nodeData) {
          setSelectedNode(nodeData)
          setSidebarOpen(true)
        }
      }
    },
    [nodeDataMap]
  )

  const handleCloseSidebar = useCallback(() => {
    setSidebarOpen(false)
    setSelectedNode(null)
  }, [])

  const handleNodesGenerated = useCallback(() => {
    fetchTree()
    setShouldAutoLayout(true)
  }, [fetchTree])

  const handleNodeUpdated = useCallback(async (forceRefresh = false) => {
    // ✅ Jeśli forceRefresh=true (np. dodano dziecko), przeładuj całe drzewo
    if (forceRefresh) {
      fetchTree()
      if (selectedNode) {
        const updatedNode = nodeDataMap.get(selectedNode.id)
        if (updatedNode) {
          setSelectedNode(updatedNode)
        }
      }
      return
    }
    
    // ✅ W przeciwnym razie, pobierz tylko zaktualizowany węzeł
    if (!selectedNode) return
    
    try {
      const response = await axios.get(`${API_URL}/api/decision-nodes/${selectedNode.id}/`)
      const updatedNodeData = response.data
      
      // Zaktualizuj nodeDataMap
      setNodeDataMap(prev => {
        const newMap = new Map(prev)
        newMap.set(updatedNodeData.id, updatedNodeData)
        return newMap
      })
      
      // Zaktualizuj nodes w ReactFlow
      setNodes(currentNodes => 
        currentNodes.map(node => 
          node.data.nodeId === updatedNodeData.id
            ? { ...node, data: { ...node.data, ...updatedNodeData } }
            : node
        )
      )
      
      // Zaktualizuj selectedNode
      setSelectedNode(updatedNodeData)
      
      // ✅ KRYTYCZNE: Przebuduj edges aby odzwierciedlić zmianę statusu
      // Wywołujemy applyVisibilityFilter który przelicza edges
      setTimeout(() => {
        applyVisibilityFilter()
      }, 50)
      
    } catch (err) {
      console.error('[handleNodeUpdated] Failed to fetch updated node:', err)
      // W przypadku błędu, fallback do fetchTree
      fetchTree()
    }
  }, [selectedNode, setNodes, fetchTree, nodeDataMap, applyVisibilityFilter])

  const handleNodeDeleted = useCallback(() => {
    setSidebarOpen(false)
    setSelectedNode(null)
    fetchTree()
  }, [fetchTree])

  const onConnect = useCallback(
    (params: Connection) => {
      // ✅ NOWE v1.29.2: Wymuszamy pełne właściwości edge przy tworzeniu
      const newEdge: Edge = {
        id: `edge-${params.source}-${params.target}`,
        source: params.source!,
        target: params.target!,
        type: 'smoothstep', // ✅ Ładny, łamany kształt
        sourceHandle: params.sourceHandle || 'bottom', // ✅ Konkretny uchwyt
        targetHandle: params.targetHandle || 'top',    // ✅ Konkretny uchwyt
        sourcePosition: params.sourceHandle === 'left' || params.sourceHandle === 'left-source' ? Position.Left : 
                       params.sourceHandle === 'right' ? Position.Right : Position.Bottom,
        targetPosition: params.targetHandle === 'left' ? Position.Left :
                       params.targetHandle === 'right' || params.targetHandle === 'right-target' ? Position.Right : Position.Top,
        animated: true,
        style: {
          strokeWidth: 6,
          stroke: '#4ade80',
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          opacity: 0.8,
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          width: 20,
          height: 20,
          color: '#4ade80',
        },
        pathOptions: { borderRadius: 40 },
      }
      
      setEdges((eds) => [...eds, newEdge])
    },
    [setEdges]
  )

  // ✅ NAPRAWA v1.28.0: Automatyczny zapis pozycji po przesunięciu węzła
  const onNodeDragStop = useCallback(
    (_event: any, node: Node) => {
      // 🛡️ SAFETY LOCK: Blokada zapisu podczas ładowania początkowego
      if (isInitialLoadRef.current) {
        console.warn('[onNodeDragStop] 🛡️ Blokada zapisu podczas ładowania początkowego!')
        return
      }
      
      // ✅ NAPRAWA v1.28.0 - PROBLEM 2: Walidacja pozycji przed zapisem
      const x = node.position.x
      const y = node.position.y
      
      // Blokuj patologiczne koordynaty (poza zakresem -50000 do +50000)
      if (Math.abs(x) >= 50000 || Math.abs(y) >= 50000) {
        console.error(`[onNodeDragStop] ❌ BLOCKED pathological position: Node ${node.data.nodeId} at (${x}, ${y})`)
        console.error(`[onNodeDragStop] ❌ Position NOT saved - coordinates out of valid range`)
        return
      }
      
      
      // 1. Zapisz wszystkie pozycje (tylko te w prawidłowym zakresie)
      const positions: Record<string, { x: number; y: number }> = {}
      nodes.forEach(n => {
        // ✅ NAPRAWA v1.28.0 - PROBLEM 2: Filtruj patologiczne pozycje przed zapisem
        if (Math.abs(n.position.x) < 50000 && Math.abs(n.position.y) < 50000) {
          positions[n.id] = n.position
        } else {
          console.warn(`[onNodeDragStop] ⚠️ Skipping pathological position for node ${n.id}: (${n.position.x}, ${n.position.y})`)
        }
      })
      
      // 2. Zapisz do localStorage (natychmiast - backup)
      const storageKey = `project-${projectId}-positions`
      const collapsedKey = `project-${projectId}-collapsed`
      localStorage.setItem(storageKey, JSON.stringify(positions))
      
      // ✅ FIX v1.22.2: Zapisz również stan collapsed nodes
      const collapsedArray = Array.from(collapsedNodes)
      localStorage.setItem(collapsedKey, JSON.stringify(collapsedArray))
      
      // 3. Ustaw flagę manual-layout (zamyka auto-layout)
      const manualFlagKey = `project-${projectId}-manual-layout`
      localStorage.setItem(manualFlagKey, 'true')
      
      // 4. Wyłącz auto-layout w state
      setDisableAutoLayout(true)
      
      // 5. ✅ DEBOUNCING: Zapisz do historii tylko raz po 500ms (nie przy każdym ruchu)
      if (saveHistoryTimeoutRef.current) {
        clearTimeout(saveHistoryTimeoutRef.current)
      }
      
      saveHistoryTimeoutRef.current = setTimeout(() => {
        saveToHistory(positions)
      }, 500)
      
      // 6. ✅ NOWE v1.23.0: Debounced API call (1000ms) - zapisz pozycję do bazy
      if (savePositionTimeoutRef.current) {
        clearTimeout(savePositionTimeoutRef.current)
      }
      
      savePositionTimeoutRef.current = setTimeout(async () => {
        try {
          await axios.patch(`${API_URL}/api/decision-nodes/${node.data.nodeId}/`, {
            position_x: node.position.x,
            position_y: node.position.y
          })
        } catch (error) {
          console.error(`[onNodeDragStop] ❌ Failed to save position to API:`, error)
          // Nie pokazuj błędu użytkownikowi - localStorage backup działa
        }
      }, 1000) // 1 sekunda debounce dla API
    },
    [nodes, projectId, saveToHistory, collapsedNodes]
  )

  const defaultEdgeOptions = useMemo(
    () => ({
      type: 'smoothstep',
      animated: false,
      style: { 
        stroke: '#10b981', // Emerald Green
        strokeWidth: 3,
        opacity: 0.8 // Solidna widoczność
      },
      pathOptions: { borderRadius: 40 } // Bardzo profesjonalne zakręty
    }),
    []
  )

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full bg-slate-50">
        <div className="text-xl text-slate-600">{t.tree.loadingTree}</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full bg-slate-50">
        <div className="text-rose-600">{error}</div>
      </div>
    )
  }

  // Conditional rendering - Analytics View
  if (showAnalytics) {
    return (
      <div className="w-full h-full relative">
        {/* View Toggle - Tree/Timeline/Analytics */}
        <div className="absolute top-4 right-4 backdrop-blur-xl bg-white/90 border border-slate-200 rounded-xl shadow-lg z-[15] flex overflow-hidden">
          <button
            onClick={() => {
              setShowAnalytics(false)
              setShowTimeline(false)
            }}
            className={`px-4 py-2.5 text-sm font-semibold transition-all flex items-center gap-2 ${
              !showTimeline && !showAnalytics
                ? 'bg-indigo-600 text-white'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
            title={t.timeline.treeView}
          >
            <LayoutGrid className="w-4 h-4" />
            {t.timeline.treeView}
          </button>
          <button
            onClick={() => {
              setShowTimeline(true)
              setShowAnalytics(false)
            }}
            className={`px-4 py-2.5 text-sm font-semibold transition-all flex items-center gap-2 ${
              showTimeline
                ? 'bg-indigo-600 text-white'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
            title={t.timeline.timelineView}
          >
            <Calendar className="w-4 h-4" />
            {t.timeline.timelineView}
          </button>
          <button
            onClick={() => {
              setShowAnalytics(true)
              setShowTimeline(false)
            }}
            className={`px-4 py-2.5 text-sm font-semibold transition-all flex items-center gap-2 ${
              showAnalytics
                ? 'bg-indigo-600 text-white'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
            title={t.analytics.analyticsView}
          >
            <BarChart3 className="w-4 h-4" />
            {t.analytics.analyticsView}
          </button>
        </div>

        <ProjectAnalytics projectId={projectId} />
      </div>
    )
  }

  // Conditional rendering - Timeline View
  if (showTimeline) {
    return (
      <div className="w-full h-full relative">
        {/* View Toggle - Tree/Timeline/Analytics */}
        <div className="absolute top-4 right-4 backdrop-blur-xl bg-white/90 border border-slate-200 rounded-xl shadow-lg z-[15] flex overflow-hidden">
          <button
            onClick={() => {
              setShowTimeline(false)
              setShowAnalytics(false)
            }}
            className={`px-4 py-2.5 text-sm font-semibold transition-all flex items-center gap-2 ${
              !showTimeline && !showAnalytics
                ? 'bg-indigo-600 text-white'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
            title={t.timeline.treeView}
          >
            <LayoutGrid className="w-4 h-4" />
            {t.timeline.treeView}
          </button>
          <button
            onClick={() => {
              setShowTimeline(true)
              setShowAnalytics(false)
            }}
            className={`px-4 py-2.5 text-sm font-semibold transition-all flex items-center gap-2 ${
              showTimeline
                ? 'bg-indigo-600 text-white'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
            title={t.timeline.timelineView}
          >
            <Calendar className="w-4 h-4" />
            {t.timeline.timelineView}
          </button>
          <button
            onClick={() => {
              setShowAnalytics(true)
              setShowTimeline(false)
            }}
            className={`px-4 py-2.5 text-sm font-semibold transition-all flex items-center gap-2 ${
              showAnalytics
                ? 'bg-indigo-600 text-white'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
            title={t.analytics.analyticsView}
          >
            <BarChart3 className="w-4 h-4" />
            {t.analytics.analyticsView}
          </button>
        </div>

        <ProjectTimeline 
          projectId={projectId} 
          onNodeClick={(nodeId) => {
            // Switch back to tree view and select node
            setShowTimeline(false)
            setShowAnalytics(false)
            const node = nodeDataMap.get(nodeId)
            if (node) {
              setSelectedNode(node)
              setSidebarOpen(true)
            }
          }}
        />
      </div>
    )
  }

  return (
    <div className="w-full h-full relative bg-[radial-gradient(circle_at_center,_#1e293b_0%,_#0f172a_50%,_#020617_100%)]">
      {/* Subtelna siatka overlay */}
      <div className="absolute inset-0 opacity-20 pointer-events-none" style={{
        backgroundImage: 'linear-gradient(rgba(148, 163, 184, 0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(148, 163, 184, 0.1) 1px, transparent 1px)',
        backgroundSize: '50px 50px'
      }} />

      {project && (
        <>
          {/* Karta projektu - DARK GLASS PREMIUM */}
          <div className="absolute top-32 left-4 bg-slate-900/80 backdrop-blur-xl shadow-[0_20px_70px_rgba(99,102,241,0.3)] rounded-2xl p-4 z-[5] border border-white/10 hover:shadow-[0_25px_90px_rgba(99,102,241,0.5)] transition-all max-w-xs">
            <div className="text-sm font-bold text-white line-clamp-2 mb-2">{project.title}</div>
            <div className="text-xs text-slate-300 flex items-center gap-2">
              <span className="text-slate-400">{t.tree.budget}:</span>
              <span className="font-semibold text-slate-100">
                {formatCurrency(project.budget_total)}
              </span>
            </div>
          </div>

          {/* ✅ PROBLEM 2 FIX: Zunifikowany Segmented Control - Widoki (Centralnie na górze) */}
          <div className="absolute top-6 left-1/2 -translate-x-1/2 z-50 flex items-center bg-slate-100/80 backdrop-blur-sm p-1 rounded-xl shadow-sm border border-slate-200">
            <button
              onClick={() => {
                setShowTimeline(false)
                setShowAnalytics(false)
              }}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                !showTimeline && !showAnalytics
                  ? 'bg-white text-indigo-600 shadow-sm'
                  : 'text-slate-600 hover:bg-slate-200/50 hover:text-slate-900'
              }`}
              title={t.timeline.treeView}
            >
              <LayoutGrid className="w-4 h-4" />
              {t.timeline.treeView}
            </button>
            <button
              onClick={() => {
                setShowTimeline(true)
                setShowAnalytics(false)
              }}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                showTimeline
                  ? 'bg-white text-indigo-600 shadow-sm'
                  : 'text-slate-600 hover:bg-slate-200/50 hover:text-slate-900'
              }`}
              title={t.timeline.timelineView}
            >
              <Calendar className="w-4 h-4" />
              {t.timeline.timelineView}
            </button>
            <button
              onClick={() => {
                setShowAnalytics(true)
                setShowTimeline(false)
              }}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                showAnalytics
                  ? 'bg-white text-indigo-600 shadow-sm'
                  : 'text-slate-600 hover:bg-slate-200/50 hover:text-slate-900'
              }`}
              title={t.analytics.analyticsView}
            >
              <BarChart3 className="w-4 h-4" />
              {t.analytics.analyticsView}
            </button>
          </div>

          {/* ✅ PROBLEM 2 FIX: Zunifikowany Pasek Akcji Projektu (Prawy górny róg) */}
          <div className="absolute top-6 right-6 flex items-center gap-3 z-50">
            {/* All Tasks Button */}
            <button
              onClick={() => setGlobalActionBoardOpen(true)}
              className="bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 shadow-sm px-4 py-2 rounded-xl flex items-center gap-2 text-sm font-medium transition-colors"
              title={language === 'pl' ? 'Zobacz wszystkie zadania projektu' : 'View all project tasks'}
            >
              <ListTodo className="w-4 h-4" />
              {t.globalActionBoard.title}
            </button>

            {/* AI Advisor Button */}
            <button
              onClick={() => setAdvisorOpen(true)}
              className="bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 shadow-sm px-4 py-2 rounded-xl flex items-center gap-2 text-sm font-medium transition-colors"
              title={language === 'pl' ? 'Doradca strategiczny AI' : 'AI Strategic Advisor'}
            >
              <Brain className="w-4 h-4 text-indigo-600" />
              {language === 'pl' ? 'Doradca AI' : 'AI Advisor'}
            </button>

            {/* Edit Project Button */}
            <button
              onClick={() => setEditProjectOpen(true)}
              className="bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 shadow-sm px-4 py-2 rounded-xl flex items-center gap-2 text-sm font-medium transition-colors"
              title={language === 'pl' ? 'Edytuj tytuł, opis i budżet projektu' : 'Edit project title, description and budget'}
            >
              <Settings className="w-4 h-4" />
              {language === 'pl' ? 'Edytuj' : 'Edit'}
            </button>
          </div>

          {/* ✅ PROBLEM 2 FIX: Pasek Kontrolek (Lewy górny róg) */}
          <div className="absolute top-20 left-6 flex gap-3 z-50">
            {/* Scenariusze - Dropdown Button */}
            <div className="relative">
              <button
                onClick={() => setScenarioMenuOpen(!scenarioMenuOpen)}
                className="bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 shadow-sm px-4 py-2 rounded-xl flex items-center gap-2 text-sm font-medium transition-colors"
                title={language === 'pl' ? 'Wybierz scenariusz automatycznego wyboru opcji' : 'Select auto-selection scenario'}
              >
                <Sparkles className="w-4 h-4 text-indigo-600" />
                {language === 'pl' ? 'Scenariusze' : 'Scenarios'}
                <motion.div
                  animate={{ rotate: scenarioMenuOpen ? 180 : 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <ChevronDown className="w-3 h-3" />
                </motion.div>
              </button>

              {/* Dropdown Menu */}
              {scenarioMenuOpen && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="absolute top-12 left-0 bg-white rounded-xl shadow-xl border border-slate-200 overflow-hidden min-w-[280px] z-20"
                >
                  <button
                    onClick={async () => {
                      const milestones = Array.from(nodeDataMap.values()).filter(n => n.node_type === 'milestone')
                      
                      for (const milestone of milestones) {
                        const options = Array.from(nodeDataMap.values()).filter(n => n.parent === milestone.id)
                        
                        if (options.length > 0) {
                          const cheapest = options.reduce((min, opt) => 
                            parseFloat(opt.estimated_cost) < parseFloat(min.estimated_cost) ? opt : min
                          )
                          
                          for (const opt of options) {
                            const newStatus = opt.id === cheapest.id ? 'selected' : 'pending'
                            await axios.patch(`${API_URL}/api/decision-nodes/${opt.id}/`, { status: newStatus })
                          }
                        }
                      }
                      
                      fetchTree()
                      setScenarioMenuOpen(false)
                    }}
                    className="w-full px-4 py-3 text-left text-slate-700 hover:bg-emerald-50 transition-all flex items-center gap-3 border-b border-slate-100"
                  >
                    <DollarSign className="w-5 h-5 text-emerald-600" />
                    <div>
                      <div className="font-semibold text-sm">{t.tree.budgetMode}</div>
                      <div className="text-xs text-slate-500">{t.tree.budgetModeTooltip}</div>
                    </div>
                  </button>

                  <button
                    onClick={async () => {
                      const milestones = Array.from(nodeDataMap.values()).filter(n => n.node_type === 'milestone')
                      
                      for (const milestone of milestones) {
                        const options = Array.from(nodeDataMap.values()).filter(n => n.parent === milestone.id)
                        
                        if (options.length > 0) {
                          const balanced = options.reduce((best, opt) => {
                            const optScore = ((opt.score_comfort || 0) + (100 - (opt.score_risk || 0)) + (opt.score_time || 0) + (opt.score_pleasure || 0)) / 4
                            const bestScore = ((best.score_comfort || 0) + (100 - (best.score_risk || 0)) + (best.score_time || 0) + (best.score_pleasure || 0)) / 4
                            return optScore > bestScore ? opt : best
                          })
                          
                          for (const opt of options) {
                            const newStatus = opt.id === balanced.id ? 'selected' : 'pending'
                            await axios.patch(`${API_URL}/api/decision-nodes/${opt.id}/`, { status: newStatus })
                          }
                        }
                      }
                      
                      fetchTree()
                      setScenarioMenuOpen(false)
                    }}
                    className="w-full px-4 py-3 text-left text-slate-700 hover:bg-blue-50 transition-all flex items-center gap-3 border-b border-slate-100"
                  >
                    <Target className="w-5 h-5 text-blue-600" />
                    <div>
                      <div className="font-semibold text-sm">{t.tree.balancedMode}</div>
                      <div className="text-xs text-slate-500">{t.tree.balancedModeTooltip}</div>
                    </div>
                  </button>

                  <button
                    onClick={async () => {
                      const milestones = Array.from(nodeDataMap.values()).filter(n => n.node_type === 'milestone')
                      
                      for (const milestone of milestones) {
                        const options = Array.from(nodeDataMap.values()).filter(n => n.parent === milestone.id)
                        
                        if (options.length > 0) {
                          const vip = options.reduce((max, opt) => 
                            (opt.score_pleasure || 0) > (max.score_pleasure || 0) ? opt : max
                          )
                          
                          for (const opt of options) {
                            const newStatus = opt.id === vip.id ? 'selected' : 'pending'
                            await axios.patch(`${API_URL}/api/decision-nodes/${opt.id}/`, { status: newStatus })
                          }
                        }
                      }
                      
                      fetchTree()
                      setScenarioMenuOpen(false)
                    }}
                    className="w-full px-4 py-3 text-left text-slate-700 hover:bg-amber-50 transition-all flex items-center gap-3"
                  >
                    <Heart className="w-5 h-5 text-amber-600" />
                    <div>
                      <div className="font-semibold text-sm">{t.tree.vipMode}</div>
                      <div className="text-xs text-slate-500">{t.tree.vipModeTooltip}</div>
                    </div>
                  </button>
                </motion.div>
              )}
            </div>

            {/* Expand/Collapse All Button */}
            <button
              onClick={onToggleExpandAll}
              className="bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 shadow-sm px-4 py-2 rounded-xl flex items-center gap-2 text-sm font-medium transition-colors"
              title={allExpanded ? t.tree.collapseAllMilestones : t.tree.expandAllMilestones}
            >
              {allExpanded ? <ChevronsUp className="w-4 h-4" /> : <ChevronsDown className="w-4 h-4" />}
              {allExpanded ? t.tree.collapseAll : t.tree.expandAll}
            </button>
          </div>

          {/* Layout Controls */}
          <div className="absolute top-32 right-4 flex flex-col gap-2 z-[15]">
            {/* Generuj Plan Działania Button - PREMIUM GRADIENT */}
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => {
                
                // Zbierz wszystkie zaznaczone opcje
                const selectedOptions = Array.from(nodeDataMap.values())
                  .filter(node => node.status === 'selected' && node.node_type !== 'milestone')
                  .map(node => ({
                    id: node.id,
                    title: node.title,
                    description: node.description,
                    cost: parseFloat(node.estimated_cost),
                    section: node.section,
                    order: node.order,
                    scores: {
                      comfort: node.score_comfort,
                      risk: node.score_risk,
                      time: node.score_time,
                      pleasure: node.score_pleasure
                    }
                  }))
                
                // Oblicz totale
                const totalCost = selectedOptions.reduce((sum, opt) => sum + opt.cost, 0)
                const avgJoy = selectedOptions.length > 0
                  ? selectedOptions.reduce((sum, opt) => sum + (opt.scores.pleasure || 0), 0) / selectedOptions.length
                  : 0
                
                // Stwórz plan działania
                const actionPlan = {
                  projectId,
                  projectTitle: project?.title,
                  budget: project ? parseFloat(project.budget_total) : 0,
                  selectedOptions,
                  summary: {
                    totalCost,
                    avgJoy: avgJoy.toFixed(1),
                    optionsCount: selectedOptions.length,
                    budgetUsage: project ? ((totalCost / parseFloat(project.budget_total)) * 100).toFixed(1) : 0
                  },
                  generatedAt: new Date().toISOString()
                }
                
                // Wyświetl w konsoli (gotowe do wysłania do API)
                
                // Zapisz do pliku JSON
                const blob = new Blob([JSON.stringify(actionPlan, null, 2)], { type: 'application/json' })
                const url = URL.createObjectURL(blob)
                const a = document.createElement('a')
                a.href = url
                a.download = `action_plan_project_${projectId}.json`
                a.click()
                URL.revokeObjectURL(url)
                
                // Pokaż alert z podsumowaniem
                const message = t.tree.actionPlanGenerated
                  .replace('{count}', String(actionPlan.summary.optionsCount))
                  .replace('{cost}', formatCurrency(totalCost)) +
                  `😊 Średnia radość: ${actionPlan.summary.avgJoy}/100\n` +
                  `📈 Wykorzystanie budżetu: ${actionPlan.summary.budgetUsage}%\n\n` +
                  `Plan został zapisany jako JSON`
                
                alert(message)
              }}
              className="bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white px-3 py-2 rounded-xl shadow-lg hover:shadow-xl transition-all flex items-center gap-2 font-semibold text-sm border border-indigo-400/30"
              title="Generate action plan from selected options"
            >
              <FileDown className="w-4 h-4" />
              Generuj Plan
            </motion.button>
            
            {/* Auto-layout Button - DARK GLASS */}
            <motion.button
              data-testid="auto-layout-button"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => {
                
                const manualFlagKey = `project-${projectId}-manual-layout`
                const storageKey = `project-${projectId}-positions`
                const collapsedKey = `project-${projectId}-collapsed`
                
                localStorage.removeItem(manualFlagKey)
                localStorage.removeItem(storageKey)
                localStorage.removeItem(collapsedKey) // ✅ FIX v1.22.2: Usuń również collapsed state
                setDisableAutoLayout(false)
                
                
                // ✅ KRYTYCZNE: Zwiń wszystkie milestones NATYCHMIAST
                const allNodes = Array.from(nodeDataMap.values())
                const rootNodesWithChildren = new Set<number>()
                
                allNodes.forEach(node => {
                  // Milestone to węzeł bez rodzica z dziećmi
                  if (!node.parent) {
                    const children = allNodes.filter(n => n.parent === node.id)
                    if (children.length > 0) {
                      rootNodesWithChildren.add(node.id)
                    }
                  }
                })
                
                
                // Zaktualizuj ZARÓWNO state JAK I ref
                setCollapsedNodes(rootNodesWithChildren)
                collapsedNodesRef.current = rootNodesWithChildren
                
                // ✅ Wywołaj onLayout NATYCHMIAST (ref jest już zaktualizowany)
                setTimeout(() => {
                  onLayout()
                  
                  // ✅ FIX v1.22.3: Użyj stabilnej funkcji forceCenterView
                  forceCenterView()
                }, 50)
              }}
              className="bg-slate-800/60 backdrop-blur-md border border-white/20 text-white hover:bg-indigo-600/20 hover:border-indigo-400 transition-all shadow-lg rounded-xl px-3 py-2 flex items-center gap-2 font-medium text-sm"
              title="Reset layout to default positions"
            >
              <Sparkles className="w-4 h-4" />
              Auto-layout
            </motion.button>
            
            {/* Save Positions Button - DARK GLASS */}
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={onSavePositions}
              className="bg-slate-800/60 backdrop-blur-md border border-white/20 text-white hover:bg-indigo-600/20 hover:border-indigo-400 transition-all shadow-lg rounded-xl px-3 py-2 flex items-center gap-2 font-medium text-sm"
              title="Save current positions"
            >
              <Save className="w-4 h-4" />
              Zapisz
            </motion.button>
            
            {/* Undo Positions Button - DARK GLASS */}
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={onUndoPositions}
              className="bg-slate-800/60 backdrop-blur-md border border-white/20 text-white hover:bg-indigo-600/20 hover:border-indigo-400 transition-all shadow-lg rounded-xl px-3 py-2 flex items-center gap-2 font-medium text-sm"
              title="Restore last saved positions"
            >
              <Undo className="w-4 h-4" />
              Cofnij
            </motion.button>
            
            {/* Center View Button - DARK GLASS */}
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={onCenterView}
              className="bg-slate-800/60 backdrop-blur-md border border-white/20 text-white hover:bg-indigo-600/20 hover:border-indigo-400 transition-all shadow-lg rounded-xl px-3 py-2 flex items-center gap-2 font-medium text-sm"
              title={t.common.centerView}
            >
              <Target className="w-4 h-4" />
              Center
            </motion.button>
            
            {/* Export PDF Button - DARK GLASS */}
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={onExportPDF}
              disabled={exportingPDF}
              className="bg-slate-800/60 backdrop-blur-md border border-white/20 text-white hover:bg-indigo-600/20 hover:border-indigo-400 transition-all shadow-lg rounded-xl px-3 py-2 flex items-center gap-2 font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              title="Export to PDF"
            >
              <FileDown className="w-4 h-4" />
              {exportingPDF ? t.tree.exporting : t.tree.exportPDF}
            </motion.button>
            
            {/* Share Button - DARK GLASS */}
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={onShareProject}
              className="bg-gradient-to-r from-indigo-600/80 to-purple-600/80 backdrop-blur-md border border-indigo-400/30 text-white hover:from-indigo-500/90 hover:to-purple-500/90 transition-all shadow-lg rounded-xl px-3 py-2 flex items-center gap-2 font-medium text-sm"
              title="Share project"
            >
              <Link className="w-4 h-4" />
              Share
            </motion.button>
          </div>
        </>
      )}
      <ReactFlow
        id="react-flow-wrapper"
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={onNodeClick}
        onNodeDragStop={onNodeDragStop}
        nodeTypes={nodeTypes}
        defaultEdgeOptions={defaultEdgeOptions}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.01}
        maxZoom={2}
        className="bg-transparent"
      >
        {/* SVG Gradient Definitions */}
        <svg style={{ position: 'absolute', width: 0, height: 0 }}>
          <defs>
            <linearGradient id="milestone-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#6366f1" stopOpacity="1" />
              <stop offset="50%" stopColor="#8b5cf6" stopOpacity="1" />
              <stop offset="100%" stopColor="#06b6d4" stopOpacity="1" />
            </linearGradient>
          </defs>
        </svg>
        {/* Section Headers - TYMCZASOWO UKRYTE (mylące dla użytkownika) */}
        {/* TODO: Przenieść do menu "Filtry" lub usunąć całkowicie */}
        {false && chronologicalMode && sectionHeaders.map(header => (
          <SectionHeader
            key={header.section}
            section={header.section}
            nodeCount={header.nodeCount}
            y={header.y}
            collapsed={collapsedSections.has(header.section)}
            onToggle={() => toggleSectionCollapse(header.section)}
          />
        ))}
        
        <Background
          variant={BackgroundVariant.Lines}
          gap={50}
          size={0.5}
          color="#1e293b"
          className="opacity-20"
        />
        <Controls
          className="bg-white/90 backdrop-blur-xl border border-white/40 rounded-xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:shadow-[0_12px_40px_rgb(0,0,0,0.08)] transition-all"
          showInteractive={false}
        />
        <MiniMap
          className="bg-white/90 backdrop-blur-xl border border-white/40 rounded-xl shadow-[0_8px_30px_rgb(0,0,0,0.04)]"
          nodeColor="#6366f1"
          maskColor="rgba(0, 0, 0, 0.1)"
          style={{
            height: 120,
            width: 180,
          }}
        />
      </ReactFlow>
      
      {/* Floating Dashboard - Statystyki zaznaczonych opcji */}
      <FloatingDashboard
        selectedNodes={Array.from(nodeDataMap.values())
          .filter(node => node.status === 'selected' && node.node_type !== 'milestone')
          .map(node => ({
            nodeId: node.id,
            title: node.title,
            cost: node.actual_cost ? parseFloat(node.actual_cost) : parseFloat(node.estimated_cost) || 0,
            joy: node.score_pleasure || 0,
            risk: node.score_risk || 0,
            section: node.section || 'general'
          }))}
        totalBudget={project ? parseFloat(project.budget_total) : 0}
      />
      
      <NodeSidebar
        node={selectedNode}
        isOpen={sidebarOpen}
        onClose={handleCloseSidebar}
        onNodesGenerated={handleNodesGenerated}
        onNodeUpdated={handleNodeUpdated}
        onNodeDeleted={handleNodeDeleted}
      />
      <ProjectAdvisor
        projectId={projectId}
        isOpen={advisorOpen}
        onClose={() => setAdvisorOpen(false)}
        onSuggestionsApplied={fetchTree}
      />
      {project && (
        <EditProjectModal
          isOpen={editProjectOpen}
          onClose={() => setEditProjectOpen(false)}
          project={project}
          onProjectUpdated={async () => {
            // Ustaw flagę że aktualizujemy tylko metadane
            setIsUpdatingProjectMeta(true)
            
            try {
              const response = await axios.get(`${API_URL}/api/projects/${projectId}/`)
              setProject(response.data)
              
              // Po krótkiej chwili wyłącz flagę
              setTimeout(() => {
                setIsUpdatingProjectMeta(false)
              }, 100)
            } catch (error) {
              console.error('Error refreshing project:', error)
              setIsUpdatingProjectMeta(false)
            }
          }}
        />
      )}
      
      {/* Global Action Board */}
      {project && (
        <GlobalActionBoard
          projectId={project.id}
          isOpen={globalActionBoardOpen}
          onClose={() => setGlobalActionBoardOpen(false)}
          onTaskUpdated={() => {
            // Odśwież drzewo aby zaktualizować wskaźniki zadań na węzłach
            fetchTree()
          }}
        />
      )}
      
      {/* Share Toast Notification */}
      {shareToastVisible && (
        <motion.div
          initial={{ opacity: 0, y: 50 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 50 }}
          className="fixed bottom-8 right-8 z-50 bg-gradient-to-r from-emerald-500 to-green-600 text-white px-6 py-4 rounded-xl shadow-2xl flex items-center gap-3 border border-emerald-400/30"
        >
          <div className="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <div>
            <p className="font-semibold">Link skopiowany!</p>
            <p className="text-sm text-emerald-100">Możesz go wysłać znajomym</p>
          </div>
        </motion.div>
      )}
      
      <AIChat projectId={projectId} />
    </div>
  )
}

export default TreeVisualizer

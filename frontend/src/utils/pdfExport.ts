import jsPDF from 'jspdf'

interface ProjectData {
  title: string
  description: string
  budget_total: string
}

interface NodeData {
  id: number
  title: string
  description: string
  estimated_cost: string
  section?: string
  order?: number
  node_type?: string
  score_comfort?: number
  score_risk?: number
  score_time?: number
  score_pleasure?: number
  status?: string
}

interface TranslationKeys {
  nodesSummary: string
  budgetSummary: string
  statistics: string
  sections: string
  order: string
  title: string
  type: string
  section: string
  cost: string
  status: string
  avgScore: string
  totalBudget: string
  totalCost: string
  remainingBudget: string
  totalNodes: string
  milestones: string
  decisions: string
  selected: string
  rejected: string
  pending: string
  generatedOn: string
  pageOf: string
  decision: string
  milestone: string
}

export const exportProjectToPDF = async (
  project: ProjectData,
  nodes: NodeData[],
  _treeElementId: string, // Reserved for future use
  formatCurrency: (amount: string | number) => string,
  translations: TranslationKeys
) => {
  try {
    // Utwórz PDF w orientacji landscape
    const pdf = new jsPDF('landscape', 'mm', 'a4')
    const pageWidth = pdf.internal.pageSize.getWidth()
    const pageHeight = pdf.internal.pageSize.getHeight()
    
    // === STRONA 1: Tytuł i Podsumowanie ===
    
    // Nagłówek
    pdf.setFontSize(24)
    pdf.setTextColor(30, 41, 59) // slate-800
    pdf.text(project.title, pageWidth / 2, 30, { align: 'center' })
    
    pdf.setFontSize(12)
    pdf.setTextColor(100, 116, 139) // slate-500
    pdf.text(`${translations.totalBudget}: ${formatCurrency(project.budget_total)}`, pageWidth / 2, 42, { align: 'center' })
    pdf.text(`${translations.generatedOn}: ${new Date().toLocaleDateString()}`, pageWidth / 2, 50, { align: 'center' })
    
    // Podsumowanie budżetu
    let yPos = 70
    pdf.setFontSize(16)
    pdf.setTextColor(30, 41, 59)
    pdf.text(translations.budgetSummary, 15, yPos)
    
    yPos += 15
    pdf.setFontSize(11)
    
    // Całkowity budżet
    pdf.setFont('helvetica', 'bold')
    pdf.text(`${translations.totalBudget}:`, 20, yPos)
    pdf.setFont('helvetica', 'normal')
    pdf.text(formatCurrency(project.budget_total), 90, yPos)
    yPos += 10
    
    // Suma kosztów decision nodes
    const totalCost = nodes
      .filter(n => n.node_type !== 'milestone')
      .reduce((sum, n) => sum + parseFloat(n.estimated_cost || '0'), 0)
    
    pdf.setFont('helvetica', 'bold')
    pdf.text(`${translations.totalCost}:`, 20, yPos)
    pdf.setFont('helvetica', 'normal')
    pdf.text(formatCurrency(totalCost), 90, yPos)
    yPos += 10
    
    // Pozostały budżet
    const remaining = parseFloat(project.budget_total) - totalCost
    pdf.setFont('helvetica', 'bold')
    pdf.text(`${translations.remainingBudget}:`, 20, yPos)
    pdf.setFont('helvetica', 'normal')
    pdf.setTextColor(remaining >= 0 ? 34 : 239, remaining >= 0 ? 197 : 68, remaining >= 0 ? 94 : 68)
    pdf.text(formatCurrency(remaining), 90, yPos)
    yPos += 20
    
    // Statystyki
    pdf.setTextColor(30, 41, 59)
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(14)
    pdf.text(translations.statistics, 15, yPos)
    yPos += 12
    
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(10)
    
    const milestones = nodes.filter(n => n.node_type === 'milestone').length
    const decisions = nodes.filter(n => n.node_type === 'decision').length
    const selected = nodes.filter(n => n.status === 'selected').length
    const rejected = nodes.filter(n => n.status === 'rejected').length
    const pending = nodes.filter(n => n.status === 'pending' || !n.status).length
    
    pdf.text(`• ${translations.totalNodes}: ${nodes.length}`, 20, yPos)
    yPos += 7
    pdf.text(`• ${translations.milestones}: ${milestones}`, 20, yPos)
    yPos += 7
    pdf.text(`• ${translations.decisions}: ${decisions}`, 20, yPos)
    yPos += 7
    pdf.text(`• ${translations.selected}: ${selected}`, 20, yPos)
    yPos += 7
    pdf.text(`• ${translations.rejected}: ${rejected}`, 20, yPos)
    yPos += 7
    pdf.text(`• ${translations.pending}: ${pending}`, 20, yPos)
    
    // Sekcje
    yPos += 15
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(14)
    pdf.text(translations.sections, 15, yPos)
    yPos += 12
    
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(10)
    
    const sectionCounts = nodes.reduce((acc, node) => {
      const section = node.section || 'general'
      acc[section] = (acc[section] || 0) + 1
      return acc
    }, {} as Record<string, number>)
    
    Object.entries(sectionCounts).forEach(([section, count]) => {
      pdf.text(`• ${section}: ${count}`, 20, yPos)
      yPos += 7
    })
    
    // === STRONA 2+: Tabela Węzłów ===
    pdf.addPage()
    
    // Nagłówek strony
    pdf.setFontSize(16)
    pdf.setTextColor(30, 41, 59)
    pdf.text(translations.nodesSummary, 15, 20)
    
    // Sortuj węzły według order
    const sortedNodes = [...nodes].sort((a, b) => (a.order || 0) - (b.order || 0))
    
    // Tabela
    yPos = 35
    const lineHeight = 7
    const colWidths = {
      order: 12,
      title: 75,
      type: 22,
      section: 28,
      cost: 28,
      status: 22,
      avgScore: 20,
    }
    
    // Nagłówki tabeli
    pdf.setFontSize(9)
    pdf.setTextColor(71, 85, 105) // slate-600
    pdf.setFont('helvetica', 'bold')
    
    let xPos = 15
    pdf.text('#', xPos, yPos)
    xPos += colWidths.order
    pdf.text(translations.title, xPos, yPos)
    xPos += colWidths.title
    pdf.text(translations.type, xPos, yPos)
    xPos += colWidths.type
    pdf.text(translations.section, xPos, yPos)
    xPos += colWidths.section
    pdf.text(translations.cost, xPos, yPos)
    xPos += colWidths.cost
    pdf.text(translations.status, xPos, yPos)
    xPos += colWidths.status
    pdf.text(translations.avgScore, xPos, yPos)
    
    // Linia pod nagłówkami
    yPos += 2
    pdf.setDrawColor(203, 213, 225) // slate-300
    pdf.line(15, yPos, pageWidth - 15, yPos)
    yPos += 6
    
    // Wiersze tabeli
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(8)
    
    sortedNodes.forEach((node, index) => {
      // Sprawdź czy trzeba dodać nową stronę
      if (yPos > pageHeight - 20) {
        pdf.addPage()
        yPos = 20
        
        // Powtórz nagłówki
        pdf.setFontSize(9)
        pdf.setTextColor(71, 85, 105)
        pdf.setFont('helvetica', 'bold')
        
        xPos = 15
        pdf.text('#', xPos, yPos)
        xPos += colWidths.order
        pdf.text(translations.title, xPos, yPos)
        xPos += colWidths.title
        pdf.text(translations.type, xPos, yPos)
        xPos += colWidths.type
        pdf.text(translations.section, xPos, yPos)
        xPos += colWidths.section
        pdf.text(translations.cost, xPos, yPos)
        xPos += colWidths.cost
        pdf.text(translations.status, xPos, yPos)
        xPos += colWidths.status
        pdf.text(translations.avgScore, xPos, yPos)
        
        yPos += 2
        pdf.setDrawColor(203, 213, 225)
        pdf.line(15, yPos, pageWidth - 15, yPos)
        yPos += 6
        
        pdf.setFont('helvetica', 'normal')
        pdf.setFontSize(8)
      }
      
      const avgScore = node.node_type === 'milestone' ? '-' : 
        Math.round(((node.score_comfort || 50) + (100 - (node.score_risk || 50)) + 
        (node.score_time || 50) + (node.score_pleasure || 50)) / 4).toString()
      
      xPos = 15
      pdf.setTextColor(51, 65, 85) // slate-700
      
      // Order
      pdf.text((node.order || index + 1).toString(), xPos, yPos)
      xPos += colWidths.order
      
      // Title (skróć jeśli za długi, bez rozciągania liter)
      const maxTitleLength = 45
      const title = node.title.length > maxTitleLength ? 
        node.title.substring(0, maxTitleLength - 3) + '...' : 
        node.title
      pdf.text(title, xPos, yPos, { maxWidth: colWidths.title - 2 })
      xPos += colWidths.title
      
      // Type
      const typeText = node.node_type === 'milestone' ? translations.milestone : translations.decision
      pdf.text(typeText, xPos, yPos)
      xPos += colWidths.type
      
      // Section
      pdf.text(node.section || 'general', xPos, yPos)
      xPos += colWidths.section
      
      // Cost
      const costText = node.node_type === 'milestone' ? '-' : formatCurrency(node.estimated_cost)
      pdf.text(costText, xPos, yPos)
      xPos += colWidths.cost
      
      // Status
      const statusText = node.status || 'pending'
      pdf.text(statusText, xPos, yPos)
      xPos += colWidths.status
      
      // Avg Score
      pdf.text(avgScore, xPos, yPos)
      
      yPos += lineHeight
    })
    
    // Footer na każdej stronie
    const totalPages = pdf.getNumberOfPages()
    for (let i = 1; i <= totalPages; i++) {
      pdf.setPage(i)
      pdf.setFontSize(8)
      pdf.setTextColor(148, 163, 184) // slate-400
      pdf.text(
        `${translations.pageOf.replace('{current}', i.toString()).replace('{total}', totalPages.toString())} • AI Decision Organizer • ${new Date().toLocaleDateString()}`,
        pageWidth / 2,
        pageHeight - 10,
        { align: 'center' }
      )
    }
    
    // Zapisz PDF
    const fileName = `${project.title.replace(/[^a-z0-9]/gi, '_')}_${Date.now()}.pdf`
    pdf.save(fileName)
    
    return { success: true, fileName }
  } catch (error) {
    console.error('Error generating PDF:', error)
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
  }
}

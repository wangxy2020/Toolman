import { Tag } from 'antd'
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Building2,
  CalendarDays,
  CircleDollarSign,
  ClipboardList,
  Filter,
  Layers,
  TrendingUp,
  Wallet
} from 'lucide-react'
import type { FC, ReactNode } from 'react'
import { useMemo } from 'react'
import styled from 'styled-components'

import type { ProjectTopMenuKey } from './costManagementTypes'

interface EpcProjectCost {
  id: string
  code: string
  name: string
  contractValue: number
  settledAmount: number
  pendingAmount: number
  progressPercent: number
  planPhase: string
  period: string
  status: 'normal' | 'warning' | 'critical'
  region: string
}

interface ProgressManagementDashboardProps {
  viewMode: ProjectTopMenuKey
  searchKeyword: string
}

const MOCK_PROJECTS: EpcProjectCost[] = [
  {
    id: 'p1',
    code: 'EPC-2401',
    name: '滨海 LNG 接收站扩建',
    contractValue: 128_500_000,
    settledAmount: 86_200_000,
    pendingAmount: 12_400_000,
    progressPercent: 72,
    planPhase: '施工',
    period: '2026-Q1',
    status: 'normal',
    region: '华东'
  },
  {
    id: 'p2',
    code: 'EPC-2408',
    name: '西北风光储一体化基地',
    contractValue: 96_800_000,
    settledAmount: 41_300_000,
    pendingAmount: 18_600_000,
    progressPercent: 48,
    planPhase: '采购',
    period: '2026-Q1',
    status: 'warning',
    region: '西北'
  },
  {
    id: 'p3',
    code: 'EPC-2315',
    name: '跨境输气管道标段 III',
    contractValue: 215_000_000,
    settledAmount: 198_400_000,
    pendingAmount: 4_200_000,
    progressPercent: 91,
    planPhase: '试运行',
    period: '2025-Q4',
    status: 'normal',
    region: '西南'
  },
  {
    id: 'p4',
    code: 'EPC-2502',
    name: '石化园区公用工程 EPC',
    contractValue: 74_200_000,
    settledAmount: 22_100_000,
    pendingAmount: 9_800_000,
    progressPercent: 31,
    planPhase: '前期',
    period: '2026-Q2',
    status: 'warning',
    region: '华北'
  },
  {
    id: 'p5',
    code: 'EPC-2209',
    name: '海水淡化及配套管网',
    contractValue: 52_600_000,
    settledAmount: 51_900_000,
    pendingAmount: 680_000,
    progressPercent: 98,
    planPhase: '竣工',
    period: '2025-Q4',
    status: 'normal',
    region: '华南'
  },
  {
    id: 'p6',
    code: 'EPC-2412',
    name: '矿区生态修复总承包',
    contractValue: 38_400_000,
    settledAmount: 11_200_000,
    pendingAmount: 6_500_000,
    progressPercent: 26,
    planPhase: '施工',
    period: '2026-Q2',
    status: 'critical',
    region: '华北'
  }
]

const PLAN_PHASE_ORDER = ['前期', '采购', '施工', '试运行', '竣工'] as const

const formatMoney = (value: number): string => {
  if (value >= 100_000_000) {
    return `${(value / 100_000_000).toFixed(2)} 亿`
  }
  if (value >= 10_000) {
    return `${(value / 10_000).toFixed(1)} 万`
  }
  return value.toLocaleString('zh-CN')
}

const matchesKeyword = (project: EpcProjectCost, keyword: string): boolean => {
  const normalized = keyword.trim().toLowerCase()
  if (!normalized) {
    return true
  }
  return (
    project.name.toLowerCase().includes(normalized) ||
    project.code.toLowerCase().includes(normalized) ||
    project.region.toLowerCase().includes(normalized) ||
    project.planPhase.toLowerCase().includes(normalized)
  )
}

const statusTag = (status: EpcProjectCost['status']) => {
  if (status === 'critical') {
    return <Tag color="error">高风险</Tag>
  }
  if (status === 'warning') {
    return <Tag color="warning">需关注</Tag>
  }
  return <Tag color="success">正常</Tag>
}

const ProgressManagementDashboard: FC<ProgressManagementDashboardProps> = ({ viewMode, searchKeyword }) => {
  const filteredProjects = useMemo(
    () => MOCK_PROJECTS.filter((project) => matchesKeyword(project, searchKeyword)),
    [searchKeyword]
  )

  const aggregates = useMemo(() => {
    const contractTotal = filteredProjects.reduce((sum, p) => sum + p.contractValue, 0)
    const settledTotal = filteredProjects.reduce((sum, p) => sum + p.settledAmount, 0)
    const pendingTotal = filteredProjects.reduce((sum, p) => sum + p.pendingAmount, 0)
    const avgProgress =
      filteredProjects.length > 0
        ? filteredProjects.reduce((sum, p) => sum + p.progressPercent, 0) / filteredProjects.length
        : 0
    const varianceRate = contractTotal > 0 ? ((contractTotal - settledTotal) / contractTotal) * 100 : 0
    const overdueCount = filteredProjects.filter((p) => p.status !== 'normal').length

    return {
      projectCount: filteredProjects.length,
      contractTotal,
      settledTotal,
      pendingTotal,
      avgProgress,
      varianceRate,
      overdueCount
    }
  }, [filteredProjects])

  const viewTitle = useMemo(() => {
    const map: Record<ProjectTopMenuKey, string> = {
      stats: '进度总览',
      menu1: '按项目',
      menu2: '按时间',
      menu3: '按计划',
      menu4: '筛选结果'
    }
    return map[viewMode]
  }, [viewMode])

  const viewHint = useMemo(() => {
    if (viewMode === 'menu4' && searchKeyword.trim()) {
      return `关键词「${searchKeyword.trim()}」· 共 ${filteredProjects.length} 个项目`
    }
    if (viewMode === 'stats') {
      return '多项目 EPC 进度全景 · 计划、里程碑与偏差一目了然'
    }
    if (viewMode === 'menu1') {
      return '以项目为主体聚合计划进度、实际完成与里程碑状态'
    }
    if (viewMode === 'menu2') {
      return '按报告周期查看各期进度完成与关键路径'
    }
    if (viewMode === 'menu3') {
      return '按 EPC 计划阶段汇总进度执行与偏差'
    }
    if (viewMode === 'menu4') {
      return '输入搜索关键词后在此查看筛选后的进度卡片'
    }
    return ''
  }, [viewMode, searchKeyword, filteredProjects.length])

  const kpiCards = useMemo(() => {
    const base = [
      {
        key: 'projects',
        label: '在管项目',
        value: `${aggregates.projectCount}`,
        sub: '个活跃 EPC 项目',
        trend: null as 'up' | 'down' | null,
        delta: '',
        icon: <Building2 size={18} />
      },
      {
        key: 'contract',
        label: '计划进度',
        value: `${aggregates.avgProgress.toFixed(0)}%`,
        sub: '在管项目均值',
        trend: 'up' as const,
        delta: '+3.1%',
        icon: <CircleDollarSign size={18} />
      },
      {
        key: 'settled',
        label: '实际完成',
        value: `${aggregates.contractTotal > 0 ? ((aggregates.settledTotal / aggregates.contractTotal) * 100).toFixed(1) : 0}%`,
        sub: '相对计划基准',
        trend: 'up' as const,
        delta: '+1.6%',
        icon: <Wallet size={18} />
      },
      {
        key: 'pending',
        label: '里程碑延期',
        value: `${aggregates.overdueCount}`,
        sub: '项待纠偏',
        trend: 'down' as const,
        delta: '-2',
        icon: <TrendingUp size={18} />
      },
      {
        key: 'variance',
        label: '进度偏差率',
        value: `${aggregates.varianceRate.toFixed(1)}%`,
        sub: '计划 vs 实际',
        trend: aggregates.varianceRate > 35 ? ('up' as const) : ('down' as const),
        delta: aggregates.varianceRate > 35 ? '偏高' : '可控',
        icon: <Layers size={18} />
      },
      {
        key: 'risk',
        label: '风险项目',
        value: `${aggregates.overdueCount}`,
        sub: '需关注 / 高风险',
        trend: aggregates.overdueCount > 0 ? ('up' as const) : null,
        delta: aggregates.overdueCount > 0 ? '待处理' : '无',
        icon: <AlertTriangle size={18} />
      }
    ]

    if (viewMode === 'menu2') {
      return [
        base[0],
        { ...base[1], label: '本期计划进度', sub: '按周期汇总' },
        { ...base[2], label: '本期实际完成' },
        { ...base[3], label: '本期延期项' },
        base[4],
        base[5]
      ]
    }
    if (viewMode === 'menu3') {
      return [
        base[0],
        { ...base[1], label: '阶段计划', sub: '阶段进度池' },
        { ...base[2], label: '阶段完成度' },
        { ...base[4], label: '阶段偏差率' },
        { ...base[3], label: '阶段延期' },
        base[5]
      ]
    }
    return base
  }, [aggregates, viewMode])

  const renderKpiRow = () => (
    <KpiGrid $columns={viewMode === 'stats' ? 6 : 4}>
      {kpiCards.map((card) => (
        <KpiCard key={card.key}>
          <KpiIconWrap>{card.icon}</KpiIconWrap>
          <KpiContent>
            <KpiLabel>{card.label}</KpiLabel>
            <KpiValue>{card.value}</KpiValue>
            <KpiSub>
              {card.sub}
              {card.trend && (
                <Trend $direction={card.trend}>
                  {card.trend === 'up' ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                  {card.delta}
                </Trend>
              )}
            </KpiSub>
          </KpiContent>
        </KpiCard>
      ))}
    </KpiGrid>
  )

  const renderProjectCard = (project: EpcProjectCost, layout: 'compact' | 'detail' = 'detail') => {
    const settlementRate = project.contractValue > 0 ? (project.settledAmount / project.contractValue) * 100 : 0
    return (
      <ProjectCard key={project.id} $layout={layout}>
        <ProjectCardHeader>
          <div>
            <ProjectCode>{project.code}</ProjectCode>
            <ProjectName title={project.name}>{project.name}</ProjectName>
          </div>
          {statusTag(project.status)}
        </ProjectCardHeader>
        <MetricRow>
          <MetricItem>
            <MetricLabel>计划进度</MetricLabel>
            <MetricValue>{project.progressPercent}%</MetricValue>
          </MetricItem>
          <MetricItem>
            <MetricLabel>实际完成</MetricLabel>
            <MetricValue>
              {project.contractValue > 0
                ? `${((project.settledAmount / project.contractValue) * 100).toFixed(0)}%`
                : '0%'}
            </MetricValue>
          </MetricItem>
          <MetricItem>
            <MetricLabel>里程碑</MetricLabel>
            <MetricValue $warn={project.status !== 'normal'}>{project.planPhase}</MetricValue>
          </MetricItem>
        </MetricRow>
        <ProgressTrack>
          <ProgressMeta>
            <span>计划 {project.progressPercent}%</span>
            <span>完成率 {settlementRate.toFixed(0)}%</span>
          </ProgressMeta>
          <ProgressBar>
            <ProgressFill $percent={project.progressPercent} />
          </ProgressBar>
        </ProgressTrack>
        {layout === 'detail' && (
          <ProjectMeta>
            <span>{project.region}</span>
            <span>{project.planPhase}</span>
            <span>{project.period}</span>
          </ProjectMeta>
        )}
      </ProjectCard>
    )
  }

  const renderStatsView = () => (
    <>
      {renderKpiRow()}
      <Section>
        <SectionHead>
          <SectionTitle>项目进度概览</SectionTitle>
          <SectionDesc>核心 EPC 项目计划与实际进度状态</SectionDesc>
        </SectionHead>
        <ProjectGrid>{filteredProjects.slice(0, 6).map((p) => renderProjectCard(p))}</ProjectGrid>
      </Section>
      <InsightGrid>
        <InsightCard>
          <InsightTitle>
            <ClipboardList size={16} />
            进度健康度
          </InsightTitle>
          <InsightValue>
            {aggregates.contractTotal > 0 ? `${(100 - aggregates.varianceRate).toFixed(1)}%` : '0%'}
          </InsightValue>
          <InsightDesc>综合计划达成度，建议保持在 85% 以上</InsightDesc>
        </InsightCard>
        <InsightCard>
          <InsightTitle>
            <TrendingUp size={16} />
            平均执行进度
          </InsightTitle>
          <InsightValue>{aggregates.avgProgress.toFixed(0)}%</InsightValue>
          <InsightDesc>在管项目加权进度，与里程碑节奏联动监控</InsightDesc>
        </InsightCard>
      </InsightGrid>
    </>
  )

  const renderByProjectView = () => {
    const sorted = [...filteredProjects].sort((a, b) => b.progressPercent - a.progressPercent)
    return (
      <>
        {renderKpiRow()}
        <Section>
          <SectionHead>
            <SectionTitle>项目维度</SectionTitle>
            <SectionDesc>按计划进度从高到低排列</SectionDesc>
          </SectionHead>
          <ProjectList>{sorted.map((p) => renderProjectCard(p, 'detail'))}</ProjectList>
        </Section>
      </>
    )
  }

  const renderByTimeView = () => {
    const groups = filteredProjects.reduce<Record<string, EpcProjectCost[]>>((acc, project) => {
      if (!acc[project.period]) {
        acc[project.period] = []
      }
      acc[project.period].push(project)
      return acc
    }, {})
    const periods = Object.keys(groups).sort().reverse()

    return (
      <>
        {renderKpiRow()}
        {periods.map((period) => {
          const projects = groups[period]
          const periodContract = projects.reduce((s, p) => s + p.contractValue, 0)
          const periodSettled = projects.reduce((s, p) => s + p.settledAmount, 0)
          return (
            <PeriodBlock key={period}>
              <PeriodHeader>
                <PeriodTitle>
                  <CalendarDays size={16} />
                  {period}
                </PeriodTitle>
                <PeriodSummary>
                  <span>{projects.length} 个项目</span>
                  <span>均进度 {periodContract > 0 ? ((periodSettled / periodContract) * 100).toFixed(0) : 0}%</span>
                  <span>项目数 {projects.length}</span>
                </PeriodSummary>
              </PeriodHeader>
              <ProjectGrid>{projects.map((p) => renderProjectCard(p, 'compact'))}</ProjectGrid>
            </PeriodBlock>
          )
        })}
      </>
    )
  }

  const renderByPlanView = () => {
    const groups = PLAN_PHASE_ORDER.map((phase) => ({
      phase,
      projects: filteredProjects.filter((p) => p.planPhase === phase)
    })).filter((g) => g.projects.length > 0)

    return (
      <>
        {renderKpiRow()}
        <PhaseGrid>
          {groups.map(({ phase, projects }) => {
            const phaseContract = projects.reduce((s, p) => s + p.contractValue, 0)
            const phaseSettled = projects.reduce((s, p) => s + p.settledAmount, 0)
            const phaseProgress =
              projects.length > 0 ? projects.reduce((s, p) => s + p.progressPercent, 0) / projects.length : 0
            return (
              <PhaseCard key={phase}>
                <PhaseCardHead>
                  <PhaseName>{phase}</PhaseName>
                  <Tag>{projects.length} 项</Tag>
                </PhaseCardHead>
                <PhaseMetrics>
                  <span>计划均值 {phaseProgress.toFixed(0)}%</span>
                  <span>完成额 {formatMoney(phaseSettled)}</span>
                  <span>基准 {formatMoney(phaseContract)}</span>
                </PhaseMetrics>
                <PhaseProjectList>
                  {projects.map((p) => (
                    <PhaseProjectItem key={p.id}>
                      <span title={p.name}>{p.name}</span>
                      <strong>{p.progressPercent}%</strong>
                    </PhaseProjectItem>
                  ))}
                </PhaseProjectList>
              </PhaseCard>
            )
          })}
        </PhaseGrid>
      </>
    )
  }

  const renderFilterView = () => (
    <>
      {renderKpiRow()}
      <FilterBanner>
        <Filter size={16} />
        {searchKeyword.trim() ? (
          <span>
            当前筛选：<strong>{searchKeyword.trim()}</strong>，匹配 {filteredProjects.length} 个项目
          </span>
        ) : (
          <span>在顶部搜索框输入项目编号、名称、区域或阶段后回车，将在此展示筛选结果</span>
        )}
      </FilterBanner>
      {filteredProjects.length > 0 ? (
        <ProjectGrid>{filteredProjects.map((p) => renderProjectCard(p))}</ProjectGrid>
      ) : (
        <EmptyState>未找到匹配项目，请调整搜索关键词</EmptyState>
      )}
    </>
  )

  const bodyByView: Record<ProjectTopMenuKey, ReactNode> = {
    stats: renderStatsView(),
    menu1: renderByProjectView(),
    menu2: renderByTimeView(),
    menu3: renderByPlanView(),
    menu4: renderFilterView()
  }

  return (
    <Dashboard>
      <PageHeader>
        <PageTitle>{viewTitle}</PageTitle>
        <PageHint>{viewHint}</PageHint>
      </PageHeader>
      {filteredProjects.length === 0 && viewMode !== 'menu4' ? (
        <EmptyState>暂无项目数据</EmptyState>
      ) : (
        bodyByView[viewMode]
      )}
    </Dashboard>
  )
}

const Dashboard = styled.div`
  display: flex;
  width: 100%;
  min-width: 0;
  flex-direction: column;
  gap: 16px;
`

const PageHeader = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
`

const PageTitle = styled.h2`
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  color: var(--color-text);
`

const PageHint = styled.p`
  margin: 4px 0 0;
  font-size: 13px;
  color: var(--color-text-secondary);
`

const KpiGrid = styled.div<{ $columns: number }>`
  display: grid;
  grid-template-columns: repeat(${({ $columns }) => $columns}, minmax(0, 1fr));
  gap: 12px;

  @media (max-width: 1400px) {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  @media (max-width: 900px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
`

const KpiCard = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 14px 16px;
  border-radius: 12px;
  border: 0.5px solid var(--color-border);
  background: var(--color-background);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
  min-height: 88px;
`

const KpiIconWrap = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 10px;
  background: var(--color-background-soft);
  color: var(--color-primary);
  flex-shrink: 0;
`

const KpiContent = styled.div`
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
`

const KpiLabel = styled.span`
  font-size: 12px;
  color: var(--color-text-secondary);
`

const KpiValue = styled.span`
  font-size: 20px;
  font-weight: 600;
  color: var(--color-text);
  line-height: 1.2;
`

const KpiSub = styled.span`
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  font-size: 11px;
  color: var(--color-text-tertiary, var(--color-text-secondary));
`

const Trend = styled.span<{ $direction: 'up' | 'down' }>`
  display: inline-flex;
  align-items: center;
  gap: 2px;
  color: ${({ $direction }) => ($direction === 'up' ? '#16a34a' : '#2563eb')};
  font-weight: 500;
`

const Section = styled.section`
  display: flex;
  flex-direction: column;
  gap: 12px;
`

const SectionHead = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
`

const SectionTitle = styled.h3`
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--color-text);
`

const SectionDesc = styled.span`
  font-size: 12px;
  color: var(--color-text-secondary);
`

const ProjectGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 12px;
`

const ProjectList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
`

const ProjectCard = styled.div<{ $layout: 'compact' | 'detail' }>`
  padding: ${({ $layout }) => ($layout === 'compact' ? '12px' : '14px 16px')};
  border-radius: 12px;
  border: 0.5px solid var(--color-border);
  background: var(--color-background);
  display: flex;
  flex-direction: column;
  gap: 10px;
  transition: box-shadow 0.2s ease;

  &:hover {
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.06);
  }
`

const ProjectCardHeader = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
`

const ProjectCode = styled.div`
  font-size: 11px;
  color: var(--color-text-secondary);
  font-family: ui-monospace, monospace;
`

const ProjectName = styled.div`
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 220px;
`

const MetricRow = styled.div`
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
`

const MetricItem = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
`

const MetricLabel = styled.span`
  font-size: 11px;
  color: var(--color-text-secondary);
`

const MetricValue = styled.span<{ $warn?: boolean }>`
  font-size: 13px;
  font-weight: 600;
  color: ${({ $warn }) => ($warn ? '#dc2626' : 'var(--color-text)')};
`

const ProgressTrack = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
`

const ProgressMeta = styled.div`
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  color: var(--color-text-secondary);
`

const ProgressBar = styled.div`
  height: 6px;
  border-radius: 999px;
  background: var(--color-background-mute);
  overflow: hidden;
`

const ProgressFill = styled.div<{ $percent: number }>`
  height: 100%;
  width: ${({ $percent }) => Math.min(100, Math.max(0, $percent))}%;
  border-radius: 999px;
  background: linear-gradient(90deg, var(--color-primary) 0%, #3b82f6 100%);
`

const ProjectMeta = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  font-size: 11px;
  color: var(--color-text-secondary);

  span {
    padding: 2px 8px;
    border-radius: 6px;
    background: var(--color-background-soft);
  }
`

const InsightGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;

  @media (max-width: 768px) {
    grid-template-columns: 1fr;
  }
`

const InsightCard = styled.div`
  padding: 16px 18px;
  border-radius: 12px;
  border: 0.5px solid var(--color-border);
  background: linear-gradient(135deg, var(--color-background-soft) 0%, var(--color-background) 100%);
`

const InsightTitle = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--color-text-secondary);
  margin-bottom: 8px;
`

const InsightValue = styled.div`
  font-size: 28px;
  font-weight: 700;
  color: var(--color-text);
  line-height: 1.1;
`

const InsightDesc = styled.p`
  margin: 8px 0 0;
  font-size: 12px;
  color: var(--color-text-secondary);
`

const PeriodBlock = styled.section`
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px 14px;
  border-radius: 12px;
  border: 0.5px solid var(--color-border);
  background: var(--color-background-soft);
`

const PeriodHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
`

const PeriodTitle = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 15px;
  font-weight: 600;
  color: var(--color-text);
`

const PeriodSummary = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  font-size: 12px;
  color: var(--color-text-secondary);
`

const PhaseGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 12px;
`

const PhaseCard = styled.div`
  padding: 14px 16px;
  border-radius: 12px;
  border: 0.5px solid var(--color-border);
  background: var(--color-background);
  display: flex;
  flex-direction: column;
  gap: 10px;
`

const PhaseCardHead = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
`

const PhaseName = styled.span`
  font-size: 15px;
  font-weight: 600;
  color: var(--color-text);
`

const PhaseMetrics = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
  color: var(--color-text-secondary);
`

const PhaseProjectList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding-top: 6px;
  border-top: 0.5px solid var(--color-border);
`

const PhaseProjectItem = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: 12px;
  color: var(--color-text);

  span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex: 1;
    min-width: 0;
  }

  strong {
    flex-shrink: 0;
    color: var(--color-text);
    font-weight: 600;
  }
`

const FilterBanner = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  border-radius: 10px;
  border: 0.5px dashed var(--color-border);
  background: var(--color-background-soft);
  font-size: 13px;
  color: var(--color-text-secondary);

  strong {
    color: var(--color-text);
  }
`

const EmptyState = styled.div`
  padding: 48px 24px;
  text-align: center;
  color: var(--color-text-secondary);
  font-size: 14px;
  border-radius: 12px;
  border: 0.5px dashed var(--color-border);
  background: var(--color-background-soft);
`

export default ProgressManagementDashboard

import { Navbar, NavbarCenter, NavbarLeft } from '@renderer/components/app/Navbar'
import NavbarIcon from '@renderer/components/NavbarIcon'
import AgentEmbeddedWorkspace from '@renderer/pages/agents/AgentEmbeddedWorkspace'
import { AutoComplete, Button, Checkbox, Dropdown, Input, Modal, Select, Tooltip } from 'antd'
import {
  ChevronDown,
  CirclePlus,
  ClipboardCheck,
  FolderArchive,
  FolderKanban,
  PanelLeftClose,
  PanelRightClose,
  PlusIcon,
  ShieldCheck,
  Target,
  TriangleAlert,
  Wallet
} from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import type { ChangeEvent, FC, ReactNode } from 'react'
import { useProjectManagerSidebarVisibility } from '@renderer/hooks/scopedSidebarVisibility'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import styled from 'styled-components'

import CostManagementDashboard from './CostManagementDashboard'
import type { ProjectTopMenuKey } from './costManagementTypes'
import ProgressManagementDashboard from './ProgressManagementDashboard'
import type { ProjectManagementAgentSlot } from './projectManagementAgentSlots'
import {
  type ConfigurableSidebarMenuKey,
  isConfigurableSidebarMenuKey,
  PROJECT_SIDEBAR_CUSTOM_TAB,
  PROJECT_SIDEBAR_MENU_LABELS,
  type ProjectSidebarMenuTab
} from './projectSidebarMenuConfig'
import ProjectSidebarMenuSettings from './ProjectSidebarMenuSettings'
import { useProjectSidebarMenuPreferences } from './useProjectSidebarMenuPreferences'

type ProjectTab = ProjectSidebarMenuTab

const MANAGEMENT_AGENT_SLOT_BY_TAB: Partial<Record<ProjectTab, ProjectManagementAgentSlot>> = {
  progress_management: 'progress_management',
  cost_management: 'cost_management'
}

type CreateMenuKey =
  | 'progress_payment_price'
  | 'progress_payment_invoice'
  | 'price_adjustment_calc'
  | 'overdue_interest'
  | 'project_price'

type DataSourceType = 'database' | 'local_file'
type RelatedFileType = 'none' | 'knowledge' | 'local_file'
type PendingNavigation = { type: 'tab'; value: ProjectTab } | { type: 'top_menu'; value: ProjectTopMenuKey }

interface ProgressPriceRow {
  id: string
  item: string
  description: string
  unit: string
  contractTotalQty: number
  previousQty: number
  currentQty: number
  unitPrice: number
}

const createDefaultRow = (index: number): ProgressPriceRow => ({
  id: `row-${Date.now()}-${index}`,
  item: `${index + 1}`,
  description: '',
  unit: '',
  contractTotalQty: 1,
  previousQty: 0,
  currentQty: 1,
  unitPrice: 0
})

/** TODO: Revert after cost management development — restore `all_projects` + `stats`. */
const PROJECT_MANAGER_DEFAULT_TAB: ProjectTab = 'cost_management'
const PROJECT_MANAGER_DEFAULT_TOP_MENU: ProjectTopMenuKey = 'menu1'

const ProjectManagerPage: FC = () => {
  const { t } = useTranslation()
  const { showSidebar, setShowSidebar } = useProjectManagerSidebarVisibility()
  const [activeTab, setActiveTab] = useState<ProjectTab>(PROJECT_MANAGER_DEFAULT_TAB)
  const [activeTopMenu, setActiveTopMenu] = useState<ProjectTopMenuKey>(PROJECT_MANAGER_DEFAULT_TOP_MENU)
  const [costDashboardView, setCostDashboardView] = useState<ProjectTopMenuKey>('stats')
  const [progressDashboardView, setProgressDashboardView] = useState<ProjectTopMenuKey>('stats')
  const [costSearchKeyword, setCostSearchKeyword] = useState('')
  const [progressSearchKeyword, setProgressSearchKeyword] = useState('')
  const [activeCreateMenu, setActiveCreateMenu] = useState<CreateMenuKey | null>(null)
  const [projectName, setProjectName] = useState('')
  const [projectHistory, setProjectHistory] = useState<string[]>([])
  const [dataSource, setDataSource] = useState<DataSourceType>('database')
  const [sourceFileName, setSourceFileName] = useState('')
  const [relatedFileType, setRelatedFileType] = useState<RelatedFileType>('none')
  const [relatedFileName, setRelatedFileName] = useState('')
  const [sheetCode, setSheetCode] = useState('')
  const [currency, setCurrency] = useState('USD')
  const [progressRows, setProgressRows] = useState<ProgressPriceRow[]>([
    createDefaultRow(0),
    createDefaultRow(1),
    createDefaultRow(2)
  ])
  const [syncToDatabase, setSyncToDatabase] = useState(false)
  const [exportFormats, setExportFormats] = useState<string[]>(['table', 'csv'])
  const [signature, setSignature] = useState('')
  const [pendingNavigation, setPendingNavigation] = useState<PendingNavigation | null>(null)
  const sourceFileInputRef = useRef<HTMLInputElement>(null)
  const relatedFileInputRef = useRef<HTMLInputElement>(null)
  const skipTopMenuResetOnMountRef = useRef(true)

  const { preferences, visibleMenuKeys, setMenuVisible, moveMenu, resetToDefaults } = useProjectSidebarMenuPreferences()

  const sidebarMenuIcons = useMemo(
    (): Record<ConfigurableSidebarMenuKey, ReactNode> => ({
      all_projects: <FolderKanban size={16} />,
      urgent_tasks: <TriangleAlert size={16} />,
      key_projects: <Target size={16} />,
      progress_management: <ClipboardCheck size={16} />,
      cost_management: <Wallet size={16} />,
      resource_management: <FolderKanban size={16} />,
      security_management: <ShieldCheck size={16} />,
      quality_management: <ClipboardCheck size={16} />,
      archive_management: <FolderArchive size={16} />
    }),
    []
  )

  const menus = useMemo(() => {
    const configurableMenus = preferences.order
      .filter((key) => visibleMenuKeys.includes(key))
      .map((key) => ({
        key,
        label: PROJECT_SIDEBAR_MENU_LABELS[key],
        icon: sidebarMenuIcons[key]
      }))

    return [
      ...configurableMenus,
      {
        key: PROJECT_SIDEBAR_CUSTOM_TAB,
        label: '自定义',
        icon: <CirclePlus size={16} />
      }
    ]
  }, [preferences.order, sidebarMenuIcons, visibleMenuKeys])

  const settingsMenuRows = useMemo(
    () =>
      preferences.order.map((key) => ({
        key,
        label: PROJECT_SIDEBAR_MENU_LABELS[key],
        icon: sidebarMenuIcons[key]
      })),
    [preferences.order, sidebarMenuIcons]
  )

  const hiddenMenuKeys = useMemo(() => new Set(preferences.hidden), [preferences.hidden])

  useEffect(() => {
    if (activeTab === PROJECT_SIDEBAR_CUSTOM_TAB) {
      return
    }
    if (isConfigurableSidebarMenuKey(activeTab) && !visibleMenuKeys.includes(activeTab)) {
      const fallback =
        visibleMenuKeys.find((key) => key === PROJECT_MANAGER_DEFAULT_TAB) ??
        visibleMenuKeys[0] ??
        PROJECT_SIDEBAR_CUSTOM_TAB
      setActiveTab(fallback)
    }
  }, [activeTab, visibleMenuKeys])

  const activeMenu = menus.find((item) => item.key === activeTab)
  const topMenus = useMemo(() => {
    const useManagementTopMenus = [
      'progress_management',
      'cost_management',
      'resource_management',
      'security_management',
      'quality_management'
    ].includes(activeTab)

    const useProgressCostTopMenus = activeTab === 'progress_management' || activeTab === 'cost_management'

    const managementMenu1Label =
      activeTab === 'cost_management' ? '成本智能体' : activeTab === 'progress_management' ? '计划智能体' : '预留1'

    const menus: { key: ProjectTopMenuKey; label: string }[] = [
      { key: 'stats', label: '统计' },
      {
        key: 'menu1',
        label: useManagementTopMenus ? managementMenu1Label : '菜单1'
      },
      {
        key: 'menu2',
        label: useProgressCostTopMenus ? '报表' : useManagementTopMenus ? '预留2' : '菜单2'
      },
      {
        key: 'menu3',
        label: useProgressCostTopMenus ? '数据库' : useManagementTopMenus ? '预留3' : '菜单3'
      }
    ]

    if (!useProgressCostTopMenus) {
      menus.push({
        key: 'menu4',
        label: useManagementTopMenus ? '预留4' : '菜单4'
      })
    }

    return menus
  }, [activeTab])
  const statsViewDropdownItems = useMemo(
    () => [
      { key: 'stats', label: '统计' },
      { key: 'menu1', label: '按项目' },
      { key: 'menu2', label: '按时间' },
      { key: 'menu3', label: '按计划' },
      { key: 'menu4', label: '筛选' }
    ],
    []
  )
  const statsViewLabels = useMemo(
    () =>
      Object.fromEntries(statsViewDropdownItems.map((item) => [item.key, item.label])) as Record<
        ProjectTopMenuKey,
        string
      >,
    [statsViewDropdownItems]
  )
  const createDropdownItems = useMemo(
    () => [
      { key: 'progress_payment_price', label: '进度价格表' },
      { key: 'progress_payment_invoice', label: '进度款发票' },
      { key: 'price_adjustment_calc', label: '调价计算表' },
      { key: 'overdue_interest', label: '逾期利息表' },
      { key: 'project_price', label: '项目价格表' }
    ],
    []
  )
  const projectSelectOptions = useMemo(
    () => projectHistory.map((name) => ({ label: name, value: name })),
    [projectHistory]
  )

  useEffect(() => {
    if (skipTopMenuResetOnMountRef.current) {
      skipTopMenuResetOnMountRef.current = false
      return
    }
    setActiveTopMenu('stats')
    setCostDashboardView('stats')
    setProgressDashboardView('stats')
  }, [activeTab])

  useEffect(() => {
    const useProgressCostTopMenus = activeTab === 'progress_management' || activeTab === 'cost_management'
    if (useProgressCostTopMenus && activeTopMenu === 'menu4') {
      setActiveTopMenu('stats')
    }
  }, [activeTab, activeTopMenu])

  const activeDashboardView =
    activeTab === 'cost_management'
      ? costDashboardView
      : activeTab === 'progress_management'
        ? progressDashboardView
        : 'stats'

  const handleManagementSearch = (value: string) => {
    const keyword = value.trim()
    if (activeTab === 'cost_management') {
      setCostSearchKeyword(keyword)
      return
    }
    if (activeTab === 'progress_management') {
      setProgressSearchKeyword(keyword)
    }
  }
  const handleStatsViewClick = ({ key }: { key: string }) => {
    const view = key as ProjectTopMenuKey
    if (activeTab === 'cost_management') {
      setCostDashboardView(view)
      return
    }
    if (activeTab === 'progress_management') {
      setProgressDashboardView(view)
    }
  }
  const handleCreateMenuClick = ({ key }: { key: string }) => {
    setActiveCreateMenu(key as CreateMenuKey)
  }

  const handleChooseSourceFile = () => {
    sourceFileInputRef.current?.click()
  }

  const handleChooseRelatedFile = () => {
    relatedFileInputRef.current?.click()
  }

  const handleSourceFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      setSourceFileName(file.name)
    }
    event.target.value = ''
  }

  const handleRelatedFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      setRelatedFileName(file.name)
    }
    event.target.value = ''
  }

  const updateProgressRow = (id: string, field: keyof ProgressPriceRow, value: string) => {
    setProgressRows((rows) =>
      rows.map((row) => {
        if (row.id !== id) {
          return row
        }
        if (
          field === 'contractTotalQty' ||
          field === 'previousQty' ||
          field === 'currentQty' ||
          field === 'unitPrice'
        ) {
          const numericValue = Number(value)
          return { ...row, [field]: Number.isFinite(numericValue) ? numericValue : 0 }
        }
        return { ...row, [field]: value }
      })
    )
  }

  const addProgressRow = () => {
    setProgressRows((rows) => [...rows, createDefaultRow(rows.length)])
  }

  const removeProgressRow = (id: string) => {
    setProgressRows((rows) => (rows.length > 1 ? rows.filter((row) => row.id !== id) : rows))
  }

  const totalAmount = useMemo(
    () => progressRows.reduce((sum, row) => sum + (row.previousQty + row.currentQty) * row.unitPrice, 0),
    [progressRows]
  )

  const handleConfirmProgressPrice = () => {
    if (!signature.trim()) {
      Modal.warning({
        title: '请输入签名',
        content: '签名不能为空，请先输入签名后再确认。'
      })
      return
    }
    if (projectName.trim()) {
      setProjectHistory((history) =>
        history.includes(projectName.trim()) ? history : [projectName.trim(), ...history]
      )
    }
    Modal.success({
      title: '操作完成',
      content: `已确认：${syncToDatabase ? '同步数据库；' : ''}${exportFormats.length ? `导出${exportFormats.join('、')}；` : ''}已生成记录。`
    })
  }
  const handleSaveProgressPrice = () => {
    Modal.success({
      title: '保存成功',
      content: '已保存草稿。'
    })
  }

  const handleCancelProgressPrice = () => {
    setActiveCreateMenu(null)
  }
  const executeNavigation = (navigation: PendingNavigation) => {
    if (navigation.type === 'tab') {
      setActiveTab(navigation.value)
      return
    }
    setActiveTopMenu(navigation.value)
  }

  const requestNavigation = (navigation: PendingNavigation) => {
    if (!showProgressPricePage) {
      executeNavigation(navigation)
      return
    }
    setPendingNavigation(navigation)
  }

  const handleExitWithSave = () => {
    setActiveCreateMenu(null)
    if (pendingNavigation) {
      executeNavigation(pendingNavigation)
    }
    setPendingNavigation(null)
  }
  const showManagementSearch = [
    'progress_management',
    'cost_management',
    'resource_management',
    'security_management',
    'quality_management'
  ].includes(activeTab)
  const showProgressPricePage = activeTab === 'cost_management' && activeCreateMenu === 'progress_payment_price'
  const showCostDashboard = activeTab === 'cost_management' && !showProgressPricePage && activeTopMenu === 'stats'
  const showProgressDashboard = activeTab === 'progress_management' && activeTopMenu === 'stats'
  const showCostAgentPage = activeTab === 'cost_management' && !showProgressPricePage && activeTopMenu === 'menu1'
  const showProgressAgentPage = activeTab === 'progress_management' && activeTopMenu === 'menu1'
  const showManagementAgentPage = showCostAgentPage || showProgressAgentPage
  const showSidebarMenuSettings = activeTab === PROJECT_SIDEBAR_CUSTOM_TAB
  const showCostReservedMenu =
    activeTab === 'cost_management' && !showProgressPricePage && activeTopMenu !== 'stats' && activeTopMenu !== 'menu1'
  const showProgressReservedMenu =
    activeTab === 'progress_management' && activeTopMenu !== 'stats' && activeTopMenu !== 'menu1'
  const mainBodyCentered =
    !showProgressPricePage &&
    !showCostDashboard &&
    !showProgressDashboard &&
    !showCostReservedMenu &&
    !showProgressReservedMenu &&
    !showManagementAgentPage &&
    !showSidebarMenuSettings
  const useManagementStatsDropdown = activeTab === 'cost_management' || activeTab === 'progress_management'
  const managementAgentSlot = showManagementAgentPage ? MANAGEMENT_AGENT_SLOT_BY_TAB[activeTab] : undefined
  const managementAgentActivationKey = showManagementAgentPage ? `${activeTab}:menu1` : undefined

  return (
    <Container>
      <Navbar className="project-manager-navbar">
        <AnimatePresence initial={false}>
          {showSidebar && (
            <motion.div
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 'auto', opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.15, ease: 'easeOut' }}
              style={{ overflow: 'hidden', display: 'flex', flexDirection: 'row' }}>
              <NavbarLeft style={{ justifyContent: 'space-between', borderRight: 'none', padding: 0 }}>
                <Tooltip title={t('navbar.hide_sidebar')} mouseEnterDelay={0.8}>
                  <NavbarIcon onClick={() => setShowSidebar(false)}>
                    <PanelLeftClose size={18} />
                  </NavbarIcon>
                </Tooltip>
              </NavbarLeft>
            </motion.div>
          )}
        </AnimatePresence>
        {!showSidebar && (
          <NavbarLeft
            style={{
              justifyContent: 'flex-start',
              borderRight: 'none',
              paddingLeft: 0,
              paddingRight: 0,
              minWidth: 'auto'
            }}>
            <Tooltip title={t('navbar.show_sidebar')} mouseEnterDelay={0.8} placement="right">
              <NavbarIcon onClick={() => setShowSidebar(true)}>
                <PanelRightClose size={18} />
              </NavbarIcon>
            </Tooltip>
          </NavbarLeft>
        )}
        <NavbarCenter style={{ borderRight: 'none' }}>项目管理</NavbarCenter>
      </Navbar>

      <ContentRow>
        <AnimatePresence initial={false}>
          {showSidebar && (
            <motion.div
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 'var(--assistants-width)', opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.15, ease: 'easeOut' }}
              style={{ overflow: 'hidden' }}>
              <SidePanel>
                {menus.map((menu) => (
                  <MenuItem
                    key={menu.key}
                    $active={menu.key === activeTab}
                    onClick={() => {
                      if (menu.key === activeTab) {
                        return
                      }
                      requestNavigation({ type: 'tab', value: menu.key })
                    }}>
                    <span className="icon">{menu.icon}</span>
                    <span>{menu.label}</span>
                  </MenuItem>
                ))}
              </SidePanel>
            </motion.div>
          )}
        </AnimatePresence>

        <MainPanel $showSidebar={showSidebar}>
          {!showSidebarMenuSettings && (
            <TopMenuBar>
              <TopMenuButtons>
                {topMenus.map((menu) => {
                  if (menu.key === 'stats' && useManagementStatsDropdown) {
                    if (activeTopMenu !== 'stats') {
                      return (
                        <TopMenuButton
                          key={menu.key}
                          type="text"
                          $active={false}
                          onClick={() => requestNavigation({ type: 'top_menu', value: 'stats' })}>
                          统计
                        </TopMenuButton>
                      )
                    }

                    return (
                      <Dropdown
                        key={menu.key}
                        menu={{ items: statsViewDropdownItems, onClick: handleStatsViewClick }}
                        trigger={['click']}
                        placement="bottomLeft">
                        <StatsDropdownButton type="text" $active>
                          <span>{statsViewLabels[activeDashboardView]}</span>
                          <ChevronDown size={14} />
                        </StatsDropdownButton>
                      </Dropdown>
                    )
                  }

                  return (
                    <TopMenuButton
                      key={menu.key}
                      type="text"
                      $active={activeTopMenu === menu.key}
                      onClick={() => {
                        if (menu.key === activeTopMenu) {
                          return
                        }
                        requestNavigation({ type: 'top_menu', value: menu.key })
                      }}>
                      {menu.label}
                    </TopMenuButton>
                  )
                })}
              </TopMenuButtons>
              {showManagementSearch && (
                <CostSearchCenter>
                  <CostSearchInput allowClear placeholder="请输入搜索内容" onSearch={handleManagementSearch} />
                </CostSearchCenter>
              )}
              {activeTab === 'cost_management' ? (
                <Dropdown
                  menu={{ items: createDropdownItems, onClick: handleCreateMenuClick }}
                  trigger={['click']}
                  placement="bottomRight">
                  <CreateMenuButton type="primary" icon={<PlusIcon size={16} />}>
                    新建
                  </CreateMenuButton>
                </Dropdown>
              ) : (
                <CreateMenuButton type="primary" icon={<PlusIcon size={16} />}>
                  新建
                </CreateMenuButton>
              )}
            </TopMenuBar>
          )}
          <MainBody $centered={mainBodyCentered} $agentFull={showManagementAgentPage}>
            {showSidebarMenuSettings ? (
              <ProjectSidebarMenuSettings
                menuRows={settingsMenuRows}
                hiddenKeys={hiddenMenuKeys}
                onVisibleChange={setMenuVisible}
                onMove={moveMenu}
                onReset={resetToDefaults}
              />
            ) : showProgressPricePage ? (
              <ProgressPricePage>
                <SectionCard>
                  <SectionTitle>基础信息</SectionTitle>
                  <FormGrid>
                    <FieldItem>
                      <FieldLabel>项目名称或编号</FieldLabel>
                      <AutoComplete
                        value={projectName}
                        options={projectSelectOptions}
                        placeholder="请输入或选择项目名称/编号"
                        onSelect={setProjectName}
                        onChange={setProjectName}
                        filterOption={(input, option) =>
                          (option?.label as string)?.toLowerCase().includes(input.toLowerCase())
                        }
                      />
                    </FieldItem>
                    <FieldItem>
                      <FieldLabel>数据来源</FieldLabel>
                      <InlineRow>
                        <Select
                          value={dataSource}
                          options={[
                            { label: '数据库', value: 'database' },
                            { label: '本地文件', value: 'local_file' }
                          ]}
                          onChange={(value) => setDataSource(value)}
                        />
                        {dataSource === 'local_file' && (
                          <>
                            <Button onClick={handleChooseSourceFile}>选择文件</Button>
                            {sourceFileName && <FieldHint title={sourceFileName}>已选择：{sourceFileName}</FieldHint>}
                          </>
                        )}
                      </InlineRow>
                    </FieldItem>
                    <FieldItem>
                      <FieldLabel>进度价格表编号</FieldLabel>
                      <Input value={sheetCode} onChange={(event) => setSheetCode(event.target.value)} />
                    </FieldItem>
                    <FieldItem>
                      <FieldLabel>关联文件</FieldLabel>
                      <InlineRow>
                        <Select
                          value={relatedFileType}
                          options={[
                            { label: '不选择', value: 'none' },
                            { label: '知识库文件', value: 'knowledge' },
                            { label: '本地文件', value: 'local_file' }
                          ]}
                          onChange={(value) => setRelatedFileType(value)}
                        />
                        {relatedFileType === 'local_file' && (
                          <Button onClick={handleChooseRelatedFile}>选择文件</Button>
                        )}
                        {relatedFileType === 'local_file' && relatedFileName && (
                          <FieldHint title={relatedFileName}>已选择：{relatedFileName}</FieldHint>
                        )}
                      </InlineRow>
                    </FieldItem>
                    <FieldItem>
                      <FieldLabel>货币</FieldLabel>
                      <Input value={currency} onChange={(event) => setCurrency(event.target.value)} />
                    </FieldItem>
                  </FormGrid>
                  <HiddenFileInput ref={sourceFileInputRef} type="file" onChange={handleSourceFileChange} />
                  <HiddenFileInput ref={relatedFileInputRef} type="file" onChange={handleRelatedFileChange} />
                </SectionCard>

                <SectionCard>
                  <SectionHeader>
                    <SectionTitle>进度价格明细</SectionTitle>
                    <Button onClick={addProgressRow}>新增行</Button>
                  </SectionHeader>
                  <TableScroller>
                    <StyledTable>
                      <thead>
                        <tr>
                          <th rowSpan={2}>Item</th>
                          <th rowSpan={2}>Description</th>
                          <th rowSpan={2}>Unit</th>
                          <th rowSpan={2}>Contract Total Qty</th>
                          <th colSpan={4}>Completion Progress</th>
                          <th rowSpan={2}>Unit Price</th>
                          <th rowSpan={2}>Total Price</th>
                          <th rowSpan={2}>操作</th>
                        </tr>
                        <tr>
                          <th>Previous</th>
                          <th>Current</th>
                          <th>Period-End Comp. Total Qty</th>
                          <th>Completed Settlement Proportion</th>
                        </tr>
                      </thead>
                      <tbody>
                        {progressRows.map((row) => {
                          const periodEndQty = row.previousQty + row.currentQty
                          const completedProportion =
                            row.contractTotalQty > 0 ? (periodEndQty / row.contractTotalQty) * 100 : 0
                          const totalPrice = periodEndQty * row.unitPrice
                          return (
                            <tr key={row.id}>
                              <td>
                                <Input
                                  value={row.item}
                                  onChange={(event) => updateProgressRow(row.id, 'item', event.target.value)}
                                />
                              </td>
                              <td>
                                <Input
                                  value={row.description}
                                  onChange={(event) => updateProgressRow(row.id, 'description', event.target.value)}
                                />
                              </td>
                              <td>
                                <Input
                                  value={row.unit}
                                  onChange={(event) => updateProgressRow(row.id, 'unit', event.target.value)}
                                />
                              </td>
                              <td>
                                <Input
                                  type="number"
                                  value={row.contractTotalQty}
                                  onChange={(event) =>
                                    updateProgressRow(row.id, 'contractTotalQty', event.target.value)
                                  }
                                />
                              </td>
                              <td>
                                <Input
                                  type="number"
                                  value={row.previousQty}
                                  onChange={(event) => updateProgressRow(row.id, 'previousQty', event.target.value)}
                                />
                              </td>
                              <td>
                                <Input
                                  type="number"
                                  value={row.currentQty}
                                  onChange={(event) => updateProgressRow(row.id, 'currentQty', event.target.value)}
                                />
                              </td>
                              <td>
                                <ReadOnlyText>{periodEndQty.toFixed(2)}</ReadOnlyText>
                              </td>
                              <td>
                                <ReadOnlyText>{completedProportion.toFixed(2)}%</ReadOnlyText>
                              </td>
                              <td>
                                <Input
                                  type="number"
                                  value={row.unitPrice}
                                  onChange={(event) => updateProgressRow(row.id, 'unitPrice', event.target.value)}
                                />
                              </td>
                              <td>
                                <ReadOnlyText>{totalPrice.toFixed(2)}</ReadOnlyText>
                              </td>
                              <td>
                                <Button danger type="text" onClick={() => removeProgressRow(row.id)}>
                                  删除
                                </Button>
                              </td>
                            </tr>
                          )
                        })}
                        <tr>
                          <SummaryCell colSpan={9}>BASIC INVOICE VALUE</SummaryCell>
                          <SummaryAmount>{totalAmount.toFixed(2)}</SummaryAmount>
                          <td />
                        </tr>
                      </tbody>
                    </StyledTable>
                  </TableScroller>
                </SectionCard>

                <SectionCard>
                  <SectionTitle>提交与导出</SectionTitle>
                  <ActionRow>
                    <Checkbox checked={syncToDatabase} onChange={(event) => setSyncToDatabase(event.target.checked)}>
                      同步数据到数据库
                    </Checkbox>
                  </ActionRow>
                  <ActionRow>
                    <Checkbox.Group
                      value={exportFormats}
                      options={[
                        { label: '导出表格', value: 'table' },
                        { label: 'CSV', value: 'csv' }
                      ]}
                      onChange={(values) => setExportFormats(values as string[])}
                    />
                  </ActionRow>
                  <ActionFooter>
                    <ActionLeft>
                      <SignatureInput
                        value={signature}
                        placeholder="请输入签名"
                        onChange={(event) => setSignature(event.target.value)}
                      />
                    </ActionLeft>
                    <ActionButtons>
                      <Button onClick={handleSaveProgressPrice}>保存</Button>
                      <Button onClick={handleCancelProgressPrice}>取消</Button>
                      <Button type="primary" onClick={handleConfirmProgressPrice}>
                        确认
                      </Button>
                    </ActionButtons>
                  </ActionFooter>
                </SectionCard>
              </ProgressPricePage>
            ) : showManagementAgentPage ? (
              <CostAgentMain>
                <AgentEmbeddedWorkspace
                  variant="embedded"
                  managementAgentSlot={managementAgentSlot}
                  managementAgentActivationKey={managementAgentActivationKey}
                />
              </CostAgentMain>
            ) : showCostDashboard ? (
              <CostManagementDashboard viewMode={costDashboardView} searchKeyword={costSearchKeyword} />
            ) : showProgressDashboard ? (
              <ProgressManagementDashboard viewMode={progressDashboardView} searchKeyword={progressSearchKeyword} />
            ) : showCostReservedMenu || showProgressReservedMenu ? (
              <>
                <MainTitle>{topMenus.find((menu) => menu.key === activeTopMenu)?.label ?? '预留菜单'}</MainTitle>
                <MainDesc>功能开发中</MainDesc>
              </>
            ) : (
              <>
                <MainTitle>{activeMenu?.label ?? '项目管理大盘'}</MainTitle>
                <MainDesc>功能开发中</MainDesc>
              </>
            )}
          </MainBody>
        </MainPanel>
      </ContentRow>
      <Modal
        open={!!pendingNavigation}
        title="退出当前编辑页面？"
        onCancel={() => setPendingNavigation(null)}
        footer={[
          <Button key="cancel" onClick={() => setPendingNavigation(null)}>
            取消
          </Button>,
          <Button key="exit" type="primary" onClick={handleExitWithSave}>
            退出
          </Button>
        ]}>
        当前数据将自动保存，退出后将进入你刚才点击的菜单页面。
      </Modal>
    </Container>
  )
}

const Container = styled.div`
  display: flex;
  flex: 1;
  min-width: 0;
  flex-direction: column;
  overflow: hidden;
`

const ContentRow = styled.div`
  display: flex;
  min-width: 0;
  flex: 1;
  overflow: hidden;
  border-top-left-radius: 10px;
  background: var(--color-background);
`

const SidePanel = styled.div`
  display: flex;
  width: var(--assistants-width);
  height: calc(100vh - var(--navbar-height));
  flex-direction: column;
  gap: 6px;
  overflow-y: auto;
  background: var(--color-background);
  border-top-left-radius: 10px;
  padding: 10px;
`

const MenuItem = styled.button<{ $active: boolean }>`
  display: flex;
  width: 100%;
  min-height: 37px;
  cursor: pointer;
  align-items: center;
  gap: 10px;
  border: 1px solid transparent;
  border-radius: var(--list-item-border-radius);
  background: ${({ $active }) => ($active ? 'var(--color-list-item)' : 'transparent')};
  color: ${({ $active }) => ($active ? 'var(--color-text)' : 'var(--color-text-secondary)')};
  padding: 0 10px;
  text-align: left;
  transition: all 0.2s ease;
  box-shadow: ${({ $active }) => ($active ? '0 1px 2px 0 rgba(0, 0, 0, 0.05)' : 'none')};

  &:hover {
    background: ${({ $active }) => ($active ? 'var(--color-list-item)' : 'var(--color-list-item-hover)')};
    color: var(--color-text);
  }

  .icon {
    display: inline-flex;
    flex-shrink: 0;
  }
`

const MainPanel = styled.div<{ $showSidebar: boolean }>`
  display: flex;
  flex: 1;
  min-width: 0;
  flex-direction: column;
  border-left: 0.5px solid var(--color-border);
  background: var(--color-background);
  border-top-left-radius: ${({ $showSidebar }) => ($showSidebar ? '0' : '10px')};
`

const TopMenuBar = styled.div`
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  border-bottom: 0.5px solid var(--color-border);
`

const TopMenuButtons = styled.div`
  display: flex;
  align-items: center;
  gap: 4px;
`

const topMenuButtonStyle = `
  height: 30px;
  border-radius: var(--list-item-border-radius);
`

const TopMenuButton = styled(Button)<{ $active: boolean }>`
  ${topMenuButtonStyle}
  border: 0.5px solid ${({ $active }) => ($active ? 'var(--color-border)' : 'transparent')};
  background: ${({ $active }) => ($active ? 'var(--color-background-soft)' : 'transparent')};
  color: ${({ $active }) => ($active ? 'var(--color-text)' : 'var(--color-text-secondary)')};

  &:hover {
    background: var(--color-background-soft) !important;
    color: var(--color-text) !important;
  }
`

const StatsDropdownButton = styled(Button)<{ $active: boolean }>`
  ${topMenuButtonStyle}
  display: inline-flex;
  align-items: center;
  gap: 4px;
  border: 0.5px solid ${({ $active }) => ($active ? 'var(--color-border)' : 'transparent')};
  background: ${({ $active }) => ($active ? 'var(--color-background-soft)' : 'transparent')};
  color: ${({ $active }) => ($active ? 'var(--color-text)' : 'var(--color-text-secondary)')};

  &:hover {
    background: var(--color-background-soft) !important;
    color: var(--color-text) !important;
  }
`

const CreateMenuButton = styled(Button)`
  justify-self: end;
  border-radius: var(--list-item-border-radius);
`

const CostSearchCenter = styled.div`
  min-width: 0;
  display: flex;
  justify-content: center;
`

const CostSearchInput = styled(Input.Search)`
  width: min(100%, clamp(220px, 42vw, 620px));

  .ant-input-affix-wrapper {
    border-radius: var(--list-item-border-radius);
  }
`

const MainBody = styled.div<{ $centered: boolean; $agentFull?: boolean }>`
  display: flex;
  flex: 1;
  min-width: 0;
  min-height: 0;
  flex-direction: column;
  align-items: ${({ $centered }) => ($centered ? 'center' : 'stretch')};
  justify-content: ${({ $centered }) => ($centered ? 'center' : 'flex-start')};
  padding: ${({ $agentFull }) => ($agentFull ? '0' : '16px')};
  gap: 12px;
  overflow: ${({ $agentFull }) => ($agentFull ? 'hidden' : 'auto')};
`

const CostAgentMain = styled.div`
  display: flex;
  min-width: 0;
  min-height: 0;
  flex: 1;
  width: 100%;
  overflow: hidden;
`

const MainTitle = styled.h1`
  margin: 0;
  color: var(--color-text);
  font-size: 24px;
  font-weight: 600;
`

const MainDesc = styled.p`
  margin: 0;
  color: var(--color-text-secondary);
  font-size: 14px;
`

const ProgressPricePage = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
`

const SectionCard = styled.div`
  border: 0.5px solid var(--color-border);
  border-radius: 10px;
  background: var(--color-background);
  padding: 12px;
`

const SectionHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
`

const SectionTitle = styled.h3`
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text);
`

const FormGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px 12px;
`

const FieldItem = styled.div`
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 6px;
`

const FieldLabel = styled.span`
  color: var(--color-text);
  font-size: 12px;
`

const FieldHint = styled.span`
  display: inline-block;
  max-width: 260px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--color-text-secondary);
  font-size: 12px;
`

const InlineRow = styled.div`
  display: flex;
  align-items: center;
  flex-wrap: nowrap;
  gap: 8px;
  min-width: 0;
`

const HiddenFileInput = styled.input`
  display: none;
`

const TableScroller = styled.div`
  overflow-x: auto;
`

const StyledTable = styled.table`
  width: 100%;
  min-width: 1100px;
  border-collapse: collapse;

  th,
  td {
    border: 0.5px solid var(--color-border);
    padding: 6px;
    text-align: center;
    vertical-align: middle;
  }

  th {
    background: var(--color-background-soft);
    white-space: nowrap;
    font-size: 12px;
    font-weight: 700;
  }
`

const ReadOnlyText = styled.span`
  display: inline-block;
  min-width: 68px;
  color: var(--color-text);
`

const SummaryCell = styled.td`
  text-align: right !important;
  font-weight: 600;
`

const SummaryAmount = styled.td`
  font-weight: 600;
  color: var(--color-text);
`

const ActionRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 10px;
  margin-top: 8px;
`

const SignatureInput = styled(Input)`
  width: 220px;
`

const ActionFooter = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 8px;
`

const ActionLeft = styled.div`
  display: flex;
  align-items: center;
  justify-content: flex-start;
`

const ActionButtons = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
`

export default ProjectManagerPage

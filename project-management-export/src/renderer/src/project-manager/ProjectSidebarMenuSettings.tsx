import { Button, Switch } from 'antd'
import { ArrowDown, ArrowUp, GripVertical, RotateCcw } from 'lucide-react'
import type { FC, ReactNode } from 'react'
import styled from 'styled-components'

import type { ConfigurableSidebarMenuKey } from './projectSidebarMenuConfig'

interface MenuRowMeta {
  key: ConfigurableSidebarMenuKey
  label: string
  icon: ReactNode
}

interface Props {
  menuRows: MenuRowMeta[]
  hiddenKeys: Set<ConfigurableSidebarMenuKey>
  onVisibleChange: (key: ConfigurableSidebarMenuKey, visible: boolean) => void
  onMove: (key: ConfigurableSidebarMenuKey, direction: 'up' | 'down') => void
  onReset: () => void
}

const ProjectSidebarMenuSettings: FC<Props> = ({ menuRows, hiddenKeys, onVisibleChange, onMove, onReset }) => {
  const visibleCount = menuRows.filter((row) => !hiddenKeys.has(row.key)).length

  return (
    <SettingsPageOuter>
      <SettingsPage>
        <SettingsHeader>
          <div>
            <SettingsTitle>自定义菜单栏</SettingsTitle>
            <SettingsDesc>配置项目管理左侧菜单的显示与顺序。「自定义」入口固定显示在底部，无法隐藏。</SettingsDesc>
          </div>
          <Button icon={<RotateCcw size={14} />} onClick={onReset}>
            恢复默认
          </Button>
        </SettingsHeader>

        <SettingsCard>
          <CardTitle>
            菜单项（{visibleCount}/{menuRows.length} 项显示）
          </CardTitle>
          <MenuList>
            {menuRows.map((row, index) => {
              const visible = !hiddenKeys.has(row.key)
              return (
                <MenuRow key={row.key}>
                  <DragHint aria-hidden>
                    <GripVertical size={14} />
                  </DragHint>
                  <MenuIcon>{row.icon}</MenuIcon>
                  <MenuLabel>{row.label}</MenuLabel>
                  <RowActions>
                    <Switch
                      checked={visible}
                      checkedChildren="显示"
                      unCheckedChildren="隐藏"
                      onChange={(checked) => onVisibleChange(row.key, checked)}
                    />
                    <Button
                      type="text"
                      size="small"
                      disabled={index === 0}
                      icon={<ArrowUp size={14} />}
                      onClick={() => onMove(row.key, 'up')}
                    />
                    <Button
                      type="text"
                      size="small"
                      disabled={index === menuRows.length - 1}
                      icon={<ArrowDown size={14} />}
                      onClick={() => onMove(row.key, 'down')}
                    />
                  </RowActions>
                </MenuRow>
              )
            })}
          </MenuList>
        </SettingsCard>

        <HintCard>
          <HintTitle>说明</HintTitle>
          <HintList>
            <li>隐藏后的菜单不会在左侧显示；若当前正在查看被隐藏的页面，将自动切换到第一个可见菜单。</li>
            <li>排序仅影响左侧菜单栏；「自定义」始终在列表最下方。</li>
            <li>设置保存在本机浏览器，换设备需重新配置。</li>
          </HintList>
        </HintCard>
      </SettingsPage>
    </SettingsPageOuter>
  )
}

const SettingsPageOuter = styled.div`
  display: flex;
  width: 100%;
  min-width: 0;
  justify-content: center;
  box-sizing: border-box;
`

const SettingsPage = styled.div`
  display: flex;
  width: 100%;
  max-width: 720px;
  flex-direction: column;
  gap: 16px;
`

const SettingsHeader = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
`

const SettingsTitle = styled.h1`
  margin: 0 0 6px;
  font-size: 20px;
  font-weight: 600;
  color: var(--color-text);
`

const SettingsDesc = styled.p`
  margin: 0;
  font-size: 13px;
  line-height: 1.5;
  color: var(--color-text-secondary);
`

const SettingsCard = styled.div`
  border: 0.5px solid var(--color-border);
  border-radius: 10px;
  background: var(--color-background);
  padding: 12px;
`

const CardTitle = styled.h3`
  margin: 0 0 10px;
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text);
`

const MenuList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
`

const MenuRow = styled.div`
  display: grid;
  grid-template-columns: auto auto 1fr auto;
  align-items: center;
  gap: 10px;
  min-height: 44px;
  padding: 6px 8px;
  border-radius: var(--list-item-border-radius);
  border: 0.5px solid var(--color-border);
  background: var(--color-background-soft);
`

const DragHint = styled.span`
  display: inline-flex;
  color: var(--color-text-tertiary, var(--color-text-secondary));
  opacity: 0.6;
`

const MenuIcon = styled.span`
  display: inline-flex;
  color: var(--color-text-secondary);
`

const MenuLabel = styled.span`
  font-size: 14px;
  color: var(--color-text);
`

const RowActions = styled.div`
  display: flex;
  align-items: center;
  gap: 4px;
`

const HintCard = styled.div`
  border: 0.5px dashed var(--color-border);
  border-radius: 10px;
  padding: 12px 14px;
  background: var(--color-background-soft);
`

const HintTitle = styled.h4`
  margin: 0 0 8px;
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text);
`

const HintList = styled.ul`
  margin: 0;
  padding-left: 18px;
  color: var(--color-text-secondary);
  font-size: 12px;
  line-height: 1.6;
`

export default ProjectSidebarMenuSettings

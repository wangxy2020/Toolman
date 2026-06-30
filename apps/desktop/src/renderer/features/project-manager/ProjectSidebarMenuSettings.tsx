import { Button, Switch } from 'antd'
import { ArrowDown, ArrowUp, GripVertical } from 'lucide-react'
import type { FC } from 'react'
import styled from 'styled-components'

import type { ConfigurableSidebarMenuKey } from './projectSidebarMenuConfig'

interface MenuRowMeta {
  key: ConfigurableSidebarMenuKey
  label: string
}

interface Props {
  menuRows: MenuRowMeta[]
  hiddenKeys: Set<ConfigurableSidebarMenuKey>
  onVisibleChange: (key: ConfigurableSidebarMenuKey, visible: boolean) => void
  onMove: (key: ConfigurableSidebarMenuKey, direction: 'up' | 'down') => void
}

const ProjectSidebarMenuSettings: FC<Props> = ({ menuRows, hiddenKeys, onVisibleChange, onMove }) => {
  const visibleCount = menuRows.filter((row) => !hiddenKeys.has(row.key)).length

  return (
    <SettingsPageOuter>
      <SettingsPage>
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
            <li>排序仅影响侧栏顶部「自定义」下方的菜单项。</li>
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
  grid-template-columns: auto 1fr auto;
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

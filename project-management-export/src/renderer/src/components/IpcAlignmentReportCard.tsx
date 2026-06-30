import {
  type DiscoveredWorkbook,
  EPC_COMMERCIAL_REPORT_TITLE,
  EPC_COMMERCIAL_WORKFLOW_STEPS
} from '@shared/epcCommercialTypes'
import { Button, Table, Tag } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { FileSpreadsheet } from 'lucide-react'
import type { FC } from 'react'
import { useMemo } from 'react'
import styled from 'styled-components'

import type { EpcCommercialReportPayload } from './epcCommercialMessage'
import { EpcOutputPathLink } from './EpcOutputPathLink'
import {
  buildAuditErrorsFromReport,
  EPC_STEP1_SCAN_INTRO,
  formatDiscoveredFileDescription,
  getDiscoveredQueueLabel,
  getStep1FooterParts,
  getStep5OutputPaths,
  getWorkflowStepFooterParts,
  getWorkflowStepIntro,
  isStep1ScanSuccess,
  sortDiscoveredForDisplay
} from './epcCommercialReportUtils'
import {
  EPC_DISCOVERY_FILE_NAME_COLUMN_PERCENT,
  EPC_DISCOVERY_QUEUE_COLUMN_MIN_WIDTH_PX,
  EPC_DISCOVERY_QUEUE_COLUMN_PERCENT
} from './epcDiscoveryTable'

interface Props {
  payload: EpcCommercialReportPayload
}

const DISCOVERED_COLUMNS: ColumnsType<DiscoveredWorkbook & { rowKey: string }> = [
  {
    title: '文件名',
    dataIndex: 'fileName',
    width: `${EPC_DISCOVERY_FILE_NAME_COLUMN_PERCENT}%`,
    ellipsis: { showTitle: true }
  },
  {
    title: '分类',
    dataIndex: 'queue',
    width: `${EPC_DISCOVERY_QUEUE_COLUMN_PERCENT}%`,
    align: 'center',
    className: 'epc-discovered-queue-col',
    onHeaderCell: () => ({
      className: 'epc-discovered-queue-col',
      style: { textAlign: 'center', minWidth: EPC_DISCOVERY_QUEUE_COLUMN_MIN_WIDTH_PX }
    }),
    onCell: () => ({
      className: 'epc-discovered-queue-col',
      style: { textAlign: 'center', minWidth: EPC_DISCOVERY_QUEUE_COLUMN_MIN_WIDTH_PX }
    }),
    render: (queue: DiscoveredWorkbook['queue']) => (
      <QueueCell>
        <QueueLabel $queue={queue}>{getDiscoveredQueueLabel(queue)}</QueueLabel>
      </QueueCell>
    )
  },
  {
    title: '说明',
    dataIndex: 'roleReason',
    render: (_text: string, record) => (
      <DescriptionCell title={formatDiscoveredFileDescription(record)}>
        {formatDiscoveredFileDescription(record)}
      </DescriptionCell>
    )
  }
]

const StepFooterColumn = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 12px;
  line-height: 1.5;
  color: var(--color-text-secondary);
`

const StepDetail = styled.div`
  margin-top: 2px;
  white-space: pre-wrap;
  word-break: break-word;
`

const StepStatusLabel = styled.span<{ $ok: boolean }>`
  font-weight: 600;
  color: ${({ $ok }) => ($ok ? 'var(--color-success, #389e0d)' : 'var(--color-error, #cf1322)')};
  margin-right: 4px;
`

const StepFooter: FC<{
  $ok: boolean
  status: string
  detail: string
  outputPaths?: string[]
}> = ({ $ok, status, detail, outputPaths }) => (
  <StepFooterColumn>
    <StepStatusLabel $ok={$ok}>{status}</StepStatusLabel>
    {$ok && (outputPaths?.length ?? 0) > 0 && (
      <OutputFileList>
        {outputPaths!.map((p, index) => (
          <OutputFileLinkRow key={`${index}-${p}`}>
            <EpcOutputPathLink path={p} />
          </OutputFileLinkRow>
        ))}
      </OutputFileList>
    )}
    {detail ? <StepDetail>{detail}</StepDetail> : null}
  </StepFooterColumn>
)

const IpcAlignmentReportCard: FC<Props> = ({ payload }) => {
  const report = payload.kind === 'report' ? payload.report : payload.kind === 'error' ? payload.report : undefined
  const errorMessage = payload.kind === 'error' ? payload.errorMessage : undefined

  const discoveredRows = useMemo(() => {
    const files = sortDiscoveredForDisplay(report?.discoveredFiles ?? [])
    return files.map((file) => ({
      ...file,
      rowKey: `${file.filePath}-${file.queue}`
    }))
  }, [report?.discoveredFiles])

  if (!report && errorMessage) {
    return (
      <Card>
        <CardTitle>{EPC_COMMERCIAL_REPORT_TITLE}</CardTitle>
        <ErrorText>{errorMessage}</ErrorText>
      </Card>
    )
  }

  if (!report) {
    return null
  }
  const handleExportErrors = async () => {
    const errors = buildAuditErrorsFromReport(report)
    if (errors.length === 0) {
      window.toast.info('没有需要导出的失败记录')
      return
    }
    const outputPath = `${report.ipcRootPath}/epc_error_audit_${report.period}_${Date.now()}.xlsx`
    const result = await window.api.epcCommercial.exportErrorAudit({
      dataDir: '',
      period: report.period,
      outputPath,
      errors
    })
    if (!result.ok) {
      window.toast.error(result.errorMessage ?? '导出失败')
      return
    }
    window.toast.success(`已导出：${result.outputPath}`)
    if (result.outputPath) {
      await window.api.openPath(result.outputPath)
    }
  }

  return (
    <Card>
      <CardTitle>{EPC_COMMERCIAL_REPORT_TITLE}</CardTitle>
      {errorMessage && <ErrorText>{errorMessage}</ErrorText>}
      <MetaGrid>
        <MetaItem>
          <MetaLabel>处理时间</MetaLabel>
          <MetaValue>{new Date(report.processedAt).toLocaleString()}</MetaValue>
        </MetaItem>
        <MetaItem>
          <MetaLabel>监控目录</MetaLabel>
          <MetaValue title={report.ipcRootPath}>{report.ipcRootPath}</MetaValue>
        </MetaItem>
        <MetaItem>
          <MetaLabel>母表</MetaLabel>
          <MetaValue title={report.masterPricePath}>{report.masterPricePath}</MetaValue>
        </MetaItem>
        <MetaItem>
          <MetaLabel>期数列</MetaLabel>
          <MetaValue>{report.period}</MetaValue>
        </MetaItem>
      </MetaGrid>

      <StatsRow>
        <Tag color="success">成功 {report.successCount}</Tag>
        <Tag color="default">跳过 {report.skippedCount}</Tag>
        <Tag color="error">失败 {report.failedCount}</Tag>
      </StatsRow>

      {(discoveredRows.length > 0 || errorMessage) && (
        <Section>
          <SectionTitle>步骤 1：多层穿透与匹配</SectionTitle>
          {isStep1ScanSuccess(report.discoveredFiles) && (
            <>
              <IntroText>{EPC_STEP1_SCAN_INTRO}</IntroText>
              <DiscoveredTable
                size="small"
                bordered
                tableLayout="fixed"
                pagination={false}
                scroll={{ y: 280 }}
                rowKey="rowKey"
                columns={DISCOVERED_COLUMNS}
                dataSource={discoveredRows}
              />
            </>
          )}
          <StepFooter
            $ok={isStep1ScanSuccess(report.discoveredFiles)}
            status={isStep1ScanSuccess(report.discoveredFiles) ? '成功。' : '失败。'}
            detail={getStep1FooterParts(report.discoveredFiles, errorMessage).detail}
          />
        </Section>
      )}

      {(report.files.length > 0 || errorMessage) &&
        EPC_COMMERCIAL_WORKFLOW_STEPS.slice(1).map((stepTitle, index) => {
          const stepNum = (index + 2) as 2 | 3 | 4 | 5
          const { ok, detail } = getWorkflowStepFooterParts(stepNum, report, errorMessage)
          const outputPaths = stepNum === 5 && ok ? getStep5OutputPaths(report) : undefined
          return (
            <Section key={stepTitle}>
              <SectionTitle>
                步骤 {stepNum}：{stepTitle}
              </SectionTitle>
              <IntroText>{getWorkflowStepIntro(stepNum)}</IntroText>
              <StepFooter
                $ok={ok}
                status={ok ? '成功。' : '失败。'}
                detail={detail}
                outputPaths={outputPaths}
              />
            </Section>
          )
        })}

      {report.files.length > 0 && <SectionTitle>处理明细</SectionTitle>}
      <FileList>
        {report.files.map((file) => (
          <FileRow key={`${file.filePath}-${file.status}`}>
            <StatusIcon>
              {file.status === 'success' && '✅'}
              {file.status === 'skipped' && '⏩'}
              {file.status === 'failed' && '❌'}
            </StatusIcon>
            <FileInfo>
              <FileName>{file.fileName}</FileName>
              {(file.errorMessage || file.skippedReason) && (
                <FileDetail>{file.errorMessage ?? file.skippedReason}</FileDetail>
              )}
            </FileInfo>
          </FileRow>
        ))}
      </FileList>

      {report.failedCount > 0 && (
        <Button type="primary" icon={<FileSpreadsheet size={16} />} onClick={handleExportErrors}>
          导出错误审计报告
        </Button>
      )}
    </Card>
  )
}

const Card = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 100%;
  max-width: 100%;
  padding: 14px 16px;
  border: 0.5px solid var(--color-border);
  border-radius: 10px;
  background: var(--color-background-soft);
`

const CardTitle = styled.h3`
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--color-text);
`

const Section = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`

const SectionTitle = styled.div`
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text);
`

const IntroText = styled.div`
  font-size: 12px;
  color: var(--color-text-secondary);
  line-height: 1.5;
`

const ErrorText = styled.p`
  margin: 0;
  font-size: 13px;
  color: var(--color-error, #cf1322);
`

const MetaGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px 12px;
`

const MetaItem = styled.div`
  min-width: 0;
`

const MetaLabel = styled.div`
  font-size: 11px;
  color: var(--color-text-secondary);
`

const MetaValue = styled.div`
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  color: var(--color-text);
`

const StatsRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
`

const FileList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 240px;
  overflow-y: auto;
`

const FileRow = styled.div`
  display: flex;
  gap: 8px;
  align-items: flex-start;
  padding: 6px 8px;
  border-radius: 6px;
  background: var(--color-background);
`

const StatusIcon = styled.span`
  flex-shrink: 0;
  width: 20px;
`

const FileInfo = styled.div`
  min-width: 0;
  flex: 1;
`

const FileName = styled.div`
  font-size: 13px;
  color: var(--color-text);
`

const FileDetail = styled.div`
  margin-top: 2px;
  font-size: 11px;
  color: var(--color-text-secondary);
  word-break: break-word;
`

const DiscoveredTable = styled(Table)`
  width: 100%;

  .ant-table {
    width: 100%;
    border-radius: 8px;
    overflow: hidden;
  }

  .ant-table-thead > tr > th {
    background: var(--color-background);
    font-weight: 600;
    font-size: 12px;
  }

  .ant-table-tbody > tr > td {
    font-size: 12px;
    vertical-align: middle;
  }

  .epc-discovered-queue-col {
    text-align: center !important;
    min-width: ${EPC_DISCOVERY_QUEUE_COLUMN_MIN_WIDTH_PX}px !important;
  }

  .ant-table-tbody > tr > td.epc-discovered-queue-col {
    padding-left: 4px;
    padding-right: 4px;
  }
` as typeof Table

const QueueCell = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  width: 100%;
`

const DescriptionCell = styled.div`
  white-space: normal;
  word-break: break-word;
  line-height: 1.45;
`

const QueueLabel = styled.span<{ $queue: DiscoveredWorkbook['queue'] }>`
  display: inline-block;
  min-width: 4em;
  padding: 0 10px;
  line-height: 22px;
  font-size: 12px;
  white-space: nowrap;
  text-align: center;
  border-radius: 4px;
  color: ${({ $queue }) =>
    $queue === 'pendingProcess'
      ? '#1677ff'
      : $queue === 'masterContract'
        ? '#d48806'
        : $queue === 'alreadyProcessed'
          ? 'var(--color-text-secondary)'
          : '#d46b08'};
  background: ${({ $queue }) =>
    $queue === 'pendingProcess'
      ? 'rgba(22, 119, 255, 0.1)'
      : $queue === 'masterContract'
        ? 'rgba(250, 173, 20, 0.15)'
        : $queue === 'alreadyProcessed'
          ? 'var(--color-background)'
          : 'rgba(250, 140, 22, 0.12)'};
  border: 1px solid
    ${({ $queue }) =>
      $queue === 'pendingProcess'
        ? 'rgba(22, 119, 255, 0.35)'
        : $queue === 'masterContract'
          ? 'rgba(250, 173, 20, 0.45)'
          : $queue === 'alreadyProcessed'
            ? 'var(--color-border)'
            : 'rgba(250, 140, 22, 0.35)'};
`

const OutputFileList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 2px;
`

const OutputFileLinkRow = styled.div`
  display: block;
  line-height: 1.45;
`

export default IpcAlignmentReportCard

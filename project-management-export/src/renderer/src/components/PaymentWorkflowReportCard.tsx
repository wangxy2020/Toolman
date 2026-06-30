import { EPC_WORK5_PAYMENT_REPORT_TITLE, EPC_WORK5_PAYMENT_WORKFLOW_STEPS } from '@shared/epcCommercialTypes'
import type { DiscoveredAlignedWorkbook } from '@shared/epcCommercialTypes'
import { Table, Tag } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import type { FC } from 'react'
import { useMemo } from 'react'
import styled from 'styled-components'

import { EpcOutputPathLink } from './EpcOutputPathLink'
import type { EpcWork5PaymentReportPayload } from './epcWork5PaymentMessage'
import {
  EPC_WORK5_STEP1_INTRO,
  getDiscoveredAlignedWorkbooks,
  getWork5Step1FooterParts,
  getWork5Step5OutputPaths,
  getWork5WorkflowStepFooterParts,
  getWork5WorkflowStepIntro,
  isWork5NoPendingIdleRun,
  isWork5Step1ScanSuccess,
  PAYMENT_ALIGNED_QUEUE_LABELS,
  sortDiscoveredAlignedForDisplay
} from './epcWork5PaymentReportUtils'
import {
  EPC_DISCOVERY_FILE_NAME_COLUMN_PERCENT,
  EPC_DISCOVERY_QUEUE_COLUMN_MIN_WIDTH_PX,
  EPC_DISCOVERY_QUEUE_COLUMN_PERCENT
} from './epcDiscoveryTable'

interface Props {
  payload: EpcWork5PaymentReportPayload
}

const DISCOVERED_ALIGNED_COLUMNS: ColumnsType<DiscoveredAlignedWorkbook & { rowKey: string }> = [
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
    render: (queue: DiscoveredAlignedWorkbook['queue']) => PAYMENT_ALIGNED_QUEUE_LABELS[queue]
  },
  {
    title: '说明',
    dataIndex: 'roleReason',
    render: (reason: string) => <DescriptionCell title={reason}>{reason}</DescriptionCell>
  }
]

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

const PaymentWorkflowReportCard: FC<Props> = ({ payload }) => {
  const report = payload.kind === 'report' ? payload.report : payload.kind === 'error' ? payload.report : undefined
  const errorMessage = payload.kind === 'error' ? payload.errorMessage : undefined

  const alignedRows = useMemo(() => {
    if (!report) {
      return []
    }
    return sortDiscoveredAlignedForDisplay(getDiscoveredAlignedWorkbooks(report)).map((file) => ({
      ...file,
      rowKey: file.filePath
    }))
  }, [report])

  if (!report && errorMessage) {
    return (
      <Card>
        <CardTitle>{EPC_WORK5_PAYMENT_REPORT_TITLE}</CardTitle>
        <ErrorText>{errorMessage}</ErrorText>
      </Card>
    )
  }

  if (!report) {
    return null
  }

  const step1Ok = isWork5Step1ScanSuccess(report)
  const idleRun = isWork5NoPendingIdleRun(report)

  return (
    <Card>
      <CardTitle>{EPC_WORK5_PAYMENT_REPORT_TITLE}</CardTitle>
      {errorMessage && <ErrorText>{errorMessage}</ErrorText>}
      <MetaGrid>
        <MetaItem>
          <MetaLabel>处理时间</MetaLabel>
          <MetaValue>{new Date(report.processedAt).toLocaleString()}</MetaValue>
        </MetaItem>
        <MetaItem>
          <MetaLabel>工作区</MetaLabel>
          <MetaValue title={report.workspaceRoot}>{report.workspaceRoot}</MetaValue>
        </MetaItem>
        <MetaItem>
          <MetaLabel>期数</MetaLabel>
          <MetaValue>{report.period}</MetaValue>
        </MetaItem>
      </MetaGrid>

      <StatsRow>
        <Tag color="success">成功 {report.successCount}</Tag>
        <Tag color="default">跳过 {report.skippedCount}</Tag>
        <Tag color="error">失败 {report.failedCount}</Tag>
      </StatsRow>

      <Section>
        <SectionTitle>步骤 1：{EPC_WORK5_PAYMENT_WORKFLOW_STEPS[0]}</SectionTitle>
        {step1Ok && (
          <>
            <IntroText>{EPC_WORK5_STEP1_INTRO}</IntroText>
            {alignedRows.length > 0 && (
              <DiscoveredTable
                size="small"
                bordered
                tableLayout="fixed"
                pagination={false}
                scroll={{ y: 280 }}
                rowKey="rowKey"
                columns={DISCOVERED_ALIGNED_COLUMNS}
                dataSource={alignedRows}
              />
            )}
          </>
        )}
        <StepFooter
          $ok={step1Ok}
          status={step1Ok ? '成功。' : '失败。'}
          detail={getWork5Step1FooterParts(report).detail}
        />
      </Section>

      {step1Ok &&
        EPC_WORK5_PAYMENT_WORKFLOW_STEPS.slice(1).map((stepTitle, index) => {
          const stepNum = (index + 2) as 2 | 3 | 4 | 5
          const { ok, detail } = getWork5WorkflowStepFooterParts(stepNum, report, errorMessage)
          const outputPaths =
            stepNum === 5 && ok && !idleRun ? getWork5Step5OutputPaths(report) : undefined
          return (
            <Section key={stepTitle}>
              <SectionTitle>
                步骤 {stepNum}：{stepTitle}
              </SectionTitle>
              <IntroText>{getWork5WorkflowStepIntro(stepNum)}</IntroText>
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
    </Card>
  )
}

export default PaymentWorkflowReportCard

const Card = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 100%;
  max-width: 100%;
  padding: 14px 16px;
  margin: 8px 0;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-background-soft);
`

const CardTitle = styled.h3`
  margin: 0;
  font-size: 15px;
  font-weight: 600;
`

const ErrorText = styled.div`
  color: var(--color-error, #cf1322);
  font-size: 13px;
`

const MetaGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px 16px;
  font-size: 12px;
`

const MetaItem = styled.div`
  min-width: 0;
`

const MetaLabel = styled.div`
  color: var(--color-text-secondary);
  margin-bottom: 2px;
`

const MetaValue = styled.div`
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`

const StatsRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
`

const Section = styled.section`
  display: flex;
  flex-direction: column;
  gap: 6px;
`

const SectionTitle = styled.h4`
  margin: 0;
  font-size: 13px;
  font-weight: 600;
`

const DescriptionCell = styled.div`
  white-space: normal;
  word-break: break-word;
  line-height: 1.45;
`

const IntroText = styled.p`
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--color-text-secondary);
`

const DiscoveredTable = styled(Table)`
  width: 100%;
  margin-top: 4px;

  .ant-table {
    width: 100%;
    font-size: 12px;
  }

  .epc-discovered-queue-col {
    text-align: center !important;
    min-width: ${EPC_DISCOVERY_QUEUE_COLUMN_MIN_WIDTH_PX}px !important;
  }
` as typeof Table

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
`

const OutputFileList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
`

const OutputFileLinkRow = styled.div`
  margin: 0;
`

const FileList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
`

const FileRow = styled.div`
  display: flex;
  gap: 8px;
  align-items: flex-start;
  font-size: 12px;
`

const StatusIcon = styled.span`
  flex-shrink: 0;
`

const FileInfo = styled.div`
  min-width: 0;
`

const FileName = styled.div`
  font-weight: 500;
`

const FileDetail = styled.div`
  color: var(--color-text-secondary);
  margin-top: 2px;
`

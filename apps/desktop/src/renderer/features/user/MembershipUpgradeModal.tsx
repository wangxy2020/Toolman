import type { BillingChannel } from '@toolman/shared'
import {
  formatMembershipPrice,
  useMembershipUpgrade,
} from './useMembershipUpgrade'

interface Props {
  open: boolean
  onClose: () => void
}

export function MembershipUpgradeModal({ open, onClose }: Props) {
  const {
    proPlan,
    currentSkuLabel,
    mockMode,
    channel,
    setChannel,
    order,
    loading,
    paying,
    error,
    message,
    handleCreateOrder,
    handleMockPay,
  } = useMembershipUpgrade(open)

  const channelLabel = channel === 'alipay' ? '支付宝' : '微信'

  if (!open) return null

  return (
    <div className="tm-modal-overlay tm-modal-overlay--auth-guard" onClick={onClose}>
      <div
        className="tm-membership-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="membership-upgrade-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="tm-membership-modal-header">
          <div>
            <h3 id="membership-upgrade-title" className="tm-membership-modal-title">
              升级会员
            </h3>
            <p className="tm-membership-modal-subtitle">当前套餐：{currentSkuLabel}</p>
          </div>
          <button type="button" className="tm-agent-modal-close" aria-label="关闭" onClick={onClose}>
            ×
          </button>
        </header>

        <div className="tm-membership-modal-body">
          {loading && !proPlan ? <p className="tm-settings-row-hint">加载套餐中…</p> : null}
          {error ? <p className="tm-settings-error">{error}</p> : null}
          {message ? <p className="tm-membership-modal-message">{message}</p> : null}

          {proPlan ? (
            <section className="tm-membership-plan-card">
              <div className="tm-membership-plan-card-head">
                <h4>{proPlan.name}</h4>
                <span className="tm-membership-plan-price">
                  {formatMembershipPrice(proPlan.priceCents)}
                  <small> / {proPlan.billingPeriodLabel}</small>
                </span>
              </div>
              <p className="tm-membership-plan-desc">{proPlan.description}</p>
              <ul className="tm-membership-plan-features">
                <li>群组成员上限 {proPlan.groupMaxMembers} 人</li>
                <li>保留社区版全部能力</li>
                <li>支付成功后可创建更高上限的新群组</li>
              </ul>
            </section>
          ) : null}

          <div className="tm-membership-channel-tabs" role="tablist" aria-label="支付方式">
            {(['alipay', 'wechat'] as BillingChannel[]).map((item) => (
              <button
                key={item}
                type="button"
                className={
                  channel === item
                    ? 'tm-membership-channel-tab tm-membership-channel-tab--active'
                    : 'tm-membership-channel-tab'
                }
                onClick={() => setChannel(item)}
              >
                {item === 'alipay' ? '支付宝' : '微信'}
              </button>
            ))}
          </div>

          <div className="tm-membership-qr-panel">
            {order?.qrImageDataUrl ? (
              <img src={order.qrImageDataUrl} alt="支付二维码" className="tm-membership-qr-image" />
            ) : (
              <div className="tm-membership-qr-placeholder" aria-hidden="true">
                <span>{channelLabel}</span>
                <span>扫码支付</span>
              </div>
            )}
            <p className="tm-membership-qr-hint">
              {order?.qrUrl
                ? '请使用手机扫码完成支付，支付成功后会员状态会自动更新。'
                : order?.message ??
                  (mockMode
                    ? '支付通道占位中。可先创建订单，再使用模拟支付验证会员生效流程。'
                    : '支付通道配置中，请稍后再试。')}
            </p>
          </div>
        </div>

        <footer className="tm-membership-modal-footer">
          {!order ? (
            <button
              type="button"
              className="tm-btn tm-btn--primary"
              disabled={loading || !proPlan}
              onClick={() => void handleCreateOrder()}
            >
              生成{channelLabel}支付码
            </button>
          ) : order.status === 'paid' ? (
            <button type="button" className="tm-btn tm-btn--primary" onClick={onClose}>
              完成
            </button>
          ) : (
            <>
              {mockMode ? (
                <button
                  type="button"
                  className="tm-btn tm-btn--primary"
                  disabled={paying}
                  onClick={() => void handleMockPay()}
                >
                  {paying ? '处理中…' : '模拟支付成功'}
                </button>
              ) : null}
              <button
                type="button"
                className="tm-btn tm-btn--ghost"
                disabled={loading}
                onClick={() => void handleCreateOrder()}
              >
                刷新二维码
              </button>
            </>
          )}
        </footer>
      </div>
    </div>
  )
}

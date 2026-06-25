import type { BillingChannel } from '@toolman/shared'
import {
  formatMembershipPrice,
  translateBillingPeriodLabel,
  translateBillingPlanDescription,
  translateBillingPlanName,
} from '../../i18n/billing-labels'
import { useMembershipUpgrade } from './useMembershipUpgrade'
import { useI18n } from '../../i18n/useI18n'

interface Props {
  open: boolean
  onClose: () => void
}

export function MembershipUpgradeModal({ open, onClose }: Props) {
  const { t } = useI18n()
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

  const channelLabel = channel === 'alipay' ? t('user.membership.alipay') : t('user.membership.wechat')

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
              {t('user.membership.titleUpgrade')}
            </h3>
            <p className="tm-membership-modal-subtitle">
              {t('user.membership.currentPlan', { sku: currentSkuLabel })}
            </p>
          </div>
          <button type="button" className="tm-agent-modal-close" aria-label={t('common.close')} onClick={onClose}>
            ×
          </button>
        </header>

        <div className="tm-membership-modal-body">
          {loading && !proPlan ? <p className="tm-settings-row-hint">{t('user.membership.loadingPlans')}</p> : null}
          {error ? <p className="tm-settings-error">{error}</p> : null}
          {message ? <p className="tm-membership-modal-message">{message}</p> : null}

          {proPlan ? (
            <section className="tm-membership-plan-card">
              <div className="tm-membership-plan-card-head">
                <h4>{translateBillingPlanName(proPlan, t)}</h4>
                <span className="tm-membership-plan-price">
                  {formatMembershipPrice(proPlan.priceCents, t)}
                  <small> / {translateBillingPeriodLabel(proPlan.billingPeriodLabel, t)}</small>
                </span>
              </div>
              <p className="tm-membership-plan-desc">{translateBillingPlanDescription(proPlan, t)}</p>
              <ul className="tm-membership-plan-features">
                <li>{t('user.membership.groupMaxMembers', { count: proPlan.groupMaxMembers })}</li>
                <li>{t('user.membership.keepCommunity')}</li>
                <li>{t('user.membership.higherGroupLimit')}</li>
              </ul>
            </section>
          ) : null}

          <div className="tm-membership-channel-tabs" role="tablist" aria-label={t('user.membership.paymentMethods')}>
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
                {item === 'alipay' ? t('user.membership.alipay') : t('user.membership.wechat')}
              </button>
            ))}
          </div>

          <div className="tm-membership-qr-panel">
            {order?.qrImageDataUrl ? (
              <img src={order.qrImageDataUrl} alt={t('user.membership.qrAlt')} className="tm-membership-qr-image" />
            ) : (
              <div className="tm-membership-qr-placeholder" aria-hidden="true">
                <span>{channelLabel}</span>
                <span>{t('user.membership.scanToPay')}</span>
              </div>
            )}
            <p className="tm-membership-qr-hint">
              {order?.qrUrl
                ? t('user.membership.scanHint')
                : order?.message ??
                  (mockMode
                    ? t('user.membership.mockMode')
                    : t('user.membership.channelConfiguring'))}
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
              {t('user.membership.generateQr', { channel: channelLabel })}
            </button>
          ) : order.status === 'paid' ? (
            <button type="button" className="tm-btn tm-btn--primary" onClick={onClose}>
              {t('user.membership.done')}
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
                  {paying ? t('user.membership.processing') : t('user.membership.mockPay')}
                </button>
              ) : null}
              <button
                type="button"
                className="tm-btn tm-btn--ghost"
                disabled={loading}
                onClick={() => void handleCreateOrder()}
              >
                {t('user.membership.refreshQr')}
              </button>
            </>
          )}
        </footer>
      </div>
    </div>
  )
}

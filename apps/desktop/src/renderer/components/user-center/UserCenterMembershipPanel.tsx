import type { BillingChannel } from '@toolman/shared'
import {
  formatMembershipPrice,
  translateBillingPeriodLabel,
  translateBillingPlanName,
} from '../../i18n/billing-labels'
import { useMembershipUpgrade } from '../../features/user/useMembershipUpgrade'
import { useI18n } from '../../i18n/useI18n'

interface UserCenterMembershipPanelProps {
  active: boolean
  onBack: () => void
}

export function UserCenterMembershipPanel({ active, onBack }: UserCenterMembershipPanelProps) {
  const { t, language } = useI18n()
  const { proPlan, channel, setChannel, loading, error, message } = useMembershipUpgrade(active)

  const channelLabel = channel === 'alipay' ? t('user.membership.alipay') : t('user.membership.wechat')

  return (
    <div className="tm-user-center-account-panel tm-user-center-account-panel--centered">
      {error ? (
        <div className="tm-user-center-account-alert tm-user-center-account-alert--error" role="alert">
          {error}
        </div>
      ) : null}
      {message ? (
        <div className="tm-user-center-account-alert tm-user-center-account-alert--success">
          {message}
        </div>
      ) : null}

      <div className="tm-user-center-account-form tm-user-center-account-form--auth tm-user-center-membership-form">
        {loading && !proPlan ? (
          <p className="tm-user-center-membership-hint">{t('user.membership.loadingPlans')}</p>
        ) : null}

        {proPlan ? (
          <section className="tm-user-center-membership-plan">
            <div className="tm-user-center-membership-plan-head">
              <h3 className="tm-user-center-membership-plan-name">{translateBillingPlanName(proPlan, t)}</h3>
              <span className="tm-user-center-membership-plan-price">
                {formatMembershipPrice(proPlan.priceCents, language, t)}
                <small> / {translateBillingPeriodLabel(proPlan.billingPeriodLabel, t)}</small>
              </span>
            </div>
            <ul className="tm-user-center-membership-plan-features">
              <li>{t('user.membership.groupMaxMembers', { count: proPlan.groupMaxMembers })}</li>
              <li>{t('user.membership.keepCommunity')}</li>
              <li className="tm-user-center-membership-plan-features-spacer" aria-hidden="true">
                &nbsp;
              </li>
            </ul>
          </section>
        ) : null}

        <div className="tm-user-center-membership-qr">
          <div
            className="tm-user-center-membership-channel-row"
            role="tablist"
            aria-label={t('user.membership.paymentMethods')}
          >
            {(['alipay', 'wechat'] as BillingChannel[]).map((item) => (
              <button
                key={item}
                type="button"
                role="tab"
                aria-selected={channel === item}
                className={[
                  'tm-user-center-text-link',
                  'tm-user-center-membership-channel-link',
                  channel === item ? 'tm-user-center-membership-channel-link--active' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                onClick={() => setChannel(item)}
              >
                {item === 'alipay' ? t('user.membership.alipay') : t('user.membership.wechat')}
              </button>
            ))}
          </div>
          <div className="tm-user-center-membership-qr-placeholder" aria-hidden="true">
            <span>{channelLabel}</span>
            <span>{t('user.membership.scanToPay')}</span>
          </div>
        </div>

        <button type="button" className="tm-user-center-text-link" onClick={onBack}>
          {t('user.account.back')}
        </button>
      </div>
    </div>
  )
}

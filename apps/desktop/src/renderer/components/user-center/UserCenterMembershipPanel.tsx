import type { BillingChannel } from '@toolman/shared'
import {
  formatMembershipPrice,
  useMembershipUpgrade,
} from '../../features/user/useMembershipUpgrade'

interface UserCenterMembershipPanelProps {
  active: boolean
  onBack: () => void
}

export function UserCenterMembershipPanel({ active, onBack }: UserCenterMembershipPanelProps) {
  const { proPlan, channel, setChannel, loading, error, message } = useMembershipUpgrade(active)

  const channelLabel = channel === 'alipay' ? '支付宝' : '微信'

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
          <p className="tm-user-center-membership-hint">加载套餐中…</p>
        ) : null}

        {proPlan ? (
          <section className="tm-user-center-membership-plan">
            <div className="tm-user-center-membership-plan-head">
              <h3 className="tm-user-center-membership-plan-name">{proPlan.name}</h3>
              <span className="tm-user-center-membership-plan-price">
                {formatMembershipPrice(proPlan.priceCents)}
                <small> / {proPlan.billingPeriodLabel}</small>
              </span>
            </div>
            <ul className="tm-user-center-membership-plan-features">
              <li>群组成员上限 {proPlan.groupMaxMembers} 人</li>
              <li>保留社区版全部能力</li>
              <li>支付成功后可创建更高上限的新群组</li>
            </ul>
          </section>
        ) : null}

        <div className="tm-user-center-membership-qr">
          <div className="tm-user-center-membership-channel-row" role="tablist" aria-label="支付方式">
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
                {item === 'alipay' ? '支付宝' : '微信'}
              </button>
            ))}
          </div>
          <div className="tm-user-center-membership-qr-placeholder" aria-hidden="true">
            <span>{channelLabel}</span>
            <span>扫码支付</span>
          </div>
        </div>

        <button type="button" className="tm-user-center-text-link" onClick={onBack}>
          返回
        </button>
      </div>
    </div>
  )
}

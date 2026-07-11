import { ArrowDownRight, ArrowUpRight } from 'lucide-react'

import type { KpiCardModel } from './dashboard-types'

interface Props {
  cards: KpiCardModel[]
}

export function PmKpiGrid({ cards }: Props) {
  return (
    <div className="tm-pm-kpi-grid">
      {cards.map((card) => (
        <div key={card.key} className="tm-pm-kpi-card">
          <div className="tm-pm-kpi-icon">{card.icon}</div>
          <div className="tm-pm-kpi-content">
            <span className="tm-pm-kpi-label">{card.label}</span>
            <span className="tm-pm-kpi-value">{card.value}</span>
            <span className="tm-pm-kpi-sub">
              {card.sub}
              {card.trend ? (
                <span className={`tm-pm-trend tm-pm-trend--${card.trend}`}>
                  {card.trend === 'up' ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                  {card.delta}
                </span>
              ) : null}
            </span>
          </div>
        </div>
      ))}
    </div>
  )
}

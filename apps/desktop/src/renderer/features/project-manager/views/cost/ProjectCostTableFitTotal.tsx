import { useLayoutEffect, useRef, type FC } from 'react'

type Props = {
  value: string
  className?: string
}

/** Shrink a 合价 so a 分部工程汇总 still fits the current column width. */
export const ProjectCostTableFitTotal: FC<Props> = ({ value, className }) => {
  const ref = useRef<HTMLSpanElement>(null)

  useLayoutEffect(() => {
    const el = ref.current
    const cell = el?.closest('td')
    if (!el || !cell) return

    const fit = () => {
      el.style.fontSize = ''
      const available = el.clientWidth
      const natural = el.scrollWidth
      if (available <= 0 || natural <= available) return
      const base = parseFloat(window.getComputedStyle(el).fontSize) || 13
      el.style.fontSize = `${Math.max(8, (base * available) / natural)}px`
    }

    fit()
    const observer = new ResizeObserver(fit)
    observer.observe(cell)
    return () => observer.disconnect()
  }, [value])

  return (
    <span ref={ref} className={className}>
      {value}
    </span>
  )
}

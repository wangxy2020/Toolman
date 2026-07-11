import { createContext, useContext, type ReactNode } from 'react'

const PlanProjectDisplayNameContext = createContext<string | null>(null)

/** Provides the selected PM project label for plan-table root-row rendering in chat. */
export function PlanProjectDisplayNameProvider({
  projectName,
  children,
}: {
  projectName: string | null | undefined
  children: ReactNode
}) {
  const value = projectName?.trim() || null
  return (
    <PlanProjectDisplayNameContext.Provider value={value}>
      {children}
    </PlanProjectDisplayNameContext.Provider>
  )
}

export function usePlanProjectDisplayName(): string | null {
  return useContext(PlanProjectDisplayNameContext)
}

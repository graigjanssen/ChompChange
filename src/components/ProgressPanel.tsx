import { useState, useEffect, useCallback, useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  ReferenceLine,
  Tooltip,
} from 'recharts'
import { supabase } from '../lib/supabase'

interface Tier {
  id: string
  name: string
  min_amount: number
  max_amount: number
  default_value: number
  sort_order: number
  color: string
  category_id: string
}

interface PeriodEntry {
  date: string
  period_type: string
  tier_id: string | null
  dollar_amount: number | null
}

interface Allocation {
  tier_id: string
  period_count: number
  is_variable: boolean
}

interface ProgressPanelProps {
  userId: string
  categoryId: string | undefined
  tiers: Tier[]
  viewDate: { year: number; month: number }
  entries: PeriodEntry[]
}

export function ProgressPanel({
  userId,
  categoryId,
  tiers,
  viewDate,
  entries,
}: ProgressPanelProps) {
  const [allocations, setAllocations] = useState<Allocation[]>([])
  const [hasBudget, setHasBudget] = useState(false)
  const [loading, setLoading] = useState(true)

  const daysInMonth = new Date(viewDate.year, viewDate.month + 1, 0).getDate()
  const totalPeriods = daysInMonth * 2

  // Variable tier adjustment: base is 60 periods (30 days)
  const periodDiff = totalPeriods - 60 // e.g. +2 for 31 days, -4 for 28 days
  const perVariableAdj = Math.floor(periodDiff / 2) // split between 2 variable tiers
  const remainder = periodDiff % 2

  const categoryTiers = useMemo(
    () => tiers.filter(t => t.category_id === categoryId).sort((a, b) => a.sort_order - b.sort_order),
    [tiers, categoryId]
  )

  const loadBudget = useCallback(async () => {
    if (!categoryId) return
    setLoading(true)

    const monthStr = `${viewDate.year}-${String(viewDate.month + 1).padStart(2, '0')}-01`

    // Look for exact month match, or fall back to most recent config before this month
    const { data: config } = await supabase
      .from('budget_configs')
      .select('id')
      .eq('user_id', userId)
      .eq('category_id', categoryId)
      .lte('effective_month', monthStr)
      .order('effective_month', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!config) {
      setHasBudget(false)
      setAllocations([])
      setLoading(false)
      return
    }

    const { data: allocs } = await supabase
      .from('budget_allocations')
      .select('tier_id, period_count, is_variable')
      .eq('budget_config_id', config.id)

    setAllocations(allocs || [])
    setHasBudget(true)
    setLoading(false)
  }, [userId, categoryId, viewDate.year, viewDate.month])

  useEffect(() => {
    loadBudget()
  }, [loadBudget])

  // Build tier progress data
  const tierProgress = useMemo(() => {
    let variableIndex = 0
    return categoryTiers
      .map(tier => {
        const alloc = allocations.find(a => a.tier_id === tier.id)
        if (!alloc || alloc.period_count === 0) return null

        let budgeted = alloc.period_count
        if (alloc.is_variable) {
          budgeted += perVariableAdj + (variableIndex === 0 ? remainder : 0)
          variableIndex++
        }
        budgeted = Math.max(0, budgeted)

        const used = entries.filter(e => e.tier_id === tier.id).length

        return { tier, budgeted, used, isVariable: alloc.is_variable }
      })
      .filter(Boolean) as { tier: Tier; budgeted: number; used: number; isVariable: boolean }[]
  }, [categoryTiers, allocations, entries, perVariableAdj, remainder])

  // Monthly budget target
  const monthlyTarget = useMemo(() => {
    return tierProgress.reduce((sum, tp) => {
      if (tp.tier.name === 'Splurge') return sum
      return sum + tp.budgeted * tp.tier.default_value
    }, 0)
  }, [tierProgress])

  // Total actual spend
  const actualSpend = useMemo(() => {
    return entries.reduce((sum, entry) => {
      if (entry.dollar_amount != null) return sum + entry.dollar_amount
      if (entry.tier_id) {
        const tier = categoryTiers.find(t => t.id === entry.tier_id)
        if (tier) return sum + tier.default_value
      }
      return sum
    }, 0)
  }, [entries, categoryTiers])

  // Cumulative spend chart data
  const chartData = useMemo(() => {
    const days = Array.from({ length: daysInMonth }, (_, i) => i + 1)
    let cumulative = 0
    const today = new Date()
    const isCurrentMonth =
      viewDate.year === today.getFullYear() && viewDate.month === today.getMonth()
    const currentDay = isCurrentMonth ? today.getDate() : daysInMonth

    const points = days.map(day => {
      const dateStr = `${viewDate.year}-${String(viewDate.month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
      const dayEntries = entries.filter(e => e.date === dateStr)

      for (const entry of dayEntries) {
        if (entry.dollar_amount != null) {
          cumulative += entry.dollar_amount
        } else if (entry.tier_id) {
          const tier = categoryTiers.find(t => t.id === entry.tier_id)
          if (tier) cumulative += tier.default_value
        }
      }

      const pace = monthlyTarget > 0
        ? Math.round((monthlyTarget / daysInMonth) * day)
        : 0

      return {
        day,
        actual: day <= currentDay ? Math.round(cumulative) : undefined,
        pace,
      }
    })

    // Projected finish line
    if (isCurrentMonth && currentDay > 0 && currentDay < daysInMonth) {
      const currentSpend = points[currentDay - 1]?.actual ?? 0
      const dailyAvg = currentSpend / currentDay
      let projected = currentSpend
      for (let d = currentDay + 1; d <= daysInMonth; d++) {
        projected += dailyAvg
        points[d - 1].projected = Math.round(projected)
      }
    }

    return points
  }, [entries, categoryTiers, viewDate, daysInMonth, monthlyTarget])

  const today = new Date()
  const isCurrentMonth =
    viewDate.year === today.getFullYear() && viewDate.month === today.getMonth()
  const currentDay = isCurrentMonth ? today.getDate() : null

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-text-muted">Loading...</p>
      </div>
    )
  }

  if (!hasBudget) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-4">
        <p className="text-text-muted text-sm">No budget set for this month</p>
        <Link
          to="/budget"
          className="text-sm text-accent border border-accent px-3 py-1.5 rounded hover:bg-accent hover:text-white transition-colors"
        >
          Set Budget
        </Link>
      </div>
    )
  }

  const chartMax = Math.max(
    monthlyTarget,
    ...chartData.map(d => d.actual ?? 0),
    ...chartData.map(d => (d as any).projected ?? 0)
  ) * 1.1

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div>
        <h3 className="text-sm font-semibold text-text-muted uppercase tracking-wider mb-1">
          Progress
        </h3>
        <div className="text-3xl font-bold">
          <span className={actualSpend > monthlyTarget ? 'text-red-400' : 'text-text'}>
            ${Math.round(actualSpend)}
          </span>
          <span className="text-text-muted font-normal"> / </span>
          <span className="text-text">${monthlyTarget.toFixed(0)}</span>
        </div>
      </div>

      {/* Tier progress bars */}
      <div className="flex flex-col gap-6">
        {tierProgress.map(({ tier, budgeted, used, isVariable }) => {
          const overflow = used > budgeted
          const barSegments = Math.max(budgeted, used)

          const tierSpend = entries
            .filter(e => e.tier_id === tier.id)
            .reduce((sum, e) => {
              if (e.dollar_amount != null) return sum + e.dollar_amount
              return sum + tier.default_value
            }, 0)

          const rangeLabel =
            tier.name === 'Splurge'
              ? '$51+'
              : tier.min_amount === 0 && tier.max_amount === 0
              ? '$0'
              : `$${tier.min_amount}–${tier.max_amount}`

          return (
            <div key={tier.id}>
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <span
                    className="w-2.5 h-2.5 rounded-full"
                    style={{ backgroundColor: tier.color }}
                  />
                  <span className="text-sm font-semibold text-text">
                    {tier.name}
                  </span>
                  <span className="text-xs text-text-muted">
                    {rangeLabel}
                  </span>
                  {isVariable && (
                    <span className="text-[10px] text-text-muted">FLEX</span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`text-sm font-bold ${
                      overflow ? 'text-red-400' : 'text-text-muted'
                    }`}
                  >
                    {used} / {budgeted}
                  </span>
                  <span className="text-xs text-text-muted">
                    ${Math.round(tierSpend)}
                  </span>
                </div>
              </div>

              {/* Segmented HP bar */}
              <div className="flex gap-[2px] h-5">
                {Array.from({ length: barSegments }, (_, i) => {
                  const isFilled = i < used
                  const isOver = i >= budgeted
                  return (
                    <div
                      key={i}
                      className="flex-1 rounded-sm"
                      style={{
                        backgroundColor: isFilled
                          ? isOver
                            ? '#ef4444'
                            : tier.color
                          : '#2d2d2d',
                        boxShadow: isFilled
                          ? 'inset 0 -2px 0 rgba(0,0,0,0.25)'
                          : 'inset 0 1px 0 rgba(255,255,255,0.03)',
                      }}
                    />
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

      {/* Free/None and Splurge indicators */}
      {(() => {
        const freeTier = categoryTiers.find(t => t.name === 'Free')
        const noneTier = categoryTiers.find(t => t.name === 'None')
        const splurgeTier = categoryTiers.find(t => t.name === 'Splurge')

        const freeCount = freeTier
          ? entries.filter(e => e.tier_id === freeTier.id).length
          : 0
        const splurgeEntries = splurgeTier
          ? entries.filter(e => e.tier_id === splurgeTier.id)
          : []
        const splurgeCount = splurgeEntries.length
        const splurgeSpend = splurgeEntries.reduce((sum, e) => {
          if (e.dollar_amount != null) return sum + e.dollar_amount
          return sum
        }, 0)

        // Food: show Free + Splurge. Drinks: show Splurge only (None is in progress bars)
        const showFree = !!freeTier
        const showSplurge = !!splurgeTier

        if (!showFree && !showSplurge) return null

        return (
          <div className="flex gap-3">
            {showFree && (
              <div className="flex-1 bg-surface-light border border-border rounded-lg px-3 py-2">
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: freeTier!.color }}
                  />
                  <span className="text-xs font-semibold text-text-muted">Free</span>
                </div>
                <span className="text-lg font-bold text-text">{freeCount}</span>
                <span className="text-xs text-text-muted ml-1">periods</span>
              </div>
            )}
            {showSplurge && (
              <div className="flex-1 bg-surface-light border border-border rounded-lg px-3 py-2">
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: splurgeTier!.color }}
                  />
                  <span className="text-xs font-semibold text-text-muted">Splurge</span>
                </div>
                <span className="text-lg font-bold text-text">{splurgeCount}</span>
                <span className="text-xs text-text-muted ml-1">periods</span>
                {splurgeSpend > 0 && (
                  <span className="text-sm font-bold text-text ml-2">
                    ${Math.round(splurgeSpend)}
                  </span>
                )}
              </div>
            )}
          </div>
        )
      })()}

      {/* Cumulative spend chart */}
      <div>
        <h4 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">
          Spending Pace
        </h4>
        <div className="bg-surface rounded-lg border border-border p-3">
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={chartData}>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="#3a3a3a"
                vertical={false}
              />
              <XAxis
                dataKey="day"
                tick={{ fill: '#888888', fontSize: 10 }}
                tickLine={false}
                axisLine={{ stroke: '#3a3a3a' }}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fill: '#888888', fontSize: 10 }}
                tickLine={false}
                axisLine={false}
                domain={[0, Math.ceil(chartMax)]}
                tickFormatter={v => `$${v}`}
                width={45}
              />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null
                  const actual = payload.find(p => p.dataKey === 'actual')?.value
                  const pace = payload.find(p => p.dataKey === 'pace')?.value
                  return (
                    <div className="bg-bg-base border border-border rounded px-3 py-2 text-xs shadow-lg">
                      <div className="text-text-muted font-semibold mb-1">Day {label}</div>
                      {actual != null && (
                        <div className="text-accent">Spent: ${actual}</div>
                      )}
                      {pace != null && (
                        <div className="text-text-muted">Target: ${pace}</div>
                      )}
                    </div>
                  )
                }}
                cursor={{ stroke: '#888888', strokeDasharray: '3 3' }}
              />
              <Line
                type="monotone"
                dataKey="pace"
                stroke="#aaaaaa"
                strokeDasharray="6 3"
                dot={false}
                activeDot={false}
                strokeWidth={2.5}
              />
              <Line
                type="monotone"
                dataKey="actual"
                stroke="#0090a8"
                dot={false}
                activeDot={false}
                strokeWidth={2}
                connectNulls={false}
              />
              <Line
                type="monotone"
                dataKey="projected"
                stroke="#0090a8"
                strokeDasharray="4 4"
                dot={false}
                activeDot={false}
                strokeWidth={1.5}
                opacity={0.5}
              />
              <ReferenceLine
                y={monthlyTarget}
                stroke="#ef4444"
                strokeDasharray="4 3"
                strokeWidth={1.5}
                opacity={0.7}
              />
              {currentDay && (
                <ReferenceLine
                  x={currentDay}
                  stroke="#0090a8"
                  strokeDasharray="2 2"
                  opacity={0.4}
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}

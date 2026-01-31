import { useState, useEffect, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { getPeriodsInMonth, getMonthStr, getMonthLabel } from '../lib/budget'

interface Category {
  id: string
  name: string
}

interface Tier {
  id: string
  category_id: string
  name: string
  min_amount: number
  max_amount: number
  default_value: number | null
  sort_order: number
  color: string
}

interface TierAllocation {
  tierId: string
  count: number
}

export function BudgetAllocation() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const mode = (searchParams.get('mode') || 'next') as 'next' | 'current'

  const now = new Date()
  const targetYear = mode === 'next'
    ? (now.getMonth() === 11 ? now.getFullYear() + 1 : now.getFullYear())
    : now.getFullYear()
  const targetMonth = mode === 'next'
    ? ((now.getMonth() + 1) % 12)
    : now.getMonth()

  const periodCount = getPeriodsInMonth(targetYear, targetMonth)
  const targetMonthStr = getMonthStr(targetYear, targetMonth)
  const targetMonthLabel = getMonthLabel(targetYear, targetMonth)

  const [categories, setCategories] = useState<Category[]>([])
  const [tiers, setTiers] = useState<Tier[]>([])
  const [activeCategory, setActiveCategory] = useState<string | null>(null)
  const [allocations, setAllocations] = useState<Record<string, TierAllocation[]>>({})
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [adjustMessage, setAdjustMessage] = useState('')
  const [loading, setLoading] = useState(true)

  const userId = user?.id

  // Auto-adjust allocations from source month to target month's period count
  const autoAdjust = (
    allocs: TierAllocation[],
    catTiers: Tier[],
    sourcePeriods: number,
    targetPeriods: number,
    catName: string
  ): { adjusted: TierAllocation[]; message: string } => {
    if (sourcePeriods === targetPeriods) {
      return { adjusted: allocs, message: '' }
    }

    const result = allocs.map(a => ({ ...a }))
    let diff = targetPeriods - sourcePeriods

    // Sort tiers by sort_order for cheapest-first adjustment
    // Filter to only tiers visible in budget allocation (exclude Free for Food, exclude Splurge)
    const adjustableTierIds = catTiers
      .filter(t => {
        if (t.name === 'Splurge') return false
        if (catName === 'Food' && t.sort_order === 0) return false
        return true
      })
      .sort((a, b) => a.sort_order - b.sort_order)
      .map(t => t.id)

    const changes: string[] = []

    if (diff > 0) {
      // Add periods to cheapest tiers first
      for (const tierId of adjustableTierIds) {
        if (diff <= 0) break
        const alloc = result.find(a => a.tierId === tierId)
        if (alloc) {
          alloc.count += diff
          const tier = catTiers.find(t => t.id === tierId)
          changes.push(`+${diff} to ${tier?.name}`)
          diff = 0
        }
      }
    } else {
      // Remove periods from cheapest tiers first
      let toRemove = Math.abs(diff)
      for (const tierId of adjustableTierIds) {
        if (toRemove <= 0) break
        const alloc = result.find(a => a.tierId === tierId)
        if (alloc && alloc.count > 0) {
          const remove = Math.min(alloc.count, toRemove)
          alloc.count -= remove
          toRemove -= remove
          const tier = catTiers.find(t => t.id === tierId)
          changes.push(`-${remove} from ${tier?.name}`)
        }
      }
    }

    const msg = changes.length > 0
      ? `Adjusted ${changes.join(' and ')} to fit ${targetMonthLabel} (${targetPeriods} periods)`
      : ''

    return { adjusted: result, message: msg }
  }

  const loadData = useCallback(async () => {
    if (!userId) return

    try {
      const { data: cats } = await supabase
        .from('categories')
        .select('id, name')
        .eq('user_id', userId)
        .order('name', { ascending: false })

      if (!cats || cats.length === 0) return

      setCategories(cats)
      setActiveCategory(prev => prev ?? cats[0].id)

      const { data: tierData } = await supabase
        .from('tiers')
        .select('id, category_id, name, min_amount, max_amount, default_value, sort_order, color')
        .eq('user_id', userId)
        .order('sort_order')

      if (tierData) setTiers(tierData)

      const newAllocations: Record<string, TierAllocation[]> = {}
      let adjMsg = ''

      for (const cat of cats) {
        const catTiers = (tierData || []).filter(t => t.category_id === cat.id)

        if (mode === 'current') {
          // Load current month's config directly
          const { data: config } = await supabase
            .from('budget_configs')
            .select('id')
            .eq('user_id', userId)
            .eq('category_id', cat.id)
            .eq('effective_month', targetMonthStr)
            .maybeSingle()

          if (config) {
            const { data: allocs } = await supabase
              .from('budget_allocations')
              .select('tier_id, period_count')
              .eq('budget_config_id', config.id)

            if (allocs && allocs.length > 0) {
              newAllocations[cat.id] = catTiers.map(t => ({
                tierId: t.id,
                count: allocs.find(a => a.tier_id === t.id)?.period_count ?? 0,
              }))
              continue
            }
          }

          // No config for current month — start empty
          newAllocations[cat.id] = catTiers.map(t => ({ tierId: t.id, count: 0 }))
        } else {
          // "next" mode: check if next month already has a config
          const { data: nextConfig } = await supabase
            .from('budget_configs')
            .select('id')
            .eq('user_id', userId)
            .eq('category_id', cat.id)
            .eq('effective_month', targetMonthStr)
            .maybeSingle()

          if (nextConfig) {
            // Pre-fill from existing next month config
            const { data: allocs } = await supabase
              .from('budget_allocations')
              .select('tier_id, period_count')
              .eq('budget_config_id', nextConfig.id)

            if (allocs && allocs.length > 0) {
              newAllocations[cat.id] = catTiers.map(t => ({
                tierId: t.id,
                count: allocs.find(a => a.tier_id === t.id)?.period_count ?? 0,
              }))
              continue
            }
          }

          // Fall back to current month's config and auto-adjust
          const currentMonthStr = getMonthStr(now.getFullYear(), now.getMonth())
          const { data: curConfig } = await supabase
            .from('budget_configs')
            .select('id')
            .eq('user_id', userId)
            .eq('category_id', cat.id)
            .lte('effective_month', currentMonthStr)
            .order('effective_month', { ascending: false })
            .limit(1)
            .maybeSingle()

          if (curConfig) {
            const { data: allocs } = await supabase
              .from('budget_allocations')
              .select('tier_id, period_count')
              .eq('budget_config_id', curConfig.id)

            if (allocs && allocs.length > 0) {
              const sourceAllocs = catTiers.map(t => ({
                tierId: t.id,
                count: allocs.find(a => a.tier_id === t.id)?.period_count ?? 0,
              }))
              const sourcePeriods = sourceAllocs.reduce((s, a) => s + a.count, 0)
              const { adjusted, message: msg } = autoAdjust(
                sourceAllocs, catTiers, sourcePeriods, periodCount, cat.name
              )
              newAllocations[cat.id] = adjusted
              if (msg) adjMsg = msg
              continue
            }
          }

          // No config at all — start empty
          newAllocations[cat.id] = catTiers.map(t => ({ tierId: t.id, count: 0 }))
        }
      }

      setAllocations(newAllocations)
      setAdjustMessage(adjMsg)
    } catch (err) {
      console.error('[budget] loadData error:', err)
    } finally {
      setLoading(false)
    }
  }, [userId, mode, targetMonthStr, periodCount])

  useEffect(() => {
    loadData()
  }, [loadData])

  const currentAllocations = activeCategory ? allocations[activeCategory] || [] : []
  const activeCategoryName = categories.find(c => c.id === activeCategory)?.name
  const currentTiers = tiers.filter(t =>
    t.category_id === activeCategory &&
    !(activeCategoryName === 'Food' && t.sort_order === 0) &&
    t.name !== 'Splurge'
  )
  const totalCount = currentAllocations.reduce((sum, a) => sum + a.count, 0)

  const monthlyTarget = currentAllocations.reduce((sum, a) => {
    const tier = currentTiers.find(t => t.id === a.tierId)
    if (!tier || tier.name === 'Splurge') return sum
    return sum + a.count * tier.default_value
  }, 0)

  const updateCount = (tierId: string, delta: number) => {
    if (!activeCategory) return
    setAllocations(prev => ({
      ...prev,
      [activeCategory]: prev[activeCategory].map(a =>
        a.tierId === tierId
          ? { ...a, count: Math.max(0, a.count + delta) }
          : a
      ),
    }))
    setMessage('')
  }

  const setCountDirect = (tierId: string, value: number) => {
    if (!activeCategory) return
    const othersTotal = currentAllocations
      .filter(a => a.tierId !== tierId)
      .reduce((sum, a) => sum + a.count, 0)
    const clamped = Math.min(Math.max(0, value), periodCount - othersTotal)
    setAllocations(prev => ({
      ...prev,
      [activeCategory]: prev[activeCategory].map(a =>
        a.tierId === tierId ? { ...a, count: clamped } : a
      ),
    }))
    setMessage('')
  }

  const canSave = totalCount === periodCount

  const handleSave = async () => {
    if (!activeCategory || !user || !canSave) return
    setSaving(true)

    const { data: config, error: configError } = await supabase
      .from('budget_configs')
      .upsert(
        {
          user_id: user.id,
          category_id: activeCategory,
          effective_month: targetMonthStr,
        },
        { onConflict: 'user_id,category_id,effective_month' }
      )
      .select('id')
      .single()

    if (configError || !config) {
      setMessage('Error saving budget config.')
      setSaving(false)
      return
    }

    await supabase
      .from('budget_allocations')
      .delete()
      .eq('budget_config_id', config.id)

    const rows = currentAllocations.map(a => ({
      budget_config_id: config.id,
      tier_id: a.tierId,
      period_count: a.count,
      is_variable: false,
    }))

    const { error: allocError } = await supabase
      .from('budget_allocations')
      .insert(rows)

    if (allocError) {
      setMessage('Error saving allocations.')
    } else if (mode === 'next') {
      setMessage(`${targetMonthLabel} budget saved. It will take effect on ${targetMonthLabel.split(' ')[0]} 1st.`)
    } else {
      setMessage(`${targetMonthLabel} budget updated.`)
    }

    setSaving(false)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-bg-dark">
        <p className="text-text-muted text-lg">Loading...</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col min-h-screen bg-bg-dark">
      <header className="flex items-center justify-between px-6 py-4 bg-surface border-b border-border">
        <div>
          <h1 className="text-2xl font-bold text-accent tracking-tight">
            {targetMonthLabel} — {periodCount} periods
          </h1>
          {mode === 'current' && (
            <span className="text-xs text-text-muted">(Current Month)</span>
          )}
          {mode === 'next' && (
            <span className="text-xs text-text-muted">Takes effect next month</span>
          )}
        </div>
        <button
          onClick={() => navigate('/')}
          className="text-sm text-text-muted hover:text-text border border-border px-3 py-1.5 rounded hover:border-accent transition-colors"
        >
          Back
        </button>
      </header>

      <main className="flex-1 px-4 py-6 max-w-lg mx-auto w-full">
        {/* Auto-adjustment message */}
        {adjustMessage && (
          <div className="mb-4 px-4 py-2 bg-surface-light border border-border rounded text-sm text-text-muted">
            {adjustMessage}
          </div>
        )}

        {/* Category tabs */}
        <div className="flex mb-6 border border-border rounded overflow-hidden">
          {categories.map(cat => (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              className={`flex-1 py-2 text-sm font-semibold transition-colors ${
                activeCategory === cat.id
                  ? 'bg-accent-dim text-white'
                  : 'bg-surface text-text-muted hover:text-text'
              }`}
            >
              {cat.name}
            </button>
          ))}
        </div>

        {/* Header area */}
        <div className="flex items-center justify-between mb-6">
          <div className="text-3xl font-bold text-text">
            ${monthlyTarget.toFixed(0)}
            <span className="text-sm text-text-muted font-normal ml-2">/ month</span>
          </div>
          <div
            className={`text-lg font-bold px-3 py-1 rounded ${
              totalCount === periodCount
                ? 'text-green-400 bg-green-900/30 border border-green-700'
                : 'text-text-muted bg-surface-light border border-border'
            }`}
          >
            {totalCount} / {periodCount}
          </div>
        </div>

        {/* Tier rows */}
        <div className="flex flex-col gap-3">
          {currentTiers.map(tier => {
            const alloc = currentAllocations.find(a => a.tierId === tier.id)
            if (!alloc) return null

            const barWidth = Math.round((alloc.count / periodCount) * 100)
            const minusDisabled = alloc.count <= 0
            const plusDisabled = totalCount >= periodCount

            return (
              <div
                key={tier.id}
                className="bg-surface border border-border rounded-lg p-3"
              >
                {/* Tier name row */}
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span
                      className="w-3 h-3 rounded-full inline-block"
                      style={{ backgroundColor: tier.color }}
                    />
                    <span className="text-text font-semibold text-sm">
                      {tier.name}
                    </span>
                    <span className="text-text text-xs font-medium opacity-70">
                      {tier.min_amount === 0 && tier.max_amount === 0
                        ? '$0'
                        : `$${tier.min_amount}–$${tier.max_amount}`
                      }
                    </span>
                  </div>
                </div>

                {/* HP bar */}
                <div className="w-full h-4 bg-surface-light rounded overflow-hidden mb-2 border border-border">
                  <div
                    className="h-full rounded transition-all duration-200"
                    style={{
                      width: `${barWidth}%`,
                      backgroundColor: tier.color,
                      backgroundImage:
                        'repeating-linear-gradient(90deg, transparent, transparent 8px, rgba(0,0,0,0.15) 8px, rgba(0,0,0,0.15) 10px)',
                    }}
                  />
                </div>

                {/* Stepper */}
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => updateCount(tier.id, -1)}
                    disabled={minusDisabled}
                    className="w-8 h-8 flex items-center justify-center rounded bg-surface-light border-2 border-border text-text font-bold text-lg hover:border-accent disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    style={{
                      boxShadow: minusDisabled
                        ? 'none'
                        : 'inset 0 -2px 0 rgba(0,0,0,0.3)',
                    }}
                  >
                    -
                  </button>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={alloc.count}
                    onKeyDown={e => {
                      if (!/^\d$/.test(e.key) && !['Backspace','Delete','ArrowLeft','ArrowRight','Tab'].includes(e.key)) {
                        e.preventDefault()
                      }
                    }}
                    onChange={e => {
                      const raw = e.target.value.replace(/\D/g, '')
                      setCountDirect(tier.id, raw === '' ? 0 : parseInt(raw, 10))
                    }}
                    onFocus={e => e.target.select()}
                    className="w-10 text-center bg-surface-light border border-border rounded text-text font-bold text-lg focus:outline-none focus:border-accent"
                  />
                  <button
                    onClick={() => updateCount(tier.id, 1)}
                    disabled={plusDisabled}
                    className="w-8 h-8 flex items-center justify-center rounded bg-surface-light border-2 border-border text-text font-bold text-lg hover:border-accent disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    style={{
                      boxShadow: plusDisabled
                        ? 'none'
                        : 'inset 0 -2px 0 rgba(0,0,0,0.3)',
                    }}
                  >
                    +
                  </button>
                </div>
              </div>
            )
          })}
        </div>

        {/* Save button */}
        <button
          onClick={handleSave}
          disabled={!canSave || saving}
          className="w-full mt-6 bg-accent text-white font-semibold py-3 rounded-lg hover:bg-accent-dim transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {saving ? 'Saving...' : 'Save Budget'}
        </button>

        {!canSave && totalCount > 0 && (
          <p className="text-text-muted text-xs mt-2 text-center">
            {totalCount < periodCount && `${periodCount - totalCount} periods remaining. `}
            {totalCount > periodCount && `${totalCount - periodCount} periods over. `}
          </p>
        )}

        {message && (
          <p className="text-green-400 text-sm mt-3 text-center">{message}</p>
        )}
      </main>
    </div>
  )
}

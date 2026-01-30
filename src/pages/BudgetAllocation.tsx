import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

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
  isVariable: boolean
}

const MAX_PERIODS = 60

export function BudgetAllocation() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [categories, setCategories] = useState<Category[]>([])
  const [tiers, setTiers] = useState<Tier[]>([])
  const [activeCategory, setActiveCategory] = useState<string | null>(null)
  const [allocations, setAllocations] = useState<Record<string, TierAllocation[]>>({})
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [existingConfigIds, setExistingConfigIds] = useState<Record<string, string>>({})

  const getNextMonth = () => {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth() + 1, 1)
      .toISOString()
      .split('T')[0]
  }

  const getCurrentMonth = () => {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), 1)
      .toISOString()
      .split('T')[0]
  }

  const userId = user?.id
  const loadData = useCallback(async () => {
    console.log('[budget] loadData called, userId:', userId)
    if (!userId) return

    try {
      console.log('[budget] about to query categories...')
      const result = await supabase
        .from('categories')
        .select('id, name')
        .eq('user_id', userId)
        .order('name', { ascending: false })
      console.log('[budget] query returned:', JSON.stringify(result))
      const { data: cats, error: catsError } = result

      console.log('[budget] categories:', cats, 'error:', catsError)
      if (!cats || cats.length === 0) {
        console.log('[budget] no categories, exiting')
        return
      }

      setCategories(cats)
      setActiveCategory(prev => prev ?? cats[0].id)

      const { data: tierData } = await supabase
        .from('tiers')
        .select('id, category_id, name, min_amount, max_amount, default_value, sort_order, color')
        .eq('user_id', userId)
        .order('sort_order')

      console.log('[budget] tiers:', tierData?.length)
      if (tierData) setTiers(tierData)

      // Load existing configs for current or next month
      const currentMonth = getCurrentMonth()
      const nextMonth = getNextMonth()

      const { data: configs } = await supabase
        .from('budget_configs')
        .select('id, category_id, effective_month')
        .eq('user_id', userId)
        .in('effective_month', [currentMonth, nextMonth])
        .order('effective_month', { ascending: false })

      console.log('[budget] configs:', configs)
      const newAllocations: Record<string, TierAllocation[]> = {}
      const configIds: Record<string, string> = {}

      for (const cat of cats) {
        const catTiers = (tierData || []).filter(t => t.category_id === cat.id)
        // Prefer next month config, fall back to current month
        const config = configs?.find(c => c.category_id === cat.id)

        if (config) {
          configIds[cat.id] = config.id
          const { data: allocs } = await supabase
            .from('budget_allocations')
            .select('tier_id, period_count, is_variable')
            .eq('budget_config_id', config.id)

          if (allocs && allocs.length > 0) {
            newAllocations[cat.id] = catTiers.map(t => {
              const existing = allocs.find(a => a.tier_id === t.id)
              return {
                tierId: t.id,
                count: existing?.period_count ?? 0,
                isVariable: existing?.is_variable ?? false,
              }
            })
            continue
          }
        }

        // Default: all zeros
        newAllocations[cat.id] = catTiers.map(t => ({
          tierId: t.id,
          count: 0,
          isVariable: false,
        }))
      }

      setAllocations(newAllocations)
      setExistingConfigIds(configIds)
    } catch (err) {
      console.error('[budget] loadData error:', err)
    } finally {
      console.log('[budget] setLoading(false)')
      setLoading(false)
    }
  }, [userId])

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
  const variableCount = currentAllocations.filter(a => a.isVariable).length

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
    const clamped = Math.min(Math.max(0, value), MAX_PERIODS - othersTotal)
    setAllocations(prev => ({
      ...prev,
      [activeCategory]: prev[activeCategory].map(a =>
        a.tierId === tierId ? { ...a, count: clamped } : a
      ),
    }))
    setMessage('')
  }

  const toggleVariable = (tierId: string) => {
    if (!activeCategory) return
    setAllocations(prev => ({
      ...prev,
      [activeCategory]: prev[activeCategory].map(a =>
        a.tierId === tierId ? { ...a, isVariable: !a.isVariable } : a
      ),
    }))
    setMessage('')
  }

  const canSave =
    totalCount === MAX_PERIODS &&
    variableCount === 2 &&
    currentAllocations
      .filter(a => a.isVariable)
      .every(a => a.count >= 2)

  const handleSave = async () => {
    if (!activeCategory || !user || !canSave) return
    setSaving(true)

    const effectiveMonth = getNextMonth()

    // Upsert budget_config
    const { data: config, error: configError } = await supabase
      .from('budget_configs')
      .upsert(
        {
          user_id: user.id,
          category_id: activeCategory,
          effective_month: effectiveMonth,
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

    // Delete old allocations for this config
    await supabase
      .from('budget_allocations')
      .delete()
      .eq('budget_config_id', config.id)

    // Insert new allocations
    const rows = currentAllocations.map(a => ({
      budget_config_id: config.id,
      tier_id: a.tierId,
      period_count: a.count,
      is_variable: a.isVariable,
    }))

    const { error: allocError } = await supabase
      .from('budget_allocations')
      .insert(rows)

    if (allocError) {
      setMessage('Error saving allocations.')
    } else {
      setMessage('Saved! Changes take effect next month.')
      setExistingConfigIds(prev => ({ ...prev, [activeCategory]: config.id }))
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
        <h1 className="text-2xl font-bold text-accent tracking-tight">Set Budget</h1>
        <button
          onClick={() => navigate('/')}
          className="text-sm text-text-muted hover:text-text border border-border px-3 py-1.5 rounded hover:border-accent transition-colors"
        >
          Back
        </button>
      </header>

      <main className="flex-1 px-4 py-6 max-w-lg mx-auto w-full">
        {/* Category tabs */}
        <div className="flex mb-6 border border-border rounded overflow-hidden">
          {categories.map(cat => (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              className={`flex-1 py-2 text-sm font-semibold transition-colors ${
                activeCategory === cat.id
                  ? 'bg-accent text-bg-dark'
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
              totalCount === MAX_PERIODS
                ? 'text-green-400 bg-green-900/30 border border-green-700'
                : 'text-text-muted bg-surface-light border border-border'
            }`}
          >
            {totalCount} / {MAX_PERIODS}
          </div>
        </div>

        {/* Tier rows */}
        <div className="flex flex-col gap-3">
          {currentTiers.map(tier => {
            const alloc = currentAllocations.find(a => a.tierId === tier.id)
            if (!alloc) return null

            const barWidth = Math.round((alloc.count / MAX_PERIODS) * 100)
            const minusDisabled = alloc.count <= 0
            const plusDisabled = totalCount >= MAX_PERIODS
            const variableDisabled =
              !alloc.isVariable && variableCount >= 2
            const variableInvalid =
              alloc.isVariable && alloc.count < 2

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

                  {/* Variable toggle */}
                  <label
                    className={`flex items-center gap-1.5 text-xs cursor-pointer ${
                      variableDisabled
                        ? 'text-text-muted/50 cursor-not-allowed'
                        : variableInvalid
                        ? 'text-red-400'
                        : 'text-text-muted'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={alloc.isVariable}
                      disabled={variableDisabled}
                      onChange={() => toggleVariable(tier.id)}
                      className="accent-accent"
                    />
                    Flex
                  </label>
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
          className="w-full mt-6 bg-accent text-bg-dark font-semibold py-3 rounded-lg hover:bg-accent-dim transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {saving ? 'Saving...' : 'Save Budget'}
        </button>

        {!canSave && totalCount > 0 && (
          <p className="text-text-muted text-xs mt-2 text-center">
            {totalCount !== MAX_PERIODS && `Allocate all ${MAX_PERIODS} periods. `}
            {variableCount !== 2 && `Select exactly 2 flex tiers. `}
            {currentAllocations
              .filter(a => a.isVariable && a.count < 2)
              .map(a => {
                const t = currentTiers.find(t => t.id === a.tierId)
                return t ? `${t.name} needs at least 2 periods. ` : ''
              })}
          </p>
        )}

        {message && (
          <p className="text-green-400 text-sm mt-3 text-center">{message}</p>
        )}
      </main>
    </div>
  )
}

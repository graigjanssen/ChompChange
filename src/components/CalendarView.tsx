import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

interface Category {
  id: string
  name: string
}

interface PeriodEntry {
  date: string
  period_type: 'AM' | 'PM'
  tier_id: string | null
}

interface Tier {
  id: string
  color: string
}

interface UserSettings {
  am_start_hour: number
  pm_start_hour: number
}

const DEFAULT_SETTINGS: UserSettings = { am_start_hour: 7, pm_start_hour: 15 }

type TabType = 'Food' | 'Drinks' | 'Combined'

export function CalendarView() {
  const { user } = useAuth()
  const userId = user?.id

  const [categories, setCategories] = useState<Category[]>([])
  const [activeTab, setActiveTab] = useState<TabType>('Food')
  const [viewDate, setViewDate] = useState(() => {
    const now = new Date()
    return { year: now.getFullYear(), month: now.getMonth() }
  })
  const [entries, setEntries] = useState<PeriodEntry[]>([])
  const [tiers, setTiers] = useState<Tier[]>([])
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS)
  const [loading, setLoading] = useState(true)

  const now = new Date()
  const isCurrentMonth =
    viewDate.year === now.getFullYear() && viewDate.month === now.getMonth()

  const activeCategoryId = categories.find(c => c.name === activeTab)?.id

  // Load categories, tiers, settings once
  useEffect(() => {
    if (!userId) return
    const load = async () => {
      const [catsRes, tiersRes, settingsRes] = await Promise.all([
        supabase
          .from('categories')
          .select('id, name')
          .eq('user_id', userId),
        supabase
          .from('tiers')
          .select('id, color')
          .eq('user_id', userId),
        supabase
          .from('user_settings')
          .select('am_start_hour, pm_start_hour')
          .eq('user_id', userId)
          .maybeSingle(),
      ])
      if (catsRes.data) setCategories(catsRes.data)
      if (tiersRes.data) setTiers(tiersRes.data)
      if (settingsRes.data) setSettings(settingsRes.data)
      setLoading(false)
    }
    load()
  }, [userId])

  // Load entries when month or category changes
  const loadEntries = useCallback(async () => {
    if (!userId || !activeCategoryId) return
    const startDate = `${viewDate.year}-${String(viewDate.month + 1).padStart(2, '0')}-01`
    const lastDay = new Date(viewDate.year, viewDate.month + 1, 0).getDate()
    const endDate = `${viewDate.year}-${String(viewDate.month + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`

    const { data } = await supabase
      .from('period_entries')
      .select('date, period_type, tier_id')
      .eq('user_id', userId)
      .eq('category_id', activeCategoryId)
      .gte('date', startDate)
      .lte('date', endDate)

    setEntries(data || [])
  }, [userId, activeCategoryId, viewDate.year, viewDate.month])

  useEffect(() => {
    loadEntries()
  }, [loadEntries])

  // Build calendar grid (weeks × 7 slots)
  const calendarGrid = useMemo(() => {
    const dayCount = new Date(viewDate.year, viewDate.month + 1, 0).getDate()
    const firstDow = new Date(viewDate.year, viewDate.month, 1).getDay() // 0=Sun
    const cells: (number | null)[] = []
    for (let i = 0; i < firstDow; i++) cells.push(null)
    for (let d = 1; d <= dayCount; d++) cells.push(d)
    while (cells.length % 7 !== 0) cells.push(null)
    return cells
  }, [viewDate.year, viewDate.month])

  const monthLabel = new Date(viewDate.year, viewDate.month).toLocaleDateString(
    'en-US',
    { month: 'long', year: 'numeric' }
  )

  const getCurrentPeriod = (): { date: string; period: 'AM' | 'PM' } | null => {
    const today = new Date()
    const hour = today.getHours()
    const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
    const period = hour < settings.pm_start_hour ? 'AM' : 'PM'
    return { date: dateStr, period }
  }

  const getPeriodState = (
    day: number,
    period: 'AM' | 'PM'
  ): 'future' | 'current' | 'past-unlogged' | 'past-logged' => {
    const dateStr = `${viewDate.year}-${String(viewDate.month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    const cellDate = new Date(viewDate.year, viewDate.month, day)
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const currentPeriod = getCurrentPeriod()

    if (cellDate > today) return 'future'
    if (cellDate < today) {
      const entry = entries.find(e => e.date === dateStr && e.period_type === period)
      return entry ? 'past-logged' : 'past-unlogged'
    }

    // Today
    if (currentPeriod) {
      const periodOrder = { AM: 0, PM: 1 }
      if (periodOrder[period] > periodOrder[currentPeriod.period]) return 'future'
      if (period === currentPeriod.period) return 'current'
    }

    const entry = entries.find(e => e.date === dateStr && e.period_type === period)
    return entry ? 'past-logged' : 'past-unlogged'
  }

  const getTierColor = (day: number, period: 'AM' | 'PM'): string | null => {
    const dateStr = `${viewDate.year}-${String(viewDate.month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    const entry = entries.find(e => e.date === dateStr && e.period_type === period)
    if (!entry?.tier_id) return null
    return tiers.find(t => t.id === entry.tier_id)?.color ?? null
  }

  const handleClick = (day: number, period: 'AM' | 'PM') => {
    const dateStr = `${viewDate.year}-${String(viewDate.month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    console.log('Clicked:', { date: dateStr, period })
  }

  const prevMonth = () => {
    setViewDate(prev => {
      if (prev.month === 0) return { year: prev.year - 1, month: 11 }
      return { ...prev, month: prev.month - 1 }
    })
  }

  const nextMonth = () => {
    setViewDate(prev => {
      if (prev.month === 11) return { year: prev.year + 1, month: 0 }
      return { ...prev, month: prev.month + 1 }
    })
  }

  const goToToday = () => {
    const now = new Date()
    setViewDate({ year: now.getFullYear(), month: now.getMonth() })
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-text-muted text-lg">Loading...</p>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col px-4 py-4 max-w-[40%] min-w-[500px] mx-auto w-full">
      {/* Category tabs */}
      <div className="flex mb-4 border border-border rounded overflow-hidden">
        {(['Food', 'Drinks', 'Combined'] as TabType[]).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 py-2 text-sm font-semibold transition-colors ${
              activeTab === tab
                ? 'bg-accent text-bg-dark'
                : 'bg-surface text-text-muted hover:text-text'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {activeTab === 'Combined' ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-text-muted text-lg">Combined view coming soon</p>
        </div>
      ) : (
        <>
          {/* Month header */}
          <div className="flex items-center justify-between mb-4">
            <button
              onClick={prevMonth}
              className="w-9 h-9 flex items-center justify-center rounded bg-surface-light border-2 border-border text-text font-bold text-lg hover:border-accent transition-colors"
              style={{ boxShadow: 'inset 0 -2px 0 rgba(0,0,0,0.3)' }}
            >
              &lt;
            </button>

            <div className="flex items-center gap-3">
              <h2 className="text-xl font-bold text-text">{monthLabel}</h2>
              {!isCurrentMonth && (
                <button
                  onClick={goToToday}
                  className="text-xs text-text-muted border border-border px-2 py-1 rounded hover:border-accent hover:text-text transition-colors"
                >
                  Today
                </button>
              )}
            </div>

            {!isCurrentMonth ? (
              <button
                onClick={nextMonth}
                className="w-9 h-9 flex items-center justify-center rounded bg-surface-light border-2 border-border text-text font-bold text-lg hover:border-accent transition-colors"
                style={{ boxShadow: 'inset 0 -2px 0 rgba(0,0,0,0.3)' }}
              >
                &gt;
              </button>
            ) : (
              <div className="w-9" />
            )}
          </div>

          {/* Calendar grid */}
          <div className="border border-text-muted/40 rounded">
            {/* Day-of-week header */}
            <div className="grid grid-cols-7">
              {['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'].map(dow => (
                <div
                  key={dow}
                  className="text-center text-xs font-bold text-text-muted py-2 border-b border-text-muted/40"
                >
                  {dow}
                </div>
              ))}
            </div>

            {/* Weeks */}
            <div className="grid grid-cols-7 gap-y-2">
              {calendarGrid.map((day, i) => (
                <div
                  key={i}
                  className={`
                    aspect-square border-b border-r border-text-muted/40
                    ${day ? 'bg-surface' : 'bg-bg-dark'}
                  `}
                  style={{ borderRight: (i % 7 === 6) ? 'none' : undefined }}
                >
                  {day && (
                    <div className="flex flex-col h-full">
                      {/* Day number */}
                      <div className="text-center text-sm font-bold text-text pt-1">
                        {day}
                      </div>

                      {/* AM / PM cells */}
                      <div className="flex flex-col gap-1 px-1 pb-1 flex-1 justify-center">
                        {(['AM', 'PM'] as const).map(period => {
                          const state = getPeriodState(day, period)
                          const tierColor = getTierColor(day, period)
                          const isCurrent = state === 'current'
                          const isFuture = state === 'future'
                          const isLogged = state === 'past-logged'

                          return (
                            <button
                              key={period}
                              onClick={() => !isFuture && handleClick(day, period)}
                              disabled={isFuture}
                              className={`
                                h-6 rounded border transition-colors relative flex items-center justify-center
                                ${isFuture
                                  ? 'bg-surface-light/30 border-border/20 cursor-default opacity-30'
                                  : isCurrent
                                  ? 'border-accent cursor-pointer calendar-pulse'
                                  : isLogged
                                  ? 'border-border/60 cursor-pointer hover:border-accent'
                                  : 'bg-[#6b7280] border-border/60 cursor-pointer hover:border-accent'
                                }
                              `}
                              style={{
                                backgroundColor: isLogged && tierColor
                                  ? tierColor
                                  : isCurrent
                                  ? 'rgba(0, 229, 255, 0.15)'
                                  : undefined,
                                boxShadow: !isFuture
                                  ? 'inset 0 -1px 0 rgba(0,0,0,0.25)'
                                  : undefined,
                              }}
                            >
                              {isCurrent && (
                                <span className="text-accent font-bold text-sm">+</span>
                              )}
                              {!isCurrent && !isFuture && (
                                <span className="text-[10px] font-semibold text-white/60">
                                  {period}
                                </span>
                              )}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

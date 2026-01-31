import { useState, useEffect, useCallback } from 'react'
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

interface ExistingEntry {
  id: string
  tier_id: string | null
  dollar_amount: number | null
  note: string | null
}

interface LoggingDialogProps {
  date: string
  period: 'AM' | 'PM'
  categoryId: string
  userId: string
  tiers: Tier[]
  existingEntry: ExistingEntry | null
  onClose: () => void
  onSaved: () => void
}

export function LoggingDialog({
  date,
  period,
  categoryId,
  userId,
  tiers,
  existingEntry,
  onClose,
  onSaved,
}: LoggingDialogProps) {
  const [selectedTierId, setSelectedTierId] = useState<string | null>(
    existingEntry?.tier_id ?? null
  )
  const [dollarAmount, setDollarAmount] = useState(
    existingEntry?.dollar_amount?.toString() ?? ''
  )
  const [note, setNote] = useState(existingEntry?.note ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const sortedTiers = [...tiers]
    .filter(t => t.category_id === categoryId)
    .sort((a, b) => a.sort_order - b.sort_order)

  const selectedTier = sortedTiers.find(t => t.id === selectedTierId)
  const isSplurge = selectedTier?.name === 'Splurge'
  const splurgeNeedsAmount = isSplurge && !dollarAmount.trim()

  // Auto-select tier when dollar amount changes
  useEffect(() => {
    const val = parseFloat(dollarAmount)
    if (isNaN(val) || val < 0) return

    const matched = sortedTiers.find(t => {
      if (t.name === 'Splurge') return val >= t.min_amount
      return val >= t.min_amount && val <= t.max_amount
    })
    if (matched) setSelectedTierId(matched.id)
  }, [dollarAmount])

  const dateLabel = (() => {
    const [y, m, d] = date.split('-').map(Number)
    const dt = new Date(y, m - 1, d)
    return dt.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })
  })()

  const handleSave = async () => {
    if (splurgeNeedsAmount) {
      setError('Splurge requires a dollar amount')
      return
    }
    if (!selectedTierId) {
      setError('Select a tier')
      return
    }

    setSaving(true)
    setError('')

    const amount = dollarAmount.trim() ? parseFloat(dollarAmount) : null

    if (existingEntry) {
      const { error: err } = await supabase
        .from('period_entries')
        .update({
          tier_id: selectedTierId,
          dollar_amount: amount,
          note: note.trim() || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingEntry.id)

      if (err) {
        setError('Failed to update entry')
        setSaving(false)
        return
      }
    } else {
      const { error: err } = await supabase
        .from('period_entries')
        .insert({
          user_id: userId,
          category_id: categoryId,
          date,
          period_type: period,
          tier_id: selectedTierId,
          dollar_amount: amount,
          note: note.trim() || null,
        })

      if (err) {
        setError('Failed to save entry')
        setSaving(false)
        return
      }
    }

    onSaved()
  }

  const handleClear = async () => {
    if (!existingEntry) return
    setSaving(true)

    const { error: err } = await supabase
      .from('period_entries')
      .delete()
      .eq('id', existingEntry.id)

    if (err) {
      setError('Failed to delete entry')
      setSaving(false)
      return
    }

    onSaved()
  }

  const canSave = !!selectedTierId && !splurgeNeedsAmount && !saving

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose()
    } else if (e.key === 'Enter' && canSave) {
      handleSave()
    }
  }, [canSave, onClose, handleSave])

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={onClose}
    >
      <div
        className="bg-bg-base border border-text-muted/40 rounded-lg w-full max-w-md mx-4 shadow-xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h3 className="text-lg font-bold text-text">
            {dateLabel} — {period}
          </h3>
          <button
            onClick={onClose}
            className="text-text-muted hover:text-text text-xl font-bold leading-none"
          >
            &times;
          </button>
        </div>

        <div className="px-5 py-4 flex flex-col gap-4">
          {/* Tier selection */}
          <div className="flex flex-col gap-2">
            <label className="text-xs font-semibold text-text-muted uppercase tracking-wider">
              Tier
            </label>
            <div className="grid grid-cols-2 gap-2">
              {sortedTiers.map(tier => {
                const isSelected = selectedTierId === tier.id
                const rangeLabel =
                  tier.name === 'Splurge'
                    ? '$51+'
                    : tier.min_amount === 0 && tier.max_amount === 0
                    ? '$0'
                    : `$${tier.min_amount}–${tier.max_amount}`

                return (
                  <button
                    key={tier.id}
                    onClick={() => setSelectedTierId(tier.id)}
                    className={`
                      rounded-lg px-3 py-2 text-left border-2 transition-all
                      ${isSelected
                        ? 'border-accent scale-[1.02] shadow-lg'
                        : 'border-transparent hover:border-text-muted/40'
                      }
                    `}
                    style={{
                      backgroundColor: tier.color + (isSelected ? '' : '99'),
                      boxShadow: isSelected
                        ? `0 0 12px ${tier.color}66`
                        : 'inset 0 -2px 0 rgba(0,0,0,0.3)',
                    }}
                  >
                    <div className="text-sm font-bold text-white">
                      {tier.name}
                    </div>
                    <div className="text-xs text-white/80">
                      {rangeLabel}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Dollar amount */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-text-muted uppercase tracking-wider">
              Amount {isSplurge && <span className="text-red-400">*</span>}
            </label>
            <input
              type="text"
              inputMode="decimal"
              placeholder="Optional: exact amount"
              value={dollarAmount}
              onKeyDown={e => {
                if (
                  !/^\d$/.test(e.key) &&
                  e.key !== '.' &&
                  !['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.key)
                ) {
                  e.preventDefault()
                }
              }}
              onChange={e => {
                const val = e.target.value.replace(/[^\d.]/g, '')
                // prevent multiple dots
                if ((val.match(/\./g) || []).length > 1) return
                setDollarAmount(val)
              }}
              className="bg-surface-light border border-border rounded px-3 py-2 text-text placeholder:text-text-muted/60 focus:outline-none focus:border-accent"
            />
          </div>

          {/* Note */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-text-muted uppercase tracking-wider">
              Note
            </label>
            <input
              type="text"
              placeholder="Optional: add a note"
              value={note}
              onChange={e => setNote(e.target.value)}
              className="bg-surface-light border border-border rounded px-3 py-2 text-text placeholder:text-text-muted/60 focus:outline-none focus:border-accent"
            />
          </div>

          {error && (
            <p className="text-red-400 text-sm">{error}</p>
          )}

          {/* Actions */}
          <div className="flex items-center gap-3 pt-1">
            <button
              onClick={handleSave}
              disabled={saving || !selectedTierId || splurgeNeedsAmount}
              className="flex-1 bg-accent text-white font-semibold py-2.5 rounded-lg hover:bg-accent-dim transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ boxShadow: 'inset 0 -2px 0 rgba(0,0,0,0.2)' }}
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
            {existingEntry && (
              <button
                onClick={handleClear}
                disabled={saving}
                className="px-4 py-2.5 rounded-lg border-2 border-red-700 text-red-400 font-semibold hover:bg-red-900/30 transition-colors disabled:opacity-40"
                style={{ boxShadow: 'inset 0 -2px 0 rgba(0,0,0,0.2)' }}
              >
                Clear
              </button>
            )}
            <button
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2.5 rounded-lg border-2 border-border text-text-muted font-semibold hover:border-text-muted hover:text-text transition-colors disabled:opacity-40"
              style={{ boxShadow: 'inset 0 -2px 0 rgba(0,0,0,0.2)' }}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

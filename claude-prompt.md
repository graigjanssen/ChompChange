# Phase 6: Budget Flow Refinement

Refine the budget management system into two distinct operations with clearer logic.

## 1. Remove Variable Tier System

- Remove the is_variable checkbox/toggle from the budget allocation UI
- Remove the is_variable column from budget_allocations table (or just ignore it)
- Remove all variable tier adjustment logic from the progress panel
- Each month's budget now stores the exact period allocations for that specific month

## 2. "Set Next Month" Button (Header)

The existing "Set Budget" button in the header becomes "Set Next Month".

### Behavior:
- Always targets the next calendar month (e.g., if today is January 30, targets February)
- Opens the budget allocation interface with header showing: "February 2026 - 56 periods"
- Pre-fills with the current month's allocation as a starting point

### Auto-adjustment logic:
- Calculate the period difference between current month and next month
- If next month has fewer periods:
  - Auto-remove periods from the cheapest tiers first (Light before Simple before Casual, etc.)
  - Show a message: "Adjusted -4 periods from Light and Simple to fit February (56 periods)"
- If next month has more periods:
  - Auto-add periods to the cheapest tiers first
  - Show a message: "Added +2 periods to Light to fit March (62 periods)"
- User can manually adjust any tier after auto-adjustment
- Allocation must equal the exact period count for that month before saving

### If no current month budget exists:
- Start with empty allocation (all zeros)
- User must manually allocate all periods

### Save behavior:
- Creates/updates budget_config with effective_month = first day of next month
- Can be edited repeatedly until that month begins
- Show confirmation: "February budget saved. It will take effect on February 1st."

## 3. "Edit This Month" Link (Progress Panel)

Add a subtle link/button in the progress panel, positioned after the tier progress bars and before the Spending Pace chart.

### Display:
- Text: "Edit This Month's Budget" or "Edit January Budget"
- Subtle styling — not prominent, but visible
- Only visible when viewing the current month

### Behavior:
- Opens the same budget allocation interface
- Header shows: "January 2026 - 62 periods (Current Month)"
- Pre-fills with the current saved allocation
- No auto-adjustment needed (same month, same period count)
- User can tweak allocations as needed
- Allocation must equal the month's exact period count before saving

### Save behavior:
- Updates the current month's budget_config
- Show confirmation: "January budget updated."
- Progress panel refreshes to reflect new allocations

## 4. Lock Past Months

- When viewing a past month (any month before the current month):
  - "Edit This Month" link is NOT visible
  - Budget data is read-only
  - Progress panel shows historical data but no edit capability

## 5. Budget Allocation Interface Updates

Update the budget allocation component to support both modes:

### Props/state needed:
- targetMonth: Date (which month we're configuring)
- mode: "next" | "current"
- periodCount: number (calculated from target month's days × 2)

### Header display:
- Show month name, year, and period count
- If mode is "current", add "(Current Month)" label
- If mode is "next", show when it takes effect

### Period counter:
- Change from "X / 60" to "X / [periodCount]"
- Dynamically based on target month

### Auto-adjustment message:
- Only shown in "next" mode when adjustments were made
- Dismissible or just informational
- Lists which tiers were adjusted and by how much

### Validation:
- Save button disabled until allocated periods equals periodCount exactly
- Show remaining/over count if not balanced

## 6. Edge Case: App Opens with No Budget for Current Month

If a user opens the app and no budget_config exists for the current month:

- Progress panel shows: "No budget set for January"
- Show a button/link: "Set January Budget"
- Clicking opens the allocation interface in "current" mode
- This is the only time you can "set" (not just "edit") the current month

Alternatively, if a previous month's budget exists:
- Inherit that allocation scaled to current month's period count
- Show nudge: "Using December's budget adjusted for January. Edit This Month's Budget to customize."

## 7. Month Period Calculation

Create a utility function to calculate periods for any month:
```typescript
function getPeriodsInMonth(year: number, month: number): number {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  return daysInMonth * 2;
}
```

- January (31 days) = 62 periods
- February (28 days) = 56 periods
- February leap year (29 days) = 58 periods
- March (31 days) = 62 periods
- April (30 days) = 60 periods
- etc.

## 8. Styling

- "Set Next Month" button in header: same style as current "Set Budget"
- "Edit This Month's Budget" link in progress panel: subtle, muted text color, perhaps with a small pencil icon, becomes slightly brighter on hover
- Auto-adjustment message: informational style, muted background, dismissible or static
- Mode indicator in allocation interface: clear but not overwhelming

## 9. Summary of User Flows

### Planning ahead (typical):
1. Click "Set Next Month" in header
2. See next month's periods and auto-adjusted allocation
3. Tweak if desired
4. Save
5. Repeat anytime before month starts

### Mid-month adjustment (rare):
1. Click "Edit This Month's Budget" in progress panel
2. Adjust allocations
3. Save
4. Progress panel updates

### New user / no budget:
1. See "No budget set" message
2. Click to set current month's budget
3. Allocate from scratch
4. Save and start tracking

### Viewing history:
1. Navigate to past month
2. See read-only budget and progress
3. No edit options available
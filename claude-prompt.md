# Phase 5: Progress Panel

Build the progress panel showing budget tracking for the current month.

## 1. Layout Integration

- Adjust the dashboard to a two-panel layout
- Left panel (2/3 width): Calendar view (already built)
- Right panel (1/3 width): Progress panel (this phase)
- Progress panel scrolls independently if content exceeds viewport

## 2. Progress Panel Header

- Show "Progress" or the month name as header
- Display the monthly budget target in large text (e.g., "$847")
- This target comes from the budget_config for the current month

## 3. Tier Progress Bars

For each tier that has an allocation (exclude tiers with 0 budgeted):

### Display per tier:
- Tier name and color indicator
- Progress bar showing periods used vs budgeted
- Count text: "X / Y" (e.g., "3 / 15")

### Progress bar styling:
- Chunky segmented style like RPG HP bars
- Each segment represents one period
- Filled segments for used periods (tier color)
- Empty segments for remaining budgeted periods (dark/muted)
- If user exceeds budget for a tier, show overflow visually (extended bar or warning color)

### Variable tier adjustments:
- Get actual days in the displayed month (28, 29, 30, or 31)
- Calculate period adjustment:
  - 30 days (60 periods): no adjustment
  - 31 days (62 periods): +1 to each variable tier
  - 28 days (56 periods): -2 from each variable tier
  - 29 days (58 periods): -1 from each variable tier
- Apply adjustment to the budgeted count for variable tiers
- Show adjusted numbers in the display

## 4. Calculating Periods Used

For each tier, count period_entries for the displayed month where:
- category_id matches active category
- tier_id matches the tier
- Include entries where dollar_amount maps to this tier (if user entered custom amount)

For mapping custom amounts to tiers:
- Use the tier's min_amount and max_amount
- An entry with dollar_amount of $14 maps to whatever tier contains 14 in its range

## 5. Cumulative Spend Chart

Below the progress bars, show a line or area chart:

### X-axis
- Days of the month (1 to 28/29/30/31)
- Mark current day

### Y-axis
- Dollar amounts from $0 to budget target (or slightly above)

### Lines to display:

#### Actual spend line
- Cumulative sum of spending by day
- For each period_entry:
  - Use dollar_amount if provided
  - Otherwise use tier's default_value
- Plot the running total

#### Pace line (target trajectory)
- Straight line from $0 on day 1 to budget target on last day
- Shows where you "should" be for even spending

#### Projected finish (optional enhancement)
- Extend actual spend line to end of month based on current average
- Dashed line style

### Chart styling:
- Dark background matching app theme
- Actual spend line in a bright accent color (teal or amber)
- Pace line in muted gray or dashed white
- Grid lines subtle
- Clear labels

## 6. Data Loading

Fetch for the displayed month:
- budget_config and budget_allocations for the active category
- period_entries for the active category
- Calculate totals and populate progress bars and chart

## 7. Empty States

If no budget configured:
- Show message: "No budget set for this month"
- Link or button to budget allocation

If no entries yet:
- Progress bars show 0 / X for each tier
- Chart shows just the pace line, actual spend at $0

## 8. Category Switching

- Progress panel updates when switching Food/Drinks tabs
- Each category has its own budget config and entries
- Combined tab: show placeholder for now (or combined totals if straightforward)

## 9. Month Navigation

- Progress panel updates when navigating to different months
- Historical months show completed data
- Future months show budget only (no entries)

## 10. Styling

Match dark retro aesthetic:
- Panel has subtle border or elevation separating it from calendar
- Progress bars are chunky with visible segments
- Tier colors match calendar colors
- Chart has retro feel (consider stepped lines vs smooth curves)
- Numbers are high contrast and readable
- Use Recharts library for the chart
# Phase 4: Logging Flow

Build the logging dialog for recording period entries.

## 1. Logging Dialog Component

Create a modal/dialog that appears when clicking any non-future period.

### Dialog header
- Show the date and period type (e.g., "January 15 - PM")
- Close button (X) in the corner

### Tier selection
- Display all tiers for the active category as selectable buttons or cards
- Include Free/None tier (the $0 tier)
- Include Splurge tier
- Show tier name and dollar range on each option (e.g., "Casual $11-17")
- Visually highlight the selected tier
- Use each tier's color as background or accent

### Dollar amount field (optional)
- Number input field, initially empty
- Placeholder text: "Optional: exact amount"
- When filled, the value maps to the appropriate tier for color-coding:
  - Find the tier where min_amount <= value <= max_amount
  - If value > 50, maps to Splurge
- When Splurge tier is selected, this field becomes required
  - Show validation message if Splurge selected without amount

### Note field (optional)
- Text input field
- Placeholder text: "Optional: add a note"
- Single line is fine, or small textarea

### Action buttons
- "Save" button - disabled if Splurge selected without dollar amount
- "Cancel" button - closes dialog without saving
- If editing an existing entry, also show "Clear" button to remove the entry

## 2. Dialog Behavior

### Opening for new entry (unlogged period)
- All fields empty
- No tier pre-selected

### Opening for existing entry (logged period)
- Pre-select the saved tier
- Pre-fill dollar amount if one was saved
- Pre-fill note if one was saved
- Show "Clear" button to delete the entry

### On Save
- If new entry: INSERT into period_entries
- If existing entry: UPDATE the period_entry
- Required fields: user_id, category_id, date, period_type, tier_id
- Optional fields: dollar_amount, note
- Close dialog after successful save
- Calendar should reflect the change (tier color)

### On Clear (existing entries only)
- DELETE the period_entry
- Close dialog
- Calendar should show period as gray (unlogged)

### On Cancel
- Close dialog without any database changes

## 3. Dollar Amount to Tier Mapping

When user enters a dollar amount, determine the tier:

Food:
- $0 = Free
- $1-5 = Light
- $6-10 = Simple
- $11-17 = Casual
- $18-26 = Takeout
- $27-37 = Dining
- $38-50 = Upscale
- $51+ = Splurge

Drinks:
- $0 = None
- $1-3 = Home
- $4-8 = Café
- $9-15 = Single
- $16-24 = Round
- $25-37 = Night
- $38-50 = Fancy
- $51+ = Splurge

Use the tier data from the database (min_amount, max_amount) rather than hardcoding.

## 4. Current Period Behavior

When clicking the current period's "+" button:
- Open the same logging dialog
- Same behavior as clicking an unlogged past period

## 5. Auto-close Elapsed Periods

This can be handled implicitly:
- Periods without entries are treated as Free/None ($0) in calculations
- No need to actually create $0 records for every elapsed period
- The calendar just shows them as gray (unlogged)

## 6. Styling

Match the dark retro aesthetic:
- Dialog has dark background (#1a1a1a or similar) with subtle border
- Tier buttons are chunky with visible depth
- Tier colors used as backgrounds on tier selection buttons
- Selected tier has prominent highlight (border, glow, or scale)
- Input fields have dark backgrounds with light text
- Buttons match the retro chunky style
- Modal backdrop dims the calendar behind

## 7. Integration

- Dialog state managed in CalendarView or lifted to Dashboard
- After save/clear, refetch period_entries for the month to update calendar
- Ensure the correct category_id is used based on active tab
# Phase 3: Calendar View

Build the calendar heatmap showing the month with AM/PM periods for each day.

## 1. Component Structure

Create a CalendarView component that displays in the main dashboard area. Later this will be the left 2/3 of a two-panel layout.

## 2. Tab Navigation

Add tabs above the calendar: Food | Drinks | Combined
- Food and Drinks tabs show their respective calendar
- Combined tab shows placeholder text: "Combined view coming soon"
- Track active category in state

## 3. Month Header and Navigation

- Display month name and year (e.g., "January 2025")
- Left arrow button to navigate to previous month
- Right arrow button to navigate to next month (only visible when viewing a past month, hidden on current month)
- "Today" button to jump back to current month (only visible when viewing a past month)

## 4. Calendar Grid Layout

- Display all days of the current month in a grid
- Each day is split into two rows: AM and PM
- Day numbers visible on the left side or within each day cell
- Consider a layout like:
```
  [1] [AM cell] [PM cell]
  [2] [AM cell] [PM cell]
  ...
```
  Or a more traditional calendar grid with AM/PM stacked within each day cell

## 5. Period States

Determine and render each period's state:

### Future periods
- Faded/transparent appearance
- Not clickable (cursor: default)

### Current period
- Pulsing animation with a prominent "+" icon or button
- Should clearly invite interaction
- Determine current period using:
  - user_settings.am_start_hour (default 7) and pm_start_hour (default 15)
  - Before pm_start_hour = AM, after = PM
  - Compare against current date and time

### Past periods (unlogged)
- Gray background (#6b7280 or similar)
- Clickable (cursor: pointer)

### Past periods (logged)
- Background color matches the tier's color from the database
- Clickable (cursor: pointer)

## 6. Data Loading

- Fetch period_entries from database for the displayed month and active category
- Fetch user_settings for AM/PM hour boundaries
- Match entries to their grid positions by date and period_type

## 7. Click Handling (Temporary)

- Clicking any non-future period should console.log the date and period type
- Example: console.log("Clicked:", { date: "2025-01-15", period: "PM" })
- Do not build the logging dialog yet

## 8. Styling

Dark retro aesthetic:
- Dark background for the calendar container
- Subtle grid borders or bevel effect on period cells
- Tier colors should pop against the dark background
- Pulsing animation should feel slightly retro (consider step-based animation rather than smooth ease)
- Chunky navigation buttons with visible depth/borders
- High contrast text for day numbers and labels

## 9. Edge Cases

- Handle months with different day counts (28, 29, 30, 31)
- First day of month alignment (not needed if using list layout vs traditional calendar grid)
- If user has no user_settings record, use defaults (am_start_hour: 7, pm_start_hour: 15)

## Do NOT build yet:
- Logging dialog (Phase 4)
- Progress panel (Phase 5)
- Hover tooltips showing dollar amounts
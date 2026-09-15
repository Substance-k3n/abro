# ABRO FRONTEND — MVP Screen Inventory & Implementation Phases

**Product:** ABRO Frontend  
**Platform:** Web + PWA  
**Stack:** Next.js 14+ (App Router) + TypeScript + Tailwind CSS  
**Version:** 1.0  
**Status:** Screen Specification & Phased Development Plan

---

## 1. Complete MVP Screen Inventory

### Total Screen Count: **42 Screens**

```text
ABRO Frontend MVP
├── Phase 1: Authentication (6 screens)
├── Phase 2: Core Dashboard (8 screens)
├── Phase 3: Expense Management (10 screens)
├── Phase 4: Group Management (8 screens)
├── Phase 5: Balance & Settlement (6 screens)
└── Phase 6: Profile & Settings (4 screens)
```

---

## 2. Phase 1: Authentication & Onboarding
**Total: 6 Screens**

### AUTH-01: Splash/Landing Screen
```
Purpose: Initial brand introduction
Route: /
Components:
  - ABRO logo
  - Tagline: "Remember every expense. Forget the confusion."
  - CTA: "Get Started" button
  - "Already have an account? Sign in" link
Interactions:
  - Navigate to onboarding or sign-in
State: None (static)
```

### AUTH-02: Onboarding Flow (3 slides)
```
Purpose: Explain core value proposition
Route: /onboarding
Slides:
  1. "Track Expenses"
     - Icon: Receipt/expense illustration
     - Text: "Record shared expenses between friends, family, and groups"
     
  2. "Know Your Balance"
     - Icon: Balance scale
     - Text: "See exactly who owes you and who you owe at a glance"
     
  3. "Settle Up Easily"
     - Icon: Handshake
     - Text: "Clear debts while keeping complete history"

Components:
  - Progress dots (1/3, 2/3, 3/3)
  - Skip button (top right)
  - Next/Get Started button
  - Back button (except first slide)

Interactions:
  - Swipe left/right
  - Dot navigation
  - Skip to sign-up
  - Auto-advance (optional)

State:
  - Current slide index
  - First-time user flag
```

### AUTH-03: Sign Up Screen
```
Purpose: New user registration
Route: /auth/signup

Form Fields:
  - Email input (required, validated)
  - Full name input (required)
  - Password input (required, min 8 chars)
  - Confirm password (required, must match)
  - Terms & Privacy checkbox (required)

Components:
  - Email input with validation
  - Password strength indicator
  - Submit button (disabled until valid)
  - "Already have account? Sign in" link
  - OR divider
  - "Continue with Google" button

Validation:
  - Email format
  - Password strength
  - Password match
  - Terms acceptance

Interactions:
  - Form submission → Email OTP or direct login
  - Google OAuth flow
  - Navigate to sign-in

State:
  - Form data
  - Validation errors
  - Loading state
  - OAuth state
```

### AUTH-04: Sign In Screen
```
Purpose: Existing user authentication
Route: /auth/signin

Form Fields:
  - Email input (required)
  - Password input (required)
  - "Remember me" checkbox

Components:
  - Email input
  - Password input with show/hide toggle
  - "Forgot password?" link
  - Sign in button
  - OR divider
  - "Continue with Google" button
  - "Don't have account? Sign up" link

Interactions:
  - Form submission → Dashboard
  - Google OAuth flow
  - Password reset flow
  - Navigate to sign-up

State:
  - Credentials
  - Loading state
  - Error messages
  - OAuth state
```

### AUTH-05: Email OTP Verification
```
Purpose: Verify email for passwordless auth
Route: /auth/verify-email

Components:
  - Email display (to which OTP was sent)
  - 6-digit OTP input boxes
  - Auto-focus and auto-advance
  - Resend code button (with 60s countdown)
  - Verify button
  - Change email link

Interactions:
  - OTP input auto-submit when complete
  - Resend OTP
  - Edit email address

State:
  - OTP value
  - Countdown timer
  - Verification loading
  - Error state
  - Email being verified
```

### AUTH-06: Setup Profile
```
Purpose: Complete user profile after first auth
Route: /auth/setup-profile

Form Fields:
  - Display name (pre-filled from signup)
  - Profile photo (optional, camera/gallery)
  - Phone number (optional, with country code)
  - Preferred currency (dropdown, default ETB)
  - Language preference (default English)

Components:
  - Avatar upload area
  - Form inputs
  - Currency selector (with search)
  - Language selector
  - Complete setup button

Interactions:
  - Avatar upload/capture
  - Form submission → Dashboard
  - Skip button (use defaults)

State:
  - Profile data
  - Avatar file
  - Loading state
  - Validation errors
```

---

## 3. Phase 2: Core Dashboard & Navigation
**Total: 8 Screens**

### DASH-01: Home Dashboard
```
Purpose: Primary financial overview
Route: /dashboard or /home

Sections:
  1. Header
     - User avatar
     - Notification bell (with badge count)
     - Settings icon

  2. Balance Summary Card
     - "You owe" amount (red/orange)
     - "You are owed" amount (green)
     - Net balance (large, prominent)
     - Visual: Simple bar or gauge

  3. Quick Actions (4 buttons)
     - Add Expense (primary, prominent)
     - Settle Up
     - Add IOU
     - Create Group

  4. Outstanding Balances Section
     - "People who owe you" list (max 3)
       - Friend avatar + name
       - Amount owed (green)
       - Tap to view details
     
     - "People you owe" list (max 3)
       - Friend avatar + name
       - Amount owed (red)
       - Tap to view details
     
     - "See all balances" link

  5. Recent Activity (5 most recent)
     - Activity item:
       - Icon (expense/settlement)
       - Description
       - Amount
       - Timestamp
     - "See all activity" link

  6. Group Summary (if user has groups)
     - Active groups with outstanding balances
     - Group avatar, name, balance
     - Tap to view group detail

Components:
  - Balance summary card
  - Quick action buttons
  - Friend balance list item
  - Activity feed item
  - Group card
  - Empty state (if no activity)

Interactions:
  - Pull to refresh
  - Tap balance → Friend detail
  - Tap activity → Expense/Settlement detail
  - Tap group → Group detail
  - Tap quick action → Respective flows

State:
  - User balance summary
  - Outstanding balances
  - Recent activity
  - Groups
  - Loading states
  - Refresh state
```

### DASH-02: Activity Feed
```
Purpose: Chronological financial activity
Route: /activity

Header:
  - Page title: "Activity"
  - Filter button (top right)
  - Search icon

Feed Items (infinite scroll):
  - Expense created
  - Expense updated
  - Settlement made
  - Group created
  - Member joined group
  - Recurring expense generated

Each Item Shows:
  - Icon (type-specific)
  - Primary text (e.g., "You paid for Lunch")
  - Secondary text (participants/group)
  - Amount and direction (+ or -)
  - Timestamp (smart: "2h ago", "Yesterday", "Jan 15")
  - Tap to view details

Filters:
  - All activity
  - Expenses only
  - Settlements only
  - Group activity
  - Date range

Components:
  - Activity feed item
  - Filter modal/sheet
  - Search bar
  - Empty state
  - Loading skeleton
  - Infinite scroll loader

Interactions:
  - Scroll to load more
  - Tap item → Detail view
  - Apply filters
  - Search activity

State:
  - Activity items (paginated)
  - Active filters
  - Search query
  - Loading/more available
```

### DASH-03: Friends List
```
Purpose: View all friends and their balances
Route: /friends

Header:
  - Title: "Friends"
  - Add friend button (top right)
  - Search icon

Sections:
  1. Friends with Outstanding Balances
     - They owe you (green section)
     - You owe them (red section)
     
  2. Settled Up Friends
     - Zero balance friends
     - Collapsed by default

Each Friend Item:
  - Avatar
  - Name
  - Balance amount
  - Direction indicator (arrow or color)
  - Tap to view details

Components:
  - Friend list item
  - Section headers
  - Search bar
  - Add friend button
  - Empty state

Interactions:
  - Search friends
  - Tap friend → Friend detail
  - Add new friend
  - Pull to refresh

State:
  - Friends list
  - Balances
  - Search query
  - Loading state
```

### DASH-04: Friend Detail
```
Purpose: View relationship with specific friend
Route: /friends/[friendId]

Header:
  - Back button
  - Friend name
  - More menu (•••)

Balance Section:
  - Large balance display
  - Direction: "You owe" or "Owes you"
  - Amount
  - Settle up button (if balance exists)

Tabs:
  1. Expenses
     - All shared expenses
     - Chronological
     - Shows: name, date, amount, your share
     
  2. Settlements
     - All settlements between you
     - Chronological
     - Shows: amount, date, direction

Actions (bottom sheet):
  - Add expense with this friend
  - Settle up
  - View all time spending
  - Remove friend (destructive)

Components:
  - Balance card
  - Tab navigation
  - Expense list item
  - Settlement list item
  - Action sheet
  - Empty states

Interactions:
  - Switch tabs
  - Tap expense → Expense detail
  - Tap settle up → Settlement flow
  - More actions menu

State:
  - Friend data
  - Balance
  - Expenses list
  - Settlements list
  - Active tab
```

### DASH-05: Groups List
```
Purpose: View all groups
Route: /groups

Header:
  - Title: "Groups"
  - Create group button (top right)

Group Categories:
  - Active groups (with outstanding balances)
  - Settled groups (zero balance)

Each Group Card:
  - Group avatar/icon
  - Group name
  - Type badge (Trip, Household, etc.)
  - Member count
  - Your balance in group
  - Last activity timestamp

Components:
  - Group card
  - Create group FAB/button
  - Empty state
  - Loading skeleton

Interactions:
  - Tap group → Group detail
  - Create new group
  - Pull to refresh

State:
  - Groups list
  - User balances per group
  - Loading state
```

### DASH-06: Balances Overview
```
Purpose: Complete balance summary
Route: /balances

Header:
  - Title: "Balances"
  - Filter/Sort button

Summary Cards:
  1. Total Balance Card
     - Total owed to you (green)
     - Total you owe (red)
     - Net balance (large)

  2. Currency Breakdown (if multi-currency)
     - Balance per currency
     - Collapsible

Balance List:
  - Grouped by:
    - People who owe you
    - People you owe
    - Groups (separate section)

Each Item:
  - Avatar
  - Name
  - Amount
  - Quick settle button

Filters:
  - All balances
  - Only friends
  - Only groups
  - Specific currency

Components:
  - Summary cards
  - Balance list item
  - Filter sheet
  - Empty state

Interactions:
  - Tap balance → Friend/Group detail
  - Quick settle
  - Apply filters

State:
  - All balances
  - Active filters
  - Loading state
```

### DASH-07: Notifications
```
Purpose: View all notifications
Route: /notifications

Header:
  - Title: "Notifications"
  - Mark all as read button

Notification Types:
  - Expense added (you're involved)
  - Expense updated
  - Settlement received
  - Group invitation
  - Member joined group
  - Payment reminder (future)
  - Recurring expense generated

Each Notification:
  - Icon (type-specific)
  - Title
  - Body text
  - Timestamp
  - Read/unread indicator
  - Tap to view related item

Components:
  - Notification list item
  - Empty state ("All caught up!")
  - Loading state

Interactions:
  - Tap notification → Related detail
  - Swipe to mark read
  - Mark all as read

State:
  - Notifications list
  - Unread count
  - Loading state
```

### DASH-08: Search
```
Purpose: Global search across all content
Route: /search

Header:
  - Back button
  - Search input (auto-focused)

Search Categories:
  - Expenses
  - Friends
  - Groups
  - Settlements

Results (tabbed):
  - All (mixed results)
  - Expenses
  - People
  - Groups

Each Result Type Shows:
  - Expense: name, date, amount, participants
  - Person: name, avatar, balance
  - Group: name, type, member count

Components:
  - Search input
  - Tab navigation
  - Result list items
  - Empty state ("No results")
  - Recent searches
  - Suggestions

Interactions:
  - Type to search
  - Switch tabs
  - Tap result → Detail view
  - Clear search

State:
  - Search query
  - Results
  - Active tab
  - Loading state
  - Recent searches
```

---

## 4. Phase 3: Expense Management
**Total: 10 Screens**

### EXP-01: Add Expense - Step 1 (Basic Details)
```
Purpose: Enter basic expense information
Route: /expenses/new (step 1)

Form Fields:
  - Expense name (required)
    - Quick suggestions: "Lunch", "Dinner", "Coffee", "Groceries"
  
  - Amount (required)
    - Large numeric input
    - Currency prefix (ETB default)
    - Calculator-style keypad on mobile
  
  - Category (required)
    - Icon grid or dropdown
    - Categories: Food, Coffee, Restaurant, Groceries, Transport, 
      Rent, Utilities, Entertainment, Shopping, Travel, Other
  
  - Date (required, default today)
    - Date picker
  
  - Group (optional)
    - Dropdown/selector
    - "None (personal IOU)" option
    - Recent groups shown first

Components:
  - Form inputs
  - Category icon selector
  - Date picker
  - Group selector
  - Next button (disabled until valid)
  - Save as draft option

Validation:
  - Name not empty
  - Amount > 0
  - Category selected

Interactions:
  - Input expense details
  - Select category
  - Pick date
  - Choose group (optional)
  - Next → Step 2

State:
  - Expense draft
  - Validation errors
  - Available groups
```

### EXP-02: Add Expense - Step 2 (Select Payer)
```
Purpose: Choose who paid for expense
Route: /expenses/new/payer

Options:
  - "You paid" (default, prominent)
  - "Someone else paid" → Friend selector

Friend Selector (if needed):
  - Search bar
  - Friend list
    - Avatar
    - Name
    - Recent collaboration indicator
  - Add new friend option

Components:
  - "You paid" card (default selected)
  - Friend selector
  - Search bar
  - Friend list items
  - Next button

Interactions:
  - Select "You paid"
  - OR search and select friend
  - Next → Step 3

State:
  - Selected payer
  - Friends list
  - Search query
  - Expense draft
```

### EXP-03: Add Expense - Step 3 (Select Participants)
```
Purpose: Choose who is involved in expense
Route: /expenses/new/participants

Header:
  - "Who is involved?"
  - "Select all" checkbox

Participant Selection:
  - You (always included if you paid, optional otherwise)
  - Group members (if group expense)
    - All selected by default
  
  - OR Friend list
    - Multi-select
    - Search bar
    - Recently shared with (priority)

Selected Participants:
  - Chips/tags at top
  - Show count
  - Remove option

Components:
  - Search bar
  - Checkbox list
  - Selected participant chips
  - "Select all" toggle
  - Next button (requires at least 1)

Validation:
  - At least one participant

Interactions:
  - Search participants
  - Toggle selection
  - Select all
  - Remove participant
  - Next → Step 4

State:
  - Selected participants
  - Available participants
  - Search query
  - Expense draft
```

### EXP-04: Add Expense - Step 4 (Split Method)
```
Purpose: Choose how to split the expense
Route: /expenses/new/split

Split Options:
  1. Equal (default)
     - Icon: = symbol
     - "Split equally"
     - Shows: each person's share preview
  
  2. Exact
     - Icon: Calculator
     - "Enter exact amounts"
     - Goes to → EXP-05
  
  3. Percentage
     - Icon: %
     - "Split by percentage"
     - Goes to → EXP-06
  
  4. Shares
     - Icon: Pie chart
     - "Split by shares"
     - Goes to → EXP-07

Split Preview (for Equal):
  - Participant list
  - Each person's share amount
  - Total sum validation

Components:
  - Split method cards
  - Preview list
  - Total validation
  - Next button

Interactions:
  - Select split method
  - If equal → Review
  - If custom → Custom split screen

State:
  - Selected split method
  - Calculated shares (if equal)
  - Expense draft
```

### EXP-05: Custom Split - Exact Amounts
```
Purpose: Manually enter exact amounts per participant
Route: /expenses/new/split/exact

Participant Input List:
  - Participant name
  - Avatar
  - Amount input field
  - Currency prefix

Total Indicator:
  - Shows sum of entered amounts
  - Warning if sum ≠ expense total
  - Red if over, Orange if under

Quick Actions:
  - Split remaining equally
  - Reset all

Components:
  - Participant amount input rows
  - Running total indicator
  - Validation warning
  - Split remaining button
  - Next button (disabled if invalid)

Validation:
  - Sum must equal total expense
  - All amounts ≥ 0

Interactions:
  - Enter amounts
  - Auto-calculate remaining
  - Split remaining equally
  - Next → Review

State:
  - Participant amounts
  - Running total
  - Validation state
  - Expense draft
```

### EXP-06: Custom Split - Percentage
```
Purpose: Split by percentage
Route: /expenses/new/split/percentage

Participant Input List:
  - Participant name
  - Avatar
  - Percentage input (0-100)
  - Amount preview (calculated)

Total Indicator:
  - Shows sum of percentages
  - Warning if sum ≠ 100%
  - Red if over, Orange if under

Quick Actions:
  - Split remaining equally
  - Reset all

Components:
  - Participant percentage inputs
  - Amount preview
  - Percentage total indicator
  - Validation warning
  - Next button (disabled if invalid)

Validation:
  - Sum must equal 100%
  - All percentages ≥ 0

Interactions:
  - Enter percentages
  - Auto-calculate amounts
  - Split remaining equally
  - Next → Review

State:
  - Participant percentages
  - Calculated amounts
  - Validation state
  - Expense draft
```

### EXP-07: Custom Split - Shares
```
Purpose: Split by share weights
Route: /expenses/new/split/shares

Participant Input List:
  - Participant name
  - Avatar
  - Share count (integer, default 1)
  - Amount preview (calculated)

Total Shares:
  - Shows total share count
  - Shows amount per share

Quick Actions:
  - Reset all to 1
  - Equal shares

Components:
  - Participant share inputs (+ and - buttons)
  - Amount preview
  - Share summary
  - Next button

Validation:
  - All shares > 0

Interactions:
  - Increment/decrement shares
  - View calculated amounts
  - Next → Review

State:
  - Participant shares
  - Calculated amounts
  - Total shares
  - Expense draft
```

### EXP-08: Add Expense - Review & Confirm
```
Purpose: Final review before creating expense
Route: /expenses/new/review

Summary Sections:
  1. Expense Details
     - Name
     - Amount
     - Category
     - Date
     - Group (if applicable)
     - Edit button

  2. Paid By
     - Payer name
     - Edit button

  3. Split Details
     - Participant list with amounts
     - Split method indicator
     - Edit button

  4. Optional Fields
     - Add note
     - Add receipt
     - Make recurring (future)

Validation Check:
  - ✓ Total matches split
  - ✓ All participants assigned
  - ✓ All required fields filled

Components:
  - Summary cards
  - Edit buttons
  - Note input (expandable)
  - Receipt upload
  - Create button (primary, prominent)
  - Save as draft

Interactions:
  - Edit any section (goes back to that step)
  - Add note
  - Add receipt
  - Create expense → Success
  - Save draft

State:
  - Complete expense data
  - Validation status
  - Loading state (on create)
  - Receipt file
```

### EXP-09: Expense Detail View
```
Purpose: View complete expense information
Route: /expenses/[id]

Header:
  - Back button
  - Expense name
  - More menu (•••)

Expense Info Card:
  - Category icon
  - Amount (large)
  - Currency
  - Date
  - Group badge (if applicable)

Paid By Section:
  - "Paid by [Name]"
  - Avatar
  - Total amount paid

Split Details:
  - Split method badge
  - Participant list
    - Avatar
    - Name
    - Share amount
    - "You" indicator if current user

Notes Section (if exists):
  - Note content
  - Added by
  - Timestamp

Receipt Section (if exists):
  - Thumbnail
  - Tap to view full

Activity Log:
  - Created by X on Date
  - Updated by Y on Date (if edited)
  - Deleted on Date (if deleted)

Actions Menu:
  - Edit expense
  - Delete expense
  - Download receipt
  - Share expense

Components:
  - Expense detail cards
  - Participant list
  - Receipt viewer
  - Activity timeline
  - Action menu

Interactions:
  - View full receipt
  - Edit expense
  - Delete expense
  - View participant profile

State:
  - Expense data
  - Participants
  - Receipt
  - Activity log
  - Authorization (can edit/delete?)
```

### EXP-10: Edit Expense
```
Purpose: Modify existing expense
Route: /expenses/[id]/edit

Similar to Add Expense flow but:
  - Pre-filled with existing data
  - Shows "Update" instead of "Create"
  - Shows warning if changes affect balances
  - Requires confirmation if major changes

Change Warnings:
  - "Changing amount will recalculate all shares"
  - "Removing participants will update balances"
  - "This will affect group balances"

Audit Trail:
  - Shows who last updated
  - Shows what changed (if possible)

Components:
  - Pre-filled form
  - Warning modals
  - Update button
  - Cancel button

Validation:
  - Same as create
  - Plus: user has permission

Interactions:
  - Edit fields
  - Update expense → Success
  - Cancel → Back to detail

State:
  - Original expense data
  - Modified expense data
  - Validation state
  - Loading state
```

---

## 5. Phase 4: Group Management
**Total: 8 Screens**

### GRP-01: Create Group - Step 1 (Basic Info)
```
Purpose: Enter group information
Route: /groups/new

Form Fields:
  - Group name (required)
    - Suggestions: "Roommates", "Trip to [City]", "Family"
  
  - Group type (required)
    - Icons + labels:
      - Friends
      - Trip
      - Household
      - Family
      - Team
      - Other
  
  - Currency (required, default ETB)
    - Dropdown with search
  
  - Description (optional)
    - Textarea
    - Max 200 chars

Components:
  - Text inputs
  - Type selector (icon grid)
  - Currency selector
  - Next button

Validation:
  - Name not empty
  - Type selected

Interactions:
  - Input group details
  - Select type
  - Choose currency
  - Next → Add Members

State:
  - Group draft
  - Validation errors
```

### GRP-02: Create Group - Step 2 (Add Members)
```
Purpose: Add initial group members
Route: /groups/new/members

Header:
  - "Add members"
  - Skip button (can add later)

Member Selection:
  - Search bar
  - Friend list (multi-select)
  - Email invite option
  - Phone invite option (future)

Selected Members:
  - Chips at top
  - You (creator) always included
  - Role indicator (Admin for creator)

Components:
  - Search bar
  - Friend checkbox list
  - Selected member chips
  - Email invite input
  - Create group button
  - Skip to create

Interactions:
  - Search friends
  - Select members
  - Enter email for invite
  - Create group

State:
  - Selected members
  - Email invites
  - Friends list
  - Group draft
```

### GRP-03: Group Detail View
```
Purpose: View group overview and activity
Route: /groups/[id]

Header:
  - Back button
  - Group name
  - Settings icon (if admin)
  - More menu

Group Info Card:
  - Group avatar/icon
  - Type badge
  - Member count
  - Created date

Your Balance Card:
  - "Your balance in this group"
  - Amount (+ green or - red)
  - Settle up button

Tabs:
  1. Expenses
     - Group expenses (chronological)
     - Add expense FAB
  
  2. Balances
     - All member balances
     - Simplified payment view (if enabled)
  
  3. Members
     - Member list
     - Role badges
     - Add member button (if admin)

Quick Actions (floating):
  - Add expense (primary)
  - Settle up
  - View simplified debts

Components:
  - Group info card
  - Balance card
  - Tab navigation
  - Expense list
  - Balance list
  - Member list
  - FAB buttons

Interactions:
  - Switch tabs
  - Add expense
  - View balances
  - Manage members (admin)
  - Settings (admin)

State:
  - Group data
  - Your balance
  - Expenses
  - Balances
  - Members
  - Active tab
  - User role
```

### GRP-04: Group Expenses
```
Purpose: View all group expenses
Route: /groups/[id]/expenses

Header:
  - Back button
  - "Group Expenses"
  - Filter button

Filters:
  - All expenses
  - Your expenses
  - By category
  - By date range
  - By payer

Expense List:
  - Chronological
  - Each item shows:
    - Category icon
    - Name
    - Amount
    - Paid by
    - Your share (highlighted)
    - Date

Add Expense FAB:
  - Pre-selects this group

Components:
  - Filter bar
  - Expense list items
  - Empty state
  - Add expense FAB

Interactions:
  - Apply filters
  - Tap expense → Detail
  - Add expense

State:
  - Expenses list
  - Active filters
  - Loading state
```

### GRP-05: Group Balances
```
Purpose: View all member balances in group
Route: /groups/[id]/balances

Header:
  - Back button
  - "Group Balances"
  - Simplify toggle (if enabled in settings)

Views:
  1. Individual Balances
     - Each member's net position
     - Who owes whom (full network)
  
  2. Simplified Debts (if enabled)
     - Minimum payment graph
     - Optimized payment suggestions

Individual Balance List:
  - Member avatar
  - Name
  - Net balance
    - Green if owed
    - Red if owing
    - Gray if settled

Simplified Payment List:
  - "[Person A] pays [Person B]"
  - Amount
  - Mark as settled button

Components:
  - View toggle
  - Balance list
  - Simplified payment cards
  - Empty state ("All settled up!")

Interactions:
  - Toggle view
  - Tap member → Balance detail
  - Mark payment as settled

State:
  - Member balances
  - Simplified debts
  - Active view
  - Group settings
```

### GRP-06: Group Members
```
Purpose: Manage group members
Route: /groups/[id]/members

Header:
  - Back button
  - "Members"
  - Add member button (if admin)

Member List:
  - Avatar
  - Name
  - Role badge (Admin/Member)
  - Balance in group
  - More menu (if admin)

Member Actions (admin only):
  - Make admin
  - Remove from group (destructive)

Add Member (admin):
  - Search friends
  - Email invite
  - Phone invite

Components:
  - Member list items
  - Role badges
  - Action menu
  - Add member modal
  - Confirmation dialogs

Interactions:
  - View member balances
  - Add member (admin)
  - Change role (admin)
  - Remove member (admin)

State:
  - Members list
  - User role
  - Add member state
```

### GRP-07: Group Settings
```
Purpose: Configure group (admin only)
Route: /groups/[id]/settings

Settings:
  1. Basic Info
     - Group name (editable)
     - Description (editable)
     - Group type (editable)
  
  2. Financial Settings
     - Currency (not editable if expenses exist)
     - Simplify debts (toggle)
     - Default split method
  
  3. Notifications
     - Notify on new expense
     - Notify on settlement
     - Notify on member join
  
  4. Danger Zone
     - Leave group
     - Delete group (creator only)

Components:
  - Form inputs
  - Toggles
  - Dropdown selectors
  - Delete confirmation modal

Validation:
  - Cannot change currency if expenses exist
  - Cannot delete if outstanding balances

Interactions:
  - Edit settings
  - Save changes
  - Leave group
  - Delete group

State:
  - Group settings
  - Validation state
  - Loading state
```

### GRP-08: Simplified Debt View
```
Purpose: Show optimized payment plan
Route: /groups/[id]/simplified

Header:
  - Back button
  - "Simplified Debts"
  - Info icon (explains algorithm)

Explanation:
  - "To settle all debts with minimum transactions:"
  - Payment count: "3 payments instead of 7"

Payment Cards:
  - From person avatar + name
  - Arrow →
  - To person avatar + name
  - Amount
  - "Mark as Settled" button

Algorithm Info:
  - Modal explaining debt simplification
  - "Total obligations remain the same"
  - "Only the payment path is optimized"

Components:
  - Payment cards
  - Info modal
  - Settlement buttons
  - Empty state

Interactions:
  - View info
  - Mark payment as settled
  - Record full settlement

State:
  - Simplified debts
  - Group balances
  - Settlement state
```

---

## 6. Phase 5: Balance & Settlement
**Total: 6 Screens**

### BAL-01: Balance Detail (Friend)
```
Purpose: Detailed balance view for one friend
Route: /balances/friend/[id]

(Already covered in DASH-04 Friend Detail)
```

### BAL-02: Balance Detail (Group)
```
Purpose: Your balance within a specific group
Route: /balances/group/[id]

Header:
  - Back button
  - Group name
  - Group icon

Your Balance Card:
  - Amount (large)
  - "You owe" or "You are owed"
  - Currency

Breakdown:
  - Balances with each member
    - Member name
    - Amount
    - Direction

Contributing Expenses:
  - Expenses that created this balance
  - Your share vs what you paid
  - Tap to view expense

Actions:
  - Settle up with group
  - View simplified debts

Components:
  - Balance summary
  - Member balance list
  - Expense list
  - Action buttons

Interactions:
  - View member balances
  - View expenses
  - Initiate settlement

State:
  - Group balance
  - Member balances
  - Contributing expenses
```

### STL-01: Settle Up - Choose Person
```
Purpose: Select who to settle with
Route: /settle/choose

Header:
  - Back button
  - "Settle Up"

Options:
  1. Outstanding Balances
     - People you owe (prioritized)
     - People who owe you
     - Each shows amount
  
  2. Groups
     - Groups with outstanding balances
     - Your balance in each

Components:
  - Person/group selector
  - Balance display
  - Search bar
  - Next button

Interactions:
  - Search
  - Select person/group
  - Next → Settlement amount

State:
  - Outstanding balances
  - Selected person/group
```

### STL-02: Settle Up - Enter Amount
```
Purpose: Enter settlement amount
Route: /settle/[personId]/amount

Header:
  - Back button
  - "Settle with [Name]"

Current Balance Display:
  - Outstanding amount
  - Direction (you owe / owes you)

Settlement Amount Input:
  - Amount input (large)
  - Currency
  - Calculator-style keypad

Quick Actions:
  - Full amount button
  - Half amount button
  - Custom amount

Validation:
  - Amount > 0
  - Amount ≤ outstanding balance
  - Warning if partial settlement

Components:
  - Balance display
  - Amount input
  - Quick action buttons
  - Next button

Validation:
  - Cannot exceed outstanding balance
  - Warning if partial

Interactions:
  - Enter amount
  - Use quick actions
  - Next → Confirm

State:
  - Outstanding balance
  - Settlement amount
  - Validation state
```

### STL-03: Settle Up - Confirm
```
Purpose: Confirm settlement details
Route: /settle/[personId]/confirm

Summary:
  - Settling with [Name]
  - Amount
  - Direction (You pay / You receive)
  - New balance after settlement

Optional Fields:
  - Payment method (cash, bank transfer, etc.)
  - Reference/note
  - Date (default today)

Important Notice:
  - "This records that payment was made"
  - "ABRO does not process payments"
  - "Make the actual payment separately"

Components:
  - Summary card
  - Optional fields
  - Notice/warning
  - Confirm button (prominent)
  - Cancel button

Interactions:
  - Add note
  - Confirm → Success
  - Cancel

State:
  - Settlement data
  - Loading state
```

### STL-04: Settlement Success
```
Purpose: Confirm settlement was recorded
Route: /settle/success

Success Message:
  - ✓ "Settlement recorded"
  - Amount settled
  - With whom
  - New balance

Actions:
  - View balance history
  - Add another expense
  - Back to home

Components:
  - Success animation
  - Summary card
  - Action buttons

Interactions:
  - Navigate to related views
  - Return to home

State:
  - Settlement result
```

### STL-05: Settlement History
```
Purpose: View all settlements
Route: /settlements

Header:
  - Back button
  - "Settlements"
  - Filter button

Filters:
  - All settlements
  - Money you paid
  - Money you received
  - By person
  - By date range

Settlement List:
  - Chronological
  - Each item:
    - Direction icon (paid/received)
    - "You paid [Name]" or "[Name] paid you"
    - Amount
    - Date
    - Notes (if any)

Components:
  - Filter bar
  - Settlement list items
  - Empty state

Interactions:
  - Apply filters
  - Tap settlement → Detail view

State:
  - Settlements list
  - Active filters
  - Loading state
```

---

## 7. Phase 6: Profile & Settings
**Total: 4 Screens**

### PRF-01: User Profile
```
Purpose: View and edit user profile
Route: /profile

Sections:
  1. Profile Header
     - Avatar (editable)
     - Display name
     - Email (verified badge)
     - Phone (if set)

  2. Preferences
     - Default currency
     - Language
     - Notifications
  
  3. Statistics
     - Total expenses tracked
     - Total amount managed
     - Groups joined
     - Friends count
  
  4. Account Actions
     - Change password
     - Connected accounts (Google, etc.)
     - Export data
     - Delete account

Components:
  - Avatar editor
  - Form inputs
  - Stat cards
  - Action list items

Interactions:
  - Edit avatar
  - Update profile info
  - Change preferences
  - Account actions

State:
  - User profile data
  - Statistics
  - Loading state
  - Validation state
```

### SET-01: Settings
```
Purpose: App settings and preferences
Route: /settings

Settings Categories:
  1. Account
     - Profile
     - Privacy
     - Security
  
  2. Preferences
     - Currency
     - Language
     - Date format
     - Number format
  
  3. Notifications
     - Push notifications (toggle)
     - Email notifications (toggle)
     - Notification types (checkboxes)
  
  4. Data
     - Export all data
     - Clear cache
     - Storage usage
  
  5. About
     - Version
     - Terms of service
     - Privacy policy
     - Contact support
     - Rate app
  
  6. Account
     - Sign out
     - Delete account

Components:
  - Setting list items
  - Toggles
  - Selectors
  - Action buttons

Interactions:
  - Toggle settings
  - Navigate to detail screens
  - Sign out
  - Delete account

State:
  - User settings
  - App preferences
```

### SET-02: Notification Settings
```
Purpose: Configure notification preferences
Route: /settings/notifications

Notification Types:
  - Expense added (you're involved)
  - Expense updated
  - Settlement received
  - Group invitation
  - Member joined group
  - Balance reminder
  - Payment due (future)

Channels:
  - Push notifications (master toggle)
  - Email notifications (master toggle)
  - Individual toggles per type per channel

Quiet Hours:
  - Enable toggle
  - Start time
  - End time

Components:
  - Channel toggles
  - Notification type checkboxes
  - Time pickers
  - Save button

Interactions:
  - Toggle channels
  - Configure types
  - Set quiet hours
  - Save preferences

State:
  - Notification preferences
  - Loading state
```

### SET-03: Privacy & Security
```
Purpose: Manage privacy and security settings
Route: /settings/privacy

Sections:
  1. Password
     - Change password
     - Last changed
  
  2. Two-Factor Authentication
     - Enable/disable
     - Setup
  
  3. Privacy
     - Profile visibility
     - Who can add you
     - Who can see your expenses
  
  4. Connected Accounts
     - Google
     - Disconnect option
  
  5. Active Sessions
     - Device list
     - Sign out option

Components:
  - Form inputs
  - Toggles
  - Device list
  - Action buttons

Interactions:
  - Change password
  - Setup 2FA
  - Adjust privacy
  - Manage sessions

State:
  - Security settings
  - Connected accounts
  - Active sessions
```

---

## 8. Phase-by-Phase Summary

### Phase 1: Authentication (6 screens)
**Duration:** Week 1  
**Goal:** User can sign up, sign in, and set up profile

```
✓ AUTH-01: Splash/Landing
✓ AUTH-02: Onboarding (3 slides)
✓ AUTH-03: Sign Up
✓ AUTH-04: Sign In
✓ AUTH-05: Email OTP
✓ AUTH-06: Setup Profile
```

**Acceptance:**
- [ ] User can sign up with email
- [ ] User can sign in with email + password
- [ ] User can authenticate with Google
- [ ] OTP verification works
- [ ] Profile setup completed
- [ ] JWT token stored
- [ ] Protected routes work

---

### Phase 2: Core Dashboard (8 screens)
**Duration:** Week 2-3  
**Goal:** User can view balances, activity, friends, groups

```
✓ DASH-01: Home Dashboard
✓ DASH-02: Activity Feed
✓ DASH-03: Friends List
✓ DASH-04: Friend Detail
✓ DASH-05: Groups List
✓ DASH-06: Balances Overview
✓ DASH-07: Notifications
✓ DASH-08: Search
```

**Acceptance:**
- [ ] Dashboard shows balance summary
- [ ] Activity feed displays events
- [ ] Friends list populated
- [ ] Friend detail shows balance
- [ ] Groups list works
- [ ] Balances overview accurate
- [ ] Notifications display
- [ ] Search works across entities

---

### Phase 3: Expense Management (10 screens)
**Duration:** Week 4-5  
**Goal:** User can create, view, edit expenses with all split types

```
✓ EXP-01: Add Expense - Basic Details
✓ EXP-02: Add Expense - Select Payer
✓ EXP-03: Add Expense - Select Participants
✓ EXP-04: Add Expense - Split Method
✓ EXP-05: Custom Split - Exact
✓ EXP-06: Custom Split - Percentage
✓ EXP-07: Custom Split - Shares
✓ EXP-08: Add Expense - Review
✓ EXP-09: Expense Detail
✓ EXP-10: Edit Expense
```

**Acceptance:**
- [ ] Equal split works
- [ ] Exact split works
- [ ] Percentage split works
- [ ] Shares split works
- [ ] Validation prevents invalid splits
- [ ] Expense created successfully
- [ ] Balances update correctly
- [ ] Edit expense works
- [ ] Delete expense works

---

### Phase 4: Group Management (8 screens)
**Duration:** Week 6  
**Goal:** User can create and manage groups

```
✓ GRP-01: Create Group - Basic Info
✓ GRP-02: Create Group - Add Members
✓ GRP-03: Group Detail
✓ GRP-04: Group Expenses
✓ GRP-05: Group Balances
✓ GRP-06: Group Members
✓ GRP-07: Group Settings
✓ GRP-08: Simplified Debt View
```

**Acceptance:**
- [ ] Group created successfully
- [ ] Members added
- [ ] Group expenses shown
- [ ] Group balances calculated
- [ ] Debt simplification works
- [ ] Member management works
- [ ] Group settings editable
- [ ] Leave/delete group works

---

### Phase 5: Balance & Settlement (6 screens)
**Duration:** Week 7  
**Goal:** User can settle debts and view settlement history

```
✓ BAL-01: Balance Detail (Friend)
✓ BAL-02: Balance Detail (Group)
✓ STL-01: Settle Up - Choose Person
✓ STL-02: Settle Up - Enter Amount
✓ STL-03: Settle Up - Confirm
✓ STL-04: Settlement Success
✓ STL-05: Settlement History
```

**Acceptance:**
- [ ] Settlement flow completes
- [ ] Partial settlement works
- [ ] Full settlement works
- [ ] Balances update after settlement
- [ ] Settlement history accurate
- [ ] Cannot settle more than owed

---

### Phase 6: Profile & Settings (4 screens)
**Duration:** Week 8  
**Goal:** User can manage profile and app settings

```
✓ PRF-01: User Profile
✓ SET-01: Settings
✓ SET-02: Notification Settings
✓ SET-03: Privacy & Security
```

**Acceptance:**
- [ ] Profile editable
- [ ] Currency preference works
- [ ] Notification settings work
- [ ] Privacy settings applied
- [ ] Sign out works
- [ ] Account deletion works

---

## 9. Mobile Navigation Structure

### Bottom Tab Navigation (5 tabs)

```
┌─────────────────────────────────────┐
│                                     │
│         SCREEN CONTENT              │
│                                     │
├─────────────────────────────────────┤
│  🏠     📊     ➕     👥     👤    │
│ Home  Activity Add  Groups  Profile│
└─────────────────────────────────────┘
```

**Tab 1: Home** → DASH-01  
**Tab 2: Activity** → DASH-02  
**Tab 3: Add Expense** → EXP-01 (Modal/Sheet)  
**Tab 4: Groups** → DASH-05  
**Tab 5: Profile** → PRF-01

---

## 10. Screen Flow Diagram

```
Authentication Flow:
AUTH-01 → AUTH-02 → AUTH-03/04 → AUTH-05 → AUTH-06 → DASH-01

Expense Creation Flow:
DASH-01 → EXP-01 → EXP-02 → EXP-03 → EXP-04 → [EXP-05/06/07] → EXP-08 → DASH-01

Group Creation Flow:
DASH-05 → GRP-01 → GRP-02 → GRP-03

Settlement Flow:
DASH-01 → STL-01 → STL-02 → STL-03 → STL-04 → DASH-01

Friend Detail Flow:
DASH-01 → DASH-03 → DASH-04 → [EXP-09 or STL-01]
```

---

## 11. Responsive Design Requirements

### Mobile (< 768px)
- Bottom tab navigation
- Full-screen modals
- Stack layout
- Thumb-friendly buttons
- Swipe gestures

### Tablet (768px - 1024px)
- Side navigation
- Split views where appropriate
- Modal sheets instead of full-screen
- Grid layouts for lists

### Desktop (> 1024px)
- Sidebar navigation
- Multi-column layouts
- Hover states
- Keyboard shortcuts
- Right-click context menus

---

## 12. Component Inventory

### Reusable Components (to be built)

1. **Layout Components**
   - `AppShell` (navigation container)
   - `BottomNav`
   - `TopBar`
   - `Sidebar`

2. **Financial Components**
   - `MoneyDisplay` (amount with currency)
   - `BalanceCard`
   - `ExpenseListItem`
   - `ParticipantChip`
   - `SplitPreview`

3. **Form Components**
   - `MoneyInput` (with currency)
   - `DatePicker`
   - `CategorySelector`
   - `FriendSelector`
   - `GroupSelector`

4. **Data Display**
   - `Avatar`
   - `UserCard`
   - `GroupCard`
   - `ActivityItem`
   - `NotificationItem`

5. **Feedback**
   - `LoadingSpinner`
   - `ErrorBoundary`
   - `Toast`
   - `ConfirmDialog`
   - `EmptyState`

6. **Navigation**
   - `Tabs`
   - `Breadcrumb`
   - `Stepper` (multi-step forms)

---

## 13. State Management Strategy

### Global State (Zustand/Context)
- User authentication
- User profile
- App settings
- Notification count

### Server State (TanStack Query)
- Expenses
- Groups
- Balances
- Settlements
- Activity feed
- Friends

### Local/Form State (useState/useReducer)
- Expense creation wizard
- Form inputs
- UI toggles
- Modal states

---

## 14. Development Timeline

| Phase | Screens | Duration | Sprint |
|-------|---------|----------|--------|
| Phase 1: Auth | 6 | 1 week | Sprint 1 |
| Phase 2: Dashboard | 8 | 2 weeks | Sprint 2-3 |
| Phase 3: Expenses | 10 | 2 weeks | Sprint 4-5 |
| Phase 4: Groups | 8 | 1 week | Sprint 6 |
| Phase 5: Settlement | 6 | 1 week | Sprint 7 |
| Phase 6: Profile | 4 | 1 week | Sprint 8 |
| **Total** | **42** | **8 weeks** | **8 sprints** |

---

## 15. MVP Definition of Done

An MVP screen is complete when:

✅ **Desktop layout** works  
✅ **Mobile layout** responsive  
✅ **Loading states** implemented  
✅ **Error states** handled  
✅ **Empty states** designed  
✅ **Navigation** works  
✅ **API integration** complete  
✅ **Form validation** working  
✅ **Accessibility** basics (ARIA, keyboard)  
✅ **Unit tests** for logic  
✅ **Manual QA** passed

---

## 16. Post-MVP Screens (Future)

Not in MVP, but planned:

- **Analytics Dashboard** (spending insights)
- **Recurring Expenses** (management screens)
- **Receipt Scanner** (OCR)
- **Export Data** (CSV/PDF generation)
- **Payment Reminders**
- **Split Templates**
- **Multi-Currency Converter**
- **Bank Integration** (if/when added)

---

## 17. Critical UI/UX Principles

### Financial Clarity
- Always show currency
- Use consistent colors (green = owed, red = owing)
- Large, readable amounts
- Clear direction indicators

### Mobile-First
- Thumb-friendly tap targets (min 44px)
- Bottom navigation
- Swipe gestures
- Pull to refresh

### Progressive Disclosure
- Show essentials first
- Expand for details
- Multi-step forms for complex actions
- Collapsible sections

### Feedback
- Loading states for all async actions
- Success confirmations
- Clear error messages
- Undo where possible

### Accessibility
- Semantic HTML
- ARIA labels
- Keyboard navigation
- High contrast mode support

---

## FINAL SUMMARY

**Total MVP Screens: 42**

**Phase 1 (Auth): 6 screens** → Week 1  
**Phase 2 (Dashboard): 8 screens** → Weeks 2-3  
**Phase 3 (Expenses): 10 screens** → Weeks 4-5  
**Phase 4 (Groups): 8 screens** → Week 6  
**Phase 5 (Settlement): 6 screens** → Week 7  
**Phase 6 (Profile): 4 screens** → Week 8

**Total Development Time: 8 weeks**

Each phase is self-contained and can be developed independently after Phase 1 is complete.

---

**END OF FRONTEND SPECIFICATION**

This document provides the complete screen inventory with precise counts, flows, and implementation phases for the ABRO frontend MVP.
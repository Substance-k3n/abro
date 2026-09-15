# ABRO PROJECT — Product Requirements Document (PRD)

**Product:** ABRO  
**Working Name:** Abro Project  
**Category:** Social Expense, IOU, Shared Money & Debt Tracking  
**Version:** 1.0  
**Status:** Draft — Independent Reimplementation Specification  
**Reference:** SplitPro, used for behavioral and architectural study only  
**Primary Market:** Ethiopia first, international-ready architecture  
**Primary Currency:** ETB  
**Target Platform:** Web + PWA  
**Recommended Stack:** Next.js + TypeScript + Supabase/PostgreSQL

---

## 1. Executive Summary

ABRO is a social financial ledger designed to solve a common problem: friends, roommates, families, coworkers, and groups regularly pay for one another, but people forget who paid, who owes whom, how much remains unpaid, and how much they spend together over time.

ABRO records shared expenses, personal IOUs, settlements, group activity, balances, and historical spending in one place.

The product is inspired by the behavioral capabilities discovered during the SplitPro audit, but ABRO must be built as an **independent product and implementation**.

The core principle is:

> **Expenses are facts. Balances are derived projections.**

The financial chain is:

**Expense → Participants → Individual Shares → Ledger Effect → Net Balance → Debt Simplification → Settlement → Historical Balance**

This financial chain is the highest-priority part of the system.

---

## 2. Product Vision

### Vision

Make shared money between people simple, transparent, and impossible to forget.

### Mission

ABRO helps users answer:

- Who owes me?
- Who do I owe?
- How much?
- What did we spend together?
- What has already been settled?
- What happened last month?
- Can we settle everything with fewer payments?

### Positioning

ABRO is not only a bill-splitting calculator.

It is a:

> **Social Financial Memory**

The product remembers financial interactions between people and turns them into a clear, auditable ledger.

---

## 3. Problem Statement

People commonly manage shared expenses through:

- Telegram/Messenger chats
- Verbal agreements
- Notes
- Spreadsheets
- Calculator screenshots
- Memory
- Bank-transfer history

These approaches become unreliable over time.

### Example

Three friends go for coffee.

- Abel pays 900 ETB.
- Three people participate.
- Each share is 300 ETB.
- Two friends owe Abel 300 ETB each.

A week later another friend pays for dinner. Someone settles part of an older debt. Eventually nobody remembers the complete picture.

ABRO keeps the history and continuously calculates the current state.

---

## 4. Goals

### Primary Goals

1. Track shared expenses.
2. Track individual IOUs.
3. Calculate who owes whom.
4. Support groups.
5. Support multiple split methods.
6. Record settlements.
7. Simplify group debts.
8. Maintain complete historical activity.
9. Provide monthly and yearly spending insights.
10. Make ETB the default currency.
11. Keep the architecture multi-currency capable.
12. Support receipt attachments.
13. Support notifications.
14. Support recurring expenses.
15. Work well as a PWA.
16. Protect financial data using database-level authorization.
17. Make financial calculations deterministic and highly tested.

### Secondary Goals

- Amharic localization
- Ethiopian phone-number friendly UX
- Shareable expense/invite links
- Telegram sharing
- CSV export
- Optional payment references
- Optional bank/transaction imports
- Future native mobile applications

---

## 5. Non-Goals for MVP

ABRO is not initially:

- A bank
- A wallet
- A payment processor
- A lending platform
- An accounting ERP
- A cryptocurrency platform
- A full bank-sync product
- An automated money-transfer platform

The MVP records and manages financial obligations. Actual payments happen externally.

---

## 6. Target Users

### Friends

Coffee, restaurants, outings, entertainment, gaming, and social groups.

### Roommates

Rent, utilities, groceries, internet, cleaning, and household purchases.

### Travelers

Accommodation, transportation, food, tickets, and activities.

### Families

Shared purchases, trips, household expenses, and recurring costs.

### Small Teams

Team lunches, office purchases, events, and subscriptions.

---

## 7. Core User Stories

**Expense:** As a user, I want to add an expense so everyone involved knows their share.

**IOU:** As a user, I want to record that a friend owes me money without creating a complicated group.

**Balance:** As a user, I want to see exactly who owes me and whom I owe.

**Settlement:** As a user, I want to record that I paid someone back.

**History:** As a user, I want to see every financial interaction between us.

**Group:** As a user, I want to create a group for shared expenses.

**Simplification:** As a group member, I want ABRO to reduce a complicated debt network into fewer practical payments.

**Analytics:** As a user, I want to understand how much I spend each month and year.

---

## 8. Product Principles

### 8.1 Financial Truth First

The ledger is more important than the UI.

### 8.2 Derived Balances

Do not maintain independent balance fields as the financial source of truth. Balances are derived from financial facts.

### 8.3 Integer Money

Never use floating-point arithmetic for financial calculations. Money must be represented in the smallest currency unit.

Example: `100.50 ETB = 10050 minor units`

### 8.4 Transactional Writes

Creating or editing an expense and its participants must be atomic.

### 8.5 Auditability

Financial history must remain traceable. Deletion should use soft-delete where appropriate.

### 8.6 Security by Default

Row Level Security must be enabled from the first database migration.

### 8.7 Mobile First

Adding an expense should be possible quickly with minimal typing.

---

## 9. Product Scope

### MVP

**Authentication:**
- Email OTP
- Google OAuth
- Session management
- Profile

**People:**
- Users
- Friends
- Invitations

**Groups:**
- Create group
- Edit group
- Add/remove members
- Group currency
- Group settings

**Expenses:**
- Add
- Edit
- Delete
- View details
- Categories
- Dates
- Notes
- Receipt

**Split Methods:**
- Equal
- Exact
- Percentage
- Shares
- Settlement

**Balances:**
- Personal balances
- Friend balances
- Group balances
- Net balance

**Settlements:**
- Record settlement
- Partial settlement
- Full settlement
- Settlement history

**Debt Simplification:**
- Simplify group debts
- Recommend practical payment sequence

**Activity:**
- Chronological feed
- Expense events
- Settlement events
- Group activity

---

## 10. Post-MVP Scope

### Phase 2

- Currency conversion
- Recurring expenses
- Web push
- Email notifications
- Receipt storage
- Monthly analytics
- Yearly analytics
- CSV export
- Advanced categories

### Phase 3

- Amharic localization
- Offline read caching
- Shareable links
- Contact-based friend discovery
- Telegram sharing
- Advanced recurrence

### Phase 4

- CSV bank imports
- Optional bank integrations
- Advanced reporting

Bank integrations must remain optional because they introduce significant cost, geographic limitations, and third-party dependency.

---

## 11. Information Architecture

```text
ABRO
├── Home
├── Activity
├── Friends
├── Groups
├── Balances
├── Add Expense
├── Settlements
├── Analytics
├── Recurring
├── Notifications
├── Settings
└── Profile
```

Recommended mobile navigation:

```text
Home | Activity | Add | Groups | Profile
```

The Add action should remain highly accessible.

---

## 12. Home Dashboard

The dashboard must immediately answer:

- What do I owe?
- What is owed to me?
- What is my net position?
- What happened recently?

### Main information

- Total you owe
- Total owed to you
- Net balance
- Recent activity
- Friends with outstanding balances
- Groups with balances

### Quick actions

- Add expense
- Add IOU
- Settle up
- Create group

---

## 13. Add Expense Flow

The Add Expense flow is a critical product surface.

### Step 1 — Basic Details

- Expense name
- Amount
- Currency
- Date
- Category
- Paid by

### Step 2 — Participants

Select users involved in the expense.

### Step 3 — Split Method

- Equal
- Exact
- Percentage
- Shares

### Step 4 — Review

Example:

```text
Lunch
900 ETB

Abel       300 ETB
Hana       300 ETB
You        300 ETB

Total      900 ETB
```

The UI must always verify:

`sum(participant shares) = expense total`

### Step 5 — Save

The server independently validates the entire transaction before persistence.

---

## 14. Split Logic

### Equal

900 ETB / 3:

```text
300
300
300
```

If division creates a remainder, the remainder must be distributed deterministically while preserving the total.

### Exact

```text
Abel 500
Hana 250
You  250
```

Validation: `500 + 250 + 250 = 1000`

### Percentage

```text
Abel 50%
Hana 30%
You  20%
```

Total must equal 100%.

### Shares

```text
Abel 2 shares
Hana 1 share
You  1 share
```

The amount is distributed according to the ratio.

### Settlement

A settlement is a ledger event representing a transfer between two users.

---

## 15. Financial Ledger Model

### Source of Truth

Core financial records:

```text
Expense
ExpenseParticipant
```

Conceptually:

```text
Expense
├── payer
├── total amount
├── currency
├── date
└── participants
    ├── user
    └── share
```

### Ledger Effect

For an expense:

```text
Payer receives credit for amount paid.
Each participant receives a debit for their share.
```

Example:

Abel pays 900 ETB.

```text
Abel 300 share
Hana 300 share
You  300 share
```

Result:

```text
Hana → Abel 300
You  → Abel 300
```

---

## 16. Balance Engine

Balances are derived from expenses.

For every pair:

`Net balance = credits - debits`

User pairs must be normalized so:

```text
A → B
B → A
```

become one net relationship.

Example:

```text
You owe Abel 500
Abel owes you 200
```

Net:

```text
You owe Abel 300
```

There must be no independently maintained balance that can drift from the ledger.

---

## 17. Group Balance

A group contains:

```text
Group
├── Members
├── Expenses
├── Settlements
└── Derived balances
```

Group balances must be calculated from group financial records.

---

## 18. Debt Simplification

ABRO should implement the standard minimum-cash-flow debt simplification approach.

Example:

```text
A owes B 100
B owes C 100
C owes D 100
```

The system should calculate a simplified payment graph.

Goal:

> Preserve the total financial obligation while reducing unnecessary transactions.

The algorithm must be deterministic and extensively tested.

---

## 19. Settlement

A settlement records that a debt has been paid.

Example:

```text
You owe Abel 500 ETB.
You pay Abel 500 ETB.

Settlement:
You → Abel
500 ETB
```

The balance becomes zero.

### Important

ABRO does not execute the payment in MVP. The actual transfer occurs externally.

### Partial Settlement

```text
Outstanding: 500 ETB
Paid:        200 ETB
Remaining:   300 ETB
```

The server must validate the settlement against the current outstanding balance.

---

## 20. Historical Balance

ABRO must preserve historical context.

Users should be able to understand:

- Current balance
- Previous balance states
- Expenses
- Settlement dates
- Group activity
- Why the current balance exists

Settling a debt must never erase its history.

---

## 21. Activity Feed

Chronological activity includes:

- Expense added
- Expense edited
- Expense deleted
- Settlement
- Group activity
- Member activity
- Recurring expense
- Notifications

Examples:

```text
You owe Abel 300 ETB
```

```text
Abel owes you 500 ETB
```

```text
You settled 300 ETB with Abel
```

---

## 22. Friend Balance

Example:

```text
Abel

You owe: 300 ETB

[Settle up]

History
-----------------
Lunch       300 ETB
Coffee      200 ETB
Settlement  200 ETB
```

The detail view should explain the current balance through historical transactions.

---

## 23. Groups

### Creation

- Name
- Type
- Currency
- Description
- Members

### Types

- Friends
- Trip
- Household
- Family
- Team
- Other

### Settings

- Name
- Currency
- Members
- Default split
- Debt simplification
- Notifications

---

## 24. Default Splits

Support reusable split templates.

Example:

```text
Roommates
3 equal members
```

or:

```text
Trip
A = 2 shares
B = 1 share
C = 1 share
```

---

## 25. Expense Categories

Initial categories:

- Food
- Coffee
- Restaurant
- Groceries
- Transport
- Rent
- Utilities
- Entertainment
- Shopping
- Travel
- Accommodation
- Bills
- Subscription
- Other

Categories should be extensible.

---

## 26. Analytics

ABRO should provide useful spending insights without becoming a full accounting system.

### Monthly

- Total expenses
- Amount paid
- Personal share
- Amount owed
- Amount received
- Settlements
- Category breakdown

### Yearly

- Yearly total
- Monthly trend
- Category distribution
- Group spending
- Personal contribution

Definitions must remain consistent:

**Total Spending:** Sum of relevant expense totals.

**Your Contribution:** Amount actually paid by the user.

**Your Share:** Amount allocated to the user.

**Net Position:** Financial difference between the user's credits and debits.

---

## 27. Multi-Currency

### Default

```text
ETB
```

### Architecture

Each expense has its own currency.
Each group may have a default currency.
Each user may have a preferred display currency.

Currency metadata:

```text
code
symbol
nativeSymbol
decimalDigits
```

### Conversion

Currency conversion must be treated as a point-in-time snapshot.

Historical transactions must not change because exchange rates changed later.

---

## 28. Money Representation

Never use floating-point storage or arithmetic for financial values.

Preferred representation:

```text
integer minor units
```

Example:

```text
100.50 ETB → 10050
```

Client display may use decimal formatting, but financial calculations remain integer-safe.

---

## 29. Recommended Data Model

```sql
profiles
---------
id
display_name
avatar_url
phone
preferred_currency
locale
created_at
updated_at

friendships
-----------
id
user_id
friend_id
status
created_at

groups
------
id
name
type
currency
simplify_debts
created_by
created_at
updated_at

group_members
-------------
id
group_id
user_id
role
status
joined_at

expenses
--------
id
group_id
name
category
amount
currency
paid_by
split_type
expense_date
receipt_path
notes
conversion_id
deleted_at
deleted_by
created_at
updated_at
updated_by

expense_participants
--------------------
id
expense_id
user_id
amount

expense_notes
-------------
id
expense_id
author_id
content
created_at

currency_rates
--------------
id
currency_from
currency_to
rate
updated_at

recurring_expenses
------------------
id
template_expense_id
frequency
next_run_at
enabled
created_at
updated_at

notifications
-------------
id
user_id
type
title
body
read_at
created_at

push_subscriptions
------------------
id
user_id
endpoint
keys
created_at
updated_at
```

Settlements should be represented as a specialized financial ledger event, with the implementation chosen during architecture design.

---

## 30. Supabase Architecture

### Authentication

Use: **Supabase Auth**

MVP:
- Email OTP
- Google OAuth

Future:
- Generic OIDC

Do not carry over the reference project's custom NextAuth/Prisma adapter.

### Database

**PostgreSQL** through Supabase.

### Security

Enable RLS from the first migration.

### Storage

Use Supabase Storage for:
- Receipts
- Avatars

Do not depend on local container filesystem storage.

---

## 31. RLS Requirements

Users may only access records they are authorized to access.

**Profiles:** Users can manage their own profile and appropriate public profile information.

**Groups:** Only authorized group members can access private group data.

**Group Members:** Membership records are protected.

**Expenses:** Access is allowed only when the user is authorized through:
- Payer relationship
- Participant relationship
- Group membership

**Receipts:** Receipt access must follow expense authorization.

**Notifications:** A user can only access their own notifications.

RLS must be tested with multiple user identities.

---

## 32. Application Architecture

Recommended feature-first structure:

```text
src/
├── app/
├── features/
│   ├── auth/
│   ├── users/
│   ├── friends/
│   ├── groups/
│   ├── expenses/
│   ├── balances/
│   ├── settlements/
│   ├── analytics/
│   ├── notifications/
│   └── recurring/
├── components/
├── lib/
│   ├── money/
│   ├── currency/
│   ├── validation/
│   └── security/
├── server/
├── types/
└── tests/
```

The financial engine must remain independent of UI components.

---

## 33. Recommended Technology Stack

### Frontend

- Next.js
- TypeScript
- React
- Tailwind CSS
- shadcn/ui or equivalent
- Lucide or equivalent open icon library

### State

Use server-state tooling for server data.
Use Zustand or equivalent for complex local interaction such as the Add Expense wizard.

### Backend

- Supabase
- PostgreSQL
- Supabase Auth
- Supabase Storage
- Supabase Edge Functions
- PostgreSQL views/functions where appropriate

### Validation

- Zod

### PWA

Use a maintained PWA/service-worker solution.

### Testing

- Unit
- Integration
- Database/RLS
- E2E

---

## 34. Notifications

Events:

- Expense added
- Expense edited
- Expense deleted
- Settlement
- Group invitation
- Group membership changes
- Recurring expense
- Debt simplification changes

Channels:

**MVP:** In-app notifications.

**Later:**
- Web push
- Email
- Telegram

---

## 35. Recurring Expenses

Examples:

- Rent
- Internet
- Subscriptions
- Recurring household bills

Each recurring expense contains:

```text
template
frequency
next execution
enabled
```

Every generated occurrence becomes an independent expense record.

---

## 36. Receipt Attachments

Optional receipts.

Supported initially:
- JPG
- PNG
- WebP

Storage: **Supabase Storage**

Requirements:
- Authenticated access
- Expense-level authorization
- Private storage

Future:
- OCR
- AI extraction
- Automatic vendor/amount/date detection

---

## 37. Search

Search:
- Expenses
- Groups
- Friends
- Categories

Expense filters:
- Name
- Category
- Payer
- Participant
- Date range
- Amount range

---

## 38. Export

Users should eventually export:
- Expenses
- Settlements
- Group history
- Analytics

Primary format: **CSV**

Future: **PDF**

Exports must preserve exact financial values.

---

## 39. Authentication UX

### First Visit

```text
ABRO

Remember every expense.
Forget the confusion.

[Continue]
```

### Sign In

- Email
- Google

### OTP

```text
Enter the verification code
```

### Profile

- Display name
- Optional avatar
- Preferred currency = ETB
- Locale

---

## 40. Onboarding

Use a short three-step explanation:

**01 — Track:** Record expenses between people.

**02 — Understand:** See who owes whom.

**03 — Settle:** Clear debts while keeping the history.

---

## 41. Ethiopian Market Adaptation

ABRO should feel natural to Ethiopian users while remaining internationally capable.

### Defaults

```text
Currency: ETB
Locale: English initially
```

Future: **Amharic**

Future local features:
- Ethiopian phone numbers
- Contact discovery
- Telegram sharing
- Payment reference support
- Ethiopian bank imports
- Local payment integrations where appropriate

These must not be required by the core financial engine.

---

## 42. PWA Requirements

- Installable
- Manifest
- Icons
- Responsive mobile UI
- Service worker
- Offline read cache where practical

MVP should be online-first.

Offline write synchronization should only be introduced after the financial consistency model is proven.

---

## 43. Performance

Target:

- Fast dashboard
- Fast expense entry
- Efficient balance queries
- Indexed financial queries
- Paginated activity

Recommended indexes:

```text
expenses.paid_by
expenses.group_id
expenses.expense_date
expenses.deleted_at
expense_participants.user_id
expense_participants.expense_id
group_members.user_id
group_members.group_id
```

---

## 44. Security

Mandatory:

1. RLS enabled
2. Server-side validation
3. Authorization on every mutation
4. Client calculations never trusted
5. No floating-point money
6. Secure receipt access
7. Secure authentication
8. Rate limiting where appropriate
9. Soft-delete audit trail
10. Service-role credentials never exposed to clients
11. Group membership validated before access
12. Settlement amount validated server-side

---

## 45. Financial Correctness

Highest engineering priority.

For every expense:

```text
sum(participant shares) = expense total
```

For every settlement:

```text
settlement <= outstanding debt
```

For every balance:

```text
derived balance = financial facts
```

For debt simplification:

```text
total obligation preserved
```

For currency:

```text
minor-unit arithmetic is exact
```

No invalid financial state should be creatable through the UI or API.

---

## 46. Testing Strategy

The reference audit identified 155 useful behavioral test scenarios covering money math, split behavior, debt simplification, and currency preferences.

ABRO should convert these behaviors into **specification tests**, not copy implementation code.

### Unit

- Money conversion
- Rounding
- Equal split
- Exact split
- Percentage split
- Shares
- Settlement
- Debt simplification

### Integration

- Expense creation
- Participant persistence
- Balance queries
- Settlements
- Soft deletion
- Transactions

### RLS

Test at least:

```text
User A
User B
User C
```

Verify unauthorized financial data is inaccessible.

### E2E

```text
Sign in
→ Create group
→ Add members
→ Add expense
→ Check balances
→ Settle
→ Verify history
```

---

## 47. Golden Financial Fixtures

Create deterministic test scenarios.

Example:

```text
Users: A, B, C

Expense:
A pays 900 ETB

Shares:
A 300
B 300
C 300
```

Expected:

```text
B owes A 300
C owes A 300
```

Fixtures must cover:

- Equal split
- Exact split
- Percentage split
- Shares
- Multiple expenses
- Opposing debts
- Partial settlements
- Full settlements
- Deleted expenses
- Multiple groups
- Multiple currencies
- Negative/credit scenarios if supported

The reference seed concept may inspire fixtures, but ABRO must maintain its own data and implementation.

---

## 48. Seed Data

Development should contain realistic deterministic data:

- Users
- Groups
- Expenses
- Settlements
- Categories
- Historical dates

Where practical, seed through the same production financial service paths used by the application.

---

## 49. Audit / History

Financial actions should preserve:

```text
created_at
updated_at
created_by
updated_by
deleted_at
deleted_by
```

Soft-deleted expenses must automatically disappear from active balances while remaining auditable.

---

## 50. Empty States

### No Expenses

```text
Nothing here yet.

Add your first shared expense and ABRO will
start keeping track.
```

### No Groups

```text
No groups yet.

Create one for your friends, trip, family, or roommates.
```

### No Balance

```text
You're all settled up.
```

---

## 51. Error Handling

Errors must be human-readable.

Instead of:

```text
INVALID_PARTICIPANT_AMOUNT
```

Show:

```text
The participant amounts must add up to 1,000 ETB.
```

Authorization:

```text
You don't have permission to access this expense.
```

Settlement:

```text
You can only settle up to the current outstanding balance.
```

---

## 52. UX Requirements

ABRO should feel:

- Modern
- Clean
- Fast
- Trustworthy
- Friendly
- Financially precise
- Mobile-first

Avoid:

- Accounting-software complexity
- Unnecessary forms
- Excessive mobile tables
- Technical financial terminology

The user should understand the balance without calculating anything.

---

## 53. Core Screen Inventory

### Authentication

1. Splash
2. Sign In
3. Email OTP
4. Google authentication
5. Profile setup

### Main

6. Home
7. Activity
8. Friends
9. Friend Detail
10. Groups
11. Group Detail
12. Balances
13. Analytics
14. Notifications
15. Profile
16. Settings

### Expense

17. Add Expense
18. Select Payer
19. Select Participants
20. Split Method
21. Custom Split
22. Expense Review
23. Expense Detail
24. Edit Expense
25. Delete Confirmation

### Settlement

26. Settle Up
27. Settlement Confirmation
28. Settlement Detail

### Group

29. Create Group
30. Edit Group
31. Group Members
32. Add Member
33. Group Settings
34. Default Split

### Recurring

35. Recurring Expenses
36. Create Recurring Expense
37. Recurring Detail

The final inventory should be refined during UX design.

---

## 54. MVP Acceptance Criteria

### Authentication

- [ ] User can sign in
- [ ] User can sign out
- [ ] User profile exists
- [ ] ETB is the default currency

### Groups

- [ ] User can create a group
- [ ] User can add members
- [ ] User can view group activity
- [ ] User can view group balances

### Expenses

- [ ] User can create an expense
- [ ] User can select payer
- [ ] User can select participants
- [ ] Equal split works
- [ ] Exact split works
- [ ] Percentage split works
- [ ] Shares split works
- [ ] Server validates every split
- [ ] User can edit
- [ ] User can soft-delete

### Balances

- [ ] Friend balance is derived correctly
- [ ] Group balance is derived correctly
- [ ] Deleted expenses do not affect active balances

### Settlements

- [ ] User can record settlement
- [ ] Partial settlement works
- [ ] Full settlement works
- [ ] Settlement appears in history
- [ ] Balance updates correctly

### Debt Simplification

- [ ] Group debt graph can be simplified
- [ ] Total obligations remain correct
- [ ] Suggested payment count is reduced where possible

### Security

- [ ] RLS policies are active
- [ ] Unauthorized users cannot access private financial records
- [ ] Service-role credentials never reach client code

---

## 55. Definition of Done

A feature is complete only when:

1. UI exists
2. Database model exists
3. Authorization exists
4. Validation exists
5. Error handling exists
6. Unit tests exist where applicable
7. Integration tests exist for financial behavior
8. Mobile layout works
9. Loading state exists
10. Empty state exists
11. Documentation exists
12. No floating-point financial calculation exists

---

## 56. Development Roadmap

### Phase 0 — Reference Audit

**Status: Complete**

Study:
- Architecture
- Dependencies
- Data model
- Financial logic
- Edge cases
- Licensing
- Migration risks

The reference audit identified derived balances, integer-safe money, split methods, settlements, debt simplification, recurring expenses, PWA, notifications, currency conversion, and optional bank integrations.

---

## 57. Phase 1 — ABRO Foundation

Objectives:

- Detach repository identity
- Establish ABRO branding
- Establish independent package metadata
- Establish Next.js application
- Configure Supabase
- Configure environment architecture
- Implement authentication
- Establish base layout
- Establish design system
- Create database migrations
- Establish RLS

Deliverable:

> ABRO runs independently without SplitPro runtime dependencies.

---

## 58. Phase 2 — Financial Core

Build:

1. Money engine
2. Split engine
3. Expense model
4. Participant model
5. Balance engine
6. Settlement engine
7. Debt simplification

No major UI polish until financial tests pass.

---

## 59. Phase 3 — Groups & Activity

Build:

- Groups
- Memberships
- Activity
- Friend balances
- Group balances
- History
- Default splits

---

## 60. Phase 4 — Product UX

Build:

- Dashboard
- Add Expense wizard
- Friend detail
- Group detail
- Analytics
- Notifications
- Responsive mobile experience

---

## 61. Phase 5 — Advanced Features

Build:

- Recurring expenses
- Currency conversion
- Receipt uploads
- Web push
- Email notifications
- Export
- Search

---

## 62. Phase 6 — Ethiopian Localization

Build:

- Amharic
- ETB-first experiences
- Ethiopian phone UX
- Local sharing patterns
- Payment reference support

---

## 63. Phase 7 — Optional Integrations

Potential:

- CSV bank imports
- Bank integrations
- Payment references
- Telegram
- Advanced receipt OCR

These remain optional and must not compromise the core ledger.

---

## 64. Dependency Strategy

ABRO must avoid unnecessary inheritance from SplitPro.

### Replace

**NextAuth:** Use Supabase Auth

**Custom Prisma Auth Adapter:** Remove

**Local Uploads:** Use Supabase Storage

**Boot-time Custom Migrations:** Use Supabase migrations

**Currency Providers:** Use a provider abstraction with caching

**Plaid:** Not an MVP dependency

**GoCardless/Nordigen:** Do not port the deprecated path

---

## 65. Independent Implementation Policy

SplitPro is a reference implementation.

It may be studied to understand:

- User flows
- Data relationships
- Financial behavior
- Edge cases
- Standard algorithms
- Product patterns

ABRO source code should be independently implemented.

Do not:

- Copy the entire repository
- Retain SplitPro branding
- Retain SplitPro product copy
- Retain unnecessary dependencies
- Preserve architecture merely because it exists in the reference

The reference audit identifies SplitPro as MIT licensed, but ABRO's engineering objective remains an independent implementation with its own architecture, branding, code, and documentation.

---

## 66. Observability

Production should eventually include:

- Structured logs
- Error tracking
- Database monitoring
- Performance monitoring
- Scheduled-job monitoring
- Notification failure monitoring

Financial calculation errors are high-severity incidents.

---

## 67. Backup & Recovery

The ledger is critical data.

Requirements:

- Automated backups
- Tested restoration
- Migration history
- Storage backup strategy
- Export capability

Backups must preserve:

```text
financial records + receipt files
```

---

## 68. Product Metrics

**Activation:** Percentage of users creating their first expense.

**Collaboration:** Average participants per expense.

**Group Adoption:** Groups created per active user.

**Settlement:** Percentage of outstanding balances eventually settled.

**Retention:** Users returning to record or review activity.

**Financial Activity:**
- Expenses per active user
- Settlements per active user
- Monthly tracked financial interactions

---

## 69. North Star Metric

> **Successfully tracked financial interactions between people**

A tracked interaction is an expense or settlement that becomes part of persistent financial history.

ABRO succeeds when users trust it to remember their shared money relationships.

---

## 70. Future Product Direction

ABRO can evolve into:

```text
ABRO
│
├── Shared Expenses
├── Personal IOUs
├── Group Money
├── Spending Insights
├── Settlements
├── Shared Budgets
├── Recurring Payments
├── Payment References
└── Local Financial Integrations
```

Long-term positioning:

> **A social financial operating layer for everyday money between people.**

---

## 71. Critical Engineering Rules

1. Never use floating point for financial calculations
2. Never trust client-calculated balances
3. Never store a manually maintained balance as the source of truth
4. Every expense mutation must be transactional
5. Every financial mutation must be authorized server-side
6. RLS must be enabled from the beginning
7. Historical financial records must remain auditable
8. Every split algorithm must have deterministic tests
9. Every balance algorithm must have deterministic fixtures
10. UI must never become the financial engine

---

## 72. Financial Logic Priority

Development priority:

```text
1. Debt Simplification
        ↓
2. Split Mathematics
        ↓
3. Balance Engine
        ↓
4. Expense Persistence
        ↓
5. Settlement
        ↓
6. Currency Conversion
        ↓
7. UI
```

The financial correctness layer must be proven before broad product polish.

---

## 73. End-to-End Example

**Users:** Nesredin, Abel, Hana

**Group:** Friday Friends (ETB)

**Expense:**
```text
Lunch
900 ETB
Paid by: Nesredin
Participants: Nesredin, Abel, Hana
Split: Equal
```

**Shares:**
```text
Nesredin 300
Abel     300
Hana     300
```

**Result:**
```text
Abel owes Nesredin 300
Hana owes Nesredin 300
```

**Second expense:**
```text
Dinner
600 ETB
Paid by: Abel
Participants: Nesredin, Abel, Hana
```

**Shares:**
```text
Nesredin 200
Abel     200
Hana     200
```

**Result:**
```text
Nesredin owes Abel 200
Hana owes Abel 200
```

**Net relationship between Nesredin and Abel:**
```text
Abel owes Nesredin 300
Nesredin owes Abel 200
```

**Final:**
```text
Abel owes Nesredin 100 ETB
```

ABRO must display the net result automatically.

---

## 74. Settlement Example

**Current:**
```text
Abel owes Nesredin 100 ETB
```

**Abel pays:** 100 ETB

**ABRO records:**
```text
SETTLEMENT
Abel → Nesredin
100 ETB
```

**New balance:** 0 ETB

**History remains:**
```text
Lunch         900 ETB
Dinner        600 ETB
Settlement    100 ETB
```

The settlement does not erase the history.

---

## 75. Partial Settlement Example

**Current:**
```text
Hana owes Nesredin 500 ETB
```

**Hana pays:** 200 ETB

**ABRO records:**
```text
Settlement: 200
Remaining: 300
```

**History:**
```text
Expense       500
Settlement    200
Outstanding   300
```

---

## 76. Production Quality Gate

Before production:

```text
TypeScript         PASS
Lint               PASS
Unit Tests         PASS
Integration Tests  PASS
RLS Tests          PASS
E2E Tests          PASS
Production Build   PASS
Financial Fixtures PASS
Mobile QA          PASS
Security Review    PASS
```

Most importantly:

> No release proceeds if balance calculations are not deterministic and tested.

---

## 77. Final Product Definition

ABRO is a:

> **Social expense and financial memory platform that records shared expenses, personal IOUs, group debts, settlements, and spending history, then automatically derives clear balances and simplified payment paths.**

The product should feel simple:

```text
Who paid?
Who participated?
How much?
```

Underneath, it contains a rigorous financial model:

```text
Expense
→ Participants
→ Shares
→ Ledger
→ Balance
→ Simplification
→ Settlement
→ History
```

The complexity belongs in the system.

The user should only need to understand:

> **Who owes whom, how much, and why.**

---

## 78. Immediate Next Artifact

After approving this PRD, create:

```text
PHASE_1_ABRO_INDEPENDENT_ARCHITECTURE.md
```

It should define the implementation contract for:

1. Repository detachment
2. ABRO naming and branding replacement
3. Package and environment renaming
4. Dependency replacement matrix
5. Final technology stack
6. Next.js folder structure
7. Supabase schema
8. RLS policies
9. Financial data model
10. Balance calculation specification
11. Split-engine specification
12. Settlement specification
13. Debt simplification specification
14. API/service boundaries
15. Testing architecture
16. Migration strategy
17. Development rules
18. CI/CD
19. Environment variables
20. Phase 1 acceptance criteria

**Phase 1 must produce an independent ABRO architecture, not merely a renamed SplitPro repository.**

---

## Document Status

**ABRO PRD v1.0**

**Status:** Ready for Architecture Phase

---

**END OF DOCUMENT** 

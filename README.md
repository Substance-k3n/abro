# FriendLedger

> Draft PRD · v0.1 · MVP scope  
> **"Never forget who paid."**

A shared expense ledger for friend groups in Ethiopia — who paid, who owes whom, and how much everyone has actually spent together, month after month. Built as our own product, studying SplitPro, Spliit and similar tools as architectural reference — not forked from any of them.

- **Default currency:** ETB
- **Platform:** Web app / PWA
- **Users:** Friend groups, phone-number based
- **Moves money?:** No — tracks it only

## 1) The problem

### Fifteen IOUs, nobody remembers the total

Four friends — You, Abel, Dawit, Hana — spend money together over a few days. Nobody wants to settle after every coffee, so the debts pile up silently, and by the end of the month nobody can say with confidence who's actually ahead.

**What happened**

- **Day 1:** Abel pays for food, split 4 ways — **1,200 ETB**
  - You owe Abel — **300 ETB**
  - Dawit owes Abel — **300 ETB**
  - Hana owes Abel — **300 ETB**
- **Day 5:** You pay for coffee, split 4 ways — **800 ETB**

**What the ledger says**

- Your balance — **+100 ETB**
- Abel owes you — **100 ETB**
- You owe Dawit — **200 ETB**
- Hana owes Abel — **300 ETB**

**Core requirement:** balances are always derived from full expense history, never hand-adjusted — so nothing gets forgotten and nothing drifts out of sync.

## 2) What we're building

### Scope: what it is and isn't

**FriendLedger is:**

- A social ledger: tracks who paid, who owes, and full history behind every balance.
- ETB-first: birr is default and primary currency.
- Phone-contact based: friends added by phone number.
- Debt-simplifying: collapses many IOUs into fewest transfers.
- Time-aware: supports monthly/yearly spend views.

**FriendLedger is not:**

- A payment processor (v1 records settlements only).
- A fork of SplitPro (no shared code).
- Multi-currency first.
- A budgeting app.
- Native mobile at launch (MVP is PWA).

## 3) Reference landscape

Pattern-level references only (architecture ideas, no code reuse):

| Project | License | Pattern borrowed |
|---|---|---|
| SplitPro | MIT | Computed balances, integer money handling, debt simplification |
| Spliit | MIT | Next.js/TS expense form and unequal-split UX patterns |
| SplitBills | MIT | Minimal core flow: expenses + settlements → balances → simplify |
| Balancia | AGPL-3.0 | Multi-payer and settlement suggestions (pattern only) |
| ShareTab | — | Item-level receipt splitting as post-MVP idea |

## 4) MVP scope

### Core ledger

- Add expense (amount, payer, participants, category, date) — **MVP**
- Equal split with deterministic remainder handling — **MVP**
- Exact / percentage / share splits — **MVP**
- Settlements (record payment without adding new cost) — **MVP**
- Full activity history (expenses + settlements remain visible) — **MVP**

### Groups & people

- Friends by phone number — **MVP**
- Groups (or 1:1 if no group) — **MVP**
- Debt simplification to minimum transfer set — **MVP**
- Share links / Telegram invite — **Phase 2**

### Insight

- Monthly spend summary by category + total — **MVP**
- Yearly summary (total, contribution, share, net) — **Phase 2**
- Export (Excel/PDF) — **Phase 2**

### Beyond MVP

- Receipt photos — **Phase 2**
- Recurring expenses — **Phase 2**
- Item-level receipt splitting — **Later / unscoped**
- Telebirr/mobile-money integration — **Later / unscoped**
- Native mobile app — **Later / unscoped**

## 5) Data model & debt logic

### Balances are computed, never stored

Only **Expense** and **Settlement** are source-of-truth entities. All balances are computed on read.

| Entity | Holds |
|---|---|
| User | Phone number, display name, default currency |
| Group | Name, members |
| Expense | Amount (integer minor units), payer, category, date, split type |
| ExpenseParticipant | One row per participant and their share |
| Settlement | Payment between two people reducing balance |
| Balance (view) | Computed from Expense + Settlement; not persisted |

### Money representation

Store money as integer in smallest ETB unit (santim). Never use floats.

### Simplification example

After simplification, the sample settles in three transfers:

- Dawit → Abel: **1,000 ETB**
- Dawit → You: **400 ETB**
- Dawit → Hana: **600 ETB**

## 6) Insight mock (September)

Monthly category totals for one group:

- Food — **4,500 ETB**
- Entertainment — **3,500 ETB**
- Transport — **2,800 ETB**
- Shopping — **1,600 ETB**
- Coffee — **1,200 ETB**
- **Group total — 13,600 ETB**

## 7) Screen inventory

MVP screens:

1. Sign in (phone + OTP)
2. Groups list
3. Group detail
4. Add expense
5. Friend balance
6. Record settlement
7. Activity feed
8. Monthly / yearly summary
9. Settings

## 8) Roadmap

- **Phase 0:** PRD and scope alignment
- **Phase 1:** Core ledger MVP (auth, groups, expenses, splits, settlements, simplification)
- **Phase 2:** Insight & sharing (summaries, receipts, exports, Telegram links)
- **Phase 3:** Ethiopia-specific integrations (Telebirr/mobile money)
- **Phase 4:** Native app (offline-first React Native if needed)

## 9) Open questions

- Final product name (FriendLedger is working title)
- OTP/SMS provider choice for Ethiopian numbers
- Hosting and monetization model
- Codebase placement (new repo vs sibling folder)

---

**Sources:** shared ChatGPT conversation + public SplitPro/Spliit/SplitBills/Balancia/ShareTab repositories, referenced for architectural patterns only.

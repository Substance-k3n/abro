---
name: abro-workflow
description: Professional engineering workflow for ABRO development. Use for any ABRO feature, phase, or backend/frontend task — context-first analysis, written work items, financial data-flow tracing, architecture-boundary checks, design-before-code, invariant definition, small-step implementation, testing discipline, git/PR conventions, and documentation upkeep. Load before starting implementation on any ABRO task, not just when the user says the word "workflow."
---

# ABRO — Professional Engineering Workflow

## Purpose

This skill defines how ABRO development must be approached and documented.

The goal is not simply to make features work. Every change must be:

- Understandable
- Traceable
- Testable
- Reviewable
- Reproducible
- Consistent with the architecture
- Documented well enough that another developer can continue the work

Never jump directly from an idea to implementation.

---

# 1. Start With Context

Before changing code, establish:

### 1.1 Current state

Determine:

- What already exists?
- What is incomplete?
- What branch am I on?
- What previous work has been merged?
- What related files/modules already exist?
- What decisions have already been documented?
- What assumptions are currently being made?

Do not recreate something that already exists.

Do not replace existing architecture without first understanding why it exists.

### 1.2 Source of truth

Use this priority:

1. Existing code
2. Architecture/decision documentation
3. Database/schema definitions
4. Tests
5. PRD/specification
6. Design/prototype
7. Personal assumptions

If two sources disagree, stop and identify the conflict before implementing.

---

# 2. Define the Work

Every feature or phase must have a written work item before implementation.

Use:

## Feature

What are we building?

## Why

What problem does it solve?

## Scope

What is included?

## Out of scope

What explicitly is NOT being built?

## Dependencies

What must already exist?

## Inputs

What data does the feature receive?

## Outputs

What does it produce?

## Business rules

What must always be true?

## Failure cases

What can go wrong?

## Acceptance criteria

How do we know the work is complete?

---

# 3. Trace the Data Flow

ABRO is a financial system.

Never implement financial behavior without explicitly tracing the data.

The canonical ABRO flow is:

Expense
→ Participants
→ Shares
→ Ledger Effect
→ Net Balance
→ Debt Simplification
→ Settlement
→ History

The fundamental rule is:

> Expenses are facts. Balances are derived projections.

Never introduce a stored "trust-me" balance when the value can be deterministically derived from expense/participant data.

For every financial feature, document:

- Source fact
- Transformation
- Result
- Persistence
- Query
- Derived values
- Reversal/edit behavior
- Settlement behavior

---

# 4. Check Architectural Boundaries

Before implementation, identify which layer owns the behavior.

ABRO should maintain clear separation between:

### Frontend

Responsible for:

- UI
- User interaction
- Client-side validation
- Presentation
- API consumption

### API / NestJS

Responsible for:

- Authentication
- Authorization
- Business rules
- Validation
- Financial calculations
- Persistence orchestration
- API contracts

### Database

Responsible for:

- Persisting facts
- Referential integrity
- Constraints
- Indexes
- Transactions

### Shared packages

Responsible for:

- Shared types
- Enums
- Schemas
- Contracts
- Pure reusable logic where appropriate

Do not place business-critical financial logic only in the frontend.

The backend must remain authoritative.

---

# 5. Design Before Coding

For non-trivial work, produce a short implementation design before writing code.

Document:

### API

- Endpoint
- HTTP method
- Request
- Response
- Validation
- Authentication requirement
- Authorization requirement
- Error cases

### Database

- Tables/models affected
- Relations
- Constraints
- Indexes
- Migration requirements

### Domain logic

- Rules
- Calculations
- Invariants
- Edge cases

### Frontend

- Route
- Components
- State
- API calls
- Loading state
- Error state
- Empty state

---

# 6. Define Invariants

Every important domain feature must identify its invariants.

Examples:

### Expense

- Total shares must equal the expense total.
- Participants must be valid users.
- Split rules must produce deterministic shares.
- Currency must be explicitly defined.
- The creator/payer relationships must be valid according to the business rules.

### Settlement

A settlement is an expense:

`splitType = SETTLEMENT`

Its participant shares must sum to zero.

Never create a second financial system just for settlements.

### Balance

Balances are derived from financial facts.

Never manually update a balance merely because an expense or settlement occurred unless there is an explicitly documented projection/cache strategy.

---

# 7. Implement in Small Steps

Do not make a giant change.

Prefer:

1. Schema/model
2. Migration
3. Domain logic
4. Service
5. Controller/API
6. Tests
7. Frontend integration
8. UI states
9. Documentation

After each meaningful step:

- Run the relevant tests
- Check types
- Check linting
- Inspect the diff
- Confirm behavior

Do not accumulate many unverified changes.

---

# 8. Testing Is Part of Implementation

A feature is not complete when the code compiles.

Test at the appropriate levels:

### Unit tests

For:

- Split calculations
- Balance calculations
- Debt simplification
- Validation
- Domain rules

### Integration tests

For:

- Database interactions
- Services
- API behavior
- Transactions

### E2E tests

For important user flows:

Example:

Create expense
→ assign participants
→ calculate shares
→ save expense
→ retrieve balances
→ simplify debts
→ record settlement
→ verify history

Test both normal and failure paths.

---

# 9. Verify Financial Mathematics

For any financial calculation, manually verify representative examples.

At minimum include:

- Equal split
- Unequal split
- Multiple participants
- Decimal amounts
- Rounding
- Someone owing someone else
- Circular debts
- Multiple expenses
- Settlement
- Settlement followed by another expense
- Zero/invalid values

Never trust a calculation simply because the code "looks right."

---

# 10. Git Workflow

Every meaningful piece of work should have a clear branch.

Use feature-oriented branches.

Example:

`feature/auth-screens`

`feature/add-expense`

`feature/expense-split-validation`

`feature/balance-engine`

`feature/settlement`

Before creating a PR:

1. Check current branch
2. Inspect changed files
3. Review diff
4. Run tests
5. Run type checking
6. Run linting
7. Confirm documentation
8. Confirm no accidental files
9. Write a clear commit message
10. Open PR

Never force-push destructive history or rewrite unrelated work unless explicitly required.

---

# 11. Pull Request Documentation

Every PR should explain:

## What

What changed?

## Why

Why was it needed?

## How

How was it implemented?

## Data changes

Did schema/database behavior change?

## API changes

Did contracts change?

## Tests

What was tested?

## Known limitations

What remains unfinished?

## Verification

What commands/checks were run?

A reviewer should be able to understand the change without opening every file.

---

# 12. Documentation Must Follow the Code

Whenever architecture or behavior changes, update the relevant documentation.

Potential documentation includes:

- `README.md`
- `docs/DECISIONS.md`
- `docs/ARCHITECTURE.md`
- `docs/WIRING_PLAN.md`
- API documentation
- Database documentation
- Feature documentation

Do not allow documentation to describe an architecture that no longer exists.

If a decision is significant, record:

### Decision

What was chosen?

### Alternatives

What else was considered?

### Reason

Why was this option chosen?

### Consequences

What does this make easier/harder?

### Status

Proposed / Accepted / Superseded

---

# 13. Never Hide Uncertainty

When something is unknown, label it.

Use:

- Confirmed
- Inferred
- Assumption
- Proposed
- Unknown
- Needs verification

Never convert an assumption into a documented fact.

For example:

> Auth mechanism: undecided — email OTP vs Google OAuth.

Do not silently choose one during implementation unless the decision is explicitly made.

---

# 14. Stop Conditions

Stop implementation and ask for clarification when:

- Two specifications conflict
- Existing code contradicts documentation
- A database decision affects multiple services
- A financial invariant is unclear
- Authentication/authorization behavior is ambiguous
- An API contract is unclear
- A destructive migration is required
- The correct ownership boundary is unclear
- A change could invalidate existing financial records

Do not "just pick something" for architectural decisions with long-term consequences.

---

# 15. Completion Checklist

A feature is DONE only when:

- [ ] Requirements understood
- [ ] Scope defined
- [ ] Dependencies identified
- [ ] Architecture checked
- [ ] Data flow documented
- [ ] Business rules documented
- [ ] Invariants identified
- [ ] Implementation completed
- [ ] Unit tests added where appropriate
- [ ] Integration tests added where appropriate
- [ ] E2E coverage added where appropriate
- [ ] Type checking passes
- [ ] Linting passes
- [ ] Relevant manual verification completed
- [ ] Database migrations verified
- [ ] API behavior verified
- [ ] Frontend states verified
- [ ] Documentation updated
- [ ] Git diff reviewed
- [ ] PR description prepared
- [ ] Known limitations recorded

Only then call the work complete.

---

# 16. How the Assistant Should Work With Me

When I give you an ABRO task:

Do NOT immediately start coding.

First determine where the task belongs in the architecture.

Then guide me through:

1. Context
2. Current state
3. Requirements
4. Scope
5. Dependencies
6. Data flow
7. Architecture
8. Design
9. Implementation plan
10. Implementation
11. Testing
12. Verification
13. Documentation
14. Git/PR
15. Completion

For each stage:

- Explain what we are doing.
- Explain why it matters.
- Tell me exactly what to inspect or change.
- Wait for the result when verification is required.
- Check my work rather than assuming it is correct.
- Point out mistakes directly.
- Do not skip steps merely because the change appears simple.

Prefer concrete commands, file paths, schemas, examples, and expected results over vague explanations.

---

# 17. ABRO-Specific Architectural Rules

These rules take precedence over generic implementation shortcuts.

### Financial truth

Expenses are facts.

Balances are derived.

### Settlement

Settlements are expenses with:

`splitType = SETTLEMENT`

### Backend authority

The frontend may validate for UX, but the backend remains authoritative for business rules.

### Type sharing

Where appropriate, frontend and backend should share:

- TypeScript types
- Enums
- Zod schemas
- API contracts

### Database

PostgreSQL + Prisma is the persistence layer.

Do not introduce Supabase-specific architecture unless explicitly decided.

### Backend

NestJS is the API/service boundary.

Do not move core business logic into Next.js server actions merely for convenience.

### Deployment

Avoid infrastructure decisions that unnecessarily couple ABRO to a single vendor unless the decision is documented.

### Existing history

Preserve meaningful project history.

Do not delete or overwrite previous architectural work simply to make the repository look cleaner.

---

# 18. Required Response Format for Future ABRO Work

When I give you a new ABRO task, begin with:

## 1. Current Understanding

What we know.

## 2. What We Need to Verify

Unknowns and assumptions.

## 3. Architecture Impact

Which parts of the system are affected.

## 4. Proposed Plan

Ordered implementation steps.

## 5. Documentation

Which documents need to be created or updated.

## 6. Implementation

Only after the plan is understood.

## 7. Verification

Commands/tests/checks and expected results.

## 8. Git / PR

Branch, commit, and PR preparation.

## 9. Completion

Final checklist and remaining known issues.

Never mark something complete merely because code was written.

---

# Core Principle

> Build slowly enough to understand the system, and systematically enough that another developer can reproduce your reasoning.

ABRO should not merely have working code.

It should have **traceable engineering decisions, deterministic financial behavior, tested business rules, and documentation that accurately reflects reality.**

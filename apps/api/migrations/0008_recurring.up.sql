-- Ported from apps/api/prisma/schema/recurring.prisma. A schedule that
-- regenerates a new expense from template_expense_id's shape each time
-- next_run_at is reached.
CREATE TYPE recurring_frequency AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY');

CREATE TABLE recurring_expenses (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_expense_id UUID NOT NULL UNIQUE REFERENCES expenses(id) ON DELETE RESTRICT,
    frequency           recurring_frequency NOT NULL,
    next_run_at         TIMESTAMPTZ NOT NULL,
    enabled             BOOLEAN NOT NULL DEFAULT true,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Serves the "what's due to run" query.
CREATE INDEX recurring_expenses_enabled_next_run_at_idx ON recurring_expenses (enabled, next_run_at);

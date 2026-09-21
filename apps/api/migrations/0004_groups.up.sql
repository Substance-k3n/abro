-- Ported from apps/api/prisma/schema/groups.prisma.

CREATE TYPE group_type AS ENUM ('FRIENDS', 'TRIP', 'HOUSEHOLD', 'FAMILY', 'TEAM', 'OTHER');
CREATE TYPE group_member_role AS ENUM ('ADMIN', 'MEMBER');
CREATE TYPE group_member_status AS ENUM ('INVITED', 'ACTIVE', 'LEFT');

CREATE TABLE groups (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name           TEXT NOT NULL,
    type           group_type NOT NULL DEFAULT 'OTHER',
    currency       TEXT NOT NULL DEFAULT 'ETB',
    description    TEXT,
    simplify_debts BOOLEAN NOT NULL DEFAULT true,
    created_by_id  UUID NOT NULL REFERENCES profiles(id),
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE group_members (
    id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id  UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    user_id   UUID NOT NULL REFERENCES profiles(id),
    role      group_member_role NOT NULL DEFAULT 'MEMBER',
    status    group_member_status NOT NULL DEFAULT 'ACTIVE',
    joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (group_id, user_id)
);
CREATE INDEX group_members_user_id_idx ON group_members (user_id);

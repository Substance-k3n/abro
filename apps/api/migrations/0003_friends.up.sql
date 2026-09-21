-- Ported from apps/api/prisma/schema/friends.prisma.

CREATE TYPE friendship_status AS ENUM ('PENDING', 'ACCEPTED', 'BLOCKED');

-- A -> B friendship request. Query both directions when resolving "is X my
-- friend". Unfriending hard-deletes the row -- soft-delete-only is scoped
-- to expenses (ABRO_PRD.md §8.5), not friendships.
CREATE TABLE friendships (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID NOT NULL REFERENCES profiles(id),
    friend_id  UUID NOT NULL REFERENCES profiles(id),
    status     friendship_status NOT NULL DEFAULT 'PENDING',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, friend_id)
);
CREATE INDEX friendships_friend_id_idx ON friendships (friend_id);

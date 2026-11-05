package admin

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strconv"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/Substance-k3n/abro/apps/api/internal/apitypes"
	"github.com/Substance-k3n/abro/apps/api/internal/auth"
	"github.com/Substance-k3n/abro/apps/api/internal/db"
	"github.com/Substance-k3n/abro/apps/api/internal/idutil"
	"github.com/Substance-k3n/abro/apps/api/internal/voice"
)

func TestRangeStart(t *testing.T) {
	// 22:30 UTC on 5 Nov is 01:30 on 6 Nov in Addis: the last 7 days are
	// 31 Oct .. 6 Nov, starting at Addis midnight (21:00 UTC on 30 Oct).
	now := time.Date(2026, 11, 5, 22, 30, 0, 0, time.UTC)
	got := rangeStart(now, 7)
	assert.Equal(t, time.Date(2026, 10, 30, 21, 0, 0, 0, time.UTC), got.UTC())
	assert.Equal(t, "2026-10-31", got.Format(time.DateOnly))
	assert.Equal(t, "2026-11-06", rangeStart(now, 1).Format(time.DateOnly))
}

// TestOverview reads the overview before and after adding known rows, in
// one REPEATABLE READ transaction: other packages' tests write to the same
// database at the same time, and the snapshot keeps their rows out.
func TestOverview(t *testing.T) {
	f := setup(t)
	tx, err := f.pool.BeginTx(f.ctx, pgx.TxOptions{IsoLevel: pgx.RepeatableRead})
	require.NoError(t, err)
	defer tx.Rollback(f.ctx) //nolint:errcheck // everything here is thrown away
	svc := *f.svc
	svc.q = db.New(tx)
	exec := func(sql string, args ...any) {
		t.Helper()
		_, err := tx.Exec(f.ctx, sql, args...)
		require.NoError(t, err)
	}
	one := func(sql string, args ...any) pgtype.UUID {
		t.Helper()
		var id pgtype.UUID
		require.NoError(t, tx.QueryRow(f.ctx, sql, args...).Scan(&id))
		return id
	}

	before, err := svc.Overview(f.ctx, 7)
	require.NoError(t, err)
	assert.Len(t, before.Series, 7, "one row per day, zeros included")

	a := one(`INSERT INTO profiles (email, display_name) VALUES ($1, 'A') RETURNING id`, f.tag+"-ova@abro.test")
	b := one(`INSERT INTO profiles (email, display_name, suspended_at) VALUES ($1, 'B', now()) RETURNING id`, f.tag+"-ovb@abro.test")
	// Created long ago: counts in totals, not in "new".
	c := one(`INSERT INTO profiles (email, display_name, created_at) VALUES ($1, 'C', now() - interval '60 days') RETURNING id`, f.tag+"-ovc@abro.test")
	exec(`INSERT INTO sessions (user_id, token_hash, expires_at, last_used_at) VALUES ($1, $2, now() + interval '1 day', now())`, a, f.tag+"-tok")

	g := one(`INSERT INTO groups (name, type, created_by_id) VALUES ('Trip', 'TRIP', $1) RETURNING id`, a)
	exec(`INSERT INTO group_members (group_id, user_id, role, status) VALUES ($1, $2, 'ADMIN', 'ACTIVE')`, g, a)
	exec(`INSERT INTO group_members (group_id, user_id, status, joined_at) VALUES ($1, $2, 'INVITED', now() - interval '10 days')`, g, c)
	gone := one(`INSERT INTO groups (name, created_by_id, deleted_at) VALUES ('Gone', $1, now()) RETURNING id`, a)
	exec(`INSERT INTO group_members (group_id, user_id, status) VALUES ($1, $2, 'INVITED')`, gone, b)

	e1 := one(`INSERT INTO expenses (group_id, name, category, amount, currency, paid_by_id, split_type, expense_date)
		VALUES ($1, 'Fuel', 'transport', 150000, 'ETB', $2, 'EQUAL', now()) RETURNING id`, g, a)
	exec(`INSERT INTO expense_participants (expense_id, user_id, amount, disputed_at) VALUES ($1, $2, 150000, now())`, e1, a)
	exec(`INSERT INTO expenses (name, category, amount, currency, paid_by_id, split_type, expense_date)
		VALUES ('Lunch', 'food', 2500, 'USD', $1, 'EXACT', now())`, a)
	exec(`INSERT INTO expenses (name, category, amount, currency, paid_by_id, split_type, expense_date)
		VALUES ('Payment', 'settlement', 99999, 'ETB', $1, 'SETTLEMENT', now())`, a)
	exec(`INSERT INTO expenses (name, category, amount, currency, paid_by_id, split_type, expense_date, deleted_at)
		VALUES ('Deleted', 'food', 777, 'ETB', $1, 'EQUAL', now(), now())`, a)
	exec(`INSERT INTO settlement_requests (payer_id, recipient_id, amount, currency, created_at)
		VALUES ($1, $2, 100, 'ETB', now() - interval '8 days'), ($1, $2, 100, 'ETB', now())`, a, c)
	exec(`INSERT INTO voice_sessions (user_id) VALUES ($1), ($1)`, a)

	after, err := svc.Overview(f.ctx, 7)
	require.NoError(t, err)

	d := func(x, y int64) int64 { return y - x }
	assert.EqualValues(t, 3, d(before.Users.Total, after.Users.Total))
	assert.EqualValues(t, 2, d(before.Users.New, after.Users.New))
	assert.EqualValues(t, 1, d(before.Users.Active, after.Users.Active))
	assert.EqualValues(t, 1, d(before.Users.Suspended, after.Users.Suspended))
	assert.EqualValues(t, 1, d(before.Groups.Total, after.Groups.Total), "deleted group not counted")
	assert.EqualValues(t, 1, d(before.Groups.New, after.Groups.New))
	assert.EqualValues(t, 2, d(before.Activity.Expenses, after.Activity.Expenses), "not the settlement or the deleted one")
	assert.EqualValues(t, 1, d(before.Activity.Settlements, after.Activity.Settlements))
	assert.EqualValues(t, 1, d(before.Queue.OpenDisputes, after.Queue.OpenDisputes))
	assert.EqualValues(t, 2, d(before.Queue.PendingConfirmations, after.Queue.PendingConfirmations))
	assert.EqualValues(t, 1, d(before.Queue.StaleConfirmations, after.Queue.StaleConfirmations))
	assert.EqualValues(t, 1, d(before.Queue.PendingInvites, after.Queue.PendingInvites), "not in the deleted group")
	assert.EqualValues(t, 1, d(before.Queue.StaleInvites, after.Queue.StaleInvites))
	assert.EqualValues(t, 2, d(before.Voice.Sessions, after.Voice.Sessions))
	assert.EqualValues(t, 1, d(before.Voice.Users, after.Voice.Users))

	tb, ta := before.Series[6], after.Series[6]
	assert.Equal(t, time.Now().In(addis).Format(time.DateOnly), ta.Day)
	assert.EqualValues(t, 2, ta.Signups-tb.Signups)
	assert.EqualValues(t, 2, ta.Expenses-tb.Expenses)
	assert.EqualValues(t, 1, ta.Settlements-tb.Settlements)
	assert.EqualValues(t, 2, ta.VoiceSessions-tb.VoiceSessions)

	cat := func(o apitypes.AdminOverview, name string) int64 {
		for _, r := range o.Categories {
			if r.Category == name {
				return r.Expenses
			}
		}
		return 0
	}
	assert.EqualValues(t, 1, cat(after, "transport")-cat(before, "transport"))
	assert.EqualValues(t, 1, cat(after, "food")-cat(before, "food"), "the deleted food expense isn't counted")
	assert.Zero(t, cat(after, "settlement"))

	vol := func(o apitypes.AdminOverview, cur string) (total, n int64) {
		for _, r := range o.Volume {
			if r.Currency == cur {
				v, err := strconv.ParseInt(r.Total, 10, 64)
				require.NoError(t, err)
				return v, r.Expenses
			}
		}
		return 0, 0
	}
	etbB, nB := vol(before, "ETB")
	etbA, nA := vol(after, "ETB")
	assert.EqualValues(t, 150000, etbA-etbB, "1,500.00 ETB: the settlement and the deleted expense aren't spending")
	assert.EqualValues(t, 1, nA-nB)
	usdB, _ := vol(before, "USD")
	usdA, _ := vol(after, "USD")
	assert.EqualValues(t, 2500, usdA-usdB)

	_, err = svc.Overview(f.ctx, 14)
	assert.Equal(t, "INVALID_RANGE", errCode(t, err))
	ninety, err := svc.Overview(f.ctx, 90)
	require.NoError(t, err)
	assert.Len(t, ninety.Series, 90)
}

func TestGroups(t *testing.T) {
	f := setup(t)
	a := f.person("a")
	b := f.person("b")
	var live, gone pgtype.UUID
	require.NoError(t, f.pool.QueryRow(f.ctx, `INSERT INTO groups (name, type, created_by_id)
		VALUES ($1, 'HOUSEHOLD', $2) RETURNING id`, f.tag+" Flat", a.ID).Scan(&live))
	require.NoError(t, f.pool.QueryRow(f.ctx, `INSERT INTO groups (name, created_by_id, deleted_at)
		VALUES ($1, $2, now()) RETURNING id`, f.tag+" Old", a.ID).Scan(&gone))
	_, err := f.pool.Exec(f.ctx, `INSERT INTO group_members (group_id, user_id, role, status) VALUES
		($1, $2, 'ADMIN', 'ACTIVE'), ($1, $3, 'MEMBER', 'INVITED')`, live, a.ID, b.ID)
	require.NoError(t, err)
	_, err = f.pool.Exec(f.ctx, `INSERT INTO expenses (group_id, name, category, amount, paid_by_id, split_type, expense_date)
		VALUES ($1, 'Rent', 'housing', 1000, $2, 'EQUAL', now()), ($1, 'Pay', 'settlement', 10, $2, 'SETTLEMENT', now())`, live, a.ID)
	require.NoError(t, err)

	names := func(status string) []string {
		t.Helper()
		p, err := f.svc.ListGroups(f.ctx, f.tag, status, 1)
		require.NoError(t, err)
		out := []string{}
		for _, g := range p.Groups {
			out = append(out, g.Name)
		}
		return out
	}
	assert.Equal(t, []string{f.tag + " Flat"}, names(""))
	assert.Equal(t, []string{f.tag + " Old"}, names("deleted"))
	assert.ElementsMatch(t, []string{f.tag + " Flat", f.tag + " Old"}, names("all"))
	_, err = f.svc.ListGroups(f.ctx, "", "archived", 1)
	assert.Equal(t, "INVALID_STATUS", errCode(t, err))

	p, err := f.svc.ListGroups(f.ctx, f.tag+" flat", "", 1)
	require.NoError(t, err)
	require.Len(t, p.Groups, 1)
	g := p.Groups[0]
	assert.EqualValues(t, 1, g.MemberCount)
	assert.EqualValues(t, 1, g.InvitedCount)
	assert.EqualValues(t, 1, g.ExpenseCount, "the settlement isn't an expense")
	assert.Equal(t, a.DisplayName, g.CreatorName)
	assert.NotNil(t, g.LastActivityAt)

	d, err := f.svc.GetGroup(f.ctx, live)
	require.NoError(t, err)
	assert.Equal(t, "HOUSEHOLD", d.Type)
	assert.EqualValues(t, 1, d.ExpenseCount)
	assert.EqualValues(t, 1, d.SettlementCount)
	require.Len(t, d.Members, 2)
	assert.Equal(t, "ACTIVE", d.Members[0].Status)
	assert.Equal(t, "INVITED", d.Members[1].Status)

	missing, _ := idutil.Parse("00000000-0000-0000-0000-000000000002")
	_, err = f.svc.GetGroup(f.ctx, missing)
	assert.Equal(t, "GROUP_NOT_FOUND", errCode(t, err))
}

// withVoiceMode runs fn with voice_mode set to mode and puts the setting
// back afterwards: it's one global row in a shared dev database.
func withVoiceMode(t *testing.T, f *fixture, mode string, fn func()) {
	t.Helper()
	var old *string
	var v string
	if err := f.pool.QueryRow(f.ctx, `SELECT value FROM app_settings WHERE key = 'voice_mode'`).Scan(&v); err == nil {
		old = &v
	}
	_, err := f.pool.Exec(f.ctx, `INSERT INTO app_settings (key, value) VALUES ('voice_mode', $1)
		ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`, mode)
	require.NoError(t, err)
	defer func() {
		if old == nil {
			f.pool.Exec(f.ctx, `DELETE FROM app_settings WHERE key = 'voice_mode'`)
		} else {
			f.pool.Exec(f.ctx, `UPDATE app_settings SET value = $1 WHERE key = 'voice_mode'`, *old)
		}
	}()
	fn()
}

func TestVoiceAccess(t *testing.T) {
	f := setup(t)
	actor := f.admin(f.withRole("admin", db.AdminRoleADMIN))
	tester := f.person("tester") // in VOICE_TESTERS (setup)
	granted := f.person("granted")
	plain := f.person("plain")
	suspended := f.person("suspended")
	require.NoError(t, f.svc.Suspend(f.ctx, actor, suspended.ID, "x", ""))

	require.NoError(t, f.svc.GrantVoice(f.ctx, actor, granted.ID, "1.2.3.4"))
	assert.Equal(t, "VOICE_ALREADY_ON", errCode(t, f.svc.GrantVoice(f.ctx, actor, granted.ID, "")))
	assert.Equal(t, "TARGET_SUSPENDED", errCode(t, f.svc.GrantVoice(f.ctx, actor, suspended.ID, "")))
	assert.Equal(t, ActionVoiceGrant, f.auditFor(granted)[0].Action)

	allowed := func(p db.Profile) bool {
		t.Helper()
		ok, err := f.voice.Allowed(f.ctx, f.q, p)
		require.NoError(t, err)
		return ok
	}
	access := func(p db.Profile) string {
		t.Helper()
		d, err := f.svc.GetUser(f.ctx, p.ID)
		require.NoError(t, err)
		return d.Voice.Access
	}

	withVoiceMode(t, f, voice.ModeListed, func() {
		assert.True(t, allowed(tester))
		assert.True(t, allowed(granted))
		assert.False(t, allowed(plain))
		assert.Equal(t, "tester", access(tester))
		assert.Equal(t, "granted", access(granted))
		assert.Equal(t, "none", access(plain))

		v, err := f.svc.Voice(f.ctx)
		require.NoError(t, err)
		assert.True(t, v.Configured)
		assert.Equal(t, "listed", v.Mode)
		assert.Equal(t, []string{f.tag + "-tester@abro.test"}, v.Testers)
		got := map[string]string{}
		for _, u := range v.Users {
			got[u.UserID] = u.Access
		}
		assert.Equal(t, "tester", got[idutil.String(tester.ID)])
		assert.Equal(t, "granted", got[idutil.String(granted.ID)])
		_, listed := got[idutil.String(plain.ID)]
		assert.False(t, listed)
	})
	withVoiceMode(t, f, voice.ModeOff, func() {
		assert.False(t, allowed(tester), "off beats VOICE_TESTERS")
		assert.False(t, allowed(granted))
		assert.Equal(t, "off", access(granted))
	})
	withVoiceMode(t, f, voice.ModeEveryone, func() {
		assert.True(t, allowed(plain))
		assert.Equal(t, "everyone", access(plain))
	})

	require.NoError(t, f.svc.RevokeVoice(f.ctx, actor, granted.ID, ""))
	assert.Equal(t, "VOICE_NOT_GRANTED", errCode(t, f.svc.RevokeVoice(f.ctx, actor, granted.ID, "")))
	assert.Equal(t, ActionVoiceRevoke, f.auditFor(granted)[0].Action)
	withVoiceMode(t, f, voice.ModeListed, func() {
		assert.False(t, allowed(granted))
	})

	t.Run("unconfigured voice is unavailable for everyone", func(t *testing.T) {
		svc := NewService(f.pool, "", voice.NewService("", "", "", "*"))
		d, err := svc.GetUser(f.ctx, tester.ID)
		require.NoError(t, err)
		assert.Equal(t, "unavailable", d.Voice.Access)
	})
}

func TestSetVoiceMode(t *testing.T) {
	f := setup(t)
	actor := f.admin(f.withRole("admin", db.AdminRoleADMIN))
	withVoiceMode(t, f, voice.ModeListed, func() {
		require.NoError(t, f.svc.SetVoiceMode(f.ctx, actor, voice.ModeOff, ""))
		mode, err := voice.Mode(f.ctx, f.q)
		require.NoError(t, err)
		assert.Equal(t, voice.ModeOff, mode)
		assert.Equal(t, "MODE_UNCHANGED", errCode(t, f.svc.SetVoiceMode(f.ctx, actor, voice.ModeOff, "")))
		assert.Equal(t, "INVALID_MODE", errCode(t, f.svc.SetVoiceMode(f.ctx, actor, "loud", "")))

		rows, err := f.q.ListAdminAudit(f.ctx, db.ListAdminAuditParams{ActorID: actor.Profile.ID, Lim: 5})
		require.NoError(t, err)
		require.Len(t, rows, 1)
		assert.Equal(t, ActionVoiceMode, rows[0].Action)
		assert.Equal(t, "setting", rows[0].TargetType)
		assert.False(t, rows[0].TargetID.Valid)
		var details map[string]any
		require.NoError(t, json.Unmarshal(rows[0].Details, &details))
		assert.Equal(t, map[string]any{"setting": "voice_mode", "from": "listed", "to": "off"}, details)
	})
}

// TestVoiceTokenIsCounted: a token handed out is a voice session the
// portal can count; a refused one isn't.
func TestVoiceTokenIsCounted(t *testing.T) {
	f := setup(t)
	relay := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte(`{"token":"tok","expiresAt":1793102859417}`))
	}))
	defer relay.Close()
	tester := f.person("tester")
	plain := f.person("plain")
	svc := voice.NewService(relay.URL, "tz_sec_test_x", "https://app.test", tester.Email.String)
	r := chi.NewRouter()
	r.Route("/voice", voice.NewHandler(svc, f.q).Mount)
	count := func(p db.Profile) int {
		var n int
		require.NoError(t, f.pool.QueryRow(context.Background(),
			`SELECT count(*) FROM voice_sessions WHERE user_id = $1`, p.ID).Scan(&n))
		return n
	}

	withVoiceMode(t, f, voice.ModeListed, func() {
		for _, c := range []struct {
			who  db.Profile
			code int
			want int
		}{{tester, http.StatusOK, 1}, {plain, http.StatusForbidden, 0}} {
			token, _ := f.session(c.who)
			req := httptest.NewRequest(http.MethodPost, "/voice/token", nil)
			req.AddCookie(&http.Cookie{Name: auth.SessionCookie, Value: token})
			rec := httptest.NewRecorder()
			r.ServeHTTP(rec, req)
			assert.Equal(t, c.code, rec.Code)
			assert.Equal(t, c.want, count(c.who))
		}
	})
}

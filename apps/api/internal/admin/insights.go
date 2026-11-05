package admin

// The portal's overview, groups and voice controls (ADR-028). Reading is
// app-wide counts; the only changes here are voice switches, each logged.

import (
	"context"
	"errors"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/Substance-k3n/abro/apps/api/internal/apitypes"
	"github.com/Substance-k3n/abro/apps/api/internal/db"
	"github.com/Substance-k3n/abro/apps/api/internal/httpx"
	"github.com/Substance-k3n/abro/apps/api/internal/idutil"
	"github.com/Substance-k3n/abro/apps/api/internal/voice"
)

const (
	ActionVoiceMode   = "voice.mode.set"
	ActionVoiceGrant  = "user.voice.grant"
	ActionVoiceRevoke = "user.voice.revoke"

	GroupPageSize = 50
)

// addis is Ethiopia's time (UTC+3 all year, no daylight saving): the
// overview's days are the days ABRO's people live in. Fixed, so the API
// image needs no time zone database.
var addis = time.FixedZone("EAT", 3*60*60)

// OverviewRanges are the day ranges the dashboard offers.
var OverviewRanges = []int{7, 30, 90}

// rangeStart is the start (Addis midnight) of the first of the last
// `days` days, today included.
func rangeStart(now time.Time, days int) time.Time {
	t := now.In(addis)
	return time.Date(t.Year(), t.Month(), t.Day()-(days-1), 0, 0, 0, 0, addis)
}

func (s *Service) Overview(ctx context.Context, days int) (apitypes.AdminOverview, error) {
	valid := false
	for _, d := range OverviewRanges {
		valid = valid || d == days
	}
	if !valid {
		return apitypes.AdminOverview{}, httpx.BadRequest("INVALID_RANGE", "range must be 7, 30 or 90 days.")
	}
	since := rangeStart(time.Now(), days)
	ts := pgtype.Timestamptz{Time: since, Valid: true}

	c, err := s.q.AdminOverviewCounts(ctx, ts)
	if err != nil {
		return apitypes.AdminOverview{}, err
	}
	series, err := s.q.AdminDailySeries(ctx, ts)
	if err != nil {
		return apitypes.AdminOverview{}, err
	}
	cats, err := s.q.AdminExpenseCategories(ctx, ts)
	if err != nil {
		return apitypes.AdminOverview{}, err
	}
	vol, err := s.q.AdminVolumeByCurrency(ctx, ts)
	if err != nil {
		return apitypes.AdminOverview{}, err
	}
	types, err := s.q.AdminGroupTypes(ctx)
	if err != nil {
		return apitypes.AdminOverview{}, err
	}

	o := apitypes.AdminOverview{RangeDays: days, Since: since}
	o.Users.Total, o.Users.New, o.Users.Active, o.Users.Suspended = c.UsersTotal, c.UsersNew, c.UsersActive, c.UsersSuspended
	o.Groups.Total, o.Groups.New = c.GroupsTotal, c.GroupsNew
	o.Activity.Expenses, o.Activity.Settlements = c.ExpensesNew, c.SettlementsNew
	o.Queue.OpenDisputes = c.OpenDisputes
	o.Queue.PendingConfirmations, o.Queue.StaleConfirmations = c.PendingConfirmations, c.StaleConfirmations
	o.Queue.PendingInvites, o.Queue.StaleInvites = c.PendingInvites, c.StaleInvites
	o.Voice.Sessions, o.Voice.Users = c.VoiceSessions, c.VoiceUsers

	o.Series = make([]apitypes.AdminDay, 0, len(series))
	for _, d := range series {
		o.Series = append(o.Series, apitypes.AdminDay{
			Day:           d.Day.Time.Format(time.DateOnly),
			Signups:       d.Signups,
			Expenses:      d.Expenses,
			Settlements:   d.Settlements,
			VoiceSessions: d.VoiceSessions,
		})
	}
	o.Categories = make([]apitypes.AdminCategoryCount, 0, len(cats))
	for _, c := range cats {
		o.Categories = append(o.Categories, apitypes.AdminCategoryCount{Category: c.Category, Expenses: c.Expenses})
	}
	o.Volume = make([]apitypes.AdminVolume, 0, len(vol))
	for _, v := range vol {
		o.Volume = append(o.Volume, apitypes.AdminVolume{
			Currency: v.Currency, Total: strconv.FormatInt(v.Total, 10), Expenses: v.Expenses,
		})
	}
	o.GroupTypes = make([]apitypes.AdminGroupType, 0, len(types))
	for _, t := range types {
		o.GroupTypes = append(o.GroupTypes, apitypes.AdminGroupType{Type: string(t.Type), Groups: t.Groups})
	}
	return o, nil
}

// --- groups ----------------------------------------------------------------

// ListGroups: status is "" (live groups), "deleted" or "all"; page from 1.
func (s *Service) ListGroups(ctx context.Context, search, status string, page int) (apitypes.AdminGroupPage, error) {
	switch status {
	case "", "deleted", "all":
	default:
		return apitypes.AdminGroupPage{}, httpx.BadRequest("INVALID_STATUS", "status must be deleted or all.")
	}
	if page < 1 {
		page = 1
	}
	search = strings.TrimSpace(search)
	rows, err := s.q.AdminListGroups(ctx, db.AdminListGroupsParams{
		Search: pgtype.Text{String: escapeLike(search), Valid: search != ""},
		Status: pgtype.Text{String: status, Valid: status != ""},
		Lim:    GroupPageSize,
		Off:    int32((page - 1) * GroupPageSize),
	})
	if err != nil {
		return apitypes.AdminGroupPage{}, err
	}
	out := apitypes.AdminGroupPage{Groups: []apitypes.AdminGroupSummary{}, Page: page, PageSize: GroupPageSize}
	for _, g := range rows {
		out.Total = g.Total
		out.Groups = append(out.Groups, apitypes.AdminGroupSummary{
			ID:             idutil.String(g.ID),
			Name:           g.Name,
			Type:           string(g.Type),
			Currency:       g.Currency,
			CreatedAt:      g.CreatedAt.Time,
			DeletedAt:      optTime(g.DeletedAt),
			CreatorID:      idutil.String(g.CreatedByID),
			CreatorName:    g.CreatorName,
			MemberCount:    g.MemberCount,
			InvitedCount:   g.InvitedCount,
			ExpenseCount:   g.ExpenseCount,
			LastActivityAt: optTime(g.LastActivityAt),
		})
	}
	return out, nil
}

func (s *Service) GetGroup(ctx context.Context, id pgtype.UUID) (apitypes.AdminGroupDetail, error) {
	g, err := s.q.AdminGetGroup(ctx, id)
	if errors.Is(err, pgx.ErrNoRows) {
		return apitypes.AdminGroupDetail{}, httpx.NotFound("GROUP_NOT_FOUND", "No such group.")
	}
	if err != nil {
		return apitypes.AdminGroupDetail{}, err
	}
	members, err := s.q.AdminGroupMembers(ctx, id)
	if err != nil {
		return apitypes.AdminGroupDetail{}, err
	}
	d := apitypes.AdminGroupDetail{
		ID:              idutil.String(g.ID),
		Name:            g.Name,
		Type:            string(g.Type),
		Currency:        g.Currency,
		Description:     optText(g.Description),
		CreatedAt:       g.CreatedAt.Time,
		DeletedAt:       optTime(g.DeletedAt),
		CreatorID:       idutil.String(g.CreatedByID),
		CreatorName:     g.CreatorName,
		ExpenseCount:    g.ExpenseCount,
		SettlementCount: g.SettlementCount,
		LastActivityAt:  optTime(g.LastActivityAt),
		Members:         make([]apitypes.AdminGroupMember, 0, len(members)),
	}
	for _, m := range members {
		d.Members = append(d.Members, apitypes.AdminGroupMember{
			UserID:      idutil.String(m.ID),
			DisplayName: m.DisplayName,
			Email:       optText(m.Email),
			Username:    optText(m.Username),
			AvatarURL:   optText(m.AvatarUrl),
			SuspendedAt: optTime(m.SuspendedAt),
			Role:        string(m.Role),
			Status:      string(m.Status),
			JoinedAt:    m.JoinedAt.Time,
		})
	}
	return d, nil
}

// --- voice -----------------------------------------------------------------

// voiceAccess is why someone has voice or not (apitypes.AdminUserVoice).
func (s *Service) voiceAccess(mode string, email pgtype.Text, granted bool) string {
	switch {
	case !s.voice.IsConfigured():
		return "unavailable"
	case mode == voice.ModeOff:
		return "off"
	case mode == voice.ModeEveryone:
		return "everyone"
	case s.voice.EnabledFor(email.String):
		if _, everyone := s.voice.Testers(); everyone {
			return "everyone"
		}
		return "tester"
	case granted:
		return "granted"
	}
	return "none"
}

func (s *Service) userVoice(ctx context.Context, p db.Profile) (apitypes.AdminUserVoice, error) {
	mode, err := voice.Mode(ctx, s.q)
	if err != nil {
		return apitypes.AdminUserVoice{}, err
	}
	v, err := s.q.AdminUserVoice(ctx, p.ID)
	if err != nil {
		return apitypes.AdminUserVoice{}, err
	}
	return apitypes.AdminUserVoice{
		Access:      s.voiceAccess(mode, p.Email, v.GrantedAt.Valid),
		GrantedAt:   optTime(v.GrantedAt),
		LastUsedAt:  optTime(v.LastUsedAt),
		Sessions30d: v.Sessions30d,
	}, nil
}

func (s *Service) Voice(ctx context.Context) (apitypes.AdminVoice, error) {
	mode, err := voice.Mode(ctx, s.q)
	if err != nil {
		return apitypes.AdminVoice{}, err
	}
	testers, everyone := s.voice.Testers()
	rows, err := s.q.AdminVoiceUsers(ctx, testers)
	if err != nil {
		return apitypes.AdminVoice{}, err
	}
	out := apitypes.AdminVoice{
		Configured:      s.voice.IsConfigured(),
		Mode:            mode,
		Testers:         testers,
		TestersEveryone: everyone,
		Users:           make([]apitypes.AdminVoiceUser, 0, len(rows)),
	}
	for _, r := range rows {
		out.Users = append(out.Users, apitypes.AdminVoiceUser{
			UserID:        idutil.String(r.ID),
			DisplayName:   r.DisplayName,
			Email:         optText(r.Email),
			Username:      optText(r.Username),
			AvatarURL:     optText(r.AvatarUrl),
			SuspendedAt:   optTime(r.SuspendedAt),
			Access:        s.voiceAccess(mode, r.Email, r.GrantedAt.Valid),
			GrantedAt:     optTime(r.GrantedAt),
			GrantedByName: optText(r.GrantedByName),
			LastUsedAt:    optTime(r.LastUsedAt),
			Sessions30d:   r.Sessions30d,
		})
	}
	return out, nil
}

func (s *Service) SetVoiceMode(ctx context.Context, actor Admin, mode, ip string) error {
	switch mode {
	case voice.ModeOff, voice.ModeListed, voice.ModeEveryone:
	default:
		return httpx.BadRequest("INVALID_MODE", "mode must be off, listed or everyone.")
	}
	return s.inTx(ctx, func(q *db.Queries) error {
		from, err := voice.Mode(ctx, q)
		if err != nil {
			return err
		}
		if from == mode {
			return httpx.Conflict("MODE_UNCHANGED", "Voice is already set that way.")
		}
		if err := q.UpsertAppSetting(ctx, db.UpsertAppSettingParams{
			Key: voice.ModeSetting, Value: mode, UpdatedBy: actor.Profile.ID,
		}); err != nil {
			return err
		}
		return auditOn(ctx, q, actor, ActionVoiceMode, "setting", pgtype.UUID{},
			map[string]any{"setting": voice.ModeSetting, "from": from, "to": mode}, ip)
	})
}

// voiceTarget: voice is a feature switch, not a punishment, so any admin
// with voice.manage may switch it for anyone, themselves included -- but
// not turn it on for a suspended account.
func voiceTarget(ctx context.Context, q *db.Queries, id pgtype.UUID) (db.Profile, error) {
	p, err := q.GetProfileByID(ctx, id)
	if errors.Is(err, pgx.ErrNoRows) {
		return db.Profile{}, httpx.NotFound("USER_NOT_FOUND", "No such user.")
	}
	return p, err
}

func (s *Service) GrantVoice(ctx context.Context, actor Admin, id pgtype.UUID, ip string) error {
	return s.inTx(ctx, func(q *db.Queries) error {
		p, err := voiceTarget(ctx, q, id)
		if err != nil {
			return err
		}
		if p.SuspendedAt.Valid {
			return httpx.Conflict("TARGET_SUSPENDED", "Unsuspend this account before turning voice on.")
		}
		n, err := q.GrantVoiceAccess(ctx, db.GrantVoiceAccessParams{UserID: id, GrantedBy: actor.Profile.ID})
		if err != nil {
			return err
		}
		if n == 0 {
			return httpx.Conflict("VOICE_ALREADY_ON", "Voice is already on for them.")
		}
		return audit(ctx, q, actor, ActionVoiceGrant, id, nil, ip)
	})
}

// RevokeVoice removes an admin's grant. Someone in VOICE_TESTERS keeps
// voice in "listed" mode; the portal says so.
func (s *Service) RevokeVoice(ctx context.Context, actor Admin, id pgtype.UUID, ip string) error {
	return s.inTx(ctx, func(q *db.Queries) error {
		if _, err := voiceTarget(ctx, q, id); err != nil {
			return err
		}
		n, err := q.RevokeVoiceAccess(ctx, id)
		if err != nil {
			return err
		}
		if n == 0 {
			return httpx.Conflict("VOICE_NOT_GRANTED", "Voice wasn't turned on for them here.")
		}
		return audit(ctx, q, actor, ActionVoiceRevoke, id, nil, ip)
	})
}

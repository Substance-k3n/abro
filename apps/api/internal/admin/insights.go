package admin

// The portal's overview and groups (ADR-028): app-wide counts, read only.

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
)

const GroupPageSize = 50

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

	o.Series = make([]apitypes.AdminDay, 0, len(series))
	for _, d := range series {
		o.Series = append(o.Series, apitypes.AdminDay{
			Day:         d.Day.Time.Format(time.DateOnly),
			Signups:     d.Signups,
			Expenses:    d.Expenses,
			Settlements: d.Settlements,
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

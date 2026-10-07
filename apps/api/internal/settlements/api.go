package settlements

import (
	"context"
	"errors"
	"strconv"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/Substance-k3n/abro/apps/api/internal/apitypes"
	"github.com/Substance-k3n/abro/apps/api/internal/db"
	"github.com/Substance-k3n/abro/apps/api/internal/idutil"
)

// ToAPI is one request in its wire shape, with both people's profiles
// (emails removed) and the group's name.
func (s *Service) ToAPI(ctx context.Context, req db.SettlementRequest) (apitypes.SettlementRequest, error) {
	out, err := s.ToAPIList(ctx, []db.SettlementRequest{req})
	if err != nil {
		return apitypes.SettlementRequest{}, err
	}
	return out[0], nil
}

// ToAPIList converts several requests, looking each person and group up
// once.
func (s *Service) ToAPIList(ctx context.Context, reqs []db.SettlementRequest) ([]apitypes.SettlementRequest, error) {
	profiles := map[pgtype.UUID]apitypes.AuthProfile{}
	profile := func(id pgtype.UUID) (apitypes.AuthProfile, error) {
		if p, ok := profiles[id]; ok {
			return p, nil
		}
		row, err := s.q.GetProfileByID(ctx, id)
		if err != nil {
			return apitypes.AuthProfile{}, err
		}
		p := apitypes.ToAuthProfile(row)
		p.Email = nil
		profiles[id] = p
		return p, nil
	}
	groupNames := map[pgtype.UUID]*string{}
	groupName := func(id pgtype.UUID) (*string, error) {
		if name, ok := groupNames[id]; ok {
			return name, nil
		}
		g, err := s.q.GetGroupByID(ctx, id)
		if errors.Is(err, pgx.ErrNoRows) {
			// A deleted group: the request still shows, without a name.
			groupNames[id] = nil
			return nil, nil
		}
		if err != nil {
			return nil, err
		}
		groupNames[id] = &g.Name
		return &g.Name, nil
	}

	out := make([]apitypes.SettlementRequest, len(reqs))
	for i, req := range reqs {
		payer, err := profile(req.PayerID)
		if err != nil {
			return nil, err
		}
		recipient, err := profile(req.RecipientID)
		if err != nil {
			return nil, err
		}
		item := apitypes.SettlementRequest{
			ID: idutil.String(req.ID), Payer: payer, Recipient: recipient,
			Amount: fmtInt(req.Amount), Currency: req.Currency, Status: string(req.Status),
			HasReceipt: req.ReceiptPath.Valid, CreatedAt: req.CreatedAt.Time,
		}
		if req.GroupID.Valid {
			id := idutil.String(req.GroupID)
			item.GroupID = &id
			if item.GroupName, err = groupName(req.GroupID); err != nil {
				return nil, err
			}
		}
		if req.SettlementID.Valid {
			id := idutil.String(req.SettlementID)
			item.SettlementID = &id
		}
		if req.ResolvedAt.Valid {
			t := req.ResolvedAt.Time
			item.ResolvedAt = &t
		}
		out[i] = item
	}
	return out, nil
}

func fmtInt(v int64) string { return strconv.FormatInt(v, 10) }

// Package ekubs implements ekub, the rotating savings group (ADR-024):
// members put in every round, one slot takes the pot, in the order the
// admin sets. The app records payments; it never moves money, and an
// ekub never touches anyone's friend or group balances.
//
// Only payments are stored. Who owes whom is derived each time from the
// members' amounts, slots and joining rounds (schedule.go).
package ekubs

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/Substance-k3n/abro/apps/api/internal/apitypes"
	"github.com/Substance-k3n/abro/apps/api/internal/db"
	"github.com/Substance-k3n/abro/apps/api/internal/friends"
	"github.com/Substance-k3n/abro/apps/api/internal/httpx"
	"github.com/Substance-k3n/abro/apps/api/internal/idutil"
	"github.com/Substance-k3n/abro/apps/api/internal/money"
	"github.com/Substance-k3n/abro/apps/api/internal/notifications"
)

type Service struct {
	q             db.Querier
	friends       *friends.Service
	notifications *notifications.Service
	// now is swapped in tests to move through the rounds.
	now func() time.Time
}

func NewService(q db.Querier, friendsSvc *friends.Service, notificationsSvc *notifications.Service) *Service {
	return &Service{q: q, friends: friendsSvc, notifications: notificationsSvc, now: time.Now}
}

// SetClock replaces the clock (tests only).
func (s *Service) SetClock(now func() time.Time) { s.now = now }

func (s *Service) today() time.Time {
	y, m, d := s.now().UTC().Date()
	return time.Date(y, m, d, 0, 0, 0, 0, time.UTC)
}

func link(ekubID pgtype.UUID) string { return "/ekub/" + idutil.String(ekubID) }

var errNotFound = httpx.NotFound("EKUB_NOT_FOUND", "No such ekub.")

// state is one ekub as loaded for a request.
type state struct {
	ekub     db.Ekub
	members  []db.ListEkubMembersRow
	payments []db.EkubPayment
	missed   []db.EkubMissedPayment
	me       *db.ListEkubMembersRow
}

func (st *state) member(id pgtype.UUID) *db.ListEkubMembersRow {
	for i := range st.members {
		if st.members[i].ID == id {
			return &st.members[i]
		}
	}
	return nil
}

// takesPart: who the schedule counts. Before the start that's everyone
// arranged in a slot, invited or not; after it, people who accepted
// (and those who left, all of whose payments were done).
func (st *state) takesPart(m db.ListEkubMembersRow) bool {
	if st.ekub.Status == db.EkubStatusDRAFT {
		return m.Status != db.GroupMemberStatusLEFT
	}
	return m.Status != db.GroupMemberStatusINVITED
}

func (s *Service) load(ctx context.Context, ekubID, userID pgtype.UUID) (*state, error) {
	ekub, err := s.q.GetEkub(ctx, ekubID)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, errNotFound
	}
	if err != nil {
		return nil, err
	}
	members, err := s.q.ListEkubMembers(ctx, ekubID)
	if err != nil {
		return nil, err
	}
	st := &state{ekub: ekub, members: members}
	for i := range members {
		if members[i].UserID == userID && members[i].Status != db.GroupMemberStatusLEFT {
			st.me = &st.members[i]
		}
	}
	if st.me == nil {
		return nil, errNotFound
	}
	if st.payments, err = s.q.ListEkubPayments(ctx, ekubID); err != nil {
		return nil, err
	}
	if st.missed, err = s.q.ListEkubMissedPayments(ctx, ekubID); err != nil {
		return nil, err
	}
	return st, nil
}

func (s *Service) loadAsAdmin(ctx context.Context, ekubID, userID pgtype.UUID) (*state, error) {
	st, err := s.load(ctx, ekubID, userID)
	if err != nil {
		return nil, err
	}
	if st.me.Role != db.GroupMemberRoleADMIN || st.me.Status != db.GroupMemberStatusACTIVE {
		return nil, httpx.Forbidden("NOT_EKUB_ADMIN", "Only the ekub's admin can do that.")
	}
	return st, nil
}

// obligation is a schedule Obligation with the members and payment
// resolved.
type obligation struct {
	payer, recipient *db.ListEkubMembersRow
	amount           int64
	round            int
	payment          *db.EkubPayment
}

func (st *state) obligations() []obligation {
	var rows []*db.ListEkubMembersRow
	var ps []Participant
	for i := range st.members {
		if st.takesPart(st.members[i]) {
			rows = append(rows, &st.members[i])
			ps = append(ps, Participant{
				Amount: st.members[i].Amount,
				Slot:   int(st.members[i].SlotPosition),
				Joined: int(st.members[i].JoinedRound),
			})
		}
	}
	// A missed payment from before the ekub was entered: the pair skip
	// each other, whichever way round it was missed.
	skip := func(a, b int) bool {
		for _, m := range st.missed {
			if (m.PayerMemberID == rows[a].ID && m.RecipientMemberID == rows[b].ID) ||
				(m.PayerMemberID == rows[b].ID && m.RecipientMemberID == rows[a].ID) {
				return true
			}
		}
		return false
	}
	obs := Obligations(st.ekub.SlotAmount, ps, skip)
	out := make([]obligation, len(obs))
	for i, o := range obs {
		out[i] = obligation{payer: rows[o.Payer], recipient: rows[o.Recipient], amount: o.Amount, round: o.Round}
		for j := range st.payments {
			p := &st.payments[j]
			if p.PayerMemberID == rows[o.Payer].ID && p.RecipientMemberID == rows[o.Recipient].ID {
				out[i].payment = p
			}
		}
	}
	return out
}

func (st *state) slotCount() int {
	n := 0
	for _, m := range st.members {
		if st.takesPart(m) && int(m.SlotPosition) > n {
			n = int(m.SlotPosition)
		}
	}
	return n
}

func (st *state) currentRound(today time.Time) int {
	if !st.ekub.StartDate.Valid {
		return 0
	}
	return CurrentRound(st.ekub.StartDate.Time, today, string(st.ekub.Cadence))
}

// leaveBlocked says why the viewer can't leave now, or "" if they can.
// After the start: once every payment into and out of their pot is
// confirmed -- so not before their turn (ADR-024).
func (st *state) leaveBlocked(obs []obligation) string {
	if st.me.Role == db.GroupMemberRoleADMIN {
		return "The admin can't leave the ekub."
	}
	if st.ekub.Status == db.EkubStatusDRAFT || st.me.Status == db.GroupMemberStatusINVITED {
		return ""
	}
	var owe, owed int64
	var oweCount int
	for _, o := range obs {
		confirmed := o.payment != nil && o.payment.Status == db.EkubPaymentStatusCONFIRMED
		if confirmed {
			continue
		}
		if o.payer.ID == st.me.ID {
			owe += o.amount
			oweCount++
		}
		if o.recipient.ID == st.me.ID {
			owed += o.amount
		}
	}
	switch {
	case owed > 0:
		return "You can leave after your turn, once everything paid into your pot is confirmed and you've paid back everyone who paid into it."
	case owe > 0:
		people := "person"
		if oweCount != 1 {
			people = "people"
		}
		return fmt.Sprintf("You can leave once you've paid the %s you still owe to %d %s and they've confirmed it.",
			money.Format(owe, st.ekub.Currency), oweCount, people)
	}
	return ""
}

func (s *Service) Detail(ctx context.Context, userID, ekubID pgtype.UUID) (apitypes.EkubDetail, error) {
	st, err := s.load(ctx, ekubID, userID)
	if err != nil {
		return apitypes.EkubDetail{}, err
	}
	return s.toDetail(st), nil
}

func (s *Service) toDetail(st *state) apitypes.EkubDetail {
	obs := st.obligations()
	out := apitypes.EkubDetail{
		Ekub:         toEkub(st.ekub, st.me.Status, st.me.Role, 0),
		MyMemberID:   idutil.String(st.me.ID),
		CurrentRound: st.currentRound(s.today()),
		Members:      []apitypes.EkubMember{},
		Rounds:       []apitypes.EkubRound{},
		Obligations:  make([]apitypes.EkubObligation, len(obs)),
		Missed:       make([]apitypes.EkubMissedPayment, 0, len(st.missed)),
	}
	for _, m := range st.missed {
		round := 0
		if r := st.member(m.RecipientMemberID); r != nil {
			round = int(r.SlotPosition)
		}
		out.Missed = append(out.Missed, apitypes.EkubMissedPayment{
			PayerMemberID: idutil.String(m.PayerMemberID), RecipientMemberID: idutil.String(m.RecipientMemberID),
			Round: round,
		})
	}
	for _, m := range st.members {
		if m.Status == db.GroupMemberStatusLEFT && !st.takesPart(m) {
			continue
		}
		if st.takesPart(m) {
			out.MemberCount++
		}
		out.Members = append(out.Members, apitypes.EkubMember{
			ID: idutil.String(m.ID), UserID: idutil.String(m.UserID), DisplayName: m.DisplayName,
			Username: textPtr(m.Username), AvatarURL: textPtr(m.AvatarUrl),
			Role: string(m.Role), Status: string(m.Status), Amount: fmt.Sprint(m.Amount),
			SlotPosition: int(m.SlotPosition), JoinedRound: int(m.JoinedRound),
		})
	}
	pots := map[int]int64{}
	confirmed := map[int]int64{}
	for i, o := range obs {
		status := "DUE"
		var paymentID *string
		if o.payment != nil {
			status = string(o.payment.Status)
			id := idutil.String(o.payment.ID)
			paymentID = &id
			if o.payment.Status == db.EkubPaymentStatusCONFIRMED {
				confirmed[o.round] += o.amount
			}
		}
		pots[o.round] += o.amount
		out.Obligations[i] = apitypes.EkubObligation{
			PayerMemberID: idutil.String(o.payer.ID), RecipientMemberID: idutil.String(o.recipient.ID),
			Amount: fmt.Sprint(o.amount), Round: o.round, Status: status, PaymentID: paymentID,
		}
	}
	for r := 1; r <= st.slotCount(); r++ {
		round := apitypes.EkubRound{Round: r, MemberIDs: []string{}, Pot: fmt.Sprint(pots[r]), Confirmed: fmt.Sprint(confirmed[r])}
		if st.ekub.StartDate.Valid {
			due := DueDate(st.ekub.StartDate.Time, string(st.ekub.Cadence), r).Format("2006-01-02")
			round.DueDate = &due
		}
		for _, m := range st.members {
			if st.takesPart(m) && int(m.SlotPosition) == r {
				round.MemberIDs = append(round.MemberIDs, idutil.String(m.ID))
			}
		}
		out.Rounds = append(out.Rounds, round)
	}
	if why := st.leaveBlocked(obs); why != "" {
		out.LeaveBlockedWhy = &why
	} else {
		out.CanLeave = true
	}
	return out
}

func (s *Service) List(ctx context.Context, userID pgtype.UUID) ([]apitypes.Ekub, error) {
	rows, err := s.q.ListMyEkubs(ctx, userID)
	if err != nil {
		return nil, err
	}
	out := make([]apitypes.Ekub, len(rows))
	for i, r := range rows {
		out[i] = toEkub(r.Ekub, r.MyStatus, r.MyRole, int(r.MemberCount))
	}
	return out, nil
}

func (s *Service) requireFriend(ctx context.Context, userID, otherID pgtype.UUID) error {
	ok, err := s.friends.AreFriends(ctx, userID, otherID)
	if err != nil {
		return err
	}
	if !ok {
		return httpx.Conflict("NOT_FRIENDS", "You can only add friends to an ekub.")
	}
	return nil
}

func (s *Service) Create(ctx context.Context, userID pgtype.UUID, in apitypes.CreateEkubInput) (apitypes.EkubDetail, error) {
	type share struct {
		user   pgtype.UUID
		amount int64
		slot   int32
		joined int32
	}
	var shares []share
	creatorIn := false
	for i, slot := range in.Slots {
		if err := checkSlotSum(slot, in.ParsedSlotAmount, i+1, in.Currency); err != nil {
			return apitypes.EkubDetail{}, err
		}
		for _, sh := range slot {
			id, err := idutil.Parse(sh.ID)
			if err != nil {
				return apitypes.EkubDetail{}, httpx.BadRequest("VALIDATION_ERROR", "invalid user id")
			}
			if id == userID {
				creatorIn = true
			} else if err := s.requireFriend(ctx, userID, id); err != nil {
				return apitypes.EkubDetail{}, err
			}
			shares = append(shares, share{user: id, amount: sh.ParsedAmount, slot: int32(i + 1), joined: joinedOr1(sh.JoinedRound)})
		}
	}
	if !creatorIn {
		return apitypes.EkubDetail{}, httpx.BadRequest("CREATOR_NOT_IN_SLOT", "Put yourself in one of the slots too.")
	}

	currency := "ETB"
	if in.Currency != nil {
		currency = *in.Currency
	}
	ekub, err := s.q.CreateEkub(ctx, db.CreateEkubParams{
		Name: in.Name, Currency: currency, SlotAmount: in.ParsedSlotAmount,
		Cadence: db.EkubCadence(in.Cadence), CreatedByID: userID,
	})
	if err != nil {
		return apitypes.EkubDetail{}, err
	}
	var invited []pgtype.UUID
	for _, sh := range shares {
		role, status := db.GroupMemberRoleMEMBER, db.GroupMemberStatusINVITED
		if sh.user == userID {
			role, status = db.GroupMemberRoleADMIN, db.GroupMemberStatusACTIVE
		} else {
			invited = append(invited, sh.user)
		}
		if _, err := s.q.CreateEkubMember(ctx, db.CreateEkubMemberParams{
			EkubID: ekub.ID, UserID: sh.user, Role: role, Status: status, Amount: sh.amount, SlotPosition: sh.slot,
			JoinedRound: sh.joined,
		}); err != nil {
			return apitypes.EkubDetail{}, err
		}
	}
	if err := s.notifications.NotifyManyLink(ctx, invited, notifications.TypeEkubInvitation,
		"Ekub invitation", fmt.Sprintf("You've been invited to join the ekub %q.", ekub.Name), link(ekub.ID)); err != nil {
		return apitypes.EkubDetail{}, err
	}
	return s.Detail(ctx, userID, ekub.ID)
}

func checkSlotSum(slot []apitypes.EkubShareInput, slotAmount int64, round int, currency *string) error {
	var sum int64
	for _, sh := range slot {
		sum += sh.ParsedAmount
	}
	if sum != slotAmount {
		code := "ETB"
		if currency != nil {
			code = *currency
		}
		return httpx.BadRequest("SLOT_AMOUNT_MISMATCH", fmt.Sprintf(
			"Turn %d adds up to %s; each turn must add up to %s.", round, money.Format(sum, code), money.Format(slotAmount, code)))
	}
	return nil
}

// UpdateSlots rearranges the turns. Before the start anything goes
// (start checks the sums). After it only turns still to come can move,
// as whole turns: who shares a turn and what each puts in stay fixed.
func (s *Service) UpdateSlots(ctx context.Context, userID, ekubID pgtype.UUID, in apitypes.UpdateEkubSlotsInput) (apitypes.EkubDetail, error) {
	st, err := s.loadAsAdmin(ctx, ekubID, userID)
	if err != nil {
		return apitypes.EkubDetail{}, err
	}
	params := db.SetEkubSlotsParams{EkubID: ekubID}
	placed := map[pgtype.UUID]bool{}
	current := st.currentRound(s.today())
	for i, slot := range in.Slots {
		pos := int32(i + 1)
		var oldPos int32 = -1
		for _, sh := range slot {
			id, err := idutil.Parse(sh.ID)
			m := st.member(id)
			if err != nil || m == nil || !st.takesPart(*m) {
				return apitypes.EkubDetail{}, httpx.BadRequest("UNKNOWN_MEMBER", "Every share must be someone in this ekub.")
			}
			placed[id] = true
			amount := sh.ParsedAmount
			joined := m.JoinedRound
			if sh.JoinedRound != nil {
				if st.ekub.Status == db.EkubStatusACTIVE && int32(*sh.JoinedRound) != m.JoinedRound {
					return apitypes.EkubDetail{}, httpx.Conflict("EKUB_STARTED", "When someone joined can't change once the ekub has started.")
				}
				joined = int32(*sh.JoinedRound)
			}
			if st.ekub.Status == db.EkubStatusACTIVE {
				if amount != m.Amount {
					return apitypes.EkubDetail{}, httpx.Conflict("EKUB_STARTED", "Amounts can't change once the ekub has started.")
				}
				if oldPos == -1 {
					oldPos = m.SlotPosition
				}
				if m.SlotPosition != oldPos {
					return apitypes.EkubDetail{}, httpx.Conflict("EKUB_STARTED", "Once the ekub has started, turns can only change places, not who shares them.")
				}
				locked := int(m.SlotPosition) < current || int(pos) < current
				if locked && m.SlotPosition != pos {
					return apitypes.EkubDetail{}, httpx.Conflict("ROUND_OVER", "Turns that are already over can't move.")
				}
			}
			params.MemberIds = append(params.MemberIds, id)
			params.SlotPositions = append(params.SlotPositions, pos)
			params.Amounts = append(params.Amounts, amount)
			params.JoinedRounds = append(params.JoinedRounds, joined)
		}
	}
	for _, m := range st.members {
		if st.takesPart(m) && !placed[m.ID] {
			return apitypes.EkubDetail{}, httpx.BadRequest("MEMBER_MISSING", fmt.Sprintf("%s isn't in any turn.", m.DisplayName))
		}
	}
	if st.ekub.Status == db.EkubStatusACTIVE {
		// Whole turns only: every old turn must come back with the same people.
		count := map[int32]int{}
		for _, m := range st.members {
			if st.takesPart(m) {
				count[m.SlotPosition]++
			}
		}
		for _, slot := range in.Slots {
			id, _ := idutil.Parse(slot[0].ID)
			if count[st.member(id).SlotPosition] != len(slot) {
				return apitypes.EkubDetail{}, httpx.Conflict("EKUB_STARTED", "Once the ekub has started, turns can only change places, not who shares them.")
			}
		}
	}
	if err := s.q.SetEkubSlots(ctx, params); err != nil {
		return apitypes.EkubDetail{}, err
	}
	return s.Detail(ctx, userID, ekubID)
}

func (s *Service) Start(ctx context.Context, userID, ekubID pgtype.UUID, in apitypes.StartEkubInput) (apitypes.EkubDetail, error) {
	st, err := s.loadAsAdmin(ctx, ekubID, userID)
	if err != nil {
		return apitypes.EkubDetail{}, err
	}
	if st.ekub.Status != db.EkubStatusDRAFT {
		return apitypes.EkubDetail{}, httpx.Conflict("EKUB_STARTED", "This ekub has already started.")
	}
	sums := map[int32]int64{}
	var others []pgtype.UUID
	for _, m := range st.members {
		if m.Status == db.GroupMemberStatusINVITED {
			return apitypes.EkubDetail{}, httpx.Conflict("INVITES_PENDING", fmt.Sprintf(
				"%s hasn't accepted yet. Wait for them, or take them out first.", m.DisplayName))
		}
		if m.Status == db.GroupMemberStatusACTIVE {
			if m.JoinedRound > m.SlotPosition {
				return apitypes.EkubDetail{}, httpx.Conflict("JOINED_AFTER_TURN", fmt.Sprintf(
					"%s joined in round %d but their turn is %d; nobody can take the pot before joining.",
					m.DisplayName, m.JoinedRound, m.SlotPosition))
			}
			sums[m.SlotPosition] += m.Amount
			if m.UserID != userID {
				others = append(others, m.UserID)
			}
		}
	}
	n := st.slotCount()
	if n < 2 {
		return apitypes.EkubDetail{}, httpx.Conflict("TOO_FEW_TURNS", "An ekub needs at least two turns.")
	}
	for r := int32(1); r <= int32(n); r++ {
		if sums[r] != st.ekub.SlotAmount {
			return apitypes.EkubDetail{}, httpx.Conflict("SLOT_AMOUNT_MISMATCH", fmt.Sprintf(
				"Turn %d adds up to %s; each turn must add up to %s.", r,
				money.Format(sums[r], st.ekub.Currency), money.Format(st.ekub.SlotAmount, st.ekub.Currency)))
		}
	}
	current := CurrentRound(in.ParsedStartDate, s.today(), string(st.ekub.Cadence))
	missed, err := st.missedPayments(in.Missed, current)
	if err != nil {
		return apitypes.EkubDetail{}, err
	}
	if _, err := s.q.StartEkub(ctx, db.StartEkubParams{
		ID: ekubID, StartDate: pgtype.Date{Time: in.ParsedStartDate, Valid: true},
	}); err != nil {
		return apitypes.EkubDetail{}, err
	}
	// Missed payments first, so recording the rest as paid leaves out
	// the pairs who now skip each other.
	for _, o := range missed {
		if err := s.q.CreateEkubMissedPayment(ctx, db.CreateEkubMissedPaymentParams{
			EkubID: ekubID, PayerMemberID: o.payer.ID, RecipientMemberID: o.recipient.ID, CreatedByID: userID,
		}); err != nil {
			return apitypes.EkubDetail{}, err
		}
	}
	if in.PastPaid {
		if err := s.recordPastPaid(ctx, userID, ekubID); err != nil {
			return apitypes.EkubDetail{}, err
		}
	}
	// A start date in the past enters an ekub that was already running:
	// say which round is due next, not when the first one was.
	due := DueDate(in.ParsedStartDate, string(st.ekub.Cadence), current)
	body := fmt.Sprintf("%q has started. The first pot is due %s.", st.ekub.Name, due.Format("2 Jan 2006"))
	if current > 1 {
		body = fmt.Sprintf("%q is now tracked in ABRO. Round %d is due %s.", st.ekub.Name, current, due.Format("2 Jan 2006"))
	}
	if err := s.notifications.NotifyManyLink(ctx, others, notifications.TypeEkubPayment, "Ekub started",
		body, link(ekubID)); err != nil {
		return apitypes.EkubDetail{}, err
	}
	return s.Detail(ctx, userID, ekubID)
}

// missedPayments checks the missed payments given at the start: each
// must be a payment the schedule expects in a round already over.
func (st *state) missedPayments(refs []apitypes.EkubMissedPaymentRef, current int) ([]obligation, error) {
	obs := st.obligations()
	out := make([]obligation, 0, len(refs))
	for _, ref := range refs {
		payer, err1 := idutil.Parse(ref.PayerMemberID)
		recipient, err2 := idutil.Parse(ref.RecipientMemberID)
		found := false
		if err1 == nil && err2 == nil {
			for _, o := range obs {
				if o.payer.ID == payer && o.recipient.ID == recipient && o.round < current {
					out = append(out, o)
					found = true
					break
				}
			}
		}
		if !found {
			return nil, httpx.BadRequest("NOT_A_PAST_PAYMENT",
				"A missed payment must be one of the payments of a round that's already over.")
		}
	}
	return out, nil
}

// recordPastPaid enters an ekub that was already running: every payment
// of the rounds already over is recorded as made, by the admin who
// entered the history, so the app tracks from the round now collecting.
func (s *Service) recordPastPaid(ctx context.Context, userID, ekubID pgtype.UUID) error {
	st, err := s.load(ctx, ekubID, userID)
	if err != nil {
		return err
	}
	current := st.currentRound(s.today())
	for _, o := range st.obligations() {
		if o.round >= current || o.payment != nil {
			continue
		}
		if _, err := s.q.CreateEkubPayment(ctx, db.CreateEkubPaymentParams{
			EkubID: ekubID, PayerMemberID: o.payer.ID, RecipientMemberID: o.recipient.ID,
			Amount: o.amount, Status: db.EkubPaymentStatusCONFIRMED, CreatedByID: userID,
		}); err != nil {
			return err
		}
	}
	return nil
}

func joinedOr1(j *int) int32 {
	if j == nil {
		return 1
	}
	return int32(*j)
}

// AddMember invites a friend. Before the start they get the part and
// turn given; after it, a full turn of their own from the round now
// collecting at the earliest, placed when they accept.
func (s *Service) AddMember(ctx context.Context, userID, ekubID pgtype.UUID, in apitypes.AddEkubMemberInput) (apitypes.EkubDetail, error) {
	st, err := s.loadAsAdmin(ctx, ekubID, userID)
	if err != nil {
		return apitypes.EkubDetail{}, err
	}
	otherID, err := idutil.Parse(in.UserID)
	if err != nil {
		return apitypes.EkubDetail{}, httpx.BadRequest("VALIDATION_ERROR", "invalid userId")
	}
	if err := s.requireFriend(ctx, userID, otherID); err != nil {
		return apitypes.EkubDetail{}, err
	}
	if existing, err := s.q.GetEkubMemberByUser(ctx, db.GetEkubMemberByUserParams{EkubID: ekubID, UserID: otherID}); err == nil {
		if existing.Status != db.GroupMemberStatusLEFT {
			return apitypes.EkubDetail{}, httpx.Conflict("ALREADY_MEMBER", "They're already in this ekub.")
		}
		return apitypes.EkubDetail{}, httpx.Conflict("LEFT_EKUB", "They left this ekub and can't rejoin it.")
	} else if !errors.Is(err, pgx.ErrNoRows) {
		return apitypes.EkubDetail{}, err
	}

	last := st.slotCount()
	position := last + 1
	if in.Position != nil && *in.Position <= last+1 {
		position = *in.Position
	}
	amount := st.ekub.SlotAmount
	// After the start, the round they join is set when they accept.
	joined := int32(1)
	if st.ekub.Status == db.EkubStatusDRAFT {
		if in.Amount != nil {
			amount = in.ParsedAmount
		}
		joined = joinedOr1(in.JoinedRound)
	} else {
		if st.currentRound(s.today()) > last {
			return apitypes.EkubDetail{}, httpx.Conflict("EKUB_FINISHED", "Every turn in this ekub is over.")
		}
		if in.Amount != nil && in.ParsedAmount != st.ekub.SlotAmount {
			return apitypes.EkubDetail{}, httpx.Conflict("EKUB_STARTED", "Someone joining after the start takes a full turn of their own.")
		}
	}
	if _, err := s.q.CreateEkubMember(ctx, db.CreateEkubMemberParams{
		EkubID: ekubID, UserID: otherID, Role: db.GroupMemberRoleMEMBER, Status: db.GroupMemberStatusINVITED,
		Amount: amount, SlotPosition: int32(position), JoinedRound: joined,
	}); err != nil {
		return apitypes.EkubDetail{}, err
	}
	if _, err := s.notifications.NotifyLink(ctx, otherID, notifications.TypeEkubInvitation, "Ekub invitation",
		fmt.Sprintf("You've been invited to join the ekub %q.", st.ekub.Name), link(ekubID)); err != nil {
		return apitypes.EkubDetail{}, err
	}
	return s.Detail(ctx, userID, ekubID)
}

// Accept takes up an invitation. Joining a started ekub: they put in
// from the round now collecting, and their turn goes in where the admin
// asked or that round, whichever is later; later turns move back one.
func (s *Service) Accept(ctx context.Context, userID, ekubID pgtype.UUID) (apitypes.EkubDetail, error) {
	st, err := s.load(ctx, ekubID, userID)
	if err != nil {
		return apitypes.EkubDetail{}, err
	}
	if st.me.Status != db.GroupMemberStatusINVITED {
		return apitypes.EkubDetail{}, httpx.Conflict("NOT_INVITED", "You're already in this ekub.")
	}
	if st.ekub.Status == db.EkubStatusDRAFT {
		if _, err := s.q.SetEkubMemberStatus(ctx, db.SetEkubMemberStatusParams{ID: st.me.ID, Status: db.GroupMemberStatusACTIVE}); err != nil {
			return apitypes.EkubDetail{}, err
		}
	} else {
		current := st.currentRound(s.today())
		last := st.slotCount()
		if current > last {
			return apitypes.EkubDetail{}, httpx.Conflict("EKUB_FINISHED", "Every turn in this ekub is over.")
		}
		position := min(max(int(st.me.SlotPosition), current), last+1)
		if _, err := s.q.JoinStartedEkub(ctx, db.JoinStartedEkubParams{
			EkubID: ekubID, MemberID: st.me.ID, SlotPosition: int32(position), JoinedRound: int32(current),
		}); err != nil {
			return apitypes.EkubDetail{}, err
		}
	}
	if _, err := s.notifications.NotifyLink(ctx, st.ekub.CreatedByID, notifications.TypeEkubInvitation, "Ekub invitation accepted",
		fmt.Sprintf("%s joined the ekub %q.", st.me.DisplayName, st.ekub.Name), link(ekubID)); err != nil {
		return apitypes.EkubDetail{}, err
	}
	return s.Detail(ctx, userID, ekubID)
}

// Leave: an invitation is declined, a member before the start just goes,
// and after the start only once leaveBlocked has nothing to say.
func (s *Service) Leave(ctx context.Context, userID, ekubID pgtype.UUID) error {
	st, err := s.load(ctx, ekubID, userID)
	if err != nil {
		return err
	}
	if why := st.leaveBlocked(st.obligations()); why != "" {
		return httpx.Conflict("CANNOT_LEAVE", why)
	}
	if st.me.Status == db.GroupMemberStatusINVITED || st.ekub.Status == db.EkubStatusDRAFT {
		if err := s.q.DeleteEkubMember(ctx, st.me.ID); err != nil {
			return err
		}
		return s.closeGaps(ctx, st, st.me.ID)
	}
	_, err = s.q.SetEkubMemberStatus(ctx, db.SetEkubMemberStatusParams{ID: st.me.ID, Status: db.GroupMemberStatusLEFT})
	return err
}

// RemoveMember: the admin takes out someone invited, or anyone before
// the start. After it, a member leaves only by clearing (Leave).
func (s *Service) RemoveMember(ctx context.Context, userID, ekubID, memberID pgtype.UUID) (apitypes.EkubDetail, error) {
	st, err := s.loadAsAdmin(ctx, ekubID, userID)
	if err != nil {
		return apitypes.EkubDetail{}, err
	}
	m := st.member(memberID)
	if m == nil || m.Status == db.GroupMemberStatusLEFT {
		return apitypes.EkubDetail{}, httpx.NotFound("MEMBER_NOT_FOUND", "No such member.")
	}
	if m.ID == st.me.ID {
		return apitypes.EkubDetail{}, httpx.Conflict("CANNOT_REMOVE_SELF", "The admin can't remove themselves.")
	}
	if st.ekub.Status == db.EkubStatusACTIVE && m.Status != db.GroupMemberStatusINVITED {
		return apitypes.EkubDetail{}, httpx.Conflict("EKUB_STARTED", "Once the ekub has started, members leave by clearing what they owe.")
	}
	if err := s.q.DeleteEkubMember(ctx, memberID); err != nil {
		return apitypes.EkubDetail{}, err
	}
	if err := s.closeGaps(ctx, st, memberID); err != nil {
		return apitypes.EkubDetail{}, err
	}
	return s.Detail(ctx, userID, ekubID)
}

// closeGaps renumbers the turns after `gone` was taken out, so a turn
// left empty doesn't stay as a hole in the order.
func (s *Service) closeGaps(ctx context.Context, st *state, gone pgtype.UUID) error {
	used := map[int32]bool{}
	for _, m := range st.members {
		if m.ID != gone && st.takesPart(m) {
			used[m.SlotPosition] = true
		}
	}
	params := db.SetEkubSlotsParams{EkubID: st.ekub.ID}
	for _, m := range st.members {
		if m.ID == gone || !st.takesPart(m) {
			continue
		}
		pos := int32(0)
		for p := range m.SlotPosition + 1 {
			if used[p] {
				pos++
			}
		}
		if pos != m.SlotPosition {
			params.MemberIds = append(params.MemberIds, m.ID)
			params.SlotPositions = append(params.SlotPositions, pos)
			params.Amounts = append(params.Amounts, m.Amount)
			params.JoinedRounds = append(params.JoinedRounds, m.JoinedRound)
		}
	}
	if len(params.MemberIds) == 0 {
		return nil
	}
	return s.q.SetEkubSlots(ctx, params)
}

// Delete removes an ekub that hasn't started. Started ones keep their
// record.
func (s *Service) Delete(ctx context.Context, userID, ekubID pgtype.UUID) error {
	st, err := s.loadAsAdmin(ctx, ekubID, userID)
	if err != nil {
		return err
	}
	if st.ekub.Status != db.EkubStatusDRAFT {
		return httpx.Conflict("EKUB_STARTED", "An ekub that has started can't be deleted.")
	}
	return s.q.DeleteEkub(ctx, ekubID)
}

// RecordPayment: the payer says they paid memberId (PAID; waits for them
// to confirm), or the person paid says memberId paid them (RECEIVED;
// counts at once, as with settlements, ADR-019). Paying ahead of the
// round is fine.
func (s *Service) RecordPayment(ctx context.Context, userID, ekubID pgtype.UUID, in apitypes.RecordEkubPaymentInput) (apitypes.EkubDetail, error) {
	st, err := s.load(ctx, ekubID, userID)
	if err != nil {
		return apitypes.EkubDetail{}, err
	}
	if st.ekub.Status != db.EkubStatusACTIVE || st.me.Status != db.GroupMemberStatusACTIVE {
		return apitypes.EkubDetail{}, httpx.Conflict("EKUB_NOT_ACTIVE", "Payments start once the ekub has started.")
	}
	otherID, err := idutil.Parse(in.MemberID)
	if err != nil {
		return apitypes.EkubDetail{}, httpx.BadRequest("VALIDATION_ERROR", "invalid memberId")
	}
	payerID, recipientID := st.me.ID, otherID
	if in.Direction == "RECEIVED" {
		payerID, recipientID = otherID, st.me.ID
	}
	var found *obligation
	for _, o := range st.obligations() {
		if o.payer.ID == payerID && o.recipient.ID == recipientID {
			found = &o
			break
		}
	}
	if found == nil {
		return apitypes.EkubDetail{}, httpx.Conflict("NO_PAYMENT_DUE", "Nothing is due between you two in this ekub.")
	}
	if found.payment != nil {
		return apitypes.EkubDetail{}, httpx.Conflict("ALREADY_RECORDED", "That payment is already recorded.")
	}
	status := db.EkubPaymentStatusPENDING
	if found.recipient.ID == st.me.ID {
		status = db.EkubPaymentStatusCONFIRMED
	}
	if _, err := s.q.CreateEkubPayment(ctx, db.CreateEkubPaymentParams{
		EkubID: ekubID, PayerMemberID: found.payer.ID, RecipientMemberID: found.recipient.ID,
		Amount: found.amount, Status: status, CreatedByID: userID,
	}); err != nil {
		return apitypes.EkubDetail{}, err
	}
	amount := money.Format(found.amount, st.ekub.Currency)
	if status == db.EkubPaymentStatusPENDING {
		_, err = s.notifications.NotifyLink(ctx, found.recipient.UserID, notifications.TypeEkubPayment, "Ekub payment to confirm",
			fmt.Sprintf("%s says they paid you %s for %q. Confirm it once you have it.", st.me.DisplayName, amount, st.ekub.Name), link(ekubID))
	} else {
		_, err = s.notifications.NotifyLink(ctx, found.payer.UserID, notifications.TypeEkubPayment, "Ekub payment confirmed",
			fmt.Sprintf("%s confirmed your %s for %q.", st.me.DisplayName, amount, st.ekub.Name), link(ekubID))
	}
	if err != nil {
		return apitypes.EkubDetail{}, err
	}
	return s.Detail(ctx, userID, ekubID)
}

// ResolvePayment: the person paid confirms a payment or says they didn't
// get it. A refused one goes away and the payer can record it again.
func (s *Service) ResolvePayment(ctx context.Context, userID, ekubID, paymentID pgtype.UUID, confirm bool) (apitypes.EkubDetail, error) {
	st, err := s.load(ctx, ekubID, userID)
	if err != nil {
		return apitypes.EkubDetail{}, err
	}
	payment, err := s.q.GetEkubPayment(ctx, db.GetEkubPaymentParams{ID: paymentID, EkubID: ekubID})
	if errors.Is(err, pgx.ErrNoRows) {
		return apitypes.EkubDetail{}, httpx.NotFound("PAYMENT_NOT_FOUND", "No such payment.")
	}
	if err != nil {
		return apitypes.EkubDetail{}, err
	}
	if payment.RecipientMemberID != st.me.ID {
		return apitypes.EkubDetail{}, httpx.Forbidden("NOT_RECIPIENT", "Only the person paid can confirm a payment.")
	}
	status := db.EkubPaymentStatusREJECTED
	if confirm {
		status = db.EkubPaymentStatusCONFIRMED
	}
	if _, err := s.q.ResolveEkubPayment(ctx, db.ResolveEkubPaymentParams{ID: paymentID, Status: status}); errors.Is(err, pgx.ErrNoRows) {
		return apitypes.EkubDetail{}, httpx.Conflict("ALREADY_RESOLVED", "That payment was already answered.")
	} else if err != nil {
		return apitypes.EkubDetail{}, err
	}
	if payer := st.member(payment.PayerMemberID); payer != nil {
		amount := money.Format(payment.Amount, st.ekub.Currency)
		title, body := "Ekub payment confirmed", fmt.Sprintf("%s confirmed your %s for %q.", st.me.DisplayName, amount, st.ekub.Name)
		if !confirm {
			title, body = "Ekub payment not received", fmt.Sprintf("%s says they didn't get your %s for %q.", st.me.DisplayName, amount, st.ekub.Name)
		}
		if _, err := s.notifications.NotifyLink(ctx, payer.UserID, notifications.TypeEkubPayment, title, body, link(ekubID)); err != nil {
			return apitypes.EkubDetail{}, err
		}
	}
	return s.Detail(ctx, userID, ekubID)
}

func toEkub(e db.Ekub, myStatus db.GroupMemberStatus, myRole db.GroupMemberRole, memberCount int) apitypes.Ekub {
	out := apitypes.Ekub{
		ID: idutil.String(e.ID), Name: e.Name, Currency: e.Currency, SlotAmount: fmt.Sprint(e.SlotAmount),
		Cadence: string(e.Cadence), Status: string(e.Status), CreatedByID: idutil.String(e.CreatedByID),
		MyStatus: string(myStatus), MyRole: string(myRole), MemberCount: memberCount,
	}
	if e.StartDate.Valid {
		d := e.StartDate.Time.Format("2006-01-02")
		out.StartDate = &d
	}
	return out
}

func textPtr(t pgtype.Text) *string {
	if !t.Valid {
		return nil
	}
	return &t.String
}

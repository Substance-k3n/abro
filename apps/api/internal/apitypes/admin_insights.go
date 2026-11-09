package apitypes

import "time"

// Admin portal overview and groups (ADR-028). App-wide numbers
// only; the one money figure is total spending per currency across the
// whole app (minor units as strings, like every amount on the wire).

type AdminOverview struct {
	RangeDays int       `json:"rangeDays"`
	Since     time.Time `json:"since"`
	Users     struct {
		Total     int64 `json:"total"`
		New       int64 `json:"new"`
		Active    int64 `json:"active"`
		Suspended int64 `json:"suspended"`
	} `json:"users"`
	Groups struct {
		Total int64 `json:"total"`
		New   int64 `json:"new"`
	} `json:"groups"`
	Activity struct {
		Expenses    int64 `json:"expenses"`
		Settlements int64 `json:"settlements"`
	} `json:"activity"`
	// Queue is what may need someone's attention, whatever the range.
	// Stale = waiting over 7 days.
	Queue struct {
		OpenDisputes         int64 `json:"openDisputes"`
		PendingConfirmations int64 `json:"pendingConfirmations"`
		StaleConfirmations   int64 `json:"staleConfirmations"`
		PendingInvites       int64 `json:"pendingInvites"`
		StaleInvites         int64 `json:"staleInvites"`
	} `json:"queue"`
	Series     []AdminDay           `json:"series"`
	Categories []AdminCategoryCount `json:"categories"`
	Volume     []AdminVolume        `json:"volume"`
	GroupTypes []AdminGroupType     `json:"groupTypes"`
}

type AdminDay struct {
	// Day is an Addis Ababa calendar day, YYYY-MM-DD.
	Day         string `json:"day"`
	Signups     int64  `json:"signups"`
	Expenses    int64  `json:"expenses"`
	Settlements int64  `json:"settlements"`
}

type AdminCategoryCount struct {
	Category string `json:"category"`
	Expenses int64  `json:"expenses"`
}

type AdminVolume struct {
	Currency string `json:"currency"`
	Total    string `json:"total"`
	Expenses int64  `json:"expenses"`
}

type AdminGroupType struct {
	Type   string `json:"type"`
	Groups int64  `json:"groups"`
}

type AdminGroupSummary struct {
	ID             string     `json:"id"`
	Name           string     `json:"name"`
	Type           string     `json:"type"`
	Currency       string     `json:"currency"`
	CreatedAt      time.Time  `json:"createdAt"`
	DeletedAt      *time.Time `json:"deletedAt"`
	CreatorID      string     `json:"creatorId"`
	CreatorName    string     `json:"creatorName"`
	MemberCount    int64      `json:"memberCount"`
	InvitedCount   int64      `json:"invitedCount"`
	ExpenseCount   int64      `json:"expenseCount"`
	LastActivityAt *time.Time `json:"lastActivityAt"`
}

type AdminGroupPage struct {
	Groups   []AdminGroupSummary `json:"groups"`
	Total    int64               `json:"total"`
	Page     int                 `json:"page"`
	PageSize int                 `json:"pageSize"`
}

type AdminGroupMember struct {
	UserID      string     `json:"userId"`
	DisplayName string     `json:"displayName"`
	Email       *string    `json:"email"`
	Username    *string    `json:"username"`
	AvatarURL   *string    `json:"avatarUrl"`
	SuspendedAt *time.Time `json:"suspendedAt"`
	Role        string     `json:"role"`
	Status      string     `json:"status"`
	JoinedAt    time.Time  `json:"joinedAt"`
}

// AdminGroupDetail is GET /admin/groups/{id}: who's in it and how busy it
// is -- no balances, expense names or amounts.
type AdminGroupDetail struct {
	ID              string             `json:"id"`
	Name            string             `json:"name"`
	Type            string             `json:"type"`
	Currency        string             `json:"currency"`
	Description     *string            `json:"description"`
	CreatedAt       time.Time          `json:"createdAt"`
	DeletedAt       *time.Time         `json:"deletedAt"`
	CreatorID       string             `json:"creatorId"`
	CreatorName     string             `json:"creatorName"`
	ExpenseCount    int64              `json:"expenseCount"`
	SettlementCount int64              `json:"settlementCount"`
	LastActivityAt  *time.Time         `json:"lastActivityAt"`
	Members         []AdminGroupMember `json:"members"`
}

package apitypes

// CategoryAmount / MonthlySpending / GroupSpending / MonthlyAnalytics /
// YearlyAnalytics mirror packages/types' analytics.ts response shapes.
// Amounts are wire strings, same convention as everywhere else.

type CategoryAmount struct {
	Category string `json:"category"`
	Amount   string `json:"amount"`
}

type MonthlySpending struct {
	Month         int    `json:"month"`
	TotalSpending string `json:"totalSpending"`
}

type GroupSpending struct {
	GroupID       string `json:"groupId"`
	GroupName     string `json:"groupName"`
	TotalSpending string `json:"totalSpending"`
}

type SettlementsSummary struct {
	Paid     string `json:"paid"`
	Received string `json:"received"`
}

type MonthlyAnalytics struct {
	Year              int                `json:"year"`
	Month             int                `json:"month"`
	TotalSpending     string             `json:"totalSpending"`
	YourContribution  string             `json:"yourContribution"`
	YourShare         string             `json:"yourShare"`
	NetPosition       string             `json:"netPosition"`
	AmountOwed        string             `json:"amountOwed"`
	AmountReceived    string             `json:"amountReceived"`
	Settlements       SettlementsSummary `json:"settlements"`
	CategoryBreakdown []CategoryAmount   `json:"categoryBreakdown"`
}

type YearlyAnalytics struct {
	Year                 int               `json:"year"`
	YearlyTotal          string            `json:"yearlyTotal"`
	MonthlyTrend         []MonthlySpending `json:"monthlyTrend"`
	CategoryDistribution []CategoryAmount  `json:"categoryDistribution"`
	GroupSpending        []GroupSpending   `json:"groupSpending"`
	PersonalContribution string            `json:"personalContribution"`
}

// GroupMemberSpending is one person's part in a group's spending: what
// they paid for its expenses and what their share of them was.
type GroupMemberSpending struct {
	UserID string `json:"userId"`
	Paid   string `json:"paid"`
	Share  string `json:"share"`
}

// GroupMonthSpending is one calendar month (UTC) of a group's spending.
type GroupMonthSpending struct {
	Year          int    `json:"year"`
	Month         int    `json:"month"`
	TotalSpending string `json:"totalSpending"`
}

// GroupStats is GET /analytics/groups/{id}: one group's spending over its
// whole life (settlements excluded, reported only as SettledTotal), with
// the last GroupStatsMonths calendar months as a trend, oldest first.
type GroupStats struct {
	GroupID      string                `json:"groupId"`
	TotalSpent   string                `json:"totalSpent"`
	ExpenseCount int                   `json:"expenseCount"`
	SettledTotal string                `json:"settledTotal"`
	Members      []GroupMemberSpending `json:"members"`
	Categories   []CategoryAmount      `json:"categories"`
	MonthlyTrend []GroupMonthSpending  `json:"monthlyTrend"`
}

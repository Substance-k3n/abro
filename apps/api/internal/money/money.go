// Package money implements ABRO_PRD.md §8.3/§28: amounts are always an
// integer in the smallest currency unit (minor units) — e.g. 100.50 ETB is
// stored as 10050. Never a float past the point it's rendered for display.
//
// This is the Go port of packages/types/src/money.ts (see docs/DECISIONS.md
// ADR-007) — the arithmetic and remainder-distribution rules must match
// exactly, since both apps/web (TypeScript) and this API now compute the
// same "never trust client-calculated balances" guarantees independently.
package money

import "fmt"

// MinorUnits is an amount in the smallest unit of its currency (cents,
// santim, etc). int64 is sufficient range for any realistic ETB-scale
// expense and maps directly onto Postgres BIGINT via pgx, with no
// JSON-precision shim needed (unlike JS bigint, which isn't JSON-safe).
type MinorUnits = int64

func Add(a, b MinorUnits) MinorUnits { return a + b }

func Subtract(a, b MinorUnits) MinorUnits { return a - b }

func Negate(a MinorUnits) MinorUnits { return -a }

func IsZero(a MinorUnits) bool { return a == 0 }

func IsPositive(a MinorUnits) bool { return a > 0 }

func IsNegative(a MinorUnits) bool { return a < 0 }

func Abs(a MinorUnits) MinorUnits {
	if a < 0 {
		return -a
	}
	return a
}

func Sum(amounts []MinorUnits) MinorUnits {
	var total MinorUnits
	for _, a := range amounts {
		total += a
	}
	return total
}

// SplitEqually splits total evenly across parts shares, distributing any
// leftover minor units deterministically (one extra unit each, starting
// from the first participant) so Sum(result) == total always holds exactly.
//
// ABRO_PRD.md §14: "If division creates a remainder, the remainder must be
// distributed deterministically while preserving the total."
func SplitEqually(total MinorUnits, parts int) ([]MinorUnits, error) {
	if parts <= 0 {
		return nil, fmt.Errorf("splitEqually requires at least one participant")
	}

	base := total / MinorUnits(parts)
	remainder := total % MinorUnits(parts)

	result := make([]MinorUnits, parts)
	for i := 0; i < parts; i++ {
		if MinorUnits(i) < remainder {
			result[i] = base + 1
		} else {
			result[i] = base
		}
	}
	return result, nil
}

// SplitByWeights splits total proportionally by weights (shares, or basis
// points for a percentage split), distributing any leftover minor units
// deterministically (one extra unit each, starting from the first
// participant) so Sum(result) == total always holds exactly — same
// guarantee as SplitEqually, generalized to non-equal ratios.
// ABRO_PRD.md §14 (Shares, Percentage).
func SplitByWeights(total MinorUnits, weights []MinorUnits) ([]MinorUnits, error) {
	if len(weights) == 0 {
		return nil, fmt.Errorf("splitByWeights requires at least one participant")
	}

	var totalWeight MinorUnits
	for _, w := range weights {
		totalWeight += w
	}
	if totalWeight <= 0 {
		return nil, fmt.Errorf("splitByWeights requires a positive total weight")
	}

	bases := make([]MinorUnits, len(weights))
	for i, w := range weights {
		bases[i] = (total * w) / totalWeight
	}
	remainder := total - Sum(bases)

	result := make([]MinorUnits, len(weights))
	for i, base := range bases {
		if remainder > 0 {
			remainder--
			result[i] = base + 1
		} else {
			result[i] = base
		}
	}
	return result, nil
}

// CurrencyMeta describes a currency's display formatting.
type CurrencyMeta struct {
	Code          string
	Symbol        string
	NativeSymbol  string
	DecimalDigits int
}

// ETB is the default currency per ABRO_PRD.md §27; the architecture stays
// multi-currency capable.
var ETB = CurrencyMeta{
	Code:          "ETB",
	Symbol:        "Br",
	NativeSymbol:  "ብር",
	DecimalDigits: 2,
}

// ToDecimal converts minor units back to a decimal number for display only.
func ToDecimal(amount MinorUnits, decimalDigits int) float64 {
	factor := pow10(decimalDigits)
	return float64(amount) / factor
}

func pow10(n int) float64 {
	result := 1.0
	for i := 0; i < n; i++ {
		result *= 10
	}
	return result
}

// FormatMoney renders amount using currency's decimal digits, e.g. "100.50 ETB".
func FormatMoney(amount MinorUnits, currency CurrencyMeta) string {
	decimal := ToDecimal(amount, currency.DecimalDigits)
	return fmt.Sprintf("%.*f %s", currency.DecimalDigits, decimal, currency.Code)
}

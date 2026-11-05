package money

import (
	"math/rand"
	"reflect"
	"testing"
)

func tx(from, to string, amount MinorUnits) SimplifiedTransaction {
	return SimplifiedTransaction{FromUserID: from, ToUserID: to, Amount: amount}
}

func nets(debts []SimplifiedTransaction) map[string]MinorUnits {
	out := map[string]MinorUnits{}
	for _, d := range debts {
		out[d.FromUserID] -= d.Amount
		out[d.ToUserID] += d.Amount
	}
	for k, v := range out {
		if v == 0 {
			delete(out, k)
		}
	}
	return out
}

func TestCancelCycles(t *testing.T) {
	cases := []struct {
		name string
		in   []SimplifiedTransaction
		want []SimplifiedTransaction
	}{
		{
			// The user's case after C pays B 1000 for A (ADR-029): A owes B,
			// C owes A, and C's payment to B reads as B owing C.
			"the paid shortcut leaves nothing",
			[]SimplifiedTransaction{tx("A", "B", 1000), tx("C", "A", 1000), tx("B", "C", 1000)},
			[]SimplifiedTransaction{},
		},
		{
			"no cycle is left alone",
			[]SimplifiedTransaction{tx("A", "B", 1000), tx("C", "A", 1000)},
			[]SimplifiedTransaction{tx("A", "B", 1000), tx("C", "A", 1000)},
		},
		{
			// min(1000, 600, 1000) = 600 comes off each.
			"a partial circle keeps the rest",
			[]SimplifiedTransaction{tx("A", "B", 1000), tx("B", "C", 600), tx("C", "A", 1000)},
			[]SimplifiedTransaction{tx("A", "B", 400), tx("C", "A", 400)},
		},
		{
			"both directions net",
			[]SimplifiedTransaction{tx("A", "B", 300), tx("B", "A", 100)},
			[]SimplifiedTransaction{tx("A", "B", 200)},
		},
		{
			"equal both ways is nothing",
			[]SimplifiedTransaction{tx("A", "B", 250), tx("B", "A", 250)},
			[]SimplifiedTransaction{},
		},
		{
			"a four-person circle",
			[]SimplifiedTransaction{tx("A", "B", 500), tx("B", "C", 500), tx("C", "D", 700), tx("D", "A", 500)},
			[]SimplifiedTransaction{tx("C", "D", 200)},
		},
		{
			"zero and self debts are dropped",
			[]SimplifiedTransaction{tx("A", "B", 0), tx("A", "A", 50), tx("B", "C", 10)},
			[]SimplifiedTransaction{tx("B", "C", 10)},
		},
		{"nothing", nil, []SimplifiedTransaction{}},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			got := CancelCycles(c.in)
			if !reflect.DeepEqual(got, c.want) {
				t.Errorf("CancelCycles = %v, want %v", got, c.want)
			}
		})
	}
}

// Over many random graphs: every net position is kept, no debt grows,
// no new pair or direction appears, and no cycle is left.
func TestCancelCyclesProperties(t *testing.T) {
	r := rand.New(rand.NewSource(29))
	people := []string{"a", "b", "c", "d", "e", "f"}
	for round := 0; round < 2000; round++ {
		var in []SimplifiedTransaction
		for i := 0; i < r.Intn(12); i++ {
			from, to := people[r.Intn(len(people))], people[r.Intn(len(people))]
			in = append(in, tx(from, to, MinorUnits(r.Intn(5)*250+r.Intn(3))))
		}
		got := CancelCycles(in)

		if !reflect.DeepEqual(nets(got), nets(in)) {
			t.Fatalf("nets changed\nin  %v\nout %v", in, got)
		}
		orig := map[[2]string]MinorUnits{}
		for _, d := range in {
			if d.FromUserID != d.ToUserID {
				orig[[2]string{d.FromUserID, d.ToUserID}] += d.Amount
			}
		}
		owes := map[string]map[string]MinorUnits{}
		for _, d := range got {
			if d.Amount <= 0 {
				t.Fatalf("non-positive debt %v", d)
			}
			if d.Amount > orig[[2]string{d.FromUserID, d.ToUserID}] {
				t.Fatalf("debt %v grew or is new (was %d)\nin %v", d, orig[[2]string{d.FromUserID, d.ToUserID}], in)
			}
			if owes[d.FromUserID] == nil {
				owes[d.FromUserID] = map[string]MinorUnits{}
			}
			owes[d.FromUserID][d.ToUserID] = d.Amount
		}
		if c := findCycle(owes); c != nil {
			t.Fatalf("cycle %v left in %v", c, got)
		}
		if again := CancelCycles(in); !reflect.DeepEqual(again, got) {
			t.Fatalf("not deterministic: %v vs %v", again, got)
		}
	}
}

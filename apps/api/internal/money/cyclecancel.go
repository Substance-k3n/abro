package money

import "sort"

// CancelCycles removes debts that go round in a circle from a list of
// pairwise debts ("who owes whom", ADR-029). If A owes B, B owes C and C
// owes A, the smallest of the three is taken off all three: nobody needs
// to pass that money round the circle.
//
// It only ever lowers or removes existing debts -- never adds a new pair
// or flips a direction -- so every remaining debt is still between people
// who really shared a bill or a payment. And it keeps every person's net
// position exactly as it was (each cycle takes the same amount in and out
// of everyone on it), so it never disagrees with SimplifyDebts' nets.
//
// Why it's needed: a payment made along the simplified plan (C pays B for
// A's debt) is a real C -> B payment, which in pairwise terms leaves
// A -> B, B -> C and C -> A open. Cancelling the circle shows the truth:
// everyone is settled.
//
// Deterministic: people and their debts are visited in id order, and each
// pass removes at least one debt, so it always finishes. Pairs owed in
// both directions are netted first (a two-person cycle). The result is
// sorted largest first, then by ids.
func CancelCycles(debts []SimplifiedTransaction) []SimplifiedTransaction {
	owes := map[string]map[string]MinorUnits{}
	add := func(from, to string, amount MinorUnits) {
		if owes[from] == nil {
			owes[from] = map[string]MinorUnits{}
		}
		owes[from][to] += amount
	}
	for _, d := range debts {
		if d.Amount > 0 && d.FromUserID != d.ToUserID {
			add(d.FromUserID, d.ToUserID, d.Amount)
		}
	}
	// Net each pair first: A -> B 300 and B -> A 100 is A -> B 200.
	for from, tos := range owes {
		for to, amount := range tos {
			back := owes[to][from]
			if amount == 0 || back == 0 {
				continue
			}
			off := min(amount, back)
			owes[from][to] -= off
			owes[to][from] -= off
		}
	}
	prune := func() {
		for from, tos := range owes {
			for to, amount := range tos {
				if amount <= 0 {
					delete(tos, to)
				}
			}
			if len(tos) == 0 {
				delete(owes, from)
			}
		}
	}
	prune()

	for {
		cycle := findCycle(owes)
		if cycle == nil {
			break
		}
		off := owes[cycle[0]][cycle[1]]
		for i := range cycle {
			from, to := cycle[i], cycle[(i+1)%len(cycle)]
			off = min(off, owes[from][to])
		}
		for i := range cycle {
			from, to := cycle[i], cycle[(i+1)%len(cycle)]
			owes[from][to] -= off
		}
		prune()
	}

	out := []SimplifiedTransaction{}
	for from, tos := range owes {
		for to, amount := range tos {
			out = append(out, SimplifiedTransaction{FromUserID: from, ToUserID: to, Amount: amount})
		}
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].Amount != out[j].Amount {
			return out[i].Amount > out[j].Amount
		}
		if out[i].FromUserID != out[j].FromUserID {
			return out[i].FromUserID < out[j].FromUserID
		}
		return out[i].ToUserID < out[j].ToUserID
	})
	return out
}

// findCycle returns the people on one directed cycle in order (each owes
// the next, the last owes the first), or nil. Depth-first in id order.
func findCycle(owes map[string]map[string]MinorUnits) []string {
	nodes := make([]string, 0, len(owes))
	for n := range owes {
		nodes = append(nodes, n)
	}
	sort.Strings(nodes)
	next := func(n string) []string {
		out := make([]string, 0, len(owes[n]))
		for to := range owes[n] {
			out = append(out, to)
		}
		sort.Strings(out)
		return out
	}

	const (
		unseen = iota
		onPath
		done
	)
	state := map[string]int{}
	var path []string
	var found []string
	var visit func(n string) bool
	visit = func(n string) bool {
		state[n] = onPath
		path = append(path, n)
		for _, to := range next(n) {
			switch state[to] {
			case onPath:
				for i, p := range path {
					if p == to {
						found = append([]string{}, path[i:]...)
						return true
					}
				}
			case unseen:
				if visit(to) {
					return true
				}
			}
		}
		path = path[:len(path)-1]
		state[n] = done
		return false
	}
	for _, n := range nodes {
		if state[n] == unseen && visit(n) {
			return found
		}
	}
	return nil
}

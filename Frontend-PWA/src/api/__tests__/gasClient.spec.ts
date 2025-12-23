
import { describe, it, expect } from 'vitest'
import { inflatePayload } from '../gasClient'

describe('gasClient Data Inflation', () => {
  it('correctly inflates Leaderboard matrix', async () => {
    const rawMatrixData = {
      format: 'matrix',
      schema: { lb: [], hh: [] }, // Actual schema not used by parsing logic, just marker
      // [id, n, t, s, role, days, avg, seen, rate, hist, dt, r]
      lb: [
        ['player1', 'King Arthur', 5000, 95, 'leader', 100, 50, '2023-01-01', '100%', '3000 24W01', 5, 9500],
        ['player2', 'Lancelot', 4000, 80, 'member', 5, 10, '2023-01-02', '50%', '', 0, 8000]
      ],
      hh: [],
      timestamp: 123456789
    }

    const result = await inflatePayload(rawMatrixData)

    // Check first player
    expect(result.lb[0].id).toBe('player1')
    expect(result.lb[0].n).toBe('King Arthur')
    expect(result.lb[0].t).toBe(5000)
    expect(result.lb[0].d.role).toBe('leader')
    expect(result.lb[0].d.days).toBe(100)
    expect(result.lb[0].dt).toBe(5)
    expect(result.lb[0].r).toBe(9500)
    
    // Check second player
    expect(result.lb[1].id).toBe('player2')
    expect(result.lb[1].d.role).toBe('member')
    expect(result.lb[1].dt).toBe(0)
  })

  it('correctly inflates Headhunter matrix', async () => {
    const rawMatrixData = {
      format: 'matrix',
      schema: { lb: [], hh: [] },
      lb: [],
      // [id, n, t, s, don, war, ago, cards]
      hh: [
        ['recruit1', 'New Guy', 3000, 60, 500, 20, '2024-01-01', 1000]
      ],
      timestamp: 123456789
    }

    const result = await inflatePayload(rawMatrixData)

    expect(result.hh).toHaveLength(1)
    expect(result.hh[0].id).toBe('recruit1')
    expect(result.hh[0].n).toBe('New Guy')
    expect(result.hh[0].d.don).toBe(500)
    expect(result.hh[0].d.war).toBe(20)
    expect(result.hh[0].d.cards).toBe(1000)
  })

  it('handles empty matrix gracefully', async () => {
    const rawMatrixData = {
      format: 'matrix',
      schema: { lb: [], hh: [] },
      lb: [],
      hh: [],
      timestamp: 123456789
    }

    const result = await inflatePayload(rawMatrixData)
    expect(result.lb).toEqual([])
    expect(result.hh).toEqual([])
  })

  it('handles malformed string inputs (String Transport Protocol)', async () => {
    const rawMatrixData = {
      format: 'matrix',
      schema: { lb: [], hh: [] },
      // Added missing columns (0, 0) to satisfy Zod schema
      lb: [['p1', 'Test', 0, 0, 'm', 0, 0, '', '', '', 0, 0]],
      hh: [],
      timestamp: 123456789
    }
    
    // Simulate double-encoded JSON string
    const stringified = JSON.stringify(rawMatrixData)
    
    const result = await inflatePayload(stringified)
    expect(result.lb).toHaveLength(1)
    expect(result.lb[0].id).toBe('p1')
  })
})

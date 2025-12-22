import type { WebAppData, LeaderboardMember, Recruit } from '../types'

/**
 * Generates a realistic war history string for 52 weeks.
 */
function generateWarHistory(): string {
    const weeks: string[] = []
    const now = new Date()

    for (let i = 0; i < 52; i++) {
        const date = new Date(now.getTime() - i * 7 * 24 * 60 * 60 * 1000)
        const yearShort = date.getFullYear().toString().slice(-2)
        const weekNum = Math.ceil(date.getDate() / 7) + (date.getMonth() * 4) // Simplified week calc
        const weekId = `${yearShort}W${weekNum.toString().padStart(2, '0')}`

        // Random fame between 0 and 3200
        // Higher probability of high fame for "good" players is handled by the caller
        const fame = Math.random() > 0.1 ? Math.floor(Math.random() * 2000) + 1200 : 0
        weeks.push(`${fame} ${weekId}`)
    }

    return weeks.join(' | ')
}

export function generateMockData(): WebAppData {
    const lb: LeaderboardMember[] = []
    const names = [
        'Arthur', 'Merlin', 'Lancelot', 'Galahad', 'Guinevere',
        'Robin', 'Marian', 'LittleJohn', 'FriarTuck', 'Sheriff',
        'Gandalf', 'Aragorn', 'Legolas', 'Gimli', 'Frodo',
        'Neo', 'Trinity', 'Morpheus', 'Cipher', 'Smith',
        'Logan', 'Xavier', 'Storm', 'Jean', 'Scott',
        'Tony', 'Steve', 'Bruce', 'Natasha', 'Clint',
        'Peter', 'Miles', 'Gwen', 'Eddie', 'Otto',
        'Mario', 'Luigi', 'Peach', 'Bowser', 'Yoshi',
        'Link', 'Zelda', 'Ganon', 'Impa', 'Sidon',
        'Cloud', 'Tifa', 'Aerith', 'Barret', 'Sephiroth'
    ]

    // Generate 50 Clan Members
    for (let i = 0; i < 50; i++) {
        const thrives = Math.random() > 0.2
        const score = thrives ? Math.floor(Math.random() * 30) + 70 : Math.floor(Math.random() * 50) + 20
        const trophies = 5000 + (score * 40) + Math.floor(Math.random() * 500)

        lb.push({
            id: `PLAYER${i}`,
            n: names[i] || `Knight ${i}`,
            t: trophies,
            s: score,
            dt: Math.floor(Math.random() * 15) - 5,
            r: score * 100,
            d: {
                role: i === 0 ? 'Leader' : (i < 5 ? 'Co-Leader' : 'Member'),
                days: 10 + Math.floor(Math.random() * 500),
                avg: Math.floor(Math.random() * 800) + 200,
                seen: 'Just now',
                rate: `${Math.floor(Math.random() * 20) + 80}%`,
                hist: generateWarHistory()
            }
        })
    }

    // Generate 20 Recruits
    const hh: Recruit[] = []
    const recruitNames = ['Hunter', 'Seeker', 'Nomad', 'Exile', 'Ronin', 'Slayer', 'Ghost', 'Shadow', 'Blade', 'Wolf']

    for (let i = 0; i < 20; i++) {
        const score = Math.floor(Math.random() * 60) + 40
        const nameBase = recruitNames[i % recruitNames.length] || 'Recruit'
        hh.push({
            id: `RECRUIT${i}`,
            n: nameBase + i,
            t: 4500 + Math.floor(Math.random() * 3000),
            s: score,
            d: {
                don: Math.floor(Math.random() * 1000),
                war: Math.floor(Math.random() * 500),
                ago: new Date(Date.now() - Math.random() * 10 * 24 * 60 * 60 * 1000).toISOString(),
                cards: Math.floor(Math.random() * 50000)
            }
        })
    }

    return {
        lb: lb.sort((a, b) => b.s - a.s),
        hh: hh.sort((a, b) => b.s - a.s),
        timestamp: Date.now()
    }
}

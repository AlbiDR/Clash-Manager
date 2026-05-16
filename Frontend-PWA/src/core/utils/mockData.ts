import type { WebAppData, LeaderboardMember, Recruit } from "@core/types";

/**
 * Generates a realistic war history string for 52 weeks.
 */
function generateWarHistory(): string {
  const weeks: string[] = [];
  const now = new Date();

  for (let i = 0; i < 52; i++) {
    const date = new Date(now.getTime() - i * 7 * 24 * 60 * 60 * 1000);
    const yearShort = date.getFullYear().toString().slice(-2);
    const weekNum = Math.ceil(date.getDate() / 7) + date.getMonth() * 4; // Simplified week calc
    const weekId = `${yearShort}W${weekNum.toString().padStart(2, "0")}`;

    // Random fame between 0 and 3200
    // Higher probability of high fame for "good" players is handled by the caller
    const fame =
      Math.random() > 0.1 ? Math.floor(Math.random() * 2000) + 1200 : 0;
    weeks.push(`${fame} ${weekId}`);
  }

  return weeks.join(" | ");
}

export const DEFAULT_MOCK_MEMBER_COUNT = 50;
export const DEFAULT_MOCK_RECRUIT_COUNT = 20;

export function generateMockData(options?: {
  memberCount?: number;
  recruitCount?: number;
}): WebAppData {
  // [UI] BRANDING RANDOMIZATION: Generate a single random count (1-50) if not specified
  // to ensure screenshots show varied clan sizes but remain symmetrically aligned between views.
  const urlParams = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
  const hashParams = new URLSearchParams(typeof window !== 'undefined' ? window.location.hash.split("?")[1] || "" : '');
  const countParam = urlParams.get('count') || hashParams.get('count');
  const randomCount = countParam ? parseInt(countParam, 10) : (Math.floor(Math.random() * 50) + 1);
  
  const memberCount = options?.memberCount ?? randomCount;
  const recruitCount = options?.recruitCount ?? randomCount;
  const lb: LeaderboardMember[] = [];
  const names = [
    "Arthur",
    "Merlin",
    "Lancelot",
    "Galahad",
    "Guinevere",
    "Robin",
    "Marian",
    "LittleJohn",
    "FriarTuck",
    "Sheriff",
    "Gandalf",
    "Aragorn",
    "Legolas",
    "Gimli",
    "Frodo",
    "Neo",
    "Trinity",
    "Morpheus",
    "Cipher",
    "Smith",
    "Logan",
    "Xavier",
    "Storm",
    "Jean",
    "Scott",
    "Tony",
    "Steve",
    "Bruce",
    "Natasha",
    "Clint",
    "Peter",
    "Miles",
    "Gwen",
    "Eddie",
    "Otto",
    "Mario",
    "Luigi",
    "Peach",
    "Bowser",
    "Yoshi",
    "Link",
    "Zelda",
    "Ganon",
    "Impa",
    "Sidon",
    "Cloud",
    "Tifa",
    "Aerith",
    "Barret",
    "Sephiroth",
  ];

  // Generate Clan Members (default 50, or custom count for Showcase mode)
  for (let i = 0; i < memberCount; i++) {
    const thrives = Math.random() > 0.2;
    const score = thrives
      ? Math.floor(Math.random() * 30) + 70
      : Math.floor(Math.random() * 50) + 20;
    const trophies = 5000 + score * 40 + Math.floor(Math.random() * 500);

    lb.push({
      id: `PLAYER${i}`,
      n: names[i] || `Knight ${i}`,
      t: trophies,
      performanceScore: score,
      performanceRawScore: score * 100,
      dt: Math.floor(Math.random() * 15) - 5,
      d: {
        role: i === 0 ? "Leader" : i < 5 ? "Co-Leader" : "Member",
        days: 10 + Math.floor(Math.random() * 500),
        avg: Math.floor(Math.random() * 800) + 200,
        seen: "Just now",
        rate: `${Math.floor(Math.random() * 20) + 80}%`,
        wfame: Math.floor(Math.random() * 800) + 2400, // Realistically high for active members
        hist: generateWarHistory(),
      },
    });
  }

  // Generate Recruits (default 20, or custom count for Showcase mode)
  const hh: Recruit[] = [];
  const recruitNames = [
    "Hunter",
    "Seeker",
    "Nomad",
    "Exile",
    "Ronin",
    "Slayer",
    "Ghost",
    "Shadow",
    "Blade",
    "Wolf",
  ];

  for (let i = 0; i < recruitCount; i++) {
    const score = Math.floor(Math.random() * 60) + 40;
    const nameBase = recruitNames[i % recruitNames.length] || "Recruit";
    hh.push({
      id: `RECRUIT${i}`,
      n: nameBase + i,
      t: 4500 + Math.floor(Math.random() * 3000),
      potentialScore: score,
      potentialRawScore: score * 100,
      d: {
        don: Math.floor(Math.random() * 1000),
        war: Math.floor(Math.random() * 500),
        ago: new Date(
          Date.now() - Math.random() * 10 * 24 * 60 * 60 * 1000,
        ).toISOString(),
        cards: Math.floor(Math.random() * 50000),
      },
    });
  }

  return {
    lb: lb.sort((a, b) => b.performanceScore - a.performanceScore),
    hh: hh.sort((a, b) => b.potentialScore - a.potentialScore),
    timestamp: Date.now(),
  };
}

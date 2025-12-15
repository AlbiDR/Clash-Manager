/**
 * TypeScript interfaces for Clash Royale Manager
 */

// API Response Envelope
export interface ApiResponse<T> {
    status: 'success' | 'error'
    data: T | null
    error: { code: string; message: string } | null
    timestamp: string
}

// Legacy format from getWebAppData
export interface LegacyApiResponse<T> {
    success: boolean
    data: T | null
    error: { code: string; message: string } | null
}

// Member in Leaderboard
export interface LeaderboardMember {
    id: string      // Player tag without #
    n: string       // Name
    t: number       // Trophies
    s: number       // Performance Score
    d: {
        role: string
        days: number
        avg: number
        seen?: string | null // Made optional
        rate?: string | null // Made optional
        hist: string
    }
}

// Recruit in Headhunter
export interface Recruit {
    id: string      // Player tag without #
    n: string       // Name
    t: number       // Trophies
    s: number       // Performance Score
    d: {
        don: number   // Donations
        war: number   // War Wins
        ago: string   // Found Date ISO
        cards?: number // Cards Won (optional)
    }
}

// Web App Data payload
export interface WebAppData {
    lb: LeaderboardMember[]
    hh: Recruit[]
    timestamp: number
}

// Real-time clan member
export interface ClanMember {
    tag: string
    name: string
    role: string
    kingLevel: number
    donations: number
    donationsReceived: number
}

// Ping response
export interface PingResponse {
    version: string
    status: string
    scriptId?: string
    spreadsheetUrl?: string
    sheets?: Record<string, number>
    modules: Record<string, string>
    latency?: number
}

// Dismiss response
export interface DismissResponse {
    success: boolean
    count?: number
    message?: string
}

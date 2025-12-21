
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useShareTarget } from '../useShareTarget'

// Mocks
const mockPush = vi.fn()
const mockReplaceState = vi.fn()
const mockSuccess = vi.fn()

vi.mock('vue-router', () => ({
    useRouter: () => ({
        push: mockPush
    })
}))

vi.mock('../useToast', () => ({
    useToast: () => ({
        success: mockSuccess
    })
}))

describe('useShareTarget', () => {
    const originalLocation = window.location
    const originalHistory = window.history

    beforeEach(() => {
        // Reset mocks
        mockPush.mockClear()
        mockSuccess.mockClear()
        mockReplaceState.mockClear()

        // Mock window.location
        delete (window as any).location
        window.location = {
            ...originalLocation,
            search: '',
            pathname: '/app',
        } as any

        // Mock window.history
        window.history.replaceState = mockReplaceState
    })

    afterEach(() => {
        window.location = originalLocation
        window.history = originalHistory
    })

    it('should ignore if no text param is present via URLSearchParams', () => {
        window.location.search = '?foo=bar'
        const { handleShareTarget } = useShareTarget()
        handleShareTarget()
        expect(mockPush).not.toHaveBeenCalled()
    })

    it('should parse tag from text param and redirect', () => {
        window.location.search = '?text=Check out this player #ABC12345'
        const { handleShareTarget } = useShareTarget()
        handleShareTarget()

        expect(mockSuccess).toHaveBeenCalledWith('Shared Tag Found: #ABC12345')
        expect(mockReplaceState).toHaveBeenCalled()
        expect(mockPush).toHaveBeenCalledWith({
            path: '/recruiter',
            query: { pin: 'ABC12345' }
        })
    })

    it('should handle tag= format', () => {
        window.location.search = '?text=tag=XYZ987'
        const { handleShareTarget } = useShareTarget()
        handleShareTarget()

        expect(mockSuccess).toHaveBeenCalledWith('Shared Tag Found: #XYZ987')
        expect(mockPush).toHaveBeenCalledWith({
            path: '/recruiter',
            query: { pin: 'XYZ987' }
        })
    })

    it('should ignore text without valid tag', () => {
        window.location.search = '?text=Just some random text'
        const { handleShareTarget } = useShareTarget()
        handleShareTarget()

        expect(mockPush).not.toHaveBeenCalled()
    })
})

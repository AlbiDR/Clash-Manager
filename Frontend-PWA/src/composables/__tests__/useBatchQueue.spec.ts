
import { describe, it, expect, vi } from 'vitest'
import { useBatchQueue } from '../useBatchQueue'

describe('useBatchQueue', () => {
  it('initializes with empty state', () => {
    const { selectedIds, queue, isSelectionMode, isProcessing } = useBatchQueue()
    
    expect(selectedIds.value).toEqual([])
    expect(queue.value).toEqual([])
    expect(isSelectionMode.value).toBe(false)
    expect(isProcessing.value).toBe(false)
  })

  it('toggles selection correctly', () => {
    const { selectedIds, toggleSelect, isSelectionMode } = useBatchQueue()
    
    // Select
    toggleSelect('123')
    expect(selectedIds.value).toContain('123')
    expect(isSelectionMode.value).toBe(true)

    // Select another
    toggleSelect('456')
    expect(selectedIds.value).toEqual(['123', '456'])

    // Deselect
    toggleSelect('123')
    expect(selectedIds.value).toEqual(['456'])
  })

  it('selects all items', () => {
    const { selectedIds, selectAll } = useBatchQueue()
    const items = ['1', '2', '3']
    
    selectAll(items)
    expect(selectedIds.value).toEqual(['1', '2', '3'])
  })

  it('clears selection', () => {
    const { selectedIds, clearSelection, selectAll } = useBatchQueue()
    
    selectAll(['1', '2'])
    clearSelection()
    expect(selectedIds.value).toEqual([])
  })

  it('handles batch actions and queue processing', async () => {
    // Mock timers for the throttle and setTimeout in handleAction
    vi.useFakeTimers()
    
    const { 
      selectedIds, 
      queue, 
      handleAction, 
      fabState, 
      isProcessing 
    } = useBatchQueue({ throttleMs: 0 }) // Disable throttle for test

    // Setup selection
    selectedIds.value = ['A', 'B']
    
    // Initial FAB state should show first selected item
    expect(fabState.value.actionHref).toContain('id=A')
    
    // Simulate Click Action (Open A)
    const mockEvent = { preventDefault: vi.fn() } as unknown as MouseEvent
    handleAction(mockEvent)
    
    // Queue should now populate
    expect(queue.value).toEqual(['A', 'B'])
    expect(isProcessing.value).toBe(true)
    
    // Fast forward passed the processing timeout (50ms)
    vi.advanceTimersByTime(50)
    
    // A should be shifted out, B should be next
    expect(queue.value).toEqual(['B'])
    expect(fabState.value.actionHref).toContain('id=B')
    expect(fabState.value.label).toContain('Next (2/2)')

    // Simulate Click Action (Open B)
    handleAction(mockEvent)
    vi.advanceTimersByTime(50)

    // Queue empty, selection cleared
    expect(queue.value).toEqual([])
    expect(selectedIds.value).toEqual([])
    expect(isProcessing.value).toBe(false)
    
    vi.useRealTimers()
  })
})

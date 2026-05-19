// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR
/**
 * Binary Heap based Priority Queue.
 *
 * @remarks
 * A high-performance collection used for O(log N) upgrade selection within the
 * Laboratory simulation engine. It ensures the most efficient upgrade candidates
 * are always processed first without the overhead of O(N log N) re-sorting.
 */
export class PriorityQueue<T> {
  private heap: T[] = [];

  /**
   * Initializes the Priority Queue with a custom comparator.
   *
   * @param comparator - A function that defines the sort order.
   *   Should return < 0 if 'a' has higher priority than 'b'.
   */
  constructor(private comparator: (a: T, b: T) => number) {}

  /**
   * Adds a new item to the queue.
   *
   * @param item - The element to insert.
   * @complexity O(log N) due to heap sift-up operation.
   */
  push(item: T): void {
    this.heap.push(item);
    this.siftUp(this.heap.length - 1);
  }

  /**
   * Removes and returns the item with the highest priority.
   *
   * @returns The highest priority element, or undefined if the queue is empty.
   * @complexity O(log N) due to heap sift-down operation.
   */
  pop(): T | undefined {
    if (this.size() === 0) return undefined;
    const top = this.heap[0];
    const bottom = this.heap.pop()!;
    if (this.size() > 0) {
      this.heap[0] = bottom;
      this.siftDown(0);
    }
    return top;
  }

  /**
   * Returns the item with the highest priority without removing it.
   *
   * @returns The highest priority element, or undefined if the queue is empty.
   * @complexity O(1) direct access to the heap root.
   */
  peek(): T | undefined {
    return this.heap[0];
  }

  /**
   * Returns the number of items currently in the queue.
   *
   * @returns The count of elements.
   * @complexity O(1)
   */
  size(): number {
    return this.heap.length;
  }

  /**
   * Restores heap property by moving an item up the tree.
   * @internal
   */
  private siftUp(index: number): void {
    while (index > 0) {
      const parent = (index - 1) >> 1;
      if (this.comparator(this.heap[index], this.heap[parent]) < 0) {
        [this.heap[index], this.heap[parent]] = [this.heap[parent], this.heap[index]];
        index = parent;
      } else break;
    }
  }

  /**
   * Restores heap property by moving an item down the tree.
   * @internal
   */
  private siftDown(index: number): void {
    while (true) {
      let smallest = index;
      const left = 2 * index + 1;
      const right = 2 * index + 2;

      if (left < this.size() && this.comparator(this.heap[left], this.heap[smallest]) < 0) {
        smallest = left;
      }
      if (right < this.size() && this.comparator(this.heap[right], this.heap[smallest]) < 0) {
        smallest = right;
      }

      if (smallest !== index) {
        [this.heap[index], this.heap[smallest]] = [this.heap[smallest], this.heap[index]];
        index = smallest;
      } else break;
    }
  }
}

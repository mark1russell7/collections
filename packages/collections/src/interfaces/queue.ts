/**
 * Queue and Deque interfaces that mirror Java's Queue and Deque.
 *
 * Queues are collections that hold elements before processing.
 * Deques (double-ended queues) give efficient insertion/removal at both ends.
 */

import type { Collection, ReadonlyCollection } from "./collection.js";
import type { Compare } from "../core/traits.js";

/**
 * ReadonlyQueue<T> - Readonly FIFO (First-In-First-Out) queue.
 *
 * This type gives read-only access to queue operations.
 */
export interface ReadonlyQueue<T> extends ReadonlyCollection<T> {
  /**
   * Retrieves, but does not remove, the head of this queue.
   *
   * @returns The head element
   * @throws Error if queue is empty
   */
  peek(): T;

  /**
   * This method gives the head element without throwing if empty.
   * This method gives undefined if queue is empty.
   */
  peekOrUndefined(): T | undefined;
}

/**
 * Queue<T> - FIFO (First-In-First-Out) queue.
 *
 * Mirrors java.util.Queue.
 * Elements are processed in the order they were added.
 */
export interface Queue<T> extends ReadonlyQueue<T>, Collection<T> {
  /**
   * This method inserts an element into the queue.
   * For bounded queues with overflow='throw', throws if queue is full.
   *
   * @param element The element to add
   * @returns true if element was added
   * @throws Error if queue is full (bounded with throw policy)
   */
  offer(element: T): boolean;

  /**
   * Retrieves and removes the head of this queue.
   *
   * @returns The head element
   * @throws Error if queue is empty
   */
  poll(): T;

  /**
   * Retrieves and removes the head of this queue, or gives undefined if empty.
   */
  pollOrUndefined(): T | undefined;

  /**
   * Alias for offer(). This method adds element to end of queue.
   * This method is here for consistency with standard queue terminology.
   */
  enqueue(element: T): boolean;

  /**
   * Alias for poll(). Removes and gives element from front of queue.
   * This method is here for consistency with standard queue terminology.
   */
  dequeue(): T;
}

/**
 * Deque<T> - Double-ended queue.
 *
 * Mirrors java.util.Deque.
 * This type supports insertion and removal at both ends.
 * This type operates as a queue (FIFO) or a stack (LIFO).
 */
export interface Deque<T> extends Queue<T> {
  // First element operations (head of queue)

  /**
   * This method inserts element at the front of this deque.
   *
   * @param element The element to add
   * @throws Error if deque is full (bounded with throw policy)
   */
  addFirst(element: T): void;

  /**
   * This method inserts element at the front, giving false if full.
   */
  offerFirst(element: T): boolean;

  /**
   * Retrieves and removes the first element.
   *
   * @throws Error if deque is empty
   */
  removeFirst(): T;

  /**
   * Retrieves and removes the first element, or undefined if empty.
   */
  pollFirst(): T | undefined;

  /**
   * Retrieves but does not remove the first element.
   *
   * @throws Error if deque is empty
   */
  peekFirst(): T;

  /**
   * Retrieves but does not remove the first element, or undefined if empty.
   */
  peekFirstOrUndefined(): T | undefined;

  // Last element operations (tail of queue)

  /**
   * This method inserts element at the end of this deque.
   *
   * @param element The element to add
   * @throws Error if deque is full (bounded with throw policy)
   */
  addLast(element: T): void;

  /**
   * This method inserts element at the end, giving false if full.
   */
  offerLast(element: T): boolean;

  /**
   * Retrieves and removes the last element.
   *
   * @throws Error if deque is empty
   */
  removeLast(): T;

  /**
   * Retrieves and removes the last element, or undefined if empty.
   */
  pollLast(): T | undefined;

  /**
   * Retrieves but does not remove the last element.
   *
   * @throws Error if deque is empty
   */
  peekLast(): T;

  /**
   * Retrieves but does not remove the last element, or undefined if empty.
   */
  peekLastOrUndefined(): T | undefined;

  // Stack operations (LIFO). As on a JavaScript array and on every List of this package,
  // push and pop work at the end. (Java's Deque uses the front.) The top of the stack is peekLast().

  /**
   * This method pushes element onto the stack represented by this deque.
   * Equivalent to addLast().
   *
   * @param element The element to push
   */
  push(element: T): void;

  /**
   * This method pops an element from the stack represented by this deque.
   * Equivalent to removeLast().
   *
   * @returns The popped element
   * @throws Error if deque is empty
   */
  pop(): T;
}

/**
 * BlockingQueue<T> - Queue that supports blocking operations.
 *
 * Mirrors java.util.concurrent.BlockingQueue.
 * Useful for producer-consumer patterns.
 */
export interface BlockingQueue<T> extends Queue<T> {
  /**
   * This method inserts element, waiting if necessary for space to become available.
   *
   * @param element The element to add
   * @param timeoutMs Optional timeout in milliseconds
   * @returns Promise that resolves to true when element is added
   * @throws Error if timeout expires
   */
  put(element: T, timeoutMs?: number): Promise<void>;

  /**
   * Retrieves and removes the head, waiting if necessary until an element is available.
   *
   * @param timeoutMs Optional timeout in milliseconds
   * @returns Promise that resolves to the head element
   * @throws Error if timeout expires
   */
  take(timeoutMs?: number): Promise<T>;

  /**
   * This value is the remaining capacity.
   * This value is Infinity for unbounded queues.
   */
  readonly remainingCapacity: number;

  /**
   * This method removes all available elements and adds them to the given array.
   * This method gives the number of elements transferred.
   */
  drainTo(target: T[], maxElements?: number): number;
}

/**
 * PriorityQueue<T> - Queue that orders elements by priority.
 *
 * Mirrors java.util.PriorityQueue.
 * Elements are removed in priority order (not insertion order).
 * A comparison function is necessary for this type to determine priority.
 */
export interface PriorityQueue<T> extends Queue<T> {
  /**
   * The comparison function used to determine priority.
   * Elements with lower compare value have higher priority.
   */
  readonly compare: Compare<T>;

  /**
   * This value is the comparator used to order elements, or undefined if natural ordering.
   */
  readonly comparator: Compare<T> | undefined;
}

/**
 * AsyncQueue<T> - Async iterable queue.
 *
 * This type is for async/await patterns and streaming data.
 * This type implements AsyncIterable for use with for-await-of loops.
 */
export interface AsyncQueue<T> extends AsyncIterable<T> {
  /** This value is the number of elements in the queue. */
  readonly size: number;

  /** True if queue is empty */
  readonly isEmpty: boolean;

  /**
   * This method adds element to queue.
   * For bounded queues, this method can wait for space to become available.
   */
  put(element: T): Promise<void>;

  /**
   * Removes and gives next element.
   * Waits for an element if queue is empty.
   */
  take(): Promise<T>;

  /**
   * This method tries to add element without waiting.
   * This method gives false if queue is full.
   */
  tryPut(element: T): boolean;

  /**
   * This method tries to remove element without waiting.
   * This method gives undefined if queue is empty.
   */
  tryTake(): T | undefined;

  /**
   * This method gives next element without removing it.
   * Waits for an element if queue is empty.
   */
  peek(): Promise<T>;

  /**
   * This method closes the queue, preventing further additions.
   * After this method, consumers can still take the existing elements.
   */
  close(): void;

  /**
   * This value is true if queue is closed.
   */
  readonly isClosed: boolean;
}

/**
 * TransferQueue<T> - Queue where producers can wait for consumers.
 *
 * Mirrors java.util.concurrent.TransferQueue.
 * Useful for direct handoff between producer and consumer threads.
 */
export interface TransferQueue<T> extends BlockingQueue<T> {
  /**
   * Transfers element to consumer, waiting if necessary.
   * This method waits for a consumer to receive the element.
   *
   * @param element The element to transfer
   * @returns Promise that resolves when element is received
   */
  transfer(element: T): Promise<void>;

  /**
   * This method tries to transfer element to waiting consumer.
   * This method gives false immediately if no consumer is waiting.
   *
   * @param element The element to transfer
   * @param timeoutMs Optional timeout in milliseconds
   */
  tryTransfer(element: T, timeoutMs?: number): Promise<boolean>;

  /**
   * This value is true if there are consumers waiting to receive elements.
   */
  readonly hasWaitingConsumer: boolean;

  /**
   * This value is an estimate of the number of consumers waiting to receive elements.
   */
  readonly waitingConsumerCount: number;
}

/**
 * DelayQueue<T> - Queue where elements become available after a delay.
 *
 * Mirrors java.util.concurrent.DelayQueue.
 * Elements can only be removed once their delay has expired.
 */
export interface DelayQueue<T> extends BlockingQueue<T> {
  /**
   * This method adds element with specified delay.
   *
   * @param element The element to add
   * @param delayMs Delay in milliseconds before element becomes available (defaults to 0)
   */
  offer(element: T, delayMs?: number): boolean;

  /**
   * This value is the delay (in ms) until next element becomes available.
   * The delay is `0` when the element is available.
   * This value is Infinity if queue is empty.
   */
  readonly nextDelay: number;
}

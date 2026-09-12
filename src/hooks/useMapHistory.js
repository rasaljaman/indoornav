import { useState, useCallback, useRef } from 'react';

/**
 * useMapHistory
 * Robust, atomic undo/redo state container for map editor state.
 * Stores { past: [], present, future: [] } in a single atomic state
 * to prevent race conditions or dropped frames in React 18/19.
 */
export function useMapHistory(initialState) {
  const [history, setHistory] = useState({
    past: [],
    present: initialState,
    future: [],
  });

  // Keep a synchronous ref for present state
  const presentRef = useRef(history.present);
  presentRef.current = history.present;

  /**
   * Reset the history stack with fresh data (e.g. upon loading from Supabase)
   */
  const resetHistory = useCallback((newState) => {
    setHistory({
      past: [],
      present: newState,
      future: [],
    });
  }, []);

  /**
   * Push a new state onto history.
   * Clears the redo (future) stack.
   */
  const pushState = useCallback((nextStateOrFn, description = '') => {
    setHistory((curr) => {
      const nextPresent =
        typeof nextStateOrFn === 'function' ? nextStateOrFn(curr.present) : nextStateOrFn;

      // Avoid duplicate consecutive identical pushes
      if (nextPresent === curr.present) return curr;

      const newPast = [...curr.past, curr.present];
      if (newPast.length > 50) newPast.shift();

      return {
        past: newPast,
        present: nextPresent,
        future: [],
      };
    });
  }, []);

  /**
   * Undo to previous state
   */
  const undo = useCallback(() => {
    setHistory((curr) => {
      if (curr.past.length === 0) return curr;

      const previous = curr.past[curr.past.length - 1];
      const newPast = curr.past.slice(0, curr.past.length - 1);

      return {
        past: newPast,
        present: previous,
        future: [curr.present, ...curr.future],
      };
    });
  }, []);

  /**
   * Redo to next state
   */
  const redo = useCallback(() => {
    setHistory((curr) => {
      if (curr.future.length === 0) return curr;

      const next = curr.future[0];
      const newFuture = curr.future.slice(1);

      return {
        past: [...curr.past, curr.present],
        present: next,
        future: newFuture,
      };
    });
  }, []);

  return {
    state: history.present,
    setState: pushState,
    resetHistory,
    undo,
    redo,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
    historyLength: history.past.length,
    futureLength: history.future.length,
  };
}

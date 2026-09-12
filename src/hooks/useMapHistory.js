import { useState, useCallback, useRef } from 'react';

/**
 * useMapHistory
 * Manages undo/redo state snapshots for rooms, nodes, edges, and qrPoints.
 */
export function useMapHistory(initialState) {
  // past: array of previous snapshots
  const [past, setPast] = useState([]);
  // present: current snapshot
  const [present, setPresent] = useState(initialState);
  // future: array of future snapshots for redo
  const [future, setFuture] = useState([]);

  // Ref to hold the current present state synchronously
  const presentRef = useRef(present);
  presentRef.current = present;

  /**
   * Reset the history stack with fresh data (e.g. upon loading from Supabase)
   */
  const resetHistory = useCallback((newState) => {
    setPast([]);
    setPresent(newState);
    setFuture([]);
  }, []);

  /**
   * Push a new state onto history.
   * If updater is a function: (prev) => next
   */
  const pushState = useCallback((nextStateOrFn, description = '') => {
    setPast((prevPast) => {
      const current = presentRef.current;
      // limit history to 50 steps
      const newPast = [...prevPast, current];
      if (newPast.length > 50) newPast.shift();
      return newPast;
    });

    setPresent((prev) => {
      const next = typeof nextStateOrFn === 'function' ? nextStateOrFn(prev) : nextStateOrFn;
      return next;
    });

    setFuture([]);
  }, []);

  /**
   * Undo to previous state
   */
  const undo = useCallback(() => {
    setPast((prevPast) => {
      if (prevPast.length === 0) return prevPast;
      const previous = prevPast[prevPast.length - 1];
      const newPast = prevPast.slice(0, prevPast.length - 1);

      setFuture((prevFuture) => [presentRef.current, ...prevFuture]);
      setPresent(previous);
      return newPast;
    });
  }, []);

  /**
   * Redo to next state
   */
  const redo = useCallback(() => {
    setFuture((prevFuture) => {
      if (prevFuture.length === 0) return prevFuture;
      const next = prevFuture[0];
      const newFuture = prevFuture.slice(1);

      setPast((prevPast) => [...prevPast, presentRef.current]);
      setPresent(next);
      return newFuture;
    });
  }, []);

  return {
    state: present,
    setState: pushState,
    resetHistory,
    undo,
    redo,
    canUndo: past.length > 0,
    canRedo: future.length > 0,
    historyLength: past.length,
  };
}

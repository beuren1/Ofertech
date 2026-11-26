import { useCallback, useReducer } from 'react'
import type { Flyer } from './flyers'

type History = { current: Flyer; past: Flyer[]; future: Flyer[]; group?: symbol }
type Action = { type: 'edit'; apply: (flyer: Flyer) => Flyer; group?: symbol }
  | { type: 'reset'; flyer: Flyer } | { type: 'undo' } | { type: 'redo' }

function reduceHistory(history: History, action: Action): History {
  const { current, past, future } = history
  switch (action.type) {
    case 'reset': return { current: action.flyer, past: [], future: [] }
    case 'undo': return past.length ? { current: past[past.length - 1], past: past.slice(0, -1), future: [current, ...future] } : history
    case 'redo': return future.length ? { current: future[0], past: [...past, current], future: future.slice(1) } : history
    case 'edit': {
      const next = action.apply(current)
      if (next === current) return history
      const continuing = action.group !== undefined && action.group === history.group
      return { current: next, past: continuing ? past : [...past, current].slice(-30), future: [], group: action.group }
    }
  }
}

export function useFlyerHistory(initial: () => Flyer) {
  const [history, dispatch] = useReducer(reduceHistory, initial, create => ({ current: create(), past: [], future: [] }))
  return {
    flyer: history.current,
    setFlyer: (apply: (flyer: Flyer) => Flyer, group?: symbol) => dispatch({ type: 'edit', apply, group }),
    resetFlyer: useCallback((flyer: Flyer) => dispatch({ type: 'reset', flyer }), []),
    undo: useCallback(() => dispatch({ type: 'undo' }), []),
    redo: useCallback(() => dispatch({ type: 'redo' }), []),
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
  }
}

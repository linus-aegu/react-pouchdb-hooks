import { useReducer, useMemo, useCallback, useRef } from 'react'

/**
 * Core state reducer for most hooks.
 * @param initialValue Initial Value, can be any object or a function returning the value.
 */
export default function useStateMachine<Result>(
  initialValue: initValueType<Result>,
): StateMachineResultType<Result> {
  const initReducerState = (
    initialValue: initValueType<Result>,
  ): State & Result => {
    if (typeof initialValue === 'function') {
      initialValue = (initialValue as () => Result)()
    }

    if (!initialValue) {
      // if the initial value is falsy,
      // then should an empty object be spread over.
      initialValue = {} as Result
    }

    return {
      ...(initialValue as Result),
      error: null,
      state: 'loading' as QueryState,
    } as State & Result
  }

  const [currentState, dispatch] = useReducer(
    reducer,
    initialValue,
    initReducerState,
  )

  const state: ResultType<Result> = useMemo(
    () => ({
      ...currentState,
      // Add loading indicator
      loading: currentState.state === 'loading',
    }),
    [currentState],
  )

  const stateRef = useRef(currentState)
  stateRef.current = currentState

  const changeState = useCallback((fn: (state: Result) => Result) => {
    const next = fn(stateRef.current as Result)
    dispatch({
      type: 'loading_finished',
      payload: next,
    })
  }, [])

  return [state, dispatch, changeState]
}

export type QueryState = 'loading' | 'done' | 'error'

interface State {
  /**
   * State. Can be 'loading', 'done' or 'error'.
   */
  state: QueryState
  /**
   * If it did error, then the error it is returned in this field.
   */
  error: PouchDB.Core.Error | null
}

type initValueType<T> = T | (() => T)

export type Dispatch<T> = React.Dispatch<Actions<T>>

export type ResultType<T> = T &
  State & {
    /**
     * Is this hook currently loading/updating.
     */
    loading: boolean
  }

type StateMachineResultType<T> = [
  ResultType<T>,
  Dispatch<T>,
  (fn: (state: T) => T) => void,
]

export interface StartLoading {
  type: 'loading_started'
}

export interface FinishedLoading<Result> {
  type: 'loading_finished'
  payload: Result
}

export interface DidError<Result = undefined> {
  type: 'loading_error'
  payload: {
    error: PouchDB.Core.Error
    setResult: boolean
    result?: Result
  }
}

export type Actions<T> = StartLoading | FinishedLoading<T> | DidError<T>

function reducer<Result>(
  state: State & Result,
  action: Actions<Result>,
): State & Result {
  switch (action.type) {
    case 'loading_started':
      return {
        ...state,
        state: 'loading' as QueryState,
      }

    case 'loading_finished':
      return {
        ...action.payload,
        error: null,
        state: 'done' as QueryState,
      } as State & Result

    case 'loading_error':
      return {
        ...state,
        ...(action.payload.setResult ? action.payload.result || {} : {}),
        state: 'error' as QueryState,
        error: action.payload.error,
      }

    default:
      return state
  }
}

export type HistoryState<T> = {
  past: T[];
  present: T;
  future: T[];
};

type HistoryOptions<T> = {
  limit?: number;
  previous?: T;
};

export const DEFAULT_HISTORY_LIMIT = 100;

export const createHistory = <T>(present: T): HistoryState<T> => ({
  past: [],
  present,
  future: [],
});

export const replaceHistoryPresent = <T>(
  history: HistoryState<T>,
  present: T,
): HistoryState<T> => {
  if (Object.is(history.present, present)) {
    return history;
  }

  return {
    ...history,
    present,
  };
};

export const recordHistory = <T>(
  history: HistoryState<T>,
  present: T,
  options: HistoryOptions<T> = {},
): HistoryState<T> => {
  const previous = options.previous ?? history.present;

  if (Object.is(previous, present)) {
    return replaceHistoryPresent(history, present);
  }

  const limit = options.limit ?? DEFAULT_HISTORY_LIMIT;
  const past = [...history.past, previous].slice(-limit);

  return {
    past,
    present,
    future: [],
  };
};

export const undoHistory = <T>(history: HistoryState<T>): HistoryState<T> => {
  const previous = history.past.at(-1);

  if (!previous) {
    return history;
  }

  return {
    past: history.past.slice(0, -1),
    present: previous,
    future: [history.present, ...history.future],
  };
};

export const redoHistory = <T>(history: HistoryState<T>): HistoryState<T> => {
  const next = history.future[0];

  if (!next) {
    return history;
  }

  return {
    past: [...history.past, history.present],
    present: next,
    future: history.future.slice(1),
  };
};

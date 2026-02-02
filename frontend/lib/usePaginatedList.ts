import { useCallback, useEffect, useRef, useState } from "react";

// Stable empty array reference to prevent infinite re-renders
const EMPTY_ARRAY: never[] = [];

export type PaginationStatus = "idle" | "loading" | "loadingMore" | "error";

export type PaginatedResponse<T> = {
  items: T[];
  cursor?: string;
  hasMore: boolean;
};

export type PaginatedErrorMessage = (
  error: unknown,
  mode: "initial" | "more",
) => string;

export type UsePaginatedListOptions<T> = {
  loadPage: (cursor?: string) => Promise<PaginatedResponse<T>>;
  getErrorMessage?: PaginatedErrorMessage;
  isErrorIgnorable?: (error: unknown) => boolean;
  initialItems?: T[];
  initialStatus?: PaginationStatus;
};

export type PaginatedListResult<T> = {
  items: T[];
  cursor?: string;
  hasMore: boolean;
  status: PaginationStatus;
  error: string;
  loadInitial: () => Promise<void>;
  loadMore: () => Promise<void>;
  reset: () => void;
  updateItems: (updater: (previous: T[]) => T[]) => void;
  replaceItems: (items: T[]) => void;
};

export function usePaginatedList<T>({
  loadPage,
  getErrorMessage,
  isErrorIgnorable,
  initialItems = EMPTY_ARRAY as T[],
  initialStatus = "idle",
}: UsePaginatedListOptions<T>): PaginatedListResult<T> {
  const getErrorMessageRef = useRef<PaginatedErrorMessage | undefined>(
    getErrorMessage,
  );
  const isErrorIgnorableRef = useRef<
    ((error: unknown) => boolean) | undefined
  >(isErrorIgnorable);
  const [items, setItems] = useState<T[]>(initialItems);
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [hasMore, setHasMore] = useState(false);
  const [status, setStatus] = useState<PaginationStatus>(initialStatus);
  const [error, setError] = useState("");
  const requestIdRef = useRef(0);

  useEffect(() => {
    getErrorMessageRef.current = getErrorMessage;
  }, [getErrorMessage]);

  useEffect(() => {
    isErrorIgnorableRef.current = isErrorIgnorable;
  }, [isErrorIgnorable]);

  const applyResponse = useCallback(
    (response: PaginatedResponse<T>, mode: "initial" | "more") => {
      setItems((prev) =>
        mode === "initial" ? response.items : [...prev, ...response.items],
      );
      setCursor(response.cursor);
      setHasMore(response.hasMore);
    },
    [],
  );

  const startRequest = useCallback(
    async (cursorParam: string | undefined, mode: "initial" | "more") => {
      const requestId = requestIdRef.current + 1;
      requestIdRef.current = requestId;

      setStatus(mode === "initial" ? "loading" : "loadingMore");
      setError("");

      try {
        const response = await loadPage(cursorParam);
        if (requestIdRef.current !== requestId) {
          return;
        }
        applyResponse(response, mode);
        setStatus("idle");
      } catch (err) {
        if (requestIdRef.current !== requestId) {
          return;
        }
        if (isErrorIgnorableRef.current?.(err)) {
          setStatus("idle");
          return;
        }
        const fallbackMessage =
          mode === "more" ? "Failed to load more" : "Failed to load items";
        const message = getErrorMessageRef.current
          ? getErrorMessageRef.current(err, mode)
          : err instanceof Error
            ? err.message
            : fallbackMessage;
        setError(message);
        setStatus("error");
        setHasMore(false);
        setCursor(undefined);
      }
    },
    [applyResponse, loadPage],
  );

  const loadInitial = useCallback(
    () => startRequest(undefined, "initial"),
    [startRequest],
  );

  const loadMore = useCallback(() => {
    if (status === "loading" || status === "loadingMore" || status === "error") {
      return Promise.resolve();
    }
    if (!hasMore || !cursor) {
      return Promise.resolve();
    }
    return startRequest(cursor, "more");
  }, [cursor, hasMore, startRequest, status]);

  const reset = useCallback(() => {
    requestIdRef.current += 1;
    setItems(initialItems);
    setCursor(undefined);
    setHasMore(false);
    setStatus("idle");
    setError("");
  }, [initialItems]);

  const updateItems = useCallback((updater: (previous: T[]) => T[]) => {
    setItems((previous) => updater(previous));
  }, []);

  const replaceItems = useCallback((nextItems: T[]) => {
    setItems(nextItems);
  }, []);

  return {
    items,
    cursor,
    hasMore,
    status,
    error,
    loadInitial,
    loadMore,
    reset,
    updateItems,
    replaceItems,
  };
}

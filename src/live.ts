import type { RestCacheType } from "./restCache";

/** The part of `EventSource` live updates use, so another can stand in. */
export interface EventSourceLike {
  addEventListener(type: string, listener: (event: MessageEvent) => void): void;
  close(): void;
}

export interface LiveUpdatesOptions {
  /** Sends cookies with the stream when it's on another origin. */
  withCredentials?: boolean;
  /** Makes the event source; `new EventSource(url, init)` by default. */
  eventSource?: (url: string, init: EventSourceInit) => EventSourceLike;
  /** Called with a message that couldn't be read (invalid JSON, say). */
  onError?: (error: unknown) => void;
}

type EntityRef = { __typename: string; id: string };

/**
 * Connects a Server-Sent Events stream to the cache. The server sends three
 * kinds of events, each with JSON data:
 *
 * - `entities`: any JSON holding objects with a `__typename` and an `id`.
 *   They're merged into the cache, as a query's response would be, and the
 *   components showing them re-render.
 * - `invalidate`: an array of paths (`["/jobs"]`). The queries under them
 *   refetch, as with `invalidateQueries`: for lists that gained or lost items.
 * - `evict`: an array of `{ __typename, id }`, removed from the cache.
 *
 * When the stream comes back after an error, every query refetches, since
 * messages may have been missed meanwhile. A path starting with `/` is taken
 * from the cache's `baseUrl`, like a query's. Returns a function that closes
 * the stream.
 */
export const connectLiveUpdates = (
  restCache: RestCacheType,
  path: string,
  options: LiveUpdatesOptions = {}
): (() => void) => {
  const url = /^https?:\/\//.test(path) ? path : `${restCache.baseUrl}${path}`;
  const makeSource =
    options.eventSource ?? ((url: string, init: EventSourceInit) => new EventSource(url, init));
  const source = makeSource(url, { withCredentials: options.withCredentials ?? false });

  const handle =
    <T>(apply: (data: T) => void) =>
    (event: MessageEvent) => {
      let data: T;
      try {
        data = JSON.parse(event.data) as T;
      } catch (error) {
        options.onError?.(error);
        return;
      }
      apply(data);
    };

  source.addEventListener(
    "entities",
    handle<unknown>((data) => restCache.write(data))
  );
  source.addEventListener(
    "invalidate",
    handle<string[]>((paths) => {
      if (!Array.isArray(paths)) {
        options.onError?.(new Error("react-rest-cache: `invalidate` expects an array of paths."));
        return;
      }
      paths.forEach((path) => restCache.invalidateQueries(path));
    })
  );
  source.addEventListener(
    "evict",
    handle<EntityRef[]>((refs) => {
      if (!Array.isArray(refs)) {
        options.onError?.(new Error("react-rest-cache: `evict` expects an array of entities."));
        return;
      }
      refs.forEach((ref) => restCache.evict(ref));
    })
  );

  // The browser reconnects by itself after an error; what was sent in
  // between is lost, so everything shown is fetched again.
  let interrupted = false;
  source.addEventListener("error", () => {
    interrupted = true;
  });
  source.addEventListener("open", () => {
    if (interrupted) {
      interrupted = false;
      restCache.invalidateQueries();
    }
  });

  return () => source.close();
};

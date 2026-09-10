/* tslint:disable */
/* eslint-disable */

/**
 * One live session's fold, held open between frames.
 *
 * The streaming counterpart to [`fold_session`], wrapping the same
 * [`crate::domain::fold::FoldMachineImpl`] the server folds with. A caller following a session
 * keeps one of these per session for as long as the session lasts: frames
 * must arrive in log order. Successful loads replace its committed history.
 *
 * A durable-log client catches up with [`Self::snapshot`] and follows with
 * [`Self::push_rows`]. Raw recording consumers use [`Self::extend`] and
 * [`Self::push`] without requiring row metadata. Refolding the
 * fetched log into a throwaway and then pushing live frames into a second
 * machine would derive the same messages twice from different halves of the
 * log; there is one machine per session precisely so that cannot happen.
 */
export class FoldStream {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Fold a run of frames in one go, answering with every message derived
     * so far - the catch-up path. See the module docs for why this is not a
     * loop of [`Self::push`].
     *
     * # Errors
     *
     * Returns a JS string when the entries are not log frames.
     */
    extend(entries: any): any;
    /**
     * Every message folded so far, oldest first.
     *
     * The same answer [`fold_session`] gives for the frames pushed so far -
     * they are one fold - which is what a reader relies on when a channel
     * that has been following a session is reopened.
     *
     * # Errors
     *
     * Returns a JS string describing what could not be encoded.
     */
    messages(): any;
    /**
     * The session metadata as it now stands - what the latest
     * `{kind: "metadata"}` event carried, for a caller that caught up with
     * [`Self::extend`] and saw no events.
     *
     * # Errors
     *
     * Returns a JS string describing what could not be encoded.
     */
    metadata(): any;
    /**
     * A machine for `session_id` that has folded nothing.
     *
     * # Errors
     *
     * Returns a JS string when the session id is not a UUID.
     */
    constructor(session_id: string);
    /**
     * Fold one more frame, reporting the changes it implied as an array of
     * `{kind: "new" | "update", message}`, `{kind: "replace", messages}`,
     * and `{kind: "metadata", metadata}`
     * events - empty for a frame that changes nothing, which is most of
     * them.
     *
     * # Errors
     *
     * Returns a JS string when the entry is not a log frame.
     */
    push(entry: any): any;
    /**
     * Ingest durable live rows in delivery order, including snapshot overlap.
     *
     * # Errors
     * Returns a JS string if any row cannot be read or events cannot be encoded.
     */
    push_rows(entries: any): any;
    /**
     * Replace this fold with a durable effective-history snapshot.
     *
     * # Errors
     * Returns a JS string if any durable row cannot be read.
     */
    snapshot(entries: any): any;
}

/**
 * Fold one session's log into the messages a channel renders.
 *
 * `session_id` is the session the entries belong to; it is not repeated per
 * entry, and it is what the returned `agentSessionMessageId`s are built from.
 *
 * Errors only on input this cannot read - a session id that is not a UUID, or
 * entries that are not log frames. The fold itself is total: an unrecognized
 * or half-finished frame yields a partially-known message rather than a
 * failure, because rendering some of a session always beats rendering none.
 *
 * # Errors
 *
 * Returns a JS string describing what could not be read.
 */
export function fold_session(session_id: string, entries: any): any;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_foldstream_free: (a: number, b: number) => void;
    readonly fold_session: (a: number, b: number, c: any) => [number, number, number];
    readonly foldstream_extend: (a: number, b: any) => [number, number, number];
    readonly foldstream_messages: (a: number) => [number, number, number];
    readonly foldstream_metadata: (a: number) => [number, number, number];
    readonly foldstream_new: (a: number, b: number) => [number, number, number];
    readonly foldstream_push: (a: number, b: any) => [number, number, number];
    readonly foldstream_push_rows: (a: number, b: any) => [number, number, number];
    readonly foldstream_snapshot: (a: number, b: any) => [number, number, number];
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_exn_store: (a: number) => void;
    readonly __externref_table_alloc: () => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __externref_table_dealloc: (a: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;

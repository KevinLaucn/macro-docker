/* tslint:disable */
/* eslint-disable */

export class CacheEngine {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Returns the opaque identity bound to this cache, or `null` when no
     * identity-bearing response has been stored yet.
     */
    boundIdentity(): Promise<any>;
    /**
     * Claims the oldest runnable queued mutation.
     */
    claimNextMutation(owner: string, now_ms: number, lease_expires_at_ms: number): Promise<any>;
    /**
     * Drops all cached state, including the durable mutation queue.
     */
    clear(): Promise<any>;
    /**
     * Consumes the engine, closes Turso and all OPFS handles, then preserves a
     * healthy database or resets a latched-unhealthy database before releasing
     * the exclusive owner lock. Every later instance method rejects.
     */
    close(): Promise<any>;
    /**
     * Atomically replaces a claimed optimistic layer with the real network
     * response and removes it from the durable queue.
     */
    commitOptimisticWrite(transaction_id: string, lease_owner: string, lease_generation: string, query: string, operation_name: string | null | undefined, variables: any, data: any): Promise<any>;
    /**
     * Returns the current in-memory cache revision as an unsigned decimal string.
     */
    currentRevision(): Promise<any>;
    /**
     * Retains a retryable mutation and releases its queue lease.
     */
    deferOptimisticWrite(transaction_id: string, lease_owner: string, lease_generation: string, next_attempt_at_ms: number, error: string): Promise<any>;
    /**
     * Deletes stale records from memory and Turso after a server-side
     * mutation and resolves to affected local operation ids.
     */
    deleteKeys(keys: string[]): Promise<any>;
    /**
     * Durably queues a mutation and its optimistic response, then attempts
     * to claim the strict queue head before resolving. Claim failures are
     * returned as a nested diagnostic outcome because enqueue succeeded.
     */
    enqueueOptimisticMutation(origin_op_id: string | null | undefined, uuid: string, query: string, operation_name: string | null | undefined, variables: any, data: any, link_patches: any, revalidations: any, created_at_ms: number, lease_owner: string, now_ms: number, lease_expires_at_ms: number): Promise<any>;
    /**
     * Evaluates one exact current-profile GraphQL Soup filter request.
     */
    entityFilter(request: any): Promise<any>;
    /**
     * Reacts to a cache reset performed by another engine instance sharing
     * the same storage (cross-tab broadcast). Drops local in-memory state
     * and resolves to every local operation id (all must re-execute).
     */
    externalReset(): Promise<any>;
    /**
     * Normalizes and stores a query response while returning only fields not
     * marked `@cacheOnly` in the GraphQL document.
     */
    hydrateQuery(query: string, operation_name: string | null | undefined, variables: any, data: any, identity?: string | null): Promise<any>;
    /**
     * Enumerates and materializes cached variants of one generated query field.
     */
    inspectQuery(query: string, operation_name: string | null | undefined, path: any, variable_filters: any): Promise<any>;
    /**
     * Recovers cached query variables without materializing each variant.
     */
    inspectQueryVariants(query: string, operation_name: string | null | undefined, path: any): Promise<any>;
    /**
     * Evicts externally-changed records from the hot tier (cross-tab
     * broadcasts, push invalidation). Resolves to the affected local
     * operation ids.
     */
    invalidateKeys(keys: string[]): Promise<any>;
    /**
     * Physically resets and recreates this instance's OPFS database while
     * retaining the exclusive owner lock. The instance remains usable after
     * the fresh engine has been installed.
     */
    physicalReset(): Promise<any>;
    /**
     * Returns payload-free durable mutation queue diagnostics.
     */
    queueDiagnostics(): Promise<any>;
    /**
     * Attempts a cache read. Resolves to `{kind:"hit",data}` or
     * `{kind:"miss"}`. When `opId` is given, the operation is registered
     * as active for dependency-driven re-execution.
     */
    readQuery(op_id: string | null | undefined, query: string, operation_name: string | null | undefined, variables: any, entity_resolvers: any): Promise<any>;
    /**
     * Projects explicit normalized entity keys through a named GraphQL
     * fragment without scanning storage.
     */
    readRecordsByKeys(document: string, fragment_name: string, keys: any): Promise<any>;
    /**
     * Reloads optimistic layers after another engine changes the durable
     * queue and returns locally affected operations.
     */
    refreshOptimisticQueue(): Promise<any>;
    /**
     * Permanently fails a claimed mutation and removes its optimistic
     * contribution.
     */
    rollbackOptimisticWrite(transaction_id: string, lease_owner: string, lease_generation: string): Promise<any>;
    /**
     * Searches the compact materialized projection. Empty queries use the
     * indexed recent path; text queries rank the compact catalog without
     * scanning normalized record blobs.
     */
    search(request: any): Promise<any>;
    /**
     * Unregisters an operation (urql teardown).
     */
    teardownOperation(op_id: string): Promise<any>;
    /**
     * Normalizes and stores a network response. Resolves to
     * `{changed: string[], affectedOps: string[], reset: boolean}` —
     * `affectedOps` are the registered operation ids (excluding
     * `originOpId`) whose data changed. `identity` is an opaque session tag
     * (extracted by the exchange from the response); a tag mismatching the
     * cache's bound identity wipes and rebinds atomically with this write.
     */
    writeQuery(context: any, query: string, operation_name: string | null | undefined, variables: any, data: any, identity?: string | null): Promise<any>;
}

/**
 * Recovery-wipes and recreates the cache database for `scope` while holding
 * the same exclusive OPFS owner lock used by [`openCache`](open_cache).
 */
export function destroyCache(scope: string): Promise<void>;

/**
 * Opens (or creates) the cache for `scope` after acquiring its exclusive OPFS
 * owner lock. The physical identity is derived from `scope` alone; disposable
 * incomplete or incompatible files are reset and reopened before returning.
 */
export function openCache(scope: string, hot_capacity?: number | null): Promise<CacheEngine>;

/**
 * Acquires the canonical owner once, recovery-wipes before any Turso open,
 * then opens a fresh cache while continuously retaining that same owner lock.
 */
export function openCacheForRecovery(scope: string, hot_capacity?: number | null): Promise<CacheEngine>;

/**
 * Additive recovery-open API returning the engine and coarse wipe outcome.
 */
export function openCacheForRecoveryWithOutcome(scope: string, hot_capacity?: number | null): Promise<any>;

/**
 * Additive open API returning the engine and payload-free recovery outcome.
 */
export function openCacheWithOutcome(scope: string, hot_capacity?: number | null): Promise<any>;

/**
 * Schema hash baked into this build (build diagnostics).
 */
export function schemaHash(): string;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_cacheengine_free: (a: number, b: number) => void;
    readonly cacheengine_boundIdentity: (a: number) => any;
    readonly cacheengine_claimNextMutation: (a: number, b: number, c: number, d: number, e: number) => any;
    readonly cacheengine_clear: (a: number) => any;
    readonly cacheengine_close: (a: number) => any;
    readonly cacheengine_commitOptimisticWrite: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: number, l: any, m: any) => any;
    readonly cacheengine_currentRevision: (a: number) => any;
    readonly cacheengine_deferOptimisticWrite: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number) => any;
    readonly cacheengine_deleteKeys: (a: number, b: number, c: number) => any;
    readonly cacheengine_enqueueOptimisticMutation: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: any, k: any, l: any, m: any, n: number, o: number, p: number, q: number, r: number) => any;
    readonly cacheengine_entityFilter: (a: number, b: any) => any;
    readonly cacheengine_externalReset: (a: number) => any;
    readonly cacheengine_hydrateQuery: (a: number, b: number, c: number, d: number, e: number, f: any, g: any, h: number, i: number) => any;
    readonly cacheengine_inspectQuery: (a: number, b: number, c: number, d: number, e: number, f: any, g: any) => any;
    readonly cacheengine_inspectQueryVariants: (a: number, b: number, c: number, d: number, e: number, f: any) => any;
    readonly cacheengine_invalidateKeys: (a: number, b: number, c: number) => any;
    readonly cacheengine_physicalReset: (a: number) => any;
    readonly cacheengine_queueDiagnostics: (a: number) => any;
    readonly cacheengine_readQuery: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: any, i: any) => any;
    readonly cacheengine_readRecordsByKeys: (a: number, b: number, c: number, d: number, e: number, f: any) => any;
    readonly cacheengine_refreshOptimisticQueue: (a: number) => any;
    readonly cacheengine_rollbackOptimisticWrite: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => any;
    readonly cacheengine_search: (a: number, b: any) => any;
    readonly cacheengine_teardownOperation: (a: number, b: number, c: number) => any;
    readonly cacheengine_writeQuery: (a: number, b: any, c: number, d: number, e: number, f: number, g: any, h: any, i: number, j: number) => any;
    readonly destroyCache: (a: number, b: number) => any;
    readonly openCache: (a: number, b: number, c: number) => any;
    readonly openCacheForRecovery: (a: number, b: number, c: number) => any;
    readonly openCacheForRecoveryWithOutcome: (a: number, b: number, c: number) => any;
    readonly openCacheWithOutcome: (a: number, b: number, c: number) => any;
    readonly schemaHash: () => [number, number];
    readonly uuid4_str: (a: number, b: number, c: number, d: number, e: number, f: number) => void;
    readonly uuid4_blob: (a: number, b: number, c: number, d: number, e: number, f: number) => void;
    readonly uuid7_str: (a: number, b: number, c: number, d: number, e: number, f: number) => void;
    readonly uuid7: (a: number, b: number, c: number, d: number, e: number, f: number) => void;
    readonly uuid7_ts: (a: number, b: number, c: number, d: number, e: number, f: number) => void;
    readonly uuid_str: (a: number, b: number, c: number, d: number, e: number, f: number) => void;
    readonly uuid_blob: (a: number, b: number, c: number, d: number, e: number, f: number) => void;
    readonly regexp: (a: number, b: number, c: number, d: number, e: number, f: number) => void;
    readonly register_uuid4_blob: (a: number) => number;
    readonly register_uuid4_str: (a: number) => number;
    readonly register_uuid7: (a: number) => number;
    readonly register_uuid7_str: (a: number) => number;
    readonly register_uuid7_ts: (a: number) => number;
    readonly register_uuid_blob: (a: number) => number;
    readonly register_uuid_str: (a: number) => number;
    readonly register_regexp: (a: number) => number;
    readonly wasm_bindgen__convert__closures_____invoke__h94f0c5a74a52e63d: (a: number, b: number, c: any) => [number, number];
    readonly wasm_bindgen__convert__closures_____invoke__hdd954863ec1480f6: (a: number, b: number, c: any, d: any) => void;
    readonly wasm_bindgen__convert__closures_____invoke__h0d09de81a835280a: (a: number, b: number, c: any) => any;
    readonly wasm_bindgen__convert__closures_____invoke__h0d09de81a835280a_1: (a: number, b: number, c: any) => any;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_exn_store: (a: number) => void;
    readonly __externref_table_alloc: () => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_destroy_closure: (a: number, b: number) => void;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
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

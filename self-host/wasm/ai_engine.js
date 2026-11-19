/* @ts-self-types="./ai_engine.d.ts" */

/**
 * An open Illustrator document.
 */
export class AiFile {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        AiFileFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_aifile_free(ptr, 0);
    }
    /**
     * Applies operations (`Op[]` JSON) as one undoable step; steps with
     * the same `coalesce` key in a row undo together. Returns an
     * `EditResult` JSON.
     * @param {string} ops
     * @param {string | null} [coalesce]
     * @returns {string}
     */
    apply(ops, coalesce) {
        let deferred4_0;
        let deferred4_1;
        try {
            const ptr0 = passStringToWasm0(ops, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len0 = WASM_VECTOR_LEN;
            var ptr1 = isLikeNone(coalesce) ? 0 : passStringToWasm0(coalesce, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            var len1 = WASM_VECTOR_LEN;
            const ret = wasm.aifile_apply(this.__wbg_ptr, ptr0, len0, ptr1, len1);
            var ptr3 = ret[0];
            var len3 = ret[1];
            if (ret[3]) {
                ptr3 = 0; len3 = 0;
                throw takeFromExternrefTable0(ret[2]);
            }
            deferred4_0 = ptr3;
            deferred4_1 = len3;
            return getStringFromWasm0(ptr3, len3);
        } finally {
            wasm.__wbindgen_free(deferred4_0, deferred4_1, 1);
        }
    }
    /**
     * Applies other people's entry changes (`EntryChange[]` JSON);
     * returns an `EditResult` JSON of what changed.
     * @param {string} changes
     * @returns {string}
     */
    applyCollab(changes) {
        let deferred3_0;
        let deferred3_1;
        try {
            const ptr0 = passStringToWasm0(changes, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len0 = WASM_VECTOR_LEN;
            const ret = wasm.aifile_applyCollab(this.__wbg_ptr, ptr0, len0);
            var ptr2 = ret[0];
            var len2 = ret[1];
            if (ret[3]) {
                ptr2 = 0; len2 = 0;
                throw takeFromExternrefTable0(ret[2]);
            }
            deferred3_0 = ptr2;
            deferred3_1 = len2;
            return getStringFromWasm0(ptr2, len2);
        } finally {
            wasm.__wbindgen_free(deferred3_0, deferred3_1, 1);
        }
    }
    /**
     * A new document's file: one artboard of `width × height` points.
     * @param {number} width
     * @param {number} height
     * @returns {Uint8Array}
     */
    static blank(width, height) {
        const ret = wasm.aifile_blank(width, height);
        if (ret[3]) {
            throw takeFromExternrefTable0(ret[2]);
        }
        var v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v1;
    }
    /**
     * The canvas bounds of nodes together (`Rect` JSON or `null`).
     * @param {string} ids
     * @returns {string}
     */
    bounds(ids) {
        let deferred2_0;
        let deferred2_1;
        try {
            const ptr0 = passStringToWasm0(ids, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len0 = WASM_VECTOR_LEN;
            const ret = wasm.aifile_bounds(this.__wbg_ptr, ptr0, len0);
            deferred2_0 = ret[0];
            deferred2_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
        }
    }
    /**
     * The entry changes since the last call (`EntryChange[]` JSON).
     * @returns {string}
     */
    collabChanges() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.aifile_collabChanges(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * The document described for search and agents.
     * @returns {string}
     */
    describe() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.aifile_describe(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * Starts editing together: new nodes get ids in `session`
     * (`1..=4095`), and `seed` asks for the document's state (the first
     * person in a new shared document). Returns `EntryChange[]` JSON to
     * write.
     * @param {number} session
     * @param {boolean} seed
     * @returns {string}
     */
    enableCollab(session, seed) {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.aifile_enableCollab(this.__wbg_ptr, session, seed);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * An artboard (or the whole canvas) as PNG at `scale` pixels per
     * point, over white unless `transparent`.
     * @param {number | null | undefined} artboard
     * @param {number} scale
     * @param {boolean} transparent
     * @returns {Uint8Array}
     */
    exportPng(artboard, scale, transparent) {
        const ret = wasm.aifile_exportPng(this.__wbg_ptr, isLikeNone(artboard) ? Number.MAX_SAFE_INTEGER : (artboard) >>> 0, scale, transparent);
        var v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v1;
    }
    /**
     * Fonts text objects use (`FontUse[]` JSON).
     * @returns {string}
     */
    fonts() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.aifile_fonts(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * The topmost object at canvas `(x, y)`: the object itself (`deep`)
     * or the outermost group holding it. `scale` is the view's pixels per
     * unit.
     * @param {number} x
     * @param {number} y
     * @param {number} scale
     * @param {boolean} deep
     * @returns {number | undefined}
     */
    hitTest(x, y, scale, deep) {
        const ret = wasm.aifile_hitTest(this.__wbg_ptr, x, y, scale, deep);
        return ret === Number.MAX_SAFE_INTEGER ? undefined : ret;
    }
    /**
     * The objects a canvas rectangle touches (`number[]` JSON).
     * @param {number} x
     * @param {number} y
     * @param {number} w
     * @param {number} h
     * @param {boolean} deep
     * @returns {string}
     */
    inRect(x, y, w, h, deep) {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.aifile_inRect(this.__wbg_ptr, x, y, w, h, deep);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * One node's properties (`Info` JSON, `null` when unknown).
     * @param {number} id
     * @returns {string}
     */
    info(id) {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.aifile_info(this.__wbg_ptr, id);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * Whether anything was edited since the file was opened.
     * @returns {boolean}
     */
    isEdited() {
        const ret = wasm.aifile_isEdited(this.__wbg_ptr);
        return ret !== 0;
    }
    /**
     * Opens an `.ai` (or `.pdf`) file.
     * @param {Uint8Array} bytes
     */
    constructor(bytes) {
        const ptr0 = passArray8ToWasm0(bytes, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.aifile_new(ptr0, len0);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        this.__wbg_ptr = ret[0];
        AiFileFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * Places an image (PNG, JPEG, GIF, or WebP) filling a canvas
     * rectangle (its pixel size at `(x, y)` when `w` is zero); returns an
     * `EditResult` JSON.
     * @param {Uint8Array} bytes
     * @param {string} name
     * @param {number} x
     * @param {number} y
     * @param {number} w
     * @param {number} h
     * @param {number | null} [parent]
     * @returns {string}
     */
    placeImage(bytes, name, x, y, w, h, parent) {
        let deferred4_0;
        let deferred4_1;
        try {
            const ptr0 = passArray8ToWasm0(bytes, wasm.__wbindgen_malloc);
            const len0 = WASM_VECTOR_LEN;
            const ptr1 = passStringToWasm0(name, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len1 = WASM_VECTOR_LEN;
            const ret = wasm.aifile_placeImage(this.__wbg_ptr, ptr0, len0, ptr1, len1, x, y, w, h, isLikeNone(parent) ? Number.MAX_SAFE_INTEGER : (parent) >>> 0);
            var ptr3 = ret[0];
            var len3 = ret[1];
            if (ret[3]) {
                ptr3 = 0; len3 = 0;
                throw takeFromExternrefTable0(ret[2]);
            }
            deferred4_0 = ptr3;
            deferred4_1 = len3;
            return getStringFromWasm0(ptr3, len3);
        } finally {
            wasm.__wbindgen_free(deferred4_0, deferred4_1, 1);
        }
    }
    /**
     * Redoes the last undone step (`EditResult` JSON).
     * @returns {string}
     */
    redo() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.aifile_redo(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * Makes a font available to text layout (TTF, OTF, collection, WOFF,
     * or WOFF2), named `family` when given; returns its faces as JSON.
     * @param {Uint8Array} bytes
     * @param {string | null} [family]
     * @returns {string}
     */
    static registerFont(bytes, family) {
        let deferred3_0;
        let deferred3_1;
        try {
            const ptr0 = passArray8ToWasm0(bytes, wasm.__wbindgen_malloc);
            const len0 = WASM_VECTOR_LEN;
            var ptr1 = isLikeNone(family) ? 0 : passStringToWasm0(family, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            var len1 = WASM_VECTOR_LEN;
            const ret = wasm.aifile_registerFont(ptr0, len0, ptr1, len1);
            deferred3_0 = ret[0];
            deferred3_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred3_0, deferred3_1, 1);
        }
    }
    /**
     * Draws `width × height` pixels of the canvas from `(x, y)` (canvas
     * units) at `scale` pixels per unit; straight RGBA. `artboards` fills
     * artboards white; `outline` draws paths as thin lines.
     * @param {number} x
     * @param {number} y
     * @param {number} scale
     * @param {number} width
     * @param {number} height
     * @param {boolean} artboards
     * @param {boolean} outline
     * @returns {Uint8Array}
     */
    render(x, y, scale, width, height, artboards, outline) {
        const ret = wasm.aifile_render(this.__wbg_ptr, x, y, scale, width, height, artboards, outline);
        var v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v1;
    }
    /**
     * The layers panel, top to bottom (`Row[]` JSON).
     * @returns {string}
     */
    rows() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.aifile_rows(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * The edited file, as `.ai` (PDF) bytes.
     * @returns {Uint8Array}
     */
    save() {
        const ret = wasm.aifile_save(this.__wbg_ptr);
        if (ret[3]) {
            throw takeFromExternrefTable0(ret[2]);
        }
        var v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v1;
    }
    /**
     * The document's summary (`Summary` JSON).
     * @returns {string}
     */
    summary() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.aifile_summary(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * A text object's lines and caret stops for the type tool
     * (`TextGeometry` JSON, `null` for other nodes).
     * @param {number} id
     * @returns {string}
     */
    textGeometry(id) {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.aifile_textGeometry(this.__wbg_ptr, id);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * The character index nearest a canvas point in a text object.
     * @param {number} id
     * @param {number} x
     * @param {number} y
     * @returns {number | undefined}
     */
    textHit(id, x, y) {
        const ret = wasm.aifile_textHit(this.__wbg_ptr, id, x, y);
        return ret === Number.MAX_SAFE_INTEGER ? undefined : ret;
    }
    /**
     * One node alone, fitted in `size` pixels (PNG; empty when it draws
     * nothing).
     * @param {number} id
     * @param {number} size
     * @returns {Uint8Array}
     */
    thumbnail(id, size) {
        const ret = wasm.aifile_thumbnail(this.__wbg_ptr, id, size);
        var v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v1;
    }
    /**
     * Undoes the last step (`EditResult` JSON).
     * @returns {string}
     */
    undo() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.aifile_undo(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * What could not be read faithfully (`string[]` JSON).
     * @returns {string}
     */
    warnings() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.aifile_warnings(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
}
if (Symbol.dispose) AiFile.prototype[Symbol.dispose] = AiFile.prototype.free;
function __wbg_get_imports() {
    const import0 = {
        __proto__: null,
        __wbg_Error_92b29b0548f8b746: function(arg0, arg1) {
            const ret = Error(getStringFromWasm0(arg0, arg1));
            return ret;
        },
        __wbg___wbindgen_throw_344f42d3211c4765: function(arg0, arg1) {
            throw new Error(getStringFromWasm0(arg0, arg1));
        },
        __wbg_error_a6fa202b58aa1cd3: function(arg0, arg1) {
            let deferred0_0;
            let deferred0_1;
            try {
                deferred0_0 = arg0;
                deferred0_1 = arg1;
                console.error(getStringFromWasm0(arg0, arg1));
            } finally {
                wasm.__wbindgen_free(deferred0_0, deferred0_1, 1);
            }
        },
        __wbg_new_227d7c05414eb861: function() {
            const ret = new Error();
            return ret;
        },
        __wbg_stack_3b0d974bbf31e44f: function(arg0, arg1) {
            const ret = arg1.stack;
            const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len1 = WASM_VECTOR_LEN;
            getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
            getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
        },
        __wbindgen_init_externref_table: function() {
            const table = wasm.__wbindgen_externrefs;
            const offset = table.grow(4);
            table.set(0, undefined);
            table.set(offset + 0, undefined);
            table.set(offset + 1, null);
            table.set(offset + 2, true);
            table.set(offset + 3, false);
        },
    };
    return {
        __proto__: null,
        "./ai_engine_bg.js": import0,
    };
}

const AiFileFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_aifile_free(ptr, 1));

function getArrayU8FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getUint8ArrayMemory0().subarray(ptr / 1, ptr / 1 + len);
}

let cachedDataViewMemory0 = null;
function getDataViewMemory0() {
    if (cachedDataViewMemory0 === null || cachedDataViewMemory0.buffer.detached === true || (cachedDataViewMemory0.buffer.detached === undefined && cachedDataViewMemory0.buffer !== wasm.memory.buffer)) {
        cachedDataViewMemory0 = new DataView(wasm.memory.buffer);
    }
    return cachedDataViewMemory0;
}

function getStringFromWasm0(ptr, len) {
    return decodeText(ptr >>> 0, len);
}

let cachedUint8ArrayMemory0 = null;
function getUint8ArrayMemory0() {
    if (cachedUint8ArrayMemory0 === null || cachedUint8ArrayMemory0.byteLength === 0) {
        cachedUint8ArrayMemory0 = new Uint8Array(wasm.memory.buffer);
    }
    return cachedUint8ArrayMemory0;
}

function isLikeNone(x) {
    return x === undefined || x === null;
}

function passArray8ToWasm0(arg, malloc) {
    const ptr = malloc(arg.length * 1, 1) >>> 0;
    getUint8ArrayMemory0().set(arg, ptr / 1);
    WASM_VECTOR_LEN = arg.length;
    return ptr;
}

function passStringToWasm0(arg, malloc, realloc) {
    if (realloc === undefined) {
        const buf = cachedTextEncoder.encode(arg);
        const ptr = malloc(buf.length, 1) >>> 0;
        getUint8ArrayMemory0().subarray(ptr, ptr + buf.length).set(buf);
        WASM_VECTOR_LEN = buf.length;
        return ptr;
    }

    let len = arg.length;
    let ptr = malloc(len, 1) >>> 0;

    const mem = getUint8ArrayMemory0();

    let offset = 0;

    for (; offset < len; offset++) {
        const code = arg.charCodeAt(offset);
        if (code > 0x7F) break;
        mem[ptr + offset] = code;
    }
    if (offset !== len) {
        if (offset !== 0) {
            arg = arg.slice(offset);
        }
        ptr = realloc(ptr, len, len = offset + arg.length * 3, 1) >>> 0;
        const view = getUint8ArrayMemory0().subarray(ptr + offset, ptr + len);
        const ret = cachedTextEncoder.encodeInto(arg, view);

        offset += ret.written;
        ptr = realloc(ptr, len, offset, 1) >>> 0;
    }

    WASM_VECTOR_LEN = offset;
    return ptr;
}

function takeFromExternrefTable0(idx) {
    const value = wasm.__wbindgen_externrefs.get(idx);
    wasm.__externref_table_dealloc(idx);
    return value;
}

let cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
cachedTextDecoder.decode();
const MAX_SAFARI_DECODE_BYTES = 2146435072;
let numBytesDecoded = 0;
function decodeText(ptr, len) {
    numBytesDecoded += len;
    if (numBytesDecoded >= MAX_SAFARI_DECODE_BYTES) {
        cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
        cachedTextDecoder.decode();
        numBytesDecoded = len;
    }
    return cachedTextDecoder.decode(getUint8ArrayMemory0().subarray(ptr, ptr + len));
}

const cachedTextEncoder = new TextEncoder();

if (!('encodeInto' in cachedTextEncoder)) {
    cachedTextEncoder.encodeInto = function (arg, view) {
        const buf = cachedTextEncoder.encode(arg);
        view.set(buf);
        return {
            read: arg.length,
            written: buf.length
        };
    };
}

let WASM_VECTOR_LEN = 0;

let wasmModule, wasmInstance, wasm;
function __wbg_finalize_init(instance, module) {
    wasmInstance = instance;
    wasm = instance.exports;
    wasmModule = module;
    cachedDataViewMemory0 = null;
    cachedUint8ArrayMemory0 = null;
    wasm.__wbindgen_start();
    return wasm;
}

async function __wbg_load(module, imports) {
    if (typeof Response === 'function' && module instanceof Response) {
        if (typeof WebAssembly.instantiateStreaming === 'function') {
            try {
                return await WebAssembly.instantiateStreaming(module, imports);
            } catch (e) {
                const validResponse = module.ok && expectedResponseType(module.type);

                if (validResponse && module.headers.get('Content-Type') !== 'application/wasm') {
                    console.warn("`WebAssembly.instantiateStreaming` failed because your server does not serve Wasm with `application/wasm` MIME type. Falling back to `WebAssembly.instantiate` which is slower. Original error:\n", e);

                } else { throw e; }
            }
        }

        const bytes = await module.arrayBuffer();
        return await WebAssembly.instantiate(bytes, imports);
    } else {
        const instance = await WebAssembly.instantiate(module, imports);

        if (instance instanceof WebAssembly.Instance) {
            return { instance, module };
        } else {
            return instance;
        }
    }

    function expectedResponseType(type) {
        switch (type) {
            case 'basic': case 'cors': case 'default': return true;
        }
        return false;
    }
}

function initSync(module) {
    if (wasm !== undefined) return wasm;


    if (module !== undefined) {
        if (Object.getPrototypeOf(module) === Object.prototype) {
            ({module} = module)
        } else {
            console.warn('using deprecated parameters for `initSync()`; pass a single object instead')
        }
    }

    const imports = __wbg_get_imports();
    if (!(module instanceof WebAssembly.Module)) {
        module = new WebAssembly.Module(module);
    }
    const instance = new WebAssembly.Instance(module, imports);
    return __wbg_finalize_init(instance, module);
}

async function __wbg_init(module_or_path) {
    if (wasm !== undefined) return wasm;


    if (module_or_path !== undefined) {
        if (Object.getPrototypeOf(module_or_path) === Object.prototype) {
            ({module_or_path} = module_or_path)
        } else {
            console.warn('using deprecated parameters for the initialization function; pass a single object instead')
        }
    }

    if (module_or_path === undefined) {
        module_or_path = new URL('ai_engine_bg.wasm', import.meta.url);
    }
    const imports = __wbg_get_imports();

    if (typeof module_or_path === 'string' || (typeof Request === 'function' && module_or_path instanceof Request) || (typeof URL === 'function' && module_or_path instanceof URL)) {
        module_or_path = fetch(module_or_path);
    }

    const { instance, module } = await __wbg_load(await module_or_path, imports);

    return __wbg_finalize_init(instance, module);
}

export { initSync, __wbg_init as default };

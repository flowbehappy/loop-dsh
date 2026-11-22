import {LoopError} from "./errors.ts"
const numberPattern = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/u
/** Preserve Go json.Number lexemes, including int64 values beyond JS precision. */
export class WireNumber {
  readonly raw: string
  constructor(raw: string) { if (!numberPattern.test(raw)) throw new LoopError("loop-host/invalid-state", "Invalid JSON number"); this.raw = raw }
  integer(): bigint {
    if (!/^-?(?:0|[1-9]\d*)$/u.test(this.raw)) throw new LoopError("loop-host/invalid-state", "Expected an integer")
    return BigInt(this.raw)
  }
}
export function parseWire(raw: string, options: {duplicates?: "reject" | "last"} = {}): any {
  if (Buffer.byteLength(raw) > 32 << 20) throw new LoopError("loop-host/invalid-state", "JSON exceeds the state size budget")
  let index = 0
  const invalid = (): never => { throw new LoopError("loop-host/invalid-state", "Invalid stored JSON") }
  const space = () => { while (/[ \n\r\t]/u.test(raw[index] ?? "x")) index++ }
  const string = (): string => {
    const start = index++
    while (index < raw.length) {
      if (raw[index] === "\\") { index += 2; continue }
      if (raw[index++] === '"') { try { return Buffer.from(JSON.parse(raw.slice(start,index)),"utf8").toString("utf8") } catch { return invalid() } }
    }
    return invalid()
  }
  const value = (depth: number): any => {
    if (depth > 128) return invalid()
    space()
    if (raw[index] === '"') return string()
    if (raw[index] === "{") {
      index++; space(); const object = Object.create(null)
      if (raw[index] === "}") {index++; return object}
      for (;;) {
        if (raw[index] !== '"') return invalid()
        const key = string(); space()
        if (raw[index++] !== ":") return invalid()
        if (options.duplicates !== "last" && Object.hasOwn(object,key)) return invalid()
        object[key] = value(depth+1); space()
        const next = raw[index++]
        if (next === "}") return object
        if (next !== ",") return invalid()
        space()
      }
    }
    if (raw[index] === "[") {
      index++; space(); const array: any[] = []
      if (raw[index] === "]") {index++; return array}
      for (;;) {
        array.push(value(depth+1)); space(); const next = raw[index++]
        if (next === "]") return array
        if (next !== ",") return invalid()
      }
    }
    for (const [word,result] of [["true",true],["false",false],["null",null]] as const) {
      if (raw.startsWith(word,index)) {index+=word.length; return result}
    }
    const match = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/u.exec(raw.slice(index))
    if (!match) return invalid()
    index += match[0].length
    return new WireNumber(match[0])
  }
  const result = value(0); space()
  if (index !== raw.length) return invalid()
  return result
}
function quote(value: string): string {
  return JSON.stringify(Buffer.from(value,"utf8").toString("utf8")).replace(/[<>&\u2028\u2029]/gu, char => "\\u" + char.charCodeAt(0).toString(16).padStart(4,"0"))
}
/** Matches Go map marshaling; struct callers may preserve their declared order. */
export function stringifyWire(value: unknown, options: {sortKeys?: boolean} = {}): string {
  const seen = new Set<object>()
  function encode(item: any, depth: number): string {
    if (depth > 128) throw new LoopError("loop-host/invalid-state", "JSON nesting exceeds the state budget")
    if (item === null) return "null"
    if (item instanceof WireNumber) return item.raw
    if (typeof item === "bigint") return item.toString()
    if (typeof item === "string") return quote(item)
    if (typeof item === "boolean") return String(item)
    if (typeof item === "number" && Number.isFinite(item)) {
      if (Number.isInteger(item) && !Number.isSafeInteger(item)) throw new LoopError("loop-host/invalid-state", "Use a lossless number for an int64 value")
      return Object.is(item,-0) ? "-0" : JSON.stringify(item)
    }
    if (typeof item !== "object" || seen.has(item)) throw new LoopError("loop-host/invalid-state", "State must contain finite JSON values")
    seen.add(item)
    let result: string
    if (Array.isArray(item)) result = "[" + item.map(value => encode(value,depth+1)).join(",") + "]"
    else {
      const keys = Object.keys(item)
      if (options.sortKeys !== false) keys.sort((a,b) => Buffer.compare(Buffer.from(a),Buffer.from(b)))
      result = "{" + keys.map(key => quote(key) + ":" + encode(item[key],depth+1)).join(",") + "}"
    }
    seen.delete(item)
    return result
  }
  return encode(value,0)
}
export function integer(value: unknown): bigint {
  if (value instanceof WireNumber) return value.integer()
  if (typeof value === "bigint") return value
  if (typeof value === "number" && Number.isSafeInteger(value)) return BigInt(value)
  throw new LoopError("loop-host/invalid-state", "Invalid integer in state")
}
/** Plain Host/UI values; large integral identities remain exact decimal strings. */
export function publicValue(value:any):any{
  if(value instanceof WireNumber){
    if(/^-?\d+$/u.test(value.raw))return publicValue(value.integer())
    const number=Number(value.raw)
    if(!Number.isFinite(number))throw new LoopError("loop-host/backend-invalid","Non-finite public number")
    return number
  }
  if(typeof value==="bigint")return value>=BigInt(Number.MIN_SAFE_INTEGER)&&value<=BigInt(Number.MAX_SAFE_INTEGER)?Number(value):value.toString()
  if(Array.isArray(value))return value.map(publicValue)
  if(value && typeof value==="object")return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,publicValue(item)]))
  return value
}

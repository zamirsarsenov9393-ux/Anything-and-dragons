/**
 * Безопасный язык формул для контент-пакетов.
 * Пример: `10 + dex.mod + con.mod`, `max(1, cha.mod)`, `floor(level.class.paladin / 2) + cha.mod`.
 * Строка разбирается в AST; eval не используется. Неизвестные имена отклоняются при разборе.
 */

export type FormulaNode =
  | { k: 'num'; v: number }
  | { k: 'var'; name: string }
  | { k: 'neg'; x: FormulaNode }
  | { k: 'bin'; op: '+' | '-' | '*' | '/'; a: FormulaNode; b: FormulaNode }
  | { k: 'call'; fn: FormulaFn; args: FormulaNode[] };

const FUNCTIONS = { min: Math.min, max: Math.max, floor: Math.floor, ceil: Math.ceil, abs: Math.abs } as const;
export type FormulaFn = keyof typeof FUNCTIONS;

const VAR_PATTERNS: RegExp[] = [
  /^(str|dex|con|int|wis|cha)\.(mod|score)$/,
  /^prof$/,
  /^level\.total$/,
  /^level\.class\.[a-z0-9-]+$/,
];

export class FormulaError extends Error {
  constructor(message: string, readonly source: string, readonly pos: number) {
    super(`${message} (позиция ${pos}): «${source}»`);
  }
}

type Tok = { t: 'num'; v: number; p: number } | { t: 'id'; v: string; p: number } | { t: 'op'; v: string; p: number };

function tokenize(src: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i]!;
    if (c === ' ' || c === '\t') { i++; continue; }
    if (/[0-9]/.test(c)) {
      const m = /^[0-9]+(\.[0-9]+)?/.exec(src.slice(i))!;
      out.push({ t: 'num', v: Number(m[0]), p: i }); i += m[0].length; continue;
    }
    if (/[a-z]/.test(c)) {
      const m = /^[a-z][a-z0-9-]*(\.[a-z0-9-]+)*/.exec(src.slice(i))!;
      out.push({ t: 'id', v: m[0], p: i }); i += m[0].length; continue;
    }
    if ('+-*/(),'.includes(c)) { out.push({ t: 'op', v: c, p: i }); i++; continue; }
    throw new FormulaError(`Недопустимый символ «${c}»`, src, i);
  }
  return out;
}

const cache = new Map<string, FormulaNode>();

export function parseFormula(src: string): FormulaNode {
  const hit = cache.get(src);
  if (hit) return hit;
  const toks = tokenize(src);
  let i = 0;
  const peek = () => toks[i];
  const fail = (msg: string): never => { throw new FormulaError(msg, src, peek()?.p ?? src.length); };
  const expectOp = (v: string) => { const t = peek(); if (t?.t === 'op' && t.v === v) i++; else fail(`Ожидалось «${v}»`); };

  function expr(): FormulaNode {
    let a = term();
    for (let t = peek(); t?.t === 'op' && (t.v === '+' || t.v === '-'); t = peek()) { i++; a = { k: 'bin', op: t.v, a, b: term() }; }
    return a;
  }
  function term(): FormulaNode {
    let a = unary();
    for (let t = peek(); t?.t === 'op' && (t.v === '*' || t.v === '/'); t = peek()) { i++; a = { k: 'bin', op: t.v, a, b: unary() }; }
    return a;
  }
  function unary(): FormulaNode {
    const t = peek();
    if (t?.t === 'op' && t.v === '-') { i++; return { k: 'neg', x: unary() }; }
    return atom();
  }
  function atom(): FormulaNode {
    const t = peek();
    if (!t) return fail('Неожиданный конец формулы');
    if (t.t === 'num') { i++; return { k: 'num', v: t.v }; }
    if (t.t === 'op' && t.v === '(') { i++; const e = expr(); expectOp(')'); return e; }
    if (t.t === 'id') {
      i++;
      const next = peek();
      if (next?.t === 'op' && next.v === '(') {
        if (!(t.v in FUNCTIONS)) fail(`Неизвестная функция «${t.v}»`);
        i++;
        const args: FormulaNode[] = [expr()];
        while (peek()?.t === 'op' && peek()!.v === ',') { i++; args.push(expr()); }
        expectOp(')');
        return { k: 'call', fn: t.v as FormulaFn, args };
      }
      if (!VAR_PATTERNS.some((r) => r.test(t.v))) fail(`Неизвестная переменная «${t.v}»`);
      return { k: 'var', name: t.v };
    }
    return fail(`Неожиданный символ «${t.v}»`);
  }

  const ast = expr();
  if (i < toks.length) fail('Лишние символы в конце');
  cache.set(src, ast);
  return ast;
}

/** Проверка без вычисления — для импорта пакетов. */
export function validateFormula(src: string): string | null {
  try { parseFormula(src); return null; } catch (e) { return (e as Error).message; }
}

export interface FormulaScope {
  abilities: Record<string, number>;
  modifiers: Record<string, number>;
  prof: number;
  totalLevel: number;
  /** уровень класса по слагу (`wizard`) */
  classLevels: Record<string, number>;
}

function lookup(name: string, s: FormulaScope): number {
  if (name === 'prof') return s.prof;
  if (name === 'level.total') return s.totalLevel;
  if (name.startsWith('level.class.')) return s.classLevels[name.slice(12)] ?? 0;
  const [ab, kind] = name.split('.') as [string, string];
  return kind === 'mod' ? (s.modifiers[ab] ?? 0) : (s.abilities[ab] ?? 0);
}

function evalNode(n: FormulaNode, s: FormulaScope): number {
  switch (n.k) {
    case 'num': return n.v;
    case 'var': return lookup(n.name, s);
    case 'neg': return -evalNode(n.x, s);
    case 'call': return (FUNCTIONS[n.fn] as (...a: number[]) => number)(...n.args.map((a) => evalNode(a, s)));
    case 'bin': {
      const a = evalNode(n.a, s), b = evalNode(n.b, s);
      if (n.op === '+') return a + b;
      if (n.op === '-') return a - b;
      if (n.op === '*') return a * b;
      return b === 0 ? 0 : a / b;
    }
  }
}

/** Итог формулы всегда целый: дробь округляется вниз, как в правилах D&D. */
export function evaluateFormula(src: string, scope: FormulaScope): number {
  return Math.floor(evalNode(parseFormula(src), scope));
}

/** Лист персонажа в PDF: pdf-lib + встроенный кириллический шрифт, работает офлайн. */
import { PDFDocument, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import type { EngineResult } from '../core/types';
import type { CharacterBundle } from '../data/repo';
import { useApp } from './store';
import { nameOf, textOf } from './content';
import { ABILITY_KEYS, signed, term, tr } from './i18n';

const W = 595.28, H = 841.89, M = 40;
const GOLD = rgb(0.6, 0.47, 0.25), INK = rgb(0.1, 0.09, 0.08), MUTED = rgb(0.42, 0.39, 0.35);

class Writer {
  page!: PDFPage;
  y = 0;
  constructor(private doc: PDFDocument, private font: PDFFont, private bold: PDFFont) { this.newPage(); }
  newPage() { this.page = this.doc.addPage([W, H]); this.y = H - M; }
  ensure(h: number) { if (this.y - h < M) this.newPage(); }
  text(s: string, o: { size?: number; bold?: boolean; color?: ReturnType<typeof rgb>; x?: number; width?: number; gap?: number } = {}) {
    const size = o.size ?? 10, f = o.bold ? this.bold : this.font, x = o.x ?? M, width = o.width ?? W - M - x;
    for (const para of clean(s).split('\n')) {
      const lines = wrap(para, f, size, width);
      for (const line of lines) { this.ensure(size + 3); this.page.drawText(line, { x, y: this.y - size, size, font: f, color: o.color ?? INK }); this.y -= size + 3; }
      this.y -= o.gap ?? 0;
    }
  }
  heading(s: string) { this.ensure(30); this.y -= 8; this.text(s, { size: 14, bold: true, color: GOLD }); this.page.drawLine({ start: { x: M, y: this.y }, end: { x: W - M, y: this.y }, thickness: 0.6, color: GOLD }); this.y -= 6; }
  box(x: number, y: number, w: number, h: number, label: string, value: string, sub?: string) {
    this.page.drawRectangle({ x, y: y - h, width: w, height: h, borderColor: GOLD, borderWidth: 0.8 });
    this.page.drawText(clean(label).toUpperCase(), { x: x + 6, y: y - 11, size: 7, font: this.font, color: MUTED });
    const vw = this.bold.widthOfTextAtSize(value, 18);
    this.page.drawText(clean(value), { x: x + (w - vw) / 2, y: y - 32, size: 18, font: this.bold, color: INK });
    if (sub) { const sw = this.font.widthOfTextAtSize(clean(sub), 8); this.page.drawText(clean(sub), { x: x + (w - sw) / 2, y: y - h + 6, size: 8, font: this.font, color: MUTED }); }
  }
}
const clean = (s: string) => s.replace(/\*\*|__|\*/g, '').replace(/[‑−]/g, '-').replace(/\t/g, ' ').replace(/[^\u0000-ɏͰ-ӿ‐-‧‰-⁞€№™]/g, '');
function wrap(s: string, f: PDFFont, size: number, width: number): string[] {
  const words = s.split(/\s+/).filter(Boolean);
  if (!words.length) return [''];
  const out: string[] = []; let line = '';
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (f.widthOfTextAtSize(test, size) <= width) line = test;
    else { if (line) out.push(line); line = w; }
  }
  if (line) out.push(line);
  return out;
}

export async function buildPdf(b: CharacterBundle, r: EngineResult): Promise<Blob> {
  const { lib, contentLang } = useApp.getState();
  const base = import.meta.env.BASE_URL;
  const [reg, bold] = await Promise.all(['fonts/DejaVuSerif.ttf', 'fonts/DejaVuSerif-Bold.ttf'].map((f) => fetch(base + f).then((x) => x.arrayBuffer())));
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  doc.setTitle(b.character.name); doc.setCreator('A&D');
  const w = new Writer(doc, await doc.embedFont(reg!, { subset: true }), await doc.embedFont(bold!, { subset: true }));
  const s = r.sheet;
  const N = (u: string) => nameOf(lib!, u, contentLang);

  w.text(b.character.name, { size: 24, bold: true });
  w.text(`${Object.entries(s.classLevels).map(([u, l]) => `${N(u)} ${l}`).join(' / ')} · D&D 5e ${s.edition}`, { size: 11, color: MUTED });
  const origin = [b.revision.build.speciesUid && N(b.revision.build.speciesUid), b.revision.build.backgroundUid && N(b.revision.build.backgroundUid), b.character.biography.alignment].filter(Boolean).join(' · ');
  if (origin) w.text(origin, { size: 10, color: MUTED });
  w.y -= 10;

  const bw = (W - 2 * M - 5 * 6) / 6;
  ABILITY_KEYS.forEach((a, i) => w.box(M + i * (bw + 6), w.y, bw, 50, term(a, true), signed(s.modifiers[a]), String(s.abilities[a].value)));
  w.y -= 58;
  const stats: [string, string][] = [[tr('КЗ', 'AC'), String(s.armorClass.value)], [tr('Хиты', 'HP'), String(s.hitPointsMax.value)], [tr('Инициатива', 'Init'), signed(s.initiative.value)], [tr('Скорость', 'Speed'), String(s.speed.walk?.value ?? 0)], [tr('Мастерство', 'Prof'), signed(s.proficiencyBonus)], [tr('Пасс. вним.', 'Passive'), String(s.passivePerception.value)]];
  stats.forEach(([k, v], i) => w.box(M + i * (bw + 6), w.y, bw, 44, k, v));
  w.y -= 54;

  const colW = (W - 2 * M - 12) / 2, top = w.y;
  w.text(tr('Спасброски', 'Saving throws'), { bold: true, color: GOLD });
  for (const a of ABILITY_KEYS) w.text(`${s.savingThrows[a].proficient ? '●' : '○'} ${term(a)} ${signed(s.savingThrows[a].value)}`, { size: 9, width: colW });
  w.y -= 6;
  w.text(tr('Владения', 'Proficiencies'), { bold: true, color: GOLD });
  for (const k of ['armor', 'weapon', 'tool', 'language'] as const) if (s.proficiencies[k].length) w.text(s.proficiencies[k].map((x) => (x.includes(':') ? N(x) : term(x))).join(', '), { size: 9, width: colW, gap: 2 });
  const leftEnd = w.y;
  w.y = top;
  w.text(tr('Навыки', 'Skills'), { bold: true, color: GOLD, x: M + colW + 12 });
  for (const [id, sk] of Object.entries(s.skills).sort((a, b) => term(a[0]).localeCompare(term(b[0])))) w.text(`${sk.proficiency === 2 ? '◆' : sk.proficiency >= 1 ? '●' : '○'} ${term(id)} (${term(sk.ability, true)}) ${signed(sk.value)}`, { size: 9, x: M + colW + 12 });
  w.y = Math.min(leftEnd, w.y);

  w.heading(tr('Атаки и ресурсы', 'Attacks & resources'));
  w.text(tr(`Атак за действие: ${s.attacksPerAction}`, `Attacks per action: ${s.attacksPerAction}`), { size: 9, color: MUTED });
  for (const a of s.attacks) w.text(`${a.sourceUid ? N(a.sourceUid) : a.name}: ${signed(a.toHit.value)} ${tr('к попаданию', 'to hit')}, ${a.damage} ${term(a.damageType)}`, { size: 10 });
  for (const x of s.resources) w.text(`${x.label}: ${x.max >= 99 ? '∞' : x.max} (${term(x.recharge)})`, { size: 10 });
  if (s.spellSlots.standard.length) w.text(`${tr('Ячейки', 'Slots')}: ${s.spellSlots.standard.map((n, i) => `${i + 1}:${n}`).join('  ')}`, { size: 10 });
  if (s.spellSlots.pact) w.text(`${tr('Магия договора', 'Pact magic')}: ${s.spellSlots.pact.count} × ${s.spellSlots.pact.slotLevel}`, { size: 10 });
  for (const sc of s.spellcasting) w.text(`${N(sc.classUid)}: ${tr('СЛ', 'DC')} ${sc.saveDc.value}, ${tr('атака', 'attack')} ${signed(sc.attackBonus.value)}`, { size: 10 });

  const prepared = Object.values(b.state.preparedSpells).flat();
  const spellUids = [...new Set([...s.grantedSpells.map((g) => g.uid as string), ...prepared])];
  if (spellUids.length) {
    w.heading(tr('Заклинания', 'Spells'));
    const byLvl = new Map<number, string[]>();
    for (const u of spellUids) { const l = (lib!.items.get(u)?.item.mechanics as { level?: number })?.level ?? 0; byLvl.set(l, [...(byLvl.get(l) ?? []), N(u)]); }
    for (const [l, names] of [...byLvl].sort((a, b) => a[0] - b[0])) w.text(`${l === 0 ? tr('Заговоры', 'Cantrips') : tr(`${l} круг`, `Level ${l}`)}: ${names.sort().join(', ')}`, { size: 10, gap: 2 });
  }

  w.heading(tr('Снаряжение', 'Equipment'));
  w.text(b.inventory.map((i) => `${i.contentUid ? N(i.contentUid) : i.customName}${i.qty > 1 ? ` ×${i.qty}` : ''}${i.slot ? ' *' : ''}`).join(', ') || '—', { size: 10 });
  const c = b.state.currency;
  w.text(`${tr('Монеты', 'Coins')}: ${c.pp} ${tr('пм', 'pp')}, ${c.gp} ${tr('зм', 'gp')}, ${c.ep} ${tr('эм', 'ep')}, ${c.sp} ${tr('см', 'sp')}, ${c.cp} ${tr('мм', 'cp')}`, { size: 9, color: MUTED });

  // описания — только из источников, которые разрешают экспорт текста
  const exportable = (u: string) => { const p = lib!.items.get(u)?.pkg; return !!p && p.source.allowedUse.exportText; };
  w.heading(tr('Особенности', 'Features'));
  const seen = new Set<string>();
  for (const f of s.features) {
    if (seen.has(f.uid)) continue; seen.add(f.uid);
    w.text(`${N(f.uid)}${f.level ? ` (${tr('ур.', 'lvl')} ${f.level})` : ''}`, { bold: true, size: 10 });
    const tx = exportable(f.uid) ? textOf(lib!, f.uid, contentLang).body : undefined;
    w.text(tx ?? tr('Описание не экспортируется: лицензия источника.', 'Description not exported (source licence).'), { size: 8.5, color: MUTED, gap: 4 });
  }
  if (spellUids.length) {
    w.heading(tr('Описания заклинаний', 'Spell descriptions'));
    for (const u of spellUids) {
      const sp = lib!.items.get(u)?.item.mechanics as { level: number; castingTime: string; duration: string; concentration: boolean } | undefined;
      w.text(N(u), { bold: true, size: 10 });
      if (sp) w.text(`${sp.level === 0 ? tr('заговор', 'cantrip') : tr(`${sp.level} круг`, `level ${sp.level}`)} · ${sp.castingTime} · ${sp.duration}${sp.concentration ? tr(' · концентрация', ' · concentration') : ''}`, { size: 8.5, color: GOLD });
      const tx = exportable(u) ? textOf(lib!, u, contentLang).body : undefined;
      w.text(tx ?? tr('Описание не экспортируется.', 'Description not exported.'), { size: 8.5, color: MUTED, gap: 4 });
    }
  }
  const bio = b.character.biography;
  if (Object.values(bio).some(Boolean)) {
    w.heading(tr('Биография', 'Biography'));
    for (const [k, label] of [['appearance', tr('Внешность', 'Appearance')], ['personality', tr('Характер', 'Personality')], ['backstory', tr('Предыстория', 'Backstory')], ['notes', tr('Заметки', 'Notes')]] as const) if (bio[k]) { w.text(label, { bold: true }); w.text(bio[k]!, { size: 9.5, gap: 4 }); }
  }
  w.heading(tr('Источники', 'Sources'));
  const pkgs = new Set(r.usedContent.map((u) => u.packageId));
  for (const p of lib!.packages) if (pkgs.has(p.pkg.id) && p.pkg.source.license.attribution) w.text(p.pkg.source.license.attribution, { size: 7.5, color: MUTED, gap: 3 });
  w.text(tr('Создано в A&D — неофициальном конструкторе персонажей, не связанном с Wizards of the Coast.', 'Made with A&D, an unofficial character builder not affiliated with Wizards of the Coast.'), { size: 7.5, color: MUTED });

  const bytes = await doc.save();
  return new Blob([bytes as BlobPart], { type: 'application/pdf' });
}

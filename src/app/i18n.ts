/**
 * Два языка интерфейса: русский и английский. Строки пишутся парой прямо в месте использования —
 * tr('Персонажи', 'Characters'), а игровые термины берутся из общего словаря, чтобы везде звучали одинаково.
 */
import { useApp } from './store';

export type Lang = 'ru' | 'en';
export const tr = (ru: string, en: string) => (useApp.getState().lang === 'en' ? en : ru);
export const useTr = () => { const lang = useApp((s) => s.lang); return (ru: string, en: string) => (lang === 'en' ? en : ru); };

type Term = [ru: string, en: string];
const G: Record<string, Term> = {
  str: ['Сила', 'Strength'], dex: ['Ловкость', 'Dexterity'], con: ['Телосложение', 'Constitution'], int: ['Интеллект', 'Intelligence'], wis: ['Мудрость', 'Wisdom'], cha: ['Харизма', 'Charisma'],
  'str.short': ['СИЛ', 'STR'], 'dex.short': ['ЛВК', 'DEX'], 'con.short': ['ТЕЛ', 'CON'], 'int.short': ['ИНТ', 'INT'], 'wis.short': ['МДР', 'WIS'], 'cha.short': ['ХАР', 'CHA'],
  acrobatics: ['Акробатика', 'Acrobatics'], 'animal-handling': ['Уход за животными', 'Animal Handling'], arcana: ['Магия', 'Arcana'], athletics: ['Атлетика', 'Athletics'], deception: ['Обман', 'Deception'],
  history: ['История', 'History'], insight: ['Проницательность', 'Insight'], intimidation: ['Запугивание', 'Intimidation'], investigation: ['Анализ', 'Investigation'], medicine: ['Медицина', 'Medicine'],
  nature: ['Природа', 'Nature'], perception: ['Внимательность', 'Perception'], performance: ['Выступление', 'Performance'], persuasion: ['Убеждение', 'Persuasion'], religion: ['Религия', 'Religion'],
  'sleight-of-hand': ['Ловкость рук', 'Sleight of Hand'], stealth: ['Скрытность', 'Stealth'], survival: ['Выживание', 'Survival'],
  light: ['Лёгкие доспехи', 'Light armor'], medium: ['Средние доспехи', 'Medium armor'], heavy: ['Тяжёлые доспехи', 'Heavy armor'], shield: ['Щиты', 'Shields'],
  simple: ['Простое оружие', 'Simple weapons'], martial: ['Воинское оружие', 'Martial weapons'],
  acid: ['кислота', 'acid'], bludgeoning: ['дробящий', 'bludgeoning'], cold: ['холод', 'cold'], fire: ['огонь', 'fire'], force: ['силовое поле', 'force'], lightning: ['электричество', 'lightning'], necrotic: ['некротическая энергия', 'necrotic'],
  piercing: ['колющий', 'piercing'], poison: ['яд', 'poison'], psychic: ['психическая энергия', 'psychic'], radiant: ['излучение', 'radiant'], slashing: ['рубящий', 'slashing'], thunder: ['звук', 'thunder'],
  abjuration: ['Ограждение', 'Abjuration'], conjuration: ['Вызов', 'Conjuration'], divination: ['Прорицание', 'Divination'], enchantment: ['Очарование', 'Enchantment'], evocation: ['Воплощение', 'Evocation'], illusion: ['Иллюзия', 'Illusion'], necromancy: ['Некромантия', 'Necromancy'], transmutation: ['Преобразование', 'Transmutation'],
  walk: ['Ходьба', 'Walk'], fly: ['Полёт', 'Fly'], swim: ['Плавание', 'Swim'], climb: ['Лазание', 'Climb'], burrow: ['Копание', 'Burrow'], darkvision: ['Тёмное зрение', 'Darkvision'],
  tiny: ['крошечный', 'tiny'], small: ['маленький', 'small'], large: ['большой', 'large'],
  short: ['короткий отдых', 'short rest'], long: ['долгий отдых', 'long rest'], dawn: ['на рассвете', 'at dawn'], none: ['—', '—'],
  blinded: ['Ослеплён', 'Blinded'], charmed: ['Очарован', 'Charmed'], deafened: ['Оглох', 'Deafened'], frightened: ['Испуган', 'Frightened'], grappled: ['Схвачен', 'Grappled'], incapacitated: ['Недееспособен', 'Incapacitated'],
  invisible: ['Невидим', 'Invisible'], paralyzed: ['Парализован', 'Paralyzed'], petrified: ['Окаменел', 'Petrified'], poisoned: ['Отравлен', 'Poisoned'], prone: ['Сбит с ног', 'Prone'], restrained: ['Опутан', 'Restrained'], stunned: ['Ошеломлён', 'Stunned'], unconscious: ['Без сознания', 'Unconscious'],
  common: ['Общий', 'Common'], dwarvish: ['Дварфский', 'Dwarvish'], elvish: ['Эльфийский', 'Elvish'], giant: ['Великаний', 'Giant'], gnomish: ['Гномий', 'Gnomish'], goblin: ['Гоблинский', 'Goblin'], halfling: ['Язык полуросликов', 'Halfling'], orc: ['Орочий', 'Orc'],
  abyssal: ['Язык Бездны', 'Abyssal'], celestial: ['Небесный', 'Celestial'], draconic: ['Драконий', 'Draconic'], 'deep-speech': ['Глубинная речь', 'Deep Speech'], infernal: ['Инфернальный', 'Infernal'], primordial: ['Первичный', 'Primordial'], sylvan: ['Сильван', 'Sylvan'], undercommon: ['Подземный общий', 'Undercommon'],
  common_rarity: ['обычный', 'common'], uncommon: ['необычный', 'uncommon'], rare: ['редкий', 'rare'], 'very-rare': ['очень редкий', 'very rare'], legendary: ['легендарный', 'legendary'], artifact: ['артефакт', 'artifact'],
};
export function term(key: string, short = false): string {
  const t = G[short ? `${key}.short` : key];
  if (!t) return key.replace(/-/g, ' ');
  return useApp.getState().lang === 'en' ? t[1] : t[0];
}
export const ABILITY_KEYS = ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const;
export const CONDITIONS = ['blinded', 'charmed', 'deafened', 'frightened', 'grappled', 'incapacitated', 'invisible', 'paralyzed', 'petrified', 'poisoned', 'prone', 'restrained', 'stunned', 'unconscious'];
export const signed = (n: number) => (n >= 0 ? `+${n}` : `−${Math.abs(n)}`);
export const plural = (n: number, one: string, few: string, many: string) => {
  const m10 = n % 10, m100 = n % 100;
  return m10 === 1 && m100 !== 11 ? one : m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20) ? few : many;
};

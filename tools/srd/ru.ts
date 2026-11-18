/**
 * Русские названия элементов SRD — пакеты-переводы `srd-5-1-ru` и `srd-5-2-ru`.
 * Перевод названий сделан для A&D. Описания пока на английском (оригинал SRD).
 *   npx tsx tools/srd/ru.ts content/packages
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { contentPackage } from '../../src/content/schema';

const N: Record<string, string> = {
  // классы
  Barbarian: 'Варвар', Bard: 'Бард', Cleric: 'Жрец', Druid: 'Друид', Fighter: 'Воин', Monk: 'Монах', Paladin: 'Паладин', Ranger: 'Следопыт', Rogue: 'Плут', Sorcerer: 'Чародей', Warlock: 'Колдун', Wizard: 'Волшебник',
  // подклассы
  Berserker: 'Берсерк', 'Path of the Berserker': 'Путь берсерка', Lore: 'Коллегия знаний', 'College of Lore': 'Коллегия знаний', Life: 'Домен жизни', 'Life Domain': 'Домен жизни', Land: 'Круг земли', 'Circle of the Land': 'Круг земли',
  Champion: 'Чемпион', 'Open Hand': 'Путь открытой ладони', 'Warrior of the Open Hand': 'Воин открытой ладони', Devotion: 'Клятва преданности', 'Oath of Devotion': 'Клятва преданности', Hunter: 'Охотник', Thief: 'Вор',
  Draconic: 'Драконья кровь', 'Draconic Sorcery': 'Драконье чародейство', Fiend: 'Исчадие', 'Fiend Patron': 'Покровитель-исчадие', Evocation: 'Школа воплощения', Evoker: 'Воплотитель',
  // виды
  Dwarf: 'Дварф', Elf: 'Эльф', Halfling: 'Полурослик', Human: 'Человек', Dragonborn: 'Драконорождённый', Gnome: 'Гном', 'Half-Elf': 'Полуэльф', 'Half-Orc': 'Полуорк', Tiefling: 'Тифлинг', Goliath: 'Голиаф', Orc: 'Орк',
  'Hill Dwarf': 'Холмовой дварф', 'High Elf': 'Высший эльф', 'Lightfoot Halfling': 'Легконогий полурослик', 'Rock Gnome': 'Скальный гном',
  'Draconic Ancestor: Black': 'Предок: чёрный дракон', 'Draconic Ancestor: Blue': 'Предок: синий дракон', 'Draconic Ancestor: Brass': 'Предок: латунный дракон', 'Draconic Ancestor: Bronze': 'Предок: бронзовый дракон', 'Draconic Ancestor: Copper': 'Предок: медный дракон',
  'Draconic Ancestor: Gold': 'Предок: золотой дракон', 'Draconic Ancestor: Green': 'Предок: зелёный дракон', 'Draconic Ancestor: Red': 'Предок: красный дракон', 'Draconic Ancestor: Silver': 'Предок: серебряный дракон', 'Draconic Ancestor: White': 'Предок: белый дракон',
  Drow: 'Дроу', 'High Elf Lineage': 'Высшие эльфы', 'Wood Elf': 'Лесной эльф', Drow_: '', 'Forest Gnome': 'Лесной гном',
  'Cloud Giant': 'Облачный великан', 'Fire Giant': 'Огненный великан', 'Frost Giant': 'Ледяной великан', 'Hill Giant': 'Холмовой великан', 'Stone Giant': 'Каменный великан', 'Storm Giant': 'Штормовой великан',
  Abyssal: 'Бездна', Chthonic: 'Хтоническое наследие', Infernal: 'Инфернальное наследие',
  // предыстории
  Acolyte: 'Прислужник', Criminal: 'Преступник', Sage: 'Мудрец', Soldier: 'Солдат',
  // черты
  Grappler: 'Борец', Alert: 'Бдительный', 'Magic Initiate': 'Посвящённый в магию', 'Savage Attacker': 'Свирепый атакующий', Skilled: 'Одарённый', 'Ability Score Improvement': 'Увеличение характеристик',
  Archery: 'Стрельба', Defense: 'Оборона', 'Great Weapon Fighting': 'Бой большим оружием', 'Two-Weapon Fighting': 'Бой двумя оружиями',
  'Boon of Combat Prowess': 'Дар боевого мастерства', 'Boon of Dimensional Travel': 'Дар пространственных странствий', 'Boon of Fate': 'Дар судьбы', 'Boon of Irresistible Offense': 'Дар неотразимой атаки',
  'Boon of Spell Recall': 'Дар возврата заклинаний', 'Boon of the Night Spirit': 'Дар ночного духа', 'Boon of Truesight': 'Дар истинного зрения',
  // доспехи
  'Padded Armor': 'Стёганый доспех', Padded: 'Стёганый доспех', 'Leather Armor': 'Кожаный доспех', Leather: 'Кожаный доспех', 'Studded Leather Armor': 'Проклёпанный кожаный доспех', 'Studded Leather': 'Проклёпанный кожаный доспех',
  'Hide Armor': 'Шкурный доспех', Hide: 'Шкурный доспех', 'Chain Shirt': 'Кольчужная рубаха', 'Scale Mail': 'Чешуйчатый доспех', Breastplate: 'Кираса', 'Half Plate Armor': 'Полулаты', 'Half Plate': 'Полулаты',
  'Ring Mail': 'Колечный доспех', 'Chain Mail': 'Кольчуга', 'Splint Armor': 'Наборный доспех', Splint: 'Наборный доспех', 'Plate Armor': 'Латы', Plate: 'Латы', Shield: 'Щит',
  // оружие
  Club: 'Дубинка', Dagger: 'Кинжал', Greatclub: 'Палица', Handaxe: 'Ручной топор', Javelin: 'Метательное копьё', 'Light Hammer': 'Лёгкий молот', Mace: 'Булава', Quarterstaff: 'Боевой посох', Sickle: 'Серп', Spear: 'Копьё',
  'Crossbow, light': 'Лёгкий арбалет', 'Light Crossbow': 'Лёгкий арбалет', Dart: 'Дротик', Shortbow: 'Короткий лук', Sling: 'Праща',
  Battleaxe: 'Боевой топор', Flail: 'Цеп', Glaive: 'Глефа', Greataxe: 'Секира', Greatsword: 'Двуручный меч', Halberd: 'Алебарда', Lance: 'Длинное копьё', Longsword: 'Длинный меч', Maul: 'Молот', Morningstar: 'Моргенштерн',
  Pike: 'Пика', Rapier: 'Рапира', Scimitar: 'Скимитар', Shortsword: 'Короткий меч', Trident: 'Трезубец', 'War pick': 'Боевая кирка', 'War Pick': 'Боевая кирка', Warhammer: 'Боевой молот', Whip: 'Кнут',
  Blowgun: 'Духовая трубка', 'Crossbow, hand': 'Ручной арбалет', 'Hand Crossbow': 'Ручной арбалет', 'Crossbow, heavy': 'Тяжёлый арбалет', 'Heavy Crossbow': 'Тяжёлый арбалет', Longbow: 'Длинный лук', Net: 'Сеть', Musket: 'Мушкет', Pistol: 'Пистолет',
  // популярные магические предметы
  'Ring of Protection': 'Кольцо защиты', 'Cloak of Protection': 'Плащ защиты', 'Bracers of Defense': 'Наручи защиты', 'Bag of Holding': 'Сумка хранения', 'Potion of Healing': 'Зелье лечения',
  'Gauntlets of Ogre Power': 'Перчатки силы огра', 'Headband of Intellect': 'Обруч интеллекта', 'Amulet of Health': 'Амулет здоровья',
  // особенности, которые видны на листе чаще всего
  Rage: 'Ярость', 'Unarmored Defense': 'Защита без доспехов', 'Reckless Attack': 'Безрассудная атака', 'Danger Sense': 'Чувство опасности', 'Extra Attack': 'Дополнительная атака', 'Fast Movement': 'Быстрое передвижение',
  'Feral Instinct': 'Дикий инстинкт', 'Brutal Critical': 'Сильный критический удар', 'Relentless Rage': 'Непрерывная ярость', 'Persistent Rage': 'Непреклонная ярость', 'Indomitable Might': 'Неукротимая мощь', 'Primal Champion': 'Первобытный чемпион',
  'Bardic Inspiration': 'Вдохновение барда', 'Jack of All Trades': 'Мастер на все руки', 'Song of Rest': 'Песнь отдыха', Expertise: 'Компетентность', 'Font of Inspiration': 'Источник вдохновения', Countercharm: 'Контрочарование', 'Magical Secrets': 'Тайны магии', 'Superior Inspiration': 'Превосходное вдохновение',
  Spellcasting: 'Использование заклинаний', 'Channel Divinity': 'Божественный канал', 'Destroy Undead': 'Уничтожение нежити', 'Divine Intervention': 'Божественное вмешательство', 'Divine Strike': 'Божественный удар',
  'Wild Shape': 'Дикий облик', Druidic: 'Друидический язык', 'Timeless Body': 'Безвременное тело', 'Beast Spells': 'Заклинания зверя', Archdruid: 'Архидруид',
  'Fighting Style': 'Боевой стиль', 'Second Wind': 'Второе дыхание', 'Action Surge': 'Всплеск действий', Indomitable: 'Упорство', 'Improved Critical': 'Улучшенный критический удар', 'Remarkable Athlete': 'Выдающийся атлет', 'Superior Critical': 'Превосходный критический удар', Survivor: 'Уцелевший',
  'Martial Arts': 'Боевые искусства', Ki: 'Ци', 'Unarmored Movement': 'Движение без доспехов', 'Deflect Missiles': 'Отражение снарядов', 'Slow Fall': 'Медленное падение', 'Stunning Strike': 'Ошеломляющий удар', Evasion: 'Увёртливость',
  'Stillness of Mind': 'Спокойствие разума', 'Purity of Body': 'Чистота тела', 'Tongue of the Sun and Moon': 'Язык солнца и луны', 'Diamond Soul': 'Алмазная душа', 'Empty Body': 'Пустое тело', 'Perfect Self': 'Совершенство',
  'Divine Sense': 'Божественное чувство', 'Lay on Hands': 'Наложение рук', 'Lay On Hands': 'Наложение рук', 'Divine Smite': 'Божественная кара', 'Divine Health': 'Божественное здоровье', 'Aura of Protection': 'Аура защиты', 'Aura of Courage': 'Аура отваги', 'Cleansing Touch': 'Очищающее касание',
  'Favored Enemy': 'Избранный враг', 'Natural Explorer': 'Исследователь природы', 'Primeval Awareness': 'Первозданная осведомлённость', "Land's Stride": 'Тропа земли', 'Hide in Plain Sight': 'Маскировка у всех на виду', Vanish: 'Исчезновение', 'Feral Senses': 'Дикие чувства', 'Foe Slayer': 'Убийца врагов',
  'Sneak Attack': 'Скрытая атака', "Thieves' Cant": 'Воровской жаргон', 'Cunning Action': 'Хитрое действие', 'Uncanny Dodge': 'Невероятное уклонение', 'Reliable Talent': 'Надёжный талант', Blindsense: 'Слепое зрение', 'Slippery Mind': 'Скользкий разум', Elusive: 'Неуловимость', 'Stroke of Luck': 'Удача',
  'Font of Magic': 'Источник магии', Metamagic: 'Метамагия', 'Sorcerous Restoration': 'Чародейское восстановление', 'Draconic Resilience': 'Драконья устойчивость',
  'Otherworldly Patron': 'Потусторонний покровитель', 'Pact Magic': 'Магия договора', 'Eldritch Invocations': 'Таинственные воззвания', 'Pact Boon': 'Предмет договора', 'Mystic Arcanum': 'Таинственный арканум', 'Eldritch Master': 'Таинственный мастер',
  'Arcane Recovery': 'Магическое восстановление', 'Arcane Tradition': 'Магическая традиция', 'Spell Mastery': 'Мастерство заклинаний', 'Signature Spells': 'Фирменные заклинания',
  'Weapon Mastery': 'Мастерство оружия', 'Ability Score Improvement ': 'Увеличение характеристик',
  // расовые черты
  Darkvision: 'Тёмное зрение', 'Superior Darkvision': 'Превосходное тёмное зрение', 'Dwarven Resilience': 'Дварфская стойкость', 'Dwarven Toughness': 'Дварфская выносливость', 'Dwarven Combat Training': 'Дварфская боевая тренировка', Stonecunning: 'Знание камня',
  'Keen Senses': 'Обострённые чувства', 'Fey Ancestry': 'Наследие фей', Trance: 'Транс', 'Elf Weapon Training': 'Владение эльфийским оружием', Lucky: 'Везучий', Luck: 'Удача', Brave: 'Храбрость', 'Halfling Nimbleness': 'Проворство полуросликов', 'Naturally Stealthy': 'Естественная скрытность',
  'Breath Weapon': 'Оружие дыхания', 'Damage Resistance': 'Сопротивление урону', 'Draconic Ancestry': 'Наследие драконов', 'Gnome Cunning': 'Гномья хитрость', 'Menacing': 'Угрожающий вид', 'Relentless Endurance': 'Неутомимость', 'Savage Attacks': 'Свирепые атаки',
  'Hellish Resistance': 'Адское сопротивление', 'Infernal Legacy': 'Дьявольское наследие', 'Skill Versatility': 'Разносторонность', Resourceful: 'Находчивость', Skillful: 'Умелость', Versatile: 'Разносторонность', 'Powerful Build': 'Мощное телосложение', 'Large Form': 'Большой облик',
};

const out = process.argv[2] ?? 'content/packages';
for (const id of ['srd-5-1', 'srd-5-2']) {
  const pkg = contentPackage.parse(JSON.parse(readFileSync(join(out, `${id}.json`), 'utf8')));
  if (pkg.kind !== 'content') continue;
  const entries = pkg.items.flatMap((i) => {
    const ru = N[i.name] ?? N[i.name.replace(/^(Circle of the Land|Wild Shape).*/, '$1')] ?? (/^Bardic Inspiration/.test(i.name) ? 'Вдохновение барда' : undefined);
    return ru ? [{ uid: i.id, name: ru }] : [];
  });
  const tr = contentPackage.parse({
    formatVersion: 1, kind: 'translation', id: `${id}-ru`, name: `${pkg.name}: русские названия`, version: '1.0.0', language: 'ru', origin: 'builtin',
    source: { id: `${id}-ru`, title: `${pkg.source.title} — русские названия`, edition: pkg.edition, documentVersion: '1', publisher: 'A&D',
      license: { code: 'CC-BY-4.0', url: 'https://creativecommons.org/licenses/by/4.0/legalcode', attribution: pkg.source.license.attribution, modifications: 'Перевод названий на русский язык выполнен для A&D.' },
      allowedUse: pkg.source.allowedUse },
    target: { packageId: id, range: '^1.0.0' }, entries,
  });
  writeFileSync(join(out, `${id}-ru.json`), JSON.stringify(tr));
  console.log(`${id}-ru: ${entries.length} названий из ${pkg.items.length}`);
}

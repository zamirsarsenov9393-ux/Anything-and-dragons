/** Тесты базы: миграции, персонажи и ревизии, кампании, пакеты, резервная копия. */
import { describe, expect, it } from 'vitest';
import { memoryRepo } from './fixtures/nodeDb';
import { MemoryResolver } from '../src/content/resolver';
import { compute, ENGINE_VERSION } from '../src/core/engine/compute';
import { pkg2014 } from './fixtures/packages';
import { build, levels } from './fixtures/build';
import { MIGRATIONS, SCHEMA_VERSION, migrate } from '../src/data/sql';
import type { ContentPackage } from '../src/content/schema';

const R = new MemoryResolver([pkg2014]);
const mk = (n: number) => build('2014', { base: [15, 13, 14, 8, 12, 10], speciesUid: 't14:species/human' as never, levels: levels('t14', Array(n).fill('fighter')) });
const summarize = (b: ReturnType<typeof mk>) => {
  const r = compute(b, R);
  return { r, summary: { level: r.sheet.totalLevel, classes: 'Fighter', ac: r.sheet.armorClass.value, hp: r.sheet.hitPointsMax.value }, snaps: R.snapshotOf(r.usedContent) };
};

describe('миграции', () => {
  it('создают все таблицы и номер версии; повторный запуск ничего не ломает', async () => {
    const { raw } = await memoryRepo();
    const db = raw();
    const tables = db.exec({ sql: "select name from sqlite_master where type='table'", rowMode: 'array', returnValue: 'resultRows' }).map((r: string[]) => r[0]);
    expect(tables).toEqual(expect.arrayContaining(['character', 'character_revision', 'character_content_ref', 'content_item_text', 'campaign', 'content_fts']));
    expect(db.selectValue("select value from app_meta where key='schema_version'")).toBe(String(SCHEMA_VERSION));
    expect(migrate(db)).toEqual({ from: SCHEMA_VERSION, to: SCHEMA_VERSION });
    expect(MIGRATIONS.length).toBe(SCHEMA_VERSION);
  });
});

describe('персонажи и ревизии', () => {
  it('создание, повышение, отмена, восстановление — история не теряется', async () => {
    const { repo } = await memoryRepo();
    const b1 = mk(1), s1 = summarize(b1);
    const id = await repo.createCharacter({ name: 'Брон', edition: '2014', build: b1, summary: s1.summary, snapshots: s1.snaps, engineVersion: ENGINE_VERSION, inventory: [{ contentUid: 't14:weapon/longsword', qty: 1, slot: 'main-hand' }] });
    let bundle = (await repo.getCharacter(id))!;
    expect(bundle.character.name).toBe('Брон');
    expect(bundle.state.hpCurrent).toBe(s1.summary.hp);
    expect(bundle.inventory).toHaveLength(1);
    expect(bundle.snapshots.length).toBe(s1.snaps.length);

    const b2 = mk(2), s2 = summarize(b2);
    await repo.addRevision(id, 'level-up', b2, s2.summary, s2.snaps, ENGINE_VERSION);
    bundle = (await repo.getCharacter(id))!;
    expect(bundle.revision.build.levels).toHaveLength(2);
    expect(bundle.revisions.map((r) => r.seq)).toEqual([1, 2]);

    expect(await repo.undo(id)).toBe(true);
    bundle = (await repo.getCharacter(id))!;
    expect(bundle.revision.seq).toBe(1);
    expect(bundle.revisions).toHaveLength(2);
    expect(await repo.undo(id)).toBe(false);

    const rev2 = bundle.revisions[1]!;
    await repo.restore(id, rev2.id, s2.summary, s2.snaps, ENGINE_VERSION);
    bundle = (await repo.getCharacter(id))!;
    expect(bundle.revision.kind).toBe('restore');
    expect(bundle.revision.build.levels).toHaveLength(2);
    expect(bundle.revisions).toHaveLength(3);

    const list = await repo.listCharacters();
    expect(list[0]!.summary?.level).toBe(2);
  });

  it('снимки из базы восстанавливают тот же лист без пакета', async () => {
    const { repo } = await memoryRepo();
    const b = mk(3), s = summarize(b);
    const id = await repo.createCharacter({ name: 'А', edition: '2014', build: b, summary: s.summary, snapshots: s.snaps, engineVersion: ENGINE_VERSION });
    const bundle = (await repo.getCharacter(id))!;
    const offline = compute(bundle.revision.build, new MemoryResolver([], bundle.snapshots));
    expect(offline.sheet).toEqual(s.r.sheet);
  });

  it('состояние, инвентарь, копия, удаление', async () => {
    const { repo } = await memoryRepo();
    const b = mk(1), s = summarize(b);
    const id = await repo.createCharacter({ name: 'Б', edition: '2014', build: b, summary: s.summary, snapshots: s.snaps, engineVersion: ENGINE_VERSION });
    await repo.saveState(id, { hpCurrent: 3, conditions: ['poisoned'], currency: { cp: 0, sp: 5, ep: 0, gp: 12, pp: 0 } });
    const itemId = await repo.addItem(id, { contentUid: 't14:armor/chain-mail' });
    await repo.updateItem(itemId, { slot: 'armor' });
    await repo.addItem(id, { customName: 'Верёвка', qty: 2 });
    let bundle = (await repo.getCharacter(id))!;
    expect(bundle.state.hpCurrent).toBe(3);
    expect(bundle.state.conditions).toEqual(['poisoned']);
    expect(bundle.inventory.find((i) => i.id === itemId)?.slot).toBe('armor');
    await repo.removeItem(itemId);
    const copyId = await repo.duplicateCharacter(id, ENGINE_VERSION);
    expect((await repo.getCharacter(copyId))!.character.name).toBe('Б (копия)');
    await repo.deleteCharacter(id);
    expect(await repo.getCharacter(id)).toBeUndefined();
    bundle = (await repo.getCharacter(copyId))!;
    expect(bundle.revisions).toHaveLength(1);
  });
});

describe('кампании', () => {
  it('кампания с игроками, журналом, заметками и персонажем', async () => {
    const { repo } = await memoryRepo();
    const cid = await repo.createCampaign({ name: 'Стимпанк', edition: '2014', dmName: 'Замир' });
    const pid = await repo.addPlayer(cid, 'Алексей');
    await repo.addLog(cid, { title: 'Сессия 1', body: 'Встреча в таверне', sessionNo: 1 });
    await repo.addNote('campaign', cid, 'Не забыть карту');
    const b = mk(1), s = summarize(b);
    await repo.createCharacter({ name: 'В', edition: '2014', build: b, summary: s.summary, snapshots: s.snaps, engineVersion: ENGINE_VERSION, campaignId: cid });
    await repo.updateCampaign(cid, { currentLevel: 3, status: 'paused' });
    let c = (await repo.getCampaign(cid))!;
    expect(c.campaign.currentLevel).toBe(3);
    expect(c.players.map((p) => p.name)).toEqual(['Алексей']);
    expect(c.logs[0]!.title).toBe('Сессия 1');
    expect(c.notes).toHaveLength(1);
    expect(c.characters).toHaveLength(1);
    await repo.removePlayer(cid, pid);
    await repo.removeLog(c.logs[0]!.id);
    await repo.removeNote(c.notes[0]!.id);
    c = (await repo.getCampaign(cid))!;
    expect(c.players).toEqual([]);
    expect(c.logs).toEqual([]);
    await repo.deleteCampaign(cid);
    expect(await repo.getCampaign(cid)).toBeUndefined();
    // персонаж остаётся без кампании
    expect((await repo.listCharacters())[0]!.campaignId).toBeNull();
  });
});

describe('контент-пакеты в базе', () => {
  it('сохранение и загрузка пакета без потерь; перевод; отключение; удаление', async () => {
    const { repo } = await memoryRepo();
    const hb = { ...pkg2014, id: 'hb', origin: 'homebrew' } as ContentPackage;
    await repo.registerPackage(hb, 'homebrew', true);
    const loaded = await repo.loadStoredPackage('hb');
    expect(loaded).toEqual(expect.objectContaining({ id: 'hb', kind: 'content' }));
    if (loaded?.kind !== 'content' || hb.kind !== 'content') throw new Error();
    expect(loaded.items.length).toBe(hb.items.length);
    const fighterA = hb.items.find((i) => i.id === 't14:class/fighter')!;
    const fighterB = loaded.items.find((i) => i.id === 't14:class/fighter')!;
    expect(fighterB.mechanics).toEqual(fighterA.mechanics);
    // одинаковый лист из исходного и восстановленного пакета
    expect(compute(mk(5), new MemoryResolver([loaded])).sheet).toEqual(compute(mk(5), new MemoryResolver([hb])).sheet);

    const tr = { formatVersion: 1, kind: 'translation', id: 'hb-ru', name: 'RU', version: '1.0.0', language: 'ru', origin: 'homebrew', dependencies: [],
      source: { id: 'hb-ru', title: 'Перевод', edition: 'any', documentVersion: '1', license: { code: 'homebrew-own' }, allowedUse: hb.source.allowedUse },
      target: { packageId: 'hb', range: '*' }, entries: [{ uid: 't14:class/fighter', name: 'Воин' }] } as ContentPackage;
    await repo.registerPackage(tr, 'homebrew', true);
    const trLoaded = await repo.loadStoredPackage('hb-ru');
    expect(trLoaded?.kind === 'translation' && trLoaded.entries[0]!.name).toBe('Воин');

    await repo.setPackageEnabled('hb', false);
    expect((await repo.listPackages()).find((p) => p.pkg.id === 'hb')?.pkg.enabled).toBe(false);
    await repo.deletePackage('hb');
    expect(await repo.loadStoredPackage('hb')).toBeUndefined();
  });

  it('встроенный пакет регистрируется без элементов и не загружается из базы', async () => {
    const { repo } = await memoryRepo();
    await repo.registerPackage(pkg2014, 'builtin', false);
    const list = await repo.listPackages();
    expect(list[0]!.source.licenseCode).toBe('CC-BY-4.0');
    expect(await repo.loadStoredPackage('test-2014')).toBeUndefined();
  });
});

describe('резервная копия', () => {
  it('выгрузка и восстановление базы целиком', async () => {
    const { repo } = await memoryRepo();
    const b = mk(2), s = summarize(b);
    await repo.createCharacter({ name: 'Г', edition: '2014', build: b, summary: s.summary, snapshots: s.snaps, engineVersion: ENGINE_VERSION });
    await repo.setMeta('ui.lang', 'en');
    const bytes = await repo.exportDatabase();
    expect(new TextDecoder().decode(bytes.slice(0, 15))).toBe('SQLite format 3');

    const other = await memoryRepo();
    await other.repo.importDatabase(bytes);
    expect((await other.repo.listCharacters()).map((c) => c.name)).toEqual(['Г']);
    expect(await other.repo.getMeta('ui.lang')).toBe('en');
    await expect(other.repo.importDatabase(new TextEncoder().encode('not a database at all'))).rejects.toThrow('Это не файл базы SQLite');
  });
});

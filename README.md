# A&D — Anything and Dragons

Конструктор персонажей для D&D 5e (редакции 2014 и 2024). Работает на устройстве, без регистрации.

Неофициальный проект. С Wizards of the Coast не связан. Игровые правила берутся из SRD 5.1 и SRD 5.2.1 (CC-BY-4.0).

## Что готово

| Этап | Статус |
|---|---|
| 1. Архитектура и схема базы | готово — [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) |
| 2. Движок правил | готово — [docs/RULES-ENGINE.md](docs/RULES-ENGINE.md) |
| 3. Контент-пакеты SRD | следующий |
| 4–10 | впереди |

## Команды

```
npm ci              # установить зависимости
npm run typecheck   # проверка типов
npm test            # тесты
npm run test:coverage
```

Каждая загрузка в `main` прогоняет проверку типов и тесты в GitHub Actions.

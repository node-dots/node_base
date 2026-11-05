# План реалізації та поточний стан

Оновлено: 5 листопада 2026 року. Цей документ фіксує перевірений стан робочих
гілок і GitHub PR. Відкритий draft PR означає, що зміни ще не прийняті в
`develop`; наявність коду сама по собі не означає завершене завдання.

## Поточні задачі TASK-020–040

| Таска | Стан коду | Pull request | Примітка |
|---|---|---|---|
| TASK-020–031 | Реалізацію розміщено у послідовних гілках | [#75–86](https://github.com/node-dots/node_base/pulls?q=is%3Apr+is%3Aopen+TASK) | Draft PR; потрібна послідовна інтеграція та CI |
| TASK-032 | Реалізацію розміщено у гілці | [#87](https://github.com/node-dots/node_base/pull/87) | Draft; залежить від TASK-029 |
| TASK-033 | Реалізацію розміщено у гілці | [#88](https://github.com/node-dots/node_base/pull/88) | Draft; залежить від TASK-029 |
| TASK-034 | Реалізацію розміщено у гілці | [#89](https://github.com/node-dots/node_base/pull/89) | Draft; базується на TASK-024 |
| TASK-035 | Реалізацію розміщено у гілці | [#90](https://github.com/node-dots/node_base/pull/90) | Draft; залежить від TASK-029 |
| TASK-036 | Реалізацію та unit-тести додано | [#91](https://github.com/node-dots/node_base/pull/91) | Draft; поєднує пошук сценаріїв із перевіркою розкладу |
| TASK-037 | CORS для локальної панелі та негативні preflight-перевірки | [#92](https://github.com/node-dots/node_base/pull/92) | Draft; жива повна панель потребує інтеграції TASK-032/033 |
| TASK-038 | Матриця й HTTP/service негативні тести | [#93](https://github.com/node-dots/node_base/pull/93) | Draft; MongoDB та звіти потребують фінального інтеграційного прогону |
| TASK-039 | Частково: наявний seed груп/catalog задокументовано й перевірено | [#94](https://github.com/node-dots/node_base/pull/94) | Повний demo seed заблоковано відсутністю безпечного provisioning account батьків |
| TASK-040 | Цей інтеграційний план і checklist | у роботі | Windows/macOS, MongoDB replica set та командне review ще потрібні |

PR #75–94 відкриті як draft і розташовані у залежному ланцюжку. Не зливайте
їх у довільному порядку: спершу прийміть залежності, потім оновлюйте базу
наступної гілки. Перевірки GitHub для PR, що націлені на іншу feature-гілку,
не замінюють CI для PR у `develop`.

## Повторювані локальні перевірки

Node.js 22+ потрібен за `package.json`; рекомендовано Node.js 24. Із кореня
чистого checkout:

```powershell
npm.cmd ci
npm.cmd run check
```

```bash
npm ci
npm run check
```

`npm run check` запускає форматування, перевірку синтаксису та unit/HTTP тести.
Для MongoDB replica-set інтеграції запустіть `npm run infra:up`, дочекайтесь
готовності БД і виконайте `npm run test:mongodb`. На Windows використовуйте
`npm.cmd`. Зупинка інфраструктури: `npm run infra:down` (без прапорців
видалення volumes).

Демо seed запускайте лише після перевірки `MONGO_URI`. Ізольований seed:

```powershell
$env:SEED_DATABASE = 'kindergarten_seed_test'
npm.cmd run seed
npm.cmd run seed
Remove-Item Env:SEED_DATABASE
```

Seed наразі наповнює групи та catalog; він не є повним навчальним набором.
Деталі й відсутні сценарії: [стан demo seed](../../development/demo-seed-status.md).

## Інтеграційна демонстрація

Перед показом пройдіть та зафіксуйте результати в
[інтеграційному checklist](../../development/integration-checklist.md):

1. Новий checkout, встановлення залежностей, конфігурація `.env` без секретів у Git.
2. Bootstrap ADMIN, readiness MongoDB, Swagger/OpenAPI.
3. Group/resources → child/enrollment → invoice/payment → withdrawal/refund.
4. Звіти й панель з ADMIN; перевірки чужого scope з іншим account.
5. Generator/forecast/configuration search із явним бюджетом та assumptions.
6. Перезапуск seed і звірка збережених ручних змін.

Не позначати кроки завершеними без збереженого результату й середовища.
У цій Windows-сесії `npm.cmd run check:syntax` успішно перевірив 209 файлів;
`npm.cmd test` завершився з 165 успішними та 22 пропущеними MongoDB-тестами.
`npm.cmd run check` зупинився на `format:check`: Prettier 3.9.10 повідомив про
188 файлів, більшість з яких не змінювались у цих PR. Цей результат треба
розглянути окремо, не форматуючи всю кодову базу в межах TASK-040. Docker CLI
відсутній; MongoDB integration не запускалась. Немає також macOS checkout,
живого demo з двома account чи командної сесії review. Ці перевірки мають
виконати учасники команди й записати ім’я/дату та результат.

## Відомі межі

- Таски TASK-041–050 наразі не знайдені у backlog або GitHub Issues; для них
  немає узгоджених критеріїв.
- TASK-037 має точний development CORS лише для `http://127.0.0.1:8088`;
  авторизація залишається обов’язковою. API sections мають бути перевірені
  проти інтегрованих report endpoints.
- TASK-039 не має дозволеного способу створювати синтетичні account батьків
  і пов’язувати guardians без прямого обходу бізнес-команд.
- TASK-040 не може бути прийнята лише за автоматичними тестами. Потрібні
  чистий Windows та macOS запуск, MongoDB integration, два різні account і
  командна демонстрація/review.

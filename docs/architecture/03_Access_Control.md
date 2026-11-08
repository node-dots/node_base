# Керування ролями, дозволами та доступом до даних

> Детальний довідник політик доступу. Чинні бізнес-вимоги, зокрема права на нові фінансові операції, визначає [узгоджений документ](../requirements/00_Consolidated_Requirements.md). При додаванні сценаріїв перелік дозволів нижче потрібно доповнювати явно; сам приклад не надає дозволу автоматично.

Статус: остаточне рішення для навчального backend-проєкту.

Мова: JavaScript, модулі ES Modules (`import` / `export`). Архітектура: Modular Monolith — модульний моноліт; плоскі модулі з service, repository та DI через конструктори. Документ уточнює правила авторизації попередніх архітектурних документів. Приклади нижче є шаблонами для реалізації, а не готовим модулем застосунку.

## 1. Остаточне рішення

Ролі та дозволи визначаємо в коді. Адміністратор призначає користувачам тільки наявні ролі. Створення довільних ролей через API — програмний інтерфейс застосунку — не реалізуємо.

Використовуємо три окремі поняття:

| Поняття | Відповідає на питання | Приклад |
|---|---|---|
| Роль | Які обов’язки має користувач? | PARENT — законний представник дитини |
| Дозвіл | Яку дію може виконувати? | CHILDREN_READ — перегляд даних дітей |
| Політика доступу | До яких записів і полів дозволено доступ? | Представник бачить лише своїх дітей і дозволені поля |

Назви дозволів описують ресурс і дію: `children:read`. Обмеження «свої», «своя група», «свої заняття» визначають політики. Суфікси `read-own` та `read-assigned-group` більше не використовуємо. Широкий дозвіл `manage` також не використовуємо: створення, редагування, зарахування та публікація — різні дії.

Права кількох ролей об’єднуються. Для конкретної дії об’єднуються лише області доступу ролей, які дають цю дію. Роль PARENT не розширює права викладача на фінансові дані чужих дітей. Невідомий дозвіл, невідома роль або відсутня політика не надають доступу.

Окремих колекцій roles і permissions немає. У `people.account.roles` зберігаються коди ролей, а не копії їхніх дозволів.

## 2. Розміщення файлів

| Файл | Призначення |
|---|---|
| `src/utils/access/roles.js` | Коди ролей із поясненнями |
| `src/utils/access/permissions.js` | Єдиний перелік дозволів із поясненнями |
| `src/modules/people/access/rolePermissions.js` | Відповідність ролей дозволам |
| `src/modules/people/access/makeAuthorizer.js` | Перевірка дозволів без прив’язки до HTTP |
| `src/modules/people/accountRoles.service.js` | Транзакційна команда призначення ролей та аудит |
| `src/modules/groups/groupAccessPolicy.js` | Видимі групи представника і призначеного працівника |
| `src/modules/children/childAccessPolicy.js` | Область записів дітей за guardianship і призначеною групою |
| `src/modules/children/childViewPolicy.js` | Дозволені поля DTO дитини для конкретного запису |
| `src/modules/children/ChildAccessPolicy.js` | Області доступу до дітей |
| `src/modules/children/ChildViewPolicy.js` | Дозволені поля даних дітей |
| `src/modules/scheduling/ScheduleAccessPolicy.js` | Доступ до розкладу та його чернеток |
| `src/middleware/requirePermission.js` | Рання перевірка дозволу в HTTP-маршруті |
| `src/modules/<module>/<module>.module.js` | Збирання залежностей та перевірка конфігурації |

Service отримує authorizer через конструктор та перевіряє права без Express. Middleware виконує ранню перевірку, але не замінює service. Repository реалізує запити з визначеною областю доступу. Майбутні файли нижче є прикладами, не вже реалізованими модулями.

## 3. Єдиний перелік ролей

```javascript
// roles.js
export const ROLES = Object.freeze({
  ADMIN: 'ADMIN',         // Адміністратор системи.
  MANAGER: 'MANAGER',     // Менеджер щоденної роботи садка.
  PARENT: 'PARENT',       // Батько, мати або інший законний представник.
  TEACHER: 'TEACHER',     // Викладач однієї додаткової дисципліни.
  EDUCATOR: 'EDUCATOR',   // Вихователь, закріплений за групою.
  ASSISTANT: 'ASSISTANT', // Помічник вихователя, закріплений за групою.
});
```

Посада і роль — різні поняття. Посада визначає роботу та зарплату; роль — доступ до системи. Людина без увімкненого облікового запису не має доступу незалежно від посади.

## 4. Перелік дозволів

Нижче — базовий перелік для реалізації. Кожен новий endpoint повинен мати явну відповідність дозволу; операції, яких немає в переліку, не отримують дозвіл автоматично.

```javascript
// permissions.js
export const PERMISSIONS = Object.freeze({
  PEOPLE_READ: 'people:read',                 // Перегляд дозволених профілів людей.
  PEOPLE_CREATE: 'people:create',             // Створення профілю людини.
  PEOPLE_UPDATE: 'people:update',             // Редагування дозволених полів профілю.
  ACCOUNTS_MANAGE: 'accounts:manage',         // Увімкнення, блокування та відновлення доступу.
  ROLES_ASSIGN: 'roles:assign',               // Призначення наявних ролей користувачу.

  CHILDREN_READ: 'children:read',             // Перегляд дозволених записів дітей.
  CHILDREN_CREATE: 'children:create',         // Реєстрація дитини.
  CHILDREN_UPDATE: 'children:update',         // Редагування адміністративних даних дитини.
  CHILDREN_ENROLL: 'children:enroll',         // Зарахування до групи.
  CHILDREN_TRANSFER: 'children:transfer',     // Переведення між групами.
  CHILDREN_WITHDRAW: 'children:withdraw',     // Оформлення вибуття.
  CHILDREN_BENEFIT_ASSIGN: 'children:benefit-assign', // Призначення наявної льготи.
  NUTRITION_READ: 'nutrition:read',           // Перегляд харчових даних дітей.
  NUTRITION_UPDATE: 'nutrition:update',       // Редагування харчових даних дітей.

  GROUPS_READ: 'groups:read',                 // Перегляд дозволених даних груп.
  GROUPS_CREATE: 'groups:create',             // Створення групи.
  GROUPS_UPDATE: 'groups:update',             // Зміна параметрів і призначень групи.
  EMPLOYEE_AVAILABILITY_UPDATE: 'employees:availability-update', // Правка доступності.

  CATALOG_READ: 'catalog:read',               // Читання дозволеної частини довідників.
  CATALOG_CREATE: 'catalog:create',           // Створення запису довідника.
  CATALOG_UPDATE: 'catalog:update',           // Правка/деактивація довідника або нова версія.

  SCHEDULES_READ: 'schedules:read',           // Перегляд дозволеного розкладу.
  SCHEDULES_GENERATE: 'schedules:generate',   // Генерація чернетки розкладу.
  SCHEDULES_UPDATE: 'schedules:update',       // Правка дозволених занять у чернетці.
  SCHEDULES_PUBLISH: 'schedules:publish',     // Публікація перевіреного розкладу.

  INVOICES_READ: 'invoices:read',             // Перегляд дозволених рахунків.
  INVOICES_CREATE: 'invoices:create',         // Виставлення рахунків.
  INVOICES_CANCEL: 'invoices:cancel',         // Скасування рахунку за бізнес-правилами.
  PAYMENTS_READ: 'payments:read',             // Перегляд дозволених платежів.
  PAYMENTS_CREATE: 'payments:create',         // Реєстрація повідомлення про оплату.
  PAYMENTS_CONFIRM: 'payments:confirm',       // Підтвердження фактичного надходження грошей.
  PAYMENTS_REJECT: 'payments:reject',         // Відхилення повідомлення про оплату.
  PAYMENTS_REFUND: 'payments:refund',         // Оформлення повернення грошей.

  EXPENSES_READ: 'expenses:read',             // Перегляд витрат.
  EXPENSES_CREATE: 'expenses:create',         // Створення витрат.
  EXPENSES_APPROVE: 'expenses:approve',       // Затвердження витрат.
  REPORTS_OPERATIONS_READ: 'reports:operations-read', // Операційні показники без прибутку.
  REPORTS_FINANCE_READ: 'reports:finance-read',       // Доходи, витрати та прибуток.
  FINANCE_SCENARIOS_RUN: 'finance:scenarios-run',     // Розрахунок фінансових сценаріїв.
  AUDIT_READ: 'audit:read',                   // Перегляд журналу критичних змін.
});
```

Зміна власного пароля та дозволених полів `/me` доступна кожному автентифікованому користувачу. Ці сценарії завжди прив’язані до поточного користувача й не приймають довільний personId. Вони не дозволяють редагувати ролі, зарплату або посаду.

## 5. Відповідність ролей дозволам

```javascript
// rolePermissions.js
import { ROLES } from '../../../../utils/access/roles.js';
import { PERMISSIONS as P } from '../../../../utils/access/permissions.js';
// P — коротке локальне ім’я переліку дозволів PERMISSIONS.

const definitions = {
  // Адміністратор має всі відомі дозволи, без спеціального символу '*'.
  [ROLES.ADMIN]: Object.values(P),

  // Менеджер: операційна робота, без керування ролями та фінансами садка.
  [ROLES.MANAGER]: [
    P.PEOPLE_READ, P.PEOPLE_CREATE, P.PEOPLE_UPDATE,
    P.CHILDREN_READ, P.CHILDREN_CREATE, P.CHILDREN_UPDATE,
    P.CHILDREN_ENROLL, P.CHILDREN_TRANSFER, P.CHILDREN_WITHDRAW,
    P.CHILDREN_BENEFIT_ASSIGN, P.NUTRITION_READ, P.NUTRITION_UPDATE,
    P.GROUPS_READ, P.GROUPS_CREATE, P.GROUPS_UPDATE,
    P.EMPLOYEE_AVAILABILITY_UPDATE, P.CATALOG_READ,
    P.SCHEDULES_READ, P.SCHEDULES_GENERATE, P.SCHEDULES_UPDATE,
    P.SCHEDULES_PUBLISH, P.INVOICES_READ, P.INVOICES_CREATE,
    P.PAYMENTS_READ, P.PAYMENTS_CREATE, P.PAYMENTS_CONFIRM,
    P.PAYMENTS_REJECT, P.REPORTS_OPERATIONS_READ,
  ],

  // Законний представник: дані своїх дітей та їхні оплати.
  [ROLES.PARENT]: [
    P.CHILDREN_READ, P.NUTRITION_READ, P.NUTRITION_UPDATE,
    P.GROUPS_READ, P.SCHEDULES_READ, P.INVOICES_READ,
    P.PAYMENTS_READ, P.PAYMENTS_CREATE,
  ],

  // Викладач: власні заняття та мінімальні дані їхніх груп.
  [ROLES.TEACHER]: [
    P.GROUPS_READ, P.SCHEDULES_READ, P.SCHEDULES_UPDATE,
    P.EMPLOYEE_AVAILABILITY_UPDATE,
  ],

  // Вихователь: діти та харчові дані призначеної групи.
  [ROLES.EDUCATOR]: [
    P.CHILDREN_READ, P.NUTRITION_READ, P.GROUPS_READ,
    P.SCHEDULES_READ, P.EMPLOYEE_AVAILABILITY_UPDATE,
  ],

  // Помічник вихователя: ті самі області перегляду своєї групи.
  [ROLES.ASSISTANT]: [
    P.CHILDREN_READ, P.NUTRITION_READ, P.GROUPS_READ,
    P.SCHEDULES_READ, P.EMPLOYEE_AVAILABILITY_UPDATE,
  ],
};

export const rolePermissions = Object.freeze(
  Object.fromEntries(
    Object.entries(definitions).map(([role, permissions]) => [
      role, Object.freeze(permissions),
    ]),
  ),
);
```

ADMIN не обходить бізнес-обмеження: він також не може переповнити групу, змінити підтверджений платіж довільним PATCH або опублікувати конфліктний розклад. Нові дозволи автоматично доступні ADMIN; додавання дозволу обов’язково проходить перегляд коду.

## 6. Захист від помилок у назвах

У робочому коді не пишемо `'children:read'` вручну — використовуємо `PERMISSIONS.CHILDREN_READ`. Рядок визначений один раз. Коментар пояснює його значення; редактор допомагає автодоповненням.

Помилка `PERMISSIONS.CHILDREN_REED` у JavaScript поверне undefined. Тому обов’язкова перевірка під час запуску охоплює таблицю ролей і кожен дозвіл, використаний у маршруті або сценарії.

```javascript
// makeAuthorizer.js
export function makeAuthorizer({ roles, permissions, rolePermissions }) {
  const knownRoles = new Set(Object.values(roles));
  const knownPermissions = new Set(Object.values(permissions));

  if (knownRoles.size !== Object.keys(roles).length) {
    throw new Error('Коди ролей мають бути унікальними');
  }
  if (knownPermissions.size !== Object.keys(permissions).length) {
    throw new Error('Коди дозволів мають бути унікальними');
  }

  function assertKnown(permission) {
    if (!knownPermissions.has(permission)) {
      throw new Error(`Невідомий дозвіл: ${String(permission)}`);
    }
  }

  for (const role of knownRoles) {
    if (!Object.hasOwn(rolePermissions, role)) {
      throw new Error(`Відсутні налаштування ролі: ${role}`);
    }
  }
  for (const [role, grants] of Object.entries(rolePermissions)) {
    if (!knownRoles.has(role) || !Array.isArray(grants)) {
      throw new Error(`Некоректні налаштування ролі: ${role}`);
    }
    grants.forEach(assertKnown);
    if (new Set(grants).size !== grants.length) {
      throw new Error(`Дозволи ролі ${role} дублюються`);
    }
  }

  function hasPermission(actor, permission) {
    assertKnown(permission);
    if (!actor?.id || !Array.isArray(actor.roles)) return false;
    // Невідома роль у профілі означає некоректний профіль: доступ заборонено.
    if (actor.roles.some((role) => !knownRoles.has(role))) return false;
    return actor.roles.some((role) => rolePermissions[role].includes(permission));
  }

  return Object.freeze({ assertKnown, hasPermission });
}
```

Не перетворюємо помилку конфігурації на дозвіл. Під час складання всіх маршрутів і сценаріїв застосунок повинен завершити запуск з поясненням, якщо константа помилкова. Тести додатково перевіряють цей випадок.

## 7. Поточний користувач

Middleware автентифікації — перевірки особи — перевіряє access JWT (JSON Web Token — підписаний токен доступу), після чого читає актуальний account з MongoDB. Перевіряє enabled і tokenVersion та формує:

```javascript
// Actor — поточний перевірений користувач для сценарію використання.
const actor = {
  id: person.id,         // Рядковий ідентифікатор людини з бази.
  roles: account.roles, // Актуальні ролі з бази, не з body запиту.
};
```

Ролі з клієнтського body або неперевіреного токена не використовуємо. Клієнт не передає trusted actor, область доступу чи список дозволених груп. Зміна ролей набуває чинності на наступному запиті.

`GET /api/v1/groups` застосовує область до списку, `total` і вікової aggregation до пагінації. `GET /groups/:id` повертає 404 для запису поза областю. `POST /groups` вимагає `GROUPS_CREATE`. Маршрути перевіряють автентифікацію і дозвіл, а service повторює перевірку для прямих викликів.

Поки TASK-015 не додає призначення персоналу до контракту групи, educator/assistant без фактичного призначення отримує порожню область. Відсутність даних призначення не перетворюється на доступ до всіх груп.

## 8. Приклад політики доступу до дітей

Політика повертає опис області доступу, а не MongoDB-фільтр. У ній немає Mongoose або Express.

```javascript
// ChildAccessPolicy.js
import { ROLES } from '../../../utils/access/roles.js';

export class ChildAccessPolicy {
  constructor({ groupAssignmentsReader }) {
    // Фасад модуля груп: читає актуальні призначення працівника.
    this.groupAssignmentsReader = groupAssignmentsReader;
  }

  async readScope(actor) {
    if (actor.roles.includes(ROLES.ADMIN)
      || actor.roles.includes(ROLES.MANAGER)) {
      return { kind: 'ALL' }; // Усі діти; дозволені поля перевіряються окремо.
    }

    const guardianId = actor.roles.includes(ROLES.PARENT)
      ? actor.id : null; // Власні діти законного представника.

    const positions = [];
    if (actor.roles.includes(ROLES.EDUCATOR)) positions.push('educator');
    if (actor.roles.includes(ROLES.ASSISTANT)) positions.push('assistant');
    // educator — призначення вихователя; assistant — призначення помічника.

    const groupIds = positions.length > 0
      ? await this.groupAssignmentsReader.findActiveGroupIds({
        personId: actor.id, positions,
      }) : [];

    return {
      kind: 'RELATED', // Об’єднання дозволених зв’язків, не всі записи.
      guardianId,
      groupIds,
    };
  }
}
```

Репозиторій в Infrastructure перетворює область на фільтр:

```javascript
// Фрагмент MongoChildRepository.js.
// toObjectId — локальна перевірка та перетворення рядкового ID у MongoDB ObjectId.
function scopeFilter(scope) {
  if (scope.kind === 'ALL') return {};
  if (scope.kind !== 'RELATED') {
    throw new Error('Невідомий вид області доступу');
  }

  const alternatives = [];
  if (scope.guardianId) {
    alternatives.push({ 'guardians.personId': toObjectId(scope.guardianId) });
  }
  if (scope.groupIds.length > 0) {
    alternatives.push({ groupId: { $in: scope.groupIds.map(toObjectId) } });
  }

  // Порожня область не повинна перетворитися на {}, тобто доступ до всіх.
  return alternatives.length > 0 ? { $or: alternatives } : { _id: { $in: [] } };
}

// Один запис: одночасно перевіряємо його ID та область доступу.
async function findByIdInScope(id, scope) {
  const record = await ChildModel.findOne({
    $and: [{ _id: toObjectId(id) }, scopeFilter(scope)],
  }).lean();
  return record ? mapChildRecord(record) : null;
  // mapChildRecord — адаптер, який повертає звичайний об’єкт зі строковими ID.
}
```

Для списку той самий scopeFilter застосовується до пошуку, підрахунку total і aggregation-запитів ДО pagination. Клієнтський пошук об’єднуємо через `$and` з фільтром політики; не дозволяємо його перезаписати. Не можна отримати всі записи, а потім відфільтрувати їх після pagination.

## 9. Доступ до полів

Доступ до запису не означає доступ до всіх його полів. Використовуємо явні DTO (Data Transfer Object — об’єкт даних для передачі), а не повертаємо документ MongoDB цілком.

| Хто читає | Дозволені поля дитини |
|---|---|
| ADMIN — адміністратор | Адміністративний DTO; credentials сторонніх людей не повертаються |
| MANAGER — менеджер | Операційні дані дитини; зарплати людей не входять у цей endpoint |
| PARENT — представник саме цієї дитини | Власна дитина, представники, харчові дані та призначена льгота |
| EDUCATOR/ASSISTANT — працівник саме цієї групи | ID, ім’я, потрібні вікові дані, група, статус та харчові обмеження; без льгот і оплат |

Фінансові дані повертаються через окремі endpoints рахунків і платежів з власними політиками. При ролях PARENT + EDUCATOR доступ вихователя до чужої дитини не дозволяє отримати її льготу: розширений DTO дозволяється лише після перевірки представництва саме для цього запису.

Приклад перевірки у ChildViewPolicy:

```javascript
// Усі ID у plain objects репозиторію вже перетворені на рядки.
const isGuardian = actor.roles.includes(ROLES.PARENT)
  && child.guardians.some((guardian) => guardian.personId === actor.id);

// Повний DTO законного представника дозволено лише за isGuardian === true.
// Інакше для призначеного працівника використовується мінімальний DTO.
```

Не досить перевірити `actor.roles.includes(PARENT)` — перевіряємо також зв’язок із конкретною дитиною. Для окремої зміни харчових даних policy допускає ADMIN/MANAGER або представника саме цієї дитини. Вихователь має лише NUTRITION_READ і не отримує право запису через свою групу.

## 10. Використання в сценарії та HTTP-маршруті

```javascript
// GetChild.js — сценарій перегляду однієї дитини.
import { PERMISSIONS } from '../../../utils/access/permissions.js';

export class GetChild {
  constructor({ authorizer, childAccessPolicy, childViewPolicy, childRepository }) {
    this.authorizer = authorizer;
    this.childAccessPolicy = childAccessPolicy;
    this.childViewPolicy = childViewPolicy;
    this.childRepository = childRepository;

    // Виконується при складанні залежностей: помилка назви зупинить запуск.
    authorizer.assertKnown(PERMISSIONS.CHILDREN_READ);
  }

  async execute({ childId }, actor) {
    if (!this.authorizer.hasPermission(actor, PERMISSIONS.CHILDREN_READ)) {
      throw new ForbiddenError(); // Немає дозволу на дію: HTTP 403.
    }

    const scope = await this.childAccessPolicy.readScope(actor);
    const child = await this.childRepository.findByIdInScope(childId, scope);
    if (!child) {
      throw new NotFoundError(); // Немає доступного запису: HTTP 404.
    }

    return this.childViewPolicy.toDto(actor, child);
  }
}
```

ForbiddenError і NotFoundError — спільні помилки застосунку, які треба імпортувати з власного модуля помилок. HTTP — протокол запитів; 403 означає заборонену дію, 404 — відсутній або недоступний ресурс. Запит до чужого ID не розкриває, чи існує така дитина.

```javascript
// requirePermission.js — рання перевірка для HTTP-маршруту.
export function makeRequirePermission({ authorizer }) {
  return function requirePermission(permission) {
    authorizer.assertKnown(permission); // Перевірка при реєстрації маршруту.

    return (req, res, next) => {
      if (!req.actor) return next(new UnauthorizedError());
      if (!authorizer.hasPermission(req.actor, permission)) {
        return next(new ForbiddenError());
      }
      return next();
    };
  };
}

// Фрагмент routes: залежності передані фабриці маршрутизатора.
router.get(
  '/:id',
  authenticate, // Перевіряє токен/актуальний account та заповнює req.actor.
  requirePermission(PERMISSIONS.CHILDREN_READ),
  validateChildId, // Перевіряє формат ID; не перевіряє власника.
  async (req, res) => {
    const data = await getChild.execute({ childId: req.params.id }, req.actor);
    res.json({ data });
  },
);
```

UnauthorizedError означає відсутність дієвої автентифікації, код 401. Middleware — проміжний обробник запиту — лише дає ранню відмову. Use Case — сценарій використання — перевіряє доступ повторно, оскільки його можуть викликати не тільки через HTTP. Єдиний обробник помилок перетворює помилки на узгоджений JSON; код відповіді не визначається всередині Domain.

## 11. Інші політики

| Дія | Політика |
|---|---|
| Перегляд рахунку/платежу | ADMIN/MANAGER або представник дитини, до якої належить рахунок |
| Реєстрація повідомлення про оплату | Представник доступної дитини або ADMIN/MANAGER; payerId визначає сервер |
| Підтвердження оплати | ADMIN/MANAGER; повторне підтвердження і переплата контролюються бізнес-правилами |
| Перегляд розкладу | Представник — опублікований розклад групи своєї дитини; викладач — власні заняття; вихователь/помічник — власна група |
| Редагування розкладу | ADMIN/MANAGER — дозволені чернетки; TEACHER — лише час власного заняття в чернетці, без зміни групи/дисципліни/викладача |
| Доступність працівника | Працівник — лише свою; ADMIN/MANAGER — операційні зміни інших працівників |
| Профіль співробітника | MANAGER бачить операційні поля, але не зарплату, passwordHash або tokenVersion |
| Довідники | MANAGER читає операційні довідники, але не фінансові налаштування зарплат/прибутку |

Не можна дозволити TEACHER завантажити повну чернетку всіх груп і перезаписати її. Сервер приймає вузьку команду зміни власного слота та перевіряє загальний розклад сам. Будь-яка дозволена зміна доступності також проходить перевірку конфліктів з опублікованим розкладом.

Для мутацій перевірку власника і запис виконують атомарно: умовним update або в транзакції зі спільним блокуванням змінюваного ресурсу. Не перевіряти представництво один раз, а потім безумовно змінювати запис, якщо зв’язок могли паралельно видалити.

## 12. Призначення ролей адміністратором

```http
PUT /api/v1/people/:id/account/roles
```

```json
{
  "roles": ["TEACHER", "PARENT"]
}
```

Тут TEACHER — викладач, PARENT — законний представник. Масив замінює набір ролей цілком. Вхідні ролі перевіряються Zod — бібліотекою валідації — за значеннями ROLES; довільний рядок відхиляється. Повторення ролей і порожній масив відхиляються; для вимкнення доступу використовується account.enabled.

Правила:

1. Лише користувач із ROLES_ASSIGN може виконати операцію; зараз це тільки ADMIN.
2. Людина має існувати й мати обліковий запис.
3. TEACHER потребує активного профілю співробітника з однією активною дисципліною з catalog. EDUCATOR/ASSISTANT також потребують активного профілю відповідної посади; сама роль не створює призначення групи.
4. Не можна видалити або заблокувати останнього активного ADMIN.
5. Зміна account.roles та аудит виконуються однією транзакцією.
6. Аудит містить виконавця, цільову людину, попередні/нові ролі й час; паролі й токени не записуються.

Захист останнього адміністратора не реалізується простим count перед update. Зміна ролей, блокування й видалення account використовують одну спільну транзакційну guard-запис у catalog SETTINGS (`ACCOUNT_ADMIN_GUARD`). Спочатку оновлюють її revision, потім перевіряють кількість активних адміністраторів і виконують зміну. Це запобігає одночасному видаленню двох останніх адміністраторів без нової колекції.

`PUT /api/v1/people/:id/account/roles` застосовує цей протокол для заміни ролей: guard revision, перевірка активних ADMIN, умовне оновлення account і audit-запис виконуються в одній MongoDB-транзакції. Зміна `tokenVersion` відкликає попередні access tokens.

## 13. Як додати нову дію або роль

### Нова дія

1. Додати константу в PERMISSIONS з українським коментарем.
2. Призначити дозвіл лише потрібним ролям у rolePermissions.
3. У відповідному модулі реалізувати політику записів і дозволених полів.
4. У фабриці service перевірити назву дозволу через assertKnown.
5. У execute перевірити дозвіл і політику; у маршруті додати ранню перевірку.
6. Описати доступ в OpenAPI — специфікації API — та оновити цей документ.
7. Додати перевірки дозволеного й забороненого доступу.

### Нова роль

1. Додати код і українське пояснення в ROLES.
2. Додати явний масив її дозволів у rolePermissions.
3. Визначити області доступу й DTO для кожної дозволеної дії. Нова роль не отримує область ALL за замовчуванням.
4. Визначити передумови її призначення та перевірити їх у сценарії призначення ролей.
5. Додати тести для ролі окремо й у комбінації з іншими ролями.

У MongoDB схему змінювати не потрібно, якщо ролі зберігаються як перевірені коди в масиві. Якщо Mongoose enum також визначено, його будують із Object.values(ROLES), а не дублюють вручну. Зміна прав потребує випуску нової версії коду; редагування дозволів адміністратором у базі не передбачене.

## 14. Обов’язкові перевірки

- Помилка в назві дозволу в rolePermissions або маршруті зупиняє запуск.
- Невідомий код ролі через API відхиляється.
- Представник не отримує чужу дитину через ID, список, пошук або звіт.
- Порожній список призначених груп повертає нуль записів, не всі записи.
- PARENT + EDUCATOR бачить своїй дитині розширені поля, а чужій дитині своєї групи — лише службові поля.
- TEACHER змінює лише власне заняття в чернетці й не публікує розклад.
- MANAGER не може призначити ADMIN, побачити зарплату або повернути кошти.
- Блокування account і зміна ролей діють на наступному запиті.
- Конкурентні операції не можуть залишити систему без активного адміністратора.
- Виклик сценарію без HTTP-маршруту також проходить авторизацію.

## 15. Пам’ятка для кожного розробника

**Константа дозволу → перевірка дії → політика конкретних записів → дозволені поля → виконання бізнес-правил → аудит для критичної зміни.**

Не повертати Mongoose-документ цілком. Не довіряти personId, ролям або областям доступу з клієнта. Не використовувати назви дозволів ручними рядками. Не додавати довільних перевірок ролей у контролери: політики зосереджені в Application відповідного модуля. Коментар до кожної нової ролі, дозволу або нетривіального скорочення пишеться українською.

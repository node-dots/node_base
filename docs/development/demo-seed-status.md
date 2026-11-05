# Поточний стан демонстраційного seed

## Ізольований запуск

`npm run seed` запускає початковий seed груп і catalog. Він дозволений лише для
`kindergarten_dev` та `kindergarten_seed_test`, обирає базу через
`SEED_DATABASE`, використовує сталі ID і `$setOnInsert`. Повторний запуск не
переписує вже наявні поля. Для тесту задайте `SEED_DATABASE` у середовищі
термінала, щоб уникнути запуску на робочій базі.

```powershell
$env:SEED_DATABASE = 'kindergarten_seed_test'
npm.cmd run seed
npm.cmd run seed
Remove-Item Env:SEED_DATABASE
```

```bash
SEED_DATABASE=kindergarten_seed_test npm run seed
SEED_DATABASE=kindergarten_seed_test npm run seed
```

Fixture груп має сталі унікальні ObjectId-сумісні ключі й валідні draft-поля;
це перевіряє `tests/demo-groups.test.js`. Сам запуск MongoDB seed потребує
Docker Compose та фактичної MongoDB replica set.

## Відсутні частини повного сценарію TASK-039

Наявний seed створює лише групи та початковий catalog. Він не створює людей,
акаунти батьків, дітей/зарахування, рахунки, pending/confirmed payments,
refunds, витрати або опублікований розклад. Наразі немає команди чи HTTP
endpoint для безпечного створення account батька; seed цих залежних записів
прямим `insert` обійшов би транзакції, авторизацію та бізнес-правила. Тому
повний наскрізний demo seed не оголошений готовим.

Перед продовженням потрібен узгоджений provisioning flow для синтетичних
account/guardian fixtures. Після цього seed має виконувати доменні команди з
Clock, працювати лише в allowlist database, бути ідемпотентним і зберігати
ручні зміни. Не використовуйте пароль із документації; bootstrap ADMIN
credentials задаються тільки через локальний `.env`.

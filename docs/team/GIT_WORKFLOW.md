# GitHub Workflow для командної розробки

## 1. Призначення гілок

У проєкті використовуємо три основні рівні гілок:

### `main`

Основна, стабільна версія проєкту.

- містить стабільний код;
- використовується як готова версія проєкту;
- учасники команди **не роблять прямі push** у `main`;
- зміни потрапляють у `main` тільки через **Pull Request** з `develop`.

### `develop`

Гілка для інтеграції та тестування нових змін.

- сюди потрапляють готові зміни від учасників команди;
- код із `develop` перевіряється та тестується;
- учасники команди **не роблять прямі push** у `develop`;
- зміни потрапляють у `develop` через **Pull Request** із `feature/*`.

### `feature/*`

Робоча гілка розробника для конкретного завдання.

Наприклад:

```text
feature/login
feature/register
feature/user-profile
feature/add-validation
feature/fix-header
```

Кожне окреме завдання бажано виконувати в окремій `feature/*` гілці.

---

# 2. Загальна схема роботи

```text
                    main
                     ↑
                     │ Pull Request
                     │
                  develop
                     ↑
                     │ Pull Request
                     │
          ┌──────────┼──────────┐
          │          │          │
          ↓          ↓          ↓
   feature/login  feature/api  feature/ui
```

Повний процес:

```text
Учасник команди

       ↓

створює feature/* від develop

       ↓

працює над завданням

       ↓

робить commit

       ↓

робить push

       ↓

створює Pull Request

       ↓

feature/* → develop

       ↓

Code Review

       ↓

Merge

       ↓

тестування develop

       ↓

Pull Request

       ↓

develop → main
```

---

# 3. Встановлення Git

Перевірити, чи встановлений Git:

```bash
git --version
```

Якщо команда повертає версію Git, наприклад:

```text
git version 2.x.x
```

— Git встановлений.

---

# 4. Створення GitHub-акаунта

Кожен учасник команди повинен мати власний GitHub-акаунт.

Після цього керівник проєкту додає учасника до репозиторію.

Необхідно прийняти запрошення до репозиторію.

> Не потрібно використовувати спільний GitHub-акаунт. Кожен учасник команди працює зі свого особистого GitHub-акаунта.

---

# 5. Налаштування SSH-ключа

SSH дозволяє працювати з GitHub без введення пароля під час кожного `push` та `pull`.

Перевірити наявні SSH-ключі:

```bash
ls -la ~/.ssh
```

Якщо ключа ще немає, створити новий:

```bash
ssh-keygen -t ed25519 -C "YOUR_EMAIL"
```

Наприклад:

```bash
ssh-keygen -t ed25519 -C "your@email.com"
```

Під час створення ключа можна залишити стандартний шлях, натиснувши `Enter`.

Після створення будуть файли:

```text
~/.ssh/id_ed25519
~/.ssh/id_ed25519.pub
```

> Файл `id_ed25519` — приватний ключ. Його не можна передавати іншим людям або завантажувати на GitHub.

---

# 6. Додавання SSH-ключа до GitHub

Потрібно отримати публічну частину ключа:

```bash
cat ~/.ssh/id_ed25519.pub
```

Скопіювати весь отриманий рядок.

У GitHub відкрити:

```text
Settings
→ SSH and GPG keys
→ New SSH key
```

Вставити ключ та зберегти його.

---

# 7. Перевірка SSH-з'єднання

Виконати:

```bash
ssh -T git@github.com
```

При успішному налаштуванні GitHub покаже повідомлення приблизно такого вигляду:

```text
Hi USERNAME! You've successfully authenticated, but GitHub does not provide shell access.
```

Це означає, що SSH працює правильно.

---

# 8. Клонування репозиторію

Отримати посилання на репозиторій у GitHub.

Для SSH воно має вигляд:

```text
git@github.com:USERNAME/REPOSITORY.git
```

Наприклад:

```bash
git clone git@github.com:USERNAME/node_base.git
```

Після цього перейти в папку проєкту:

```bash
cd node_base
```

Перевірити підключений репозиторій:

```bash
git remote -v
```

Повинно бути приблизно:

```text
origin  git@github.com:USERNAME/node_base.git (fetch)
origin  git@github.com:USERNAME/node_base.git (push)
```

---

# 9. Налаштування імені та email Git

Перевірити поточні налаштування:

```bash
git config --global user.name
git config --global user.email
```

Встановити своє ім'я:

```bash
git config --global user.name "Ваше Ім'я"
```

Встановити email:

```bash
git config --global user.email "your@email.com"
```

Бажано використовувати email, який прив'язаний до вашого GitHub-акаунта.

---

# 10. Отримання актуальної версії `develop`

Перед початком роботи потрібно перейти на `develop`:

```bash
git checkout develop
```

Отримати останні зміни:

```bash
git pull origin develop
```

Або можна використовувати:

```bash
git switch develop
git pull origin develop
```

> Завжди починайте нове завдання з актуальної версії `develop`.

---

# 11. Створення власної feature-гілки

Не потрібно працювати безпосередньо в `develop`.

Для кожного завдання створюється окрема робоча гілка:

```bash
git checkout -b feature/my-task
```

Наприклад:

```bash
git checkout -b feature/login
```

Або:

```bash
git checkout -b feature/user-registration
```

Перевірити поточну гілку:

```bash
git branch
```

Зірочка `*` показує поточну гілку:

```text
  develop
* feature/login
  main
```

---

# 12. Виконання завдання

Після створення `feature/*` можна працювати з кодом.

Наприклад:

```text
feature/login
```

Розробник:

- змінює код;
- додає необхідні файли;
- запускає проєкт;
- перевіряє свою функціональність;
- виправляє помилки.

Перевірити зміни:

```bash
git status
```

---

# 13. Створення commit

Додати зміни:

```bash
git add .
```

Створити commit:

```bash
git commit -m "feat: add login"
```

Приклади назв commit:

```text
feat: add login
feat: add registration
fix: fix validation error
fix: fix authorization
docs: update README
refactor: improve user service
test: add login tests
```

Бажано писати короткі та зрозумілі повідомлення про те, що саме було зроблено.

---

# 14. Відправлення feature-гілки на GitHub

Перший push:

```bash
git push -u origin feature/login
```

Після цього можна використовувати просто:

```bash
git push
```

Наприклад:

```bash
git push -u origin feature/user-registration
```

---

# 15. Створення Pull Request

Після `push` потрібно відкрити GitHub.

Створити:

```text
Pull Request
```

Правильний напрямок:

```text
feature/login → develop
```

або:

```text
feature/user-registration → develop
```

**Не створювати Pull Request безпосередньо в `main`.**

---

# 16. Що потрібно вказати у Pull Request

Pull Request повинен містити зрозумілу інформацію.

### Що зроблено?

Наприклад:

```text
Додано авторизацію користувача.
```

### Що змінено?

```text
- додано login form;
- додано перевірку email;
- додано валідацію пароля;
- додано API-запит авторизації.
```

### Як перевірити?

Наприклад:

```text
1. Запустити проєкт.
2. Відкрити /login.
3. Ввести коректні дані.
4. Перевірити успішну авторизацію.
```

---

# 17. Code Review

Після створення Pull Request інший учасник команди або керівник проєкту перевіряє код.

Перевіряється:

- чи правильно виконане завдання;
- чи немає очевидних помилок;
- чи відповідає код вимогам;
- чи не зламаний існуючий функціонал;
- чи зрозумілий код;
- чи немає зайвих змін.

Якщо потрібно щось виправити, розробник продовжує працювати у своїй `feature/*` гілці.

Наприклад:

```bash
git add .
git commit -m "fix: update login validation"
git push
```

Pull Request автоматично оновиться.

---

# 18. Merge у `develop`

Після успішного Code Review Pull Request:

```text
feature/login → develop
```

можна об'єднати з `develop`.

Після цього зміни стають частиною загальної версії для тестування.

---

# 19. Після завершення завдання

Після Merge потрібно оновити
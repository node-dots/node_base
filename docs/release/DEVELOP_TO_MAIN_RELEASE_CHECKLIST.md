# Release checklist: `develop` → `main`

Статус: **план підготовлено; реліз заблокований людським acceptance TASK-001/010/040**.

## Перевірений стан гілок

На момент аналізу:

- `develop`: `c4759f2230f9d142872a038f58af3bd342f9d897`;
- `main`: `e53e8fd9b138985657c3ebc8b388746cf84cc130`;
- `git rev-list --left-right --count origin/main...origin/develop`: `2 321`;
- merge-base: `ee2ad97722d02674fdae28af01f79cea53b80e13`.

Два `main`-only commits:

| SHA | Причина | Висновок |
| --- | --- | --- |
| `9eb1d9b` | merge PR #4 зі старого `develop` (CI/docs) | merge topology; CI commit `e58e7b7` уже є предком актуального `develop` |
| `e53e8fd` | merge PR #67 зі старого `develop` (people foundation) | merge topology; people commit `ee2ad97` є merge-base і предком актуального `develop` |

`git diff ee2ad97 e53e8fd` порожній: ці два merge-коміти не несуть окремого tree change.
`git merge-tree --write-tree origin/main origin/develop` завершився без конфліктів, а
результуючий tree SHA збігся з `origin/develop^{tree}`. Тому reset, cherry-pick, force push
або переписування `main` не потрібні.

## Release gates

- [ ] TASK-001 / Issue #6 має реальний team-lead acceptance і статус `Done`.
- [ ] TASK-010 / Issue #15 має незалежну S7 arithmetic verification і статус `Done`.
- [ ] TASK-040 / Issue #62 має проведену командну demo, defect disposition і статус `Done`.
- [ ] Усі blocker/high defects закриті або мають явно погоджений release disposition.
- [ ] `develop` не має відкритих PR, merge conflicts або незавершених required checks.
- [ ] Exact release SHA пройшов Code, MongoDB, Postman і macOS CI.
- [ ] Release PR отримав незалежний approval; автор не self-approve/self-merge всупереч правилам.
- [ ] Version/release notes/tag погоджені; secrets і generated local environment не потрапили у diff.

## Штатна інтеграція

Після виконання gates:

1. `git fetch origin --prune`; повторити SHA/divergence/merge-tree перевірки.
2. Відкрити PR з base `main`, compare `develop`; не push у `main` напряму.
3. У PR додати links на Issues #6, #15, #62, цей checklist, exact test counts і CI run.
4. Переглянути весь `main...develop` diff, особливо workflows, dependencies, migrations,
   `.env.example`, OpenAPI/Postman і history security boundary.
5. Дочекатися всіх required checks і незалежного approval. Не використовувати admin bypass.
6. Виконати дозволений repository merge method; не rebase/force-update опубліковану історію.
7. Перевірити post-merge CI на `main`, health/startup із чистого checkout та merge commit SHA.
8. Лише після цього створити погоджений annotated tag/release notes і оголосити реліз.

До виконання всіх gates формулювання — **«технічно готовий до acceptance/захисту»**, а не
«реліз завершено».

# Планетарий вкуса Аси

Статический Next.js-опыт с 328 обоями, разложенными по визуальной близости на внутренней сфере. Посетитель отмечает понравившиеся узоры и получает свой остров вкуса.

## Локальная разработка

```bash
pnpm install
pnpm dev
```

Проверки:

```bash
pnpm lint
pnpm test
.venv/bin/pytest pipeline -q
pnpm build
pnpm test:e2e
```

## Данные

Готовый статический релиз находится в `public/`. Исходные обои, embedding-кэш и `.env` не отслеживаются Git.

Для пересборки нужен Python 3.11 и `OPENROUTER_API_KEY`:

```bash
python3.11 -m venv .venv
.venv/bin/pip install -r pipeline/requirements.txt
.venv/bin/python pipeline/run.py --clusters 12
```

Если защитный anchor gate остановил проверенное расширение корпуса, после изучения причины допускается явный `--reconcile-registry`. Команда сохраняет существующие публичные ID по пересечению и embedding-близости, а неоднозначный mapping блокирует.

## Деплой

Vercel собирает `output: "export"`. `.vercelignore` исключает Python-пайплайн, сырые обои и локальные секреты. Preview можно проверить командой:

```bash
DEPLOY_URL=https://preview.example pnpm exec playwright test e2e/deploy-smoke.spec.ts
```

# GCP Free Tier HA Migration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Перенести пайплайн вакансий на GCP с контролируемой отказоустойчивостью, автоперезапуском и регулярным бэкапом данных без выхода за Always Free где возможно.

**Architecture:** Базовая модель: `vm-a` (active) + `vm-b` (standby/observer), где мониторинг и рестарт идут через systemd + внешний оркестратор GitHub Actions + Ansible. Для устойчивости health-check опирается не только на ICMP, но и на HTTP `/healthz` и freshness `data/last_run.json`. Данные и секреты разделяются: в GitHub хранится только код и обезличенные артефакты, runtime-state и секреты уходят в защищенное хранилище.

**Tech Stack:** Node.js, Playwright, systemd, Ansible, GitHub Actions, GCP Compute Engine, GCP Cloud Monitoring, Supabase.

---

### Task 1: Зафиксировать целевую архитектуру и ограничения Free Tier

**Files:**
- Create: `docs/operations/gcp-free-tier-architecture.md`
- Create: `docs/operations/gcp-cost-guardrails.md`

**Step 1: Описать hard-ограничения**

Добавить раздел:
- 1 free `e2-micro`-эквивалент по времени в месяц (не 2 постоянные VM бесплатно).
- 30 GB standard persistent disk на billing account.
- Регионы Always Free для Compute Engine: `us-west1`, `us-central1`, `us-east1`.

**Step 2: Описать режимы работы**

Добавить 2 режима:
- `Always-Free mode`: активна 1 VM, вторая выключена/эпизодическая.
- `HA paid-lite mode`: обе VM активны 24/7 с контролем бюджета.

**Step 3: Проверка**

Run: `rg -n "Always-Free|HA paid-lite|e2-micro|30 GB|us-west1|us-central1|us-east1" docs/operations/gcp-free-tier-architecture.md docs/operations/gcp-cost-guardrails.md`
Expected: все ключевые ограничения найдены.

### Task 2: Подготовить приложение к headless/low-memory запуску

**Files:**
- Modify: `scripts/parse_linkedin.js`
- Modify: `scripts/parse_glassdoor.js`
- Modify: `scripts/score_vacancies.js`
- Create: `scripts/healthcheck.js`

**Step 1: Вынести headless режим в ENV**

Добавить `BROWSER_HEADLESS=true|false` с дефолтом `true`.
Заменить жесткие `headless: false` на env-driven значение.

**Step 2: Добавить health endpoint/command**

Создать `scripts/healthcheck.js`, который:
- проверяет свежесть `data/last_run.json` (например, не старше N минут),
- проверяет валидность ключевых JSON файлов,
- возвращает exit code `0/1`.

**Step 3: Проверка**

Run: `node scripts/healthcheck.js`
Expected: `exit 0` при валидном состоянии.

Run: `npm run run:smoke`
Expected: `PASS` без регрессий.

### Task 3: Описать systemd и локальное self-healing

**Files:**
- Create: `infra/systemd/vacancy-pipeline.service`
- Create: `infra/systemd/vacancy-pipeline.timer`
- Create: `infra/systemd/vacancy-health.service`
- Create: `infra/systemd/vacancy-health.timer`
- Create: `infra/bin/recover-local.sh`

**Step 1: Создать unit для pipeline**

`vacancy-pipeline.service`:
- `ExecStart=/usr/bin/node /opt/vacancy/scripts/orchestrate.js`
- `Restart=on-failure`
- `RestartSec=20`
- lock (через `flock`) для исключения параллельных запусков.

**Step 2: Создать health + recover**

`vacancy-health.service` запускает `node scripts/healthcheck.js`.
При fail выполняется `recover-local.sh`:
- `systemctl restart vacancy-pipeline.service`
- запись события в лог.

**Step 3: Проверка**

Run: `systemctl daemon-reload && systemctl enable --now vacancy-pipeline.timer vacancy-health.timer`
Expected: оба timer активны.

### Task 4: Внедрить Ansible bootstrap/deploy/recover

**Files:**
- Create: `infra/ansible/inventory.ini`
- Create: `infra/ansible/group_vars/all.yml`
- Create: `infra/ansible/playbooks/bootstrap.yml`
- Create: `infra/ansible/playbooks/deploy.yml`
- Create: `infra/ansible/playbooks/recover.yml`
- Create: `infra/ansible/roles/app/tasks/main.yml`
- Create: `infra/ansible/roles/systemd/tasks/main.yml`

**Step 1: Bootstrap playbook**

Установка:
- Node LTS,
- Chromium/зависимостей для Playwright,
- systemd units,
- базовых утилит мониторинга.

**Step 2: Deploy playbook**

Деплой кода в `/opt/vacancy`, `npm ci`, обновление unit-файлов, controlled restart.

**Step 3: Recover playbook**

Idempotent команды:
- `ansible.builtin.systemd_service` restart,
- проверка `ansible.builtin.ping`,
- post-check `scripts/healthcheck.js`.

**Step 4: Проверка**

Run: `ansible-playbook -i infra/ansible/inventory.ini infra/ansible/playbooks/deploy.yml --check`
Expected: dry-run без критических ошибок.

### Task 5: Настроить GitHub Actions как внешний оркестратор

**Files:**
- Create: `.github/workflows/deploy.yml`
- Create: `.github/workflows/recover.yml`
- Create: `.github/workflows/health-audit.yml`

**Step 1: Deploy workflow**

Триггеры:
- `push` в `main`,
- `workflow_dispatch`.

Шаги:
- checkout,
- запуск `ansible-playbook deploy.yml`,
- post-deploy smoke.

**Step 2: Recover workflow**

Триггеры:
- `repository_dispatch` (event `vm_unhealthy`),
- `workflow_dispatch`.

Шаги:
- выбор целевой VM,
- запуск `recover.yml`,
- уведомление о результате.

**Step 3: Health-audit workflow**

`schedule` (не на старте часа), который:
- проверяет доступность обеих VM,
- при fail отправляет `repository_dispatch` на recover.

**Step 4: Проверка**

Run: `gh workflow run recover.yml -f target=vm-b`
Expected: успешный запуск и лог recovery.

### Task 6: Разделить backup на code/state/secrets

**Files:**
- Create: `infra/backup/backup.sh`
- Create: `infra/backup/restore.sh`
- Create: `docs/operations/backup-restore.md`
- Modify: `.gitignore`

**Step 1: Определить, что НЕ хранить в GitHub**

Исключить из git backup:
- `auth/*` (cookies/tokens),
- `.env`,
- browser profiles.

**Step 2: Определить, что хранить**

В GitHub (private repo):
- код,
- docs,
- компактные обезличенные JSON snapshots (опционально, по размеру).

В защищенном backup-хранилище:
- runtime-state (`data/*.json` при необходимости),
- encrypted secrets bundle.

**Step 3: Реализовать шифрованный backup**

`backup.sh`:
- собирает архив state,
- шифрует (`age`/`gpg`),
- публикует artifact/объект.

`restore.sh`:
- подтягивает архив,
- расшифровывает,
- валидирует checksum,
- восстанавливает права.

**Step 4: Проверка**

Run: `bash infra/backup/backup.sh && bash infra/backup/restore.sh --verify-only`
Expected: целостность подтверждена.

### Task 7: Ввести двухуровневый health model вместо "VM ping VM"

**Files:**
- Create: `docs/operations/health-model.md`
- Modify: `infra/ansible/group_vars/all.yml`

**Step 1: Описать уровни health**

L1 (инфра): ICMP/TCP reachability.  
L2 (приложение): `scripts/healthcheck.js`, свежесть `data/last_run.json`, статус последних фаз оркестратора.

**Step 2: Внедрить пороги**

Правила:
- 1-2 transient fail -> no action,
- N подряд fail -> recover playbook,
- cooldown после recovery.

**Step 3: Проверка**

Run: `ansible-playbook -i infra/ansible/inventory.ini infra/ansible/playbooks/recover.yml --extra-vars "target=vm-a"`
Expected: сервис перезапущен, health снова `OK`.

### Task 8: Документировать runbook и аварийные сценарии

**Files:**
- Modify: `RUNBOOK.md`
- Create: `docs/operations/failover-runbook.md`

**Step 1: Добавить стандартные сценарии**

- VM down
- app unhealthy
- broken auth session (LinkedIn/Glassdoor)
- Supabase unavailable

**Step 2: Добавить decision tree**

Кто и что запускает:
- local systemd restart,
- GitHub Actions recover,
- manual Ansible fallback.

**Step 3: Проверка**

Run: `rg -n "VM down|app unhealthy|recover|ansible|github actions|failover" RUNBOOK.md docs/operations/failover-runbook.md`
Expected: все аварийные кейсы покрыты.

### Task 9: Включить контроль стоимости и бюджетные алерты

**Files:**
- Create: `docs/operations/cost-alerting.md`
- Create: `infra/gcp/budget-policy.md`

**Step 1: Настроить бюджет и алерты**

Пороги: 25%, 50%, 90%, 100% месячного бюджета.

**Step 2: Привязать уведомления**

Канал в Telegram/email для алертов перерасхода.

**Step 3: Проверка**

Run: `gcloud billing budgets list --billing-account=<ACCOUNT_ID>`
Expected: бюджет и пороги видны.

### Task 10: Провести game day и закрыть внедрение

**Files:**
- Create: `docs/operations/game-day-2026-03.md`

**Step 1: Сценарии теста**

- kill процесса,
- выключение VM,
- порча state файла,
- недоступность Supabase.

**Step 2: Зафиксировать RTO/RPO**

Замерить:
- время детекта,
- время восстановления,
- потерю данных.

**Step 3: Финальная приемка**

Run:
- `npm run run:smoke`
- `ansible-playbook .../deploy.yml --check`
- `gh workflow run health-audit.yml`

Expected: все проверки зеленые, recovery подтвержден.


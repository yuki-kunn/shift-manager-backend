# shift-manager 仕様書

> 最終更新: 2026-06-03（マルチエージェントコードレビュー後）

---

## 1. システム概要

シフト管理 Web アプリケーション。施設単位でスタッフのシフト希望収集・AI シフト生成・カレンダー管理・給与計算を行う。

| 項目 | 技術スタック |
|------|------------|
| フロントエンド | SvelteKit 2 + Svelte 5 runes + Tailwind CSS v4 |
| バックエンド | Hono (Node.js) + Drizzle ORM + SQLite (better-sqlite3) |
| AI | Google Gemini 2.5 Flash |
| 認証 | JWT (HS256, 7日有効) |
| DB | SQLite（Railway ボリューム永続化） |
| FE ホスティング | Vercel |
| BE ホスティング | Railway |

---

## 2. 認証・権限

### ロール

| ロール | 権限 |
|--------|------|
| `admin` | 施設の作成・削除・パスワード変更 |
| `facility` | 自施設のデータのみ閲覧・操作可能 |

### JWT ペイロード

```typescript
type AuthPayload = {
  sub: string;           // ユーザーID
  role: 'admin' | 'facility';
  facilityId?: string;   // facility ロールの場合のみ
}
```

### セキュリティポリシー

- **facilityId フィルター必須**: facility ロールのすべての API は `facilityId` で自施設データのみに限定する
- **所有権チェック**: schedules, events の更新・削除は `facilityId` 一致を確認してから実行
- `shift-requests` の GET は自施設の従業員 ID セットでフィルタリング

---

## 3. データモデル

### employees（従業員）

| カラム | 型 | 説明 |
|-------|-----|------|
| id | TEXT PK | UUID |
| facility_id | TEXT | 施設ID |
| name | TEXT | 氏名 |
| reading | TEXT \| NULL | 読み仮名（任意） |
| type | TEXT | 種別名（自由文字列、employeeTypes.name と対応） |
| hourly_wage | INTEGER | 時給（デフォルト: 1177円） |
| color | TEXT | 表示色（種別カラーと同期） |
| priority | TEXT | `'high'` / `'medium'` / `'low'` |
| income_lower | INTEGER \| NULL | 月収下限アラート（円） |
| income_upper | INTEGER \| NULL | 月収上限アラート（円） |
| created_at / updated_at | TEXT | ISO8601 |

> **重要**: `type` カラムには `CHECK` 制約なし（日本語の種別名を自由に保存可能）。  
> 以前あった `CHECK(type IN ('contract','intern','part'))` は migrate.ts の再作成マイグレーションで除去済み。

### employee_types（従業員種別）

| カラム | 型 | 説明 |
|-------|-----|------|
| id | TEXT PK | UUID |
| facility_id | TEXT | 施設ID |
| name | TEXT | 種別名（日本語可） |
| color | TEXT | 表示色（hex） |

### shift_requests（シフト希望）

- `employee_id`, `year`, `month`, `day` に複合ユニーク制約
- `bulk` POST で upsert（`ON CONFLICT DO UPDATE`）

### schedules / schedule_slots（シフト表）

- `schedules.status`: `'draft'` | `'published'`
- スロットは `schedule_id + employee_id + date` の組み合わせで重複チェック（POST 時）

### events / event_employees（イベント）

- シフト時間はイベント側（`events.start_time`, `events.end_time`）で管理
- event_employees はメンバー参照のみ（時間情報なし）
- AI シフト生成時、イベントアサイン済みスタッフは指定時間で強制スロット化

### business_hours（営業時間設定）

| カラム | 型 | 説明 |
|-------|-----|------|
| open_time / close_time | TEXT | HH:MM 形式 |
| long_shift_threshold | INTEGER | ロングシフト判定時間数 |
| min_staff | INTEGER | 最低同時勤務人数 |
| max_staff | INTEGER | 最高同時勤務人数 |
| fixed_prompt | TEXT \| NULL | AI への固定追加指示 |

---

## 4. API 仕様

### ベース URL: `/api`

| メソッド | パス | 権限 | 説明 |
|---------|------|------|------|
| POST | `/auth/admin/login` | - | 管理者ログイン |
| POST | `/auth/facility/login` | - | 施設ログイン |
| GET | `/admin/facilities` | admin | 施設一覧 |
| POST | `/admin/facilities` | admin | 施設作成（営業時間初期化を含む） |
| DELETE | `/admin/facilities/:id` | admin | 施設削除（`default` は不可） |
| PUT | `/admin/facilities/:id/password` | admin | パスワード変更 |
| GET/POST | `/employees` | facility | 従業員一覧・作成 |
| PUT/DELETE | `/employees/:id` | facility | 従業員更新・削除 |
| GET/PUT | `/settings/business-hours` | facility | 営業時間 |
| GET/POST/PUT/DELETE | `/settings/employee-types` | facility | 従業員種別 |
| GET | `/shift-requests` | facility | シフト希望一覧（自施設のみ） |
| POST | `/shift-requests/bulk` | facility | シフト希望一括 upsert |
| GET | `/schedules` | facility | スケジュール一覧 |
| POST | `/schedules/:id/slots` | facility | スロット追加（重複チェックあり） |
| PUT | `/schedules/:id/slots/:slotId` | facility | スロット更新 |
| DELETE | `/schedules/:id/slots/:slotId` | facility | スロット削除 |
| DELETE | `/schedules/:id` | facility | スケジュール削除（facilityId チェックあり） |
| POST | `/ai/generate-schedule` | facility | AI シフト生成 |
| GET/POST/PUT/DELETE | `/events` | facility | イベント管理 |
| POST/DELETE | `/events/:id/members` | facility | イベントメンバー管理 |
| GET | `/health` | - | ヘルスチェック |

---

## 5. フロントエンド構成

### ストア（`src/lib/stores.ts`）

| ストア | 型 | 説明 |
|--------|-----|------|
| `auth` | `AuthState \| null` | JWT + ロール（localStorage 永続化） |
| `employees` | `Employee[]` | 従業員リスト |
| `employeeTypes` | `EmployeeType[]` | 従業員種別リスト |
| `employeeTypeMap` | `Map<name, EmployeeType>` | derived。種別名 → EmployeeType の O(1) 参照 |
| `businessHours` | `BusinessHours \| null` | 営業時間設定 |
| `toast` | `{ message, type } \| null` | トースト通知 |
| `selectedYear` | `number` | 選択中の年（localStorage 永続化） |
| `selectedMonth` | `number` | 選択中の月（localStorage 永続化） |

> `currentSchedule` は削除済み（dead store）。各ページでローカルに管理。

### ページ一覧

| パス | 説明 |
|------|------|
| `/` | ダッシュボード（シフト概要・従業員別サマリー） |
| `/login` | ログイン（admin / facility 切り替え） |
| `/employees` | 従業員管理（複数条件ソート・localStorage 永続化） |
| `/schedule` | シフト希望登録 |
| `/calendar` | カレンダー（シフト表示・手動スロット追加） |
| `/events` | イベント管理 |
| `/salary` | 給与計算 |
| `/settings` | 設定（営業時間・従業員種別） |
| `/admin` | 管理者ページ（施設管理） |

### 従業員ソート仕様（`/employees`）

- 複数条件ソート: `{ key: 'name'|'type'|'priority', dir: 'asc'|'desc' }[]` の配列
- localStorage キー `emp-sort` に JSON 保存
- ヘッダークリックで 1 番目の条件を変更（同キーなら昇降切替）
- `+ 追加` ボタンで最大 3 条件まで追加可能
- 名前順ソートは `reading`（読み仮名）を優先使用

### 給与アラート判定仕様（`/` ダッシュボード・`/salary`）

- **上限超過**: `emp.incomeUpper != null && salary > emp.incomeUpper`
- **下限未満**: `emp.incomeLower != null && hours > 0 && salary < emp.incomeLower`
- 種別名によるハードコード判定は廃止（`incomeLower/incomeUpper` フィールドを使用）

---

## 6. AI シフト生成仕様

- モデル: `gemini-2.5-flash`
- 入力: 従業員データ・シフト希望・営業時間設定・イベント強制アサイン
- 優先順位ルール（高→低）:
  1. `available=false` の日は絶対にシフト不可
  2. 最低同時勤務人数を常に維持
  3. 最高同時勤務人数を超えない
  4. priority 順（high → medium → low）
  5. 出勤可能日数が少ない従業員を優先
  6. シフト希望時間・メモを考慮
  7. イベント強制アサイン（変更・省略不可）
  8. fixed_prompt（施設固定ルール）
  9. 今回の追加指示（note）
- 出力: JSON `{ slots: [...] }` のみ（マークダウン不要）
- イベントスロットは AI スロットにマージ（同一 employee+date は強制スロットで上書き）

---

## 7. 既知の制限・TODO

- `notionExport.ts` の `TEST_DB_ID` がハードコード → 本番では `VITE_NOTION_DB_ID` 環境変数から取得するよう変更すること
- `shift-requests` の `PUT /:id` に facilityId チェックなし（フロントが自施設 ID のみ渡す前提）
- `migrate.ts` の `hashPassword` は `auth.ts` と重複定義（独立実行要件のため。変更時は両方を同期すること）
- Notion エクスポートは現状テスト用 DB のみ対応

---

## 8. マイグレーション履歴

| バージョン | 内容 |
|-----------|------|
| 初期 | admins, facilities, employee_types, employees, business_hours, shift_requests, schedules, schedule_slots |
| 追加 | employees.priority, employees.facility_id |
| 追加 | employees.income_lower, employees.income_upper, employees.reading |
| 追加 | events, event_employees テーブル |
| 追加 | events.start_time, events.end_time |
| 追加 | business_hours.min_staff, max_staff, fixed_prompt, facility_id |
| 追加 | schedules.facility_id |
| 修正 | employees テーブルの `CHECK(type IN ('contract','intern','part'))` 制約をテーブル再作成で除去 |

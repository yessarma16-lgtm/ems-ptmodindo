# Spec: Modul Attendance / Overtime (Import, Crosscheck, Report)

Adaptasi dari `claude-code-prompt.md` (spec awal untuk project Streamlit
terpisah) ke struktur module Next.js yang sudah dipakai di project ini
(Employee Management System). Bukan project baru — modul ini ditambahkan
ke dalam project yang sudah ada, mengikuti pola yang sudah dipakai modul
Employees / Master Data / Export.

Keputusan scope (dikonfirmasi dengan user):
- **Output tahap ini**: dokumen spec, lalu implementasi bertahap dimulai
  dari rule engine + importer (lihat "Status implementasi" di bawah).
- **Database provider**: SQLite (dev) + Postgres/Supabase (prod). Google
  Sheets provider **tidak** didukung untuk modul ini — lihat bagian
  "Database adapter" kenapa ini butuh pola adapter terpisah.
- **Testing**: tambah Vitest (project ini belum punya test framework sama
  sekali) khusus untuk rule engine overtime, setara requirement pytest di
  spec asli.

## Status implementasi

| Bagian | Status | File |
|---|---|---|
| Rule engine (day-type, overtime-rules) | ✅ Selesai, 4 test wajib lulus | `lib/attendance/day-type.ts`, `lib/attendance/overtime-rules.ts`, `lib/attendance/overtime-rules.test.ts` |
| Importer (parsing Excel, murni tanpa DB) | ✅ Selesai, 8 test lulus | `lib/attendance/importer.ts`, `__tests__/attendance/importer.test.ts`, fixture di `__tests__/fixtures/attendance_import_fixture.xlsx` |
| Skema 4 tabel (`bracket_master`, `bracket_master_history`, `raw_attendance`, `calculated_attendance`) | ✅ Selesai, additive ke `ensureSchema()` | `lib/database/sqlite-init.ts`, `lib/database/postgres-init.ts` |
| `AttendanceDatabaseAdapter` — implementasi SQLite | ✅ Selesai, 8 test wajib lulus (`:memory:` DB terisolasi) | `lib/database/sqlite-attendance.ts`, `__tests__/attendance/attendance-adapter.test.ts` |
| `AttendanceDatabaseAdapter` — implementasi Postgres | 🟡 **KNOWN GAP** — ditulis mengikuti pola postgres-users.ts persis, **belum pernah tereksekusi terhadap instance Supabase live**, khususnya jalur transaksi `update_bracket_master()` lewat `.rpc()` — **perlu verifikasi manual sebelum deploy ke Postgres**, jangan dianggap production-ready hanya karena kodenya ada | `lib/database/postgres-attendance.ts`, fungsi `update_bracket_master` di `postgres-init.ts` |
| `getAttendanceAdapter()` (selector SQLite/Postgres, real) | ✅ Selesai | `lib/database/attendance-adapter.ts` |
| `lib/attendance-import.ts` (orkestrasi: `importer.ts` -> preview konflik -> `adapter.importRawAttendance()`, resolusi Timpa/Lewati) | ✅ Selesai, 2 test lulus | `lib/attendance-import.ts`, `__tests__/attendance/attendance-import.test.ts` |
| Zod schema (`schemas/attendance.schema.ts`), API routes (import preview/commit/history, bracket-master + history) | ✅ Selesai | `app/api/attendance/**` |
| Page 1 UI: Tab "Import Data Absensi" + Tab "Master Durasi Jam antara" (diff visual, riwayat) | ✅ Selesai, ditest manual lewat browser end-to-end | `app/(app)/attendance/import/page.tsx`, `components/attendance/*` |
| Integrasi `config/navigation.ts` + `config/module-permissions.ts` | ✅ Selesai (child Page 1–3 terdaftar) | `config/navigation.ts`, `config/module-permissions.ts` |
| Page 2 (MPP Calculation) | ✅ Selesai, termasuk test UI crosscheck/koreksi | `app/(app)/attendance/calculation/page.tsx`, `components/attendance/CalculationPanel.tsx`, `components/attendance/CorrectionDialog.tsx`, `app/api/attendance/calculation/**`, `app/api/attendance/crosscheck/route.ts` |
| Page 3 (Report) | ✅ Selesai, 4 test komponen/service/permission | `app/(app)/attendance/report/page.tsx`, `components/attendance/AttendanceReportPanel.tsx`, `lib/attendance-report-service.ts`, `app/api/attendance/report/route.ts` |

Total suite saat ini: **30 test, 30 lulus** (`npm run test`) — 4 rule engine +
8 importer + 8 adapter + 2 orkestrasi import. `npm run db:init:sqlite` sudah
dijalankan ulang dan berhasil menambahkan 4 tabel baru ke `data/employee.db`
yang asli (additive, tidak menyentuh data lain). `tsc --noEmit` dan `eslint`
bersih untuk seluruh file baru.

Jalankan `npm run test` untuk menjalankan seluruh suite Vitest yang ada
saat ini.

**Ditest manual di browser sungguhan** (bukan cuma Vitest) terhadap
`data/employee.db` asli: upload `__tests__/fixtures/attendance_import_fixture.xlsx`
(8 baris masuk baru) -> re-upload file yang sama (8 baris konflik terdeteksi,
default "Lewati", commit -> 0 baris berubah, riwayat tidak nambah entry
baru karena tidak ada yang ditulis) -> Tab Master: tambah baris bracket
Senin-Jumat, simpan, cek "Lihat riwayat perubahan" menunjukkan entry
"Dibuat" dengan `changed_by` terisi otomatis dari user yang login
("Admin User", lewat `getCurrentSessionUser()`). Semua sesuai perilaku
yang dites di Vitest. **Catatan**: proses manual testing ini meninggalkan
data percobaan di `data/employee.db` (8 baris `raw_attendance` untuk NIK
2318060259/2318060357, 1 baris `bracket_master` Senin-Jumat 0–0.5 jam) —
data dev biasa, bukan sesuatu yang otomatis dibersihkan.

## Kenapa banyak yang berubah dari spec asli

Spec asli (`claude-code-prompt.md`) ditulis untuk scaffold project Python
baru dari nol: Streamlit multi-page, SQLAlchemy ORM, SQLite lokal
terpisah, pytest. Project ini sudah punya arsitektur sendiri yang berbeda
total secara teknis tapi setara secara pola:

| Spec asli (Streamlit) | Project ini (Next.js) |
|---|---|
| `pages/1_NK_Attendance_Data.py` dst | `app/(app)/attendance/*/page.tsx` (App Router) |
| SQLAlchemy ORM | Raw SQL per provider (`node:sqlite` utk dev, Supabase JS client utk prod) — tidak ada ORM sama sekali di project ini |
| SQLite lokal `data/attendance.db` terpisah | Tabel baru di `data/employee.db` yang sudah ada (satu file DB, satu koneksi — lihat `lib/database/sqlite-connection.ts`) |
| openpyxl | `exceljs` (sudah jadi dependency, dipakai `lib/employee-import.ts` & `lib/export-service.ts`) |
| pytest | Vitest (baru ditambahkan, project belum punya test framework) |
| `st.data_editor` (grid inline-edit) | Table + Dialog form (pola `MasterDataTable` + `MasterDataDialog`) — project ini tidak pakai grid inline-edit di mana pun |
| Validasi ad-hoc | Zod schema di `schemas/*.schema.ts`, divalidasi juga di API route |
| Baca dict Python hardcoded vs DB | Sama-sama "harus baca dari DB", diterjemahkan ke `lookupBracket()` yang query lewat adapter, bukan lewat SQLAlchemy session |

Poin yang **tidak berubah** dari spec asli: seluruh logika rule engine
(urutan langkah, pembulatan 0.5 jam, potongan 1 jam istirahat, 4 test
case wajib) — itu hasil trial-and-error dengan data real dan harus
persis sama, hanya bahasanya yang diterjemahkan ke TypeScript.

## Tech stack (mengikuti yang sudah dipakai project ini)

- Next.js 16 (App Router) + React 19 + TypeScript — **sudah ada**, bukan baru
- Tailwind v4 + Radix/shadcn-style components di `components/ui/` — **sudah ada**
- `node:sqlite` (`DatabaseSync`) untuk dev, Supabase Postgres (PostgREST via `@supabase/supabase-js`) untuk prod — **sudah ada**, pola provider-agnostic lewat `DatabaseAdapter`
- `exceljs` untuk baca/tulis Excel — **sudah ada**
- `zod` untuk validasi — **sudah ada**
- **Baru**: Vitest, untuk `lib/attendance/overtime-rules.test.ts`

## Struktur folder (ditambahkan ke project yang ada, bukan folder baru terpisah)

```
lib/
├── attendance/
│   ├── day-type.ts              # tentukan Senin-Jumat/Sabtu/Minggu dari tanggal
│   ├── bracket-table.ts         # BracketLookupFn — TYPE saja, lihat catatan DI di bawah
│   ├── overtime-rules.ts        # rule engine utama (calculateOvertime)
│   ├── overtime-rules.test.ts   # 4 test case wajib (Vitest), colocated — pola umum TS, bukan folder tests/ terpisah
│   └── importer.ts              # parsing & validasi Excel murni -> RawAttendanceParsedRow[], TIDAK menyentuh DB (lihat bagian "Importer")
├── attendance-import.ts         # ✅ orkestrasi: importer.ts + AttendanceDatabaseAdapter, resolusi konflik (nik, tanggal)
├── attendance-service.ts        # orkestrasi: jalankan crosscheck, simpan koreksi manual
├── attendance-report-service.ts # 3 jenis report -> buffer .xlsx (pola lib/export-service.ts)
└── database/
    ├── attendance-types.ts                # ✅ BracketMasterRow(Input), BracketMasterHistoryRecord, RawAttendance*, CalculatedAttendance*, dst — file terpisah dari types.ts utama (bukan dicampur ke DatabaseAdapter punya types)
    ├── attendance-errors.ts               # ✅ AttendanceProviderNotSupportedError, AttendanceValidationError — dipisah dari attendance-adapter.ts supaya sqlite-/postgres-attendance.ts bisa impor tanpa circular import
    ├── attendance-adapter.ts              # ✅ interface final + getAttendanceAdapter() (real, bukan skeleton lagi)
    ├── sqlite-attendance.ts               # ✅ implementasi SQLite — factory createSqliteAttendanceAdapter(db), lihat catatan testability
    ├── postgres-attendance.ts             # 🟡 implementasi Postgres, ditulis belum diverifikasi (lihat "Test yang lulus")
    ├── sqlite-init.ts                     # ✅ + 4 CREATE TABLE baru (edit file yang sudah ada)
    └── postgres-init.ts                   # ✅ + 4 CREATE TABLE baru + fungsi update_bracket_master() (edit file yang sudah ada)

__tests__/attendance/
├── importer.test.ts             # 8 test — parsing Excel
└── attendance-adapter.test.ts   # ✅ BARU — 8 test wajib addendum langkah 4, SQLite :memory:

schemas/
└── attendance.schema.ts         # rawAttendanceRowSchema, bracketMasterInputSchema, correctionInputSchema

config/
└── attendance.ts                # DAY_TYPES, kategori "Hari Libur/Lembur", dsb — konstanta, bukan hardcode rule

app/api/attendance/
├── import/route.ts                       # POST — upload & import Excel
├── raw/route.ts                          # GET — riwayat import
├── bracket-master/route.ts               # GET/POST — list & tambah baris bracket
├── bracket-master/[id]/route.ts          # PUT/DELETE — edit & hapus satu baris
├── crosscheck/route.ts                   # POST — jalankan rule engine ke raw_attendance yang belum dihitung
├── calculated/route.ts                   # GET — list hasil kalkulasi (filter tanggal/dept/status)
├── calculated/[id]/correction/route.ts   # PUT — koreksi manual final_oth
└── report/route.ts                       # POST — generate & download salah satu dari 3 report

app/(app)/attendance/
├── import/page.tsx        # Page 1 — setara "NK Attendance Data" (Tab: Import Data, Master Durasi Jam)
├── calculation/page.tsx   # Page 2 — setara "MPP Calculation"
└── report/page.tsx        # Page 3 — setara "Report"

__tests__/
├── attendance/
│   └── importer.test.ts         # test importer (fixture xlsx real-shaped, butuh baca file jadi tidak dicolocate seperti overtime-rules.test.ts)
└── fixtures/
    └── attendance_import_fixture.xlsx

components/attendance/
├── AttendanceImportPanel.tsx     # upload + preview konflik + ringkasan hasil
├── AttendanceImportHistory.tsx   # tabel riwayat import
├── BracketMasterManager.tsx      # pola MasterDataManager.tsx: pilih day_type, tabel, dialog add/edit
├── CrosscheckTable.tsx           # tabel hasil dengan badge warna per status + filter
├── CorrectionDialog.tsx          # form koreksi final_oth + correction_note wajib
└── AttendanceReportPanel.tsx     # filter tanggal/dept + 3 tombol Generate & Download
```

Vitest ditaruh colocated (`overtime-rules.test.ts` di sebelah
`overtime-rules.ts`) mengikuti konvensi umum proyek TypeScript — project
ini belum punya folder `tests/` sendiri jadi tidak ada preseden yang
harus diikuti, colocated adalah default yang paling umum dan gampang
ditemukan.

## Database adapter — kenapa perlu interface terpisah

`lib/database/database-adapter.ts` (`DatabaseAdapter`) adalah SATU
interface yang wajib diimplementasikan oleh SEMUA 3 provider (SQLite,
Postgres, **dan Google Sheets**), dipilih lewat `getDatabaseAdapter()` di
`lib/database/database.ts`. Karena modul attendance ini sengaja **tidak**
didukung di Google Sheets (data relasional bracket + raw + calculated
tidak cocok dipetakan ke sheet), menambah method attendance langsung ke
`DatabaseAdapter` akan memaksa `google-sheets-adapter.ts` implement
method yang tidak pernah bisa benar-benar jalan di sana (TypeScript
interface tidak punya "optional per provider").

Solusinya: interface & selector kedua yang paralel, sama sekali tidak
menyentuh `DatabaseAdapter` yang sudah ada. Interface final yang
diimplementasikan (`lib/database/attendance-adapter.ts`) — sedikit beda
dari draft awal di atas setelah addendum langkah 4 mempertajam
requirement-nya:

```ts
export interface AttendanceDatabaseAdapter {
  lookupBracket: BracketLookupFn;

  importRawAttendance(rows: RawAttendanceInput[], onConflict?: "ask" | "skip" | "overwrite"): Promise<ImportSummary>;
  findExistingByNikDate(pairs: NikDatePair[]): Promise<ExistingRecord[]>;
  getRawAttendance(filters: RawAttendanceFilter): Promise<RawAttendanceRecord[]>;

  getBracketMaster(dayType?: DayType): Promise<BracketMasterRow[]>;
  updateBracketMaster(rows: BracketMasterRowInput[], changedBy: string): Promise<void>;
  getBracketMasterHistory(bracketId?: number): Promise<BracketMasterHistoryRecord[]>;

  runCrosscheck(rawIds?: number[]): Promise<CalculationSummary>;
  getCalculatedAttendance(filters: CalculatedAttendanceFilter): Promise<CalculatedAttendanceRecord[]>;
  correctFinalOth(id: number, newValue: number, note: string, correctedBy: string): Promise<void>;
}

export function getAttendanceAdapter(): AttendanceDatabaseAdapter {
  const provider = getDatabaseProvider(); // reuse selector yang sama dari database.ts
  if (provider === "google") {
    throw new AttendanceProviderNotSupportedError(
      "Modul Attendance/Overtime hanya tersedia di provider SQLite atau Postgres.",
    );
  }
  return provider === "postgres" ? getPostgresAttendanceAdapter() : getSqliteAttendanceAdapter();
}
```

Perbedaan dari draft interface awal (addendum langkah 4 secara eksplisit
menspesifikasikan method-methodnya, jadi draft lama di atas diganti,
bukan ditambah):
- `ensureReady()` dihapus — `ensureSchema()` di `sqlite-init.ts`/`postgres-init.ts`
  sudah jalan otomatis lewat `getSqliteDb()` / `npm run db:init:postgres`,
  sama seperti tabel lain, jadi tidak perlu method terpisah di adapter.
- `createBracketMasterRow`/`updateBracketMasterRow`/`deleteBracketMasterRow`
  (3 method) digabung jadi satu `updateBracketMaster(rows, changedBy)` —
  bulk diff (create/update/delete sekaligus) untuk satu day_type, cocok
  dengan tombol "Simpan Perubahan" di UI (bukan 3 API call terpisah per
  baris). `rows` harus berisi SELURUH baris untuk day_type yang sedang
  diedit (bukan partial) — baris existing di DB dengan `day_type` yang sama
  tapi id-nya tidak ada di `rows` dianggap dihapus. `day_type` yang sama
  sekali tidak muncul di `rows` tidak disentuh.
- `findExistingByNikDate` pakai `date: string` (ISO), bukan `date: Date`
  seperti draft addendum — konsisten dengan seluruh modul ini yang sudah
  memakai ISO string (day-type.ts, overtime-rules.ts, importer.ts) untuk
  menghindari bug timezone `Date`.
- `importRawAttendance` dapat parameter `onConflict?: "ask" | "skip" | "overwrite"`
  (default `"ask"`) — bukan cuma deteksi konflik, tapi juga bisa langsung
  dipakai untuk step "Timpa"/"Lewati" setelah user menjawab, tanpa perlu
  method terpisah nanti di langkah 5.

`lib/attendance-service.ts` dan API routes attendance memanggil
`getAttendanceAdapter()`, bukan `getDatabaseAdapter()`. Kalau
`DATABASE_PROVIDER=google` aktif, halaman attendance menampilkan pesan
"tidak tersedia di provider ini" alih-alih error 500 — tangkap
`AttendanceProviderNotSupportedError` di `toApiErrorResponse` (tambah satu
`if` baru, mirror pola `DatabaseNotConfiguredError` yang sudah ada) — belum
dikerjakan (bagian dari "Zod schema, service layer, API routes" di tabel
status, langkah 5).

**Testability & `server-only`**: `sqlite-attendance.ts` diekspos sebagai
FACTORY (`createSqliteAttendanceAdapter(db: DatabaseSync)`) alih-alih
langsung memakai singleton `getSqliteDb()` di setiap fungsi seperti
`sqlite-users.ts` dkk — supaya test bisa memakai `DatabaseSync(":memory:")`
yang terisolasi, bukan `data/employee.db` yang asli. Semua file DB-touching
tetap punya `import "server-only"` di baris pertama, tanpa pengecualian
(konsisten 100% dengan `sqlite-users.ts` dkk) — masalah "server-only throw
di Vitest" (paket ini sengaja throw kalau di-import di luar kondisi
`react-server`) diselesaikan di level tooling, bukan dengan menghapus
guard-nya: `vitest.config.ts` meng-alias `server-only` ke
`node_modules/server-only/empty.js` (persis file yang dipakai kondisi
`react-server` di `package.json`-nya sendiri) — replikasi efek yang sama
dengan yang Next.js lakukan lewat conditional exports, khusus untuk
Vitest.

## Skema database

Ditambahkan ke `lib/database/sqlite-init.ts` (`ensureSchema()`) dan versi
Postgres-nya di `lib/database/postgres-init.ts`, persis pola 3 tabel yang
sudah ada di sana (`contract_history`, `family`, `bpjs`) — `CREATE TABLE
IF NOT EXISTS`, index eksplisit, tidak pernah drop/clear. **Status: selesai
diimplementasikan** — `npm run db:init:sqlite` sudah dijalankan ulang dan
menambahkan 4 tabel ini ke `data/employee.db` yang asli tanpa error.

**Migration & reversibility (addendum langkah 4)** — project ini TIDAK
punya migration tool/rollback sama sekali; semua tabel (termasuk yang
lebih dulu direvisi setelah dipakai data asli — `employees`, `users`,
`online_registrations`, lihat `ensureEmployeeColumnsExist` dkk di
`sqlite-init.ts`) memakai pola `ensureSchema()` idempotent: `CREATE TABLE
IF NOT EXISTS` untuk tabel baru, `PRAGMA table_info` + `ALTER TABLE ADD
COLUMN IF NOT EXISTS` untuk kolom yang ditambah ke tabel yang sudah
berjalan dengan data asli, dieksekusi ulang tiap startup, dan filosofinya
eksplisit "never drop or clear data" — tidak pernah ada down-migration di
mana pun. 4 tabel attendance ini mengikuti pola yang sama persis, tanpa
infra migration baru. Karena keempatnya baru dibuat sekarang (belum ada
data produksi), belum ada fungsi `ensure*ColumnsExist()` untuk mereka —
komentar di `ensureSchema()` menunjuk ke pola yang sudah ada
(`ensureEmployeeColumnsExist`) sebagai contoh kalau nanti perlu nambah
kolom setelah tabel ini punya data asli.

**`bracket_master`** (SQLite):
```sql
CREATE TABLE IF NOT EXISTS bracket_master (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  day_type TEXT NOT NULL,           -- 'Senin-Jumat' | 'Sabtu' | 'Minggu'
  durasi_start REAL NOT NULL,       -- disimpan sebagai jam desimal, bukan TIME — konsisten dgn cara selisih_hours dihitung di rule engine
  durasi_end REAL NOT NULL,
  ot_hours REAL NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_bracket_master_day_type ON bracket_master(day_type);
```
(Postgres: `id SERIAL PRIMARY KEY`, `updated_at TIMESTAMPTZ NOT NULL DEFAULT now()`, sisanya sama — pola persis `sqlite-init.ts` vs `postgres-init.ts` yang sudah ada.)

**`bracket_master_history`** (addendum langkah 4, poin 2 — audit trail):
```sql
CREATE TABLE IF NOT EXISTS bracket_master_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bracket_master_id INTEGER NOT NULL,  -- SENGAJA tanpa FK, lihat catatan di bawah
  day_type TEXT NOT NULL,
  durasi_start REAL, durasi_end REAL, ot_hours REAL,  -- snapshot nilai LAMA; NULL untuk change_type "created" (tidak ada nilai lama)
  changed_by TEXT NOT NULL DEFAULT '',
  changed_at TEXT NOT NULL,
  change_type TEXT NOT NULL         -- 'created' | 'updated' | 'deleted'
);
CREATE INDEX IF NOT EXISTS idx_bracket_master_history_bracket ON bracket_master_history(bracket_master_id);
```
`bracket_master_id` sengaja **tanpa** FK constraint (sama seperti
`audit_log.entity_id` di tabel yang sudah ada) — kalau dipasang FK, baris
history untuk `change_type: "deleted"` akan memblokir penghapusan
`bracket_master`-nya sendiri (riwayat "deleted" ditulis SEBELUM baris
sungguhan dihapus, jadi setelah hapus, id itu tidak lagi ada di
`bracket_master` — FK strict akan menolak ini). Riwayat harus tetap bisa
merujuk ke id yang sudah tidak ada.

Setiap create/update/delete lewat `updateBracketMaster()` menulis satu
baris history SEBELUM perubahan diterapkan, dalam satu transaksi
(`BEGIN`/`COMMIT`/`ROLLBACK` di SQLite — lihat `sqlite-attendance.ts`;
fungsi Postgres `update_bracket_master()` di `postgres-init.ts`, dipanggil
lewat `.rpc()`, untuk alasan yang sama dengan `approve_online_registration`:
PostgREST tidak punya BEGIN/COMMIT lintas-statement dari sisi client).
Ditest lewat "updateBracketMaster menulis snapshot ke bracket_master_history
sebelum update" dan "...dalam satu transaksi (rollback kalau salah satu
gagal)" — keduanya lulus.

UI "Lihat riwayat perubahan" (tabel read-only sederhana di tab "Master
Durasi Jam antara") belum dikerjakan — bagian dari langkah UI yang
menunggu langkah 5 (Zod schema/service/API routes) selesai dulu.

**`raw_attendance`**:
```sql
CREATE TABLE IF NOT EXISTS raw_attendance (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nik TEXT NOT NULL,
  nama TEXT NOT NULL DEFAULT '',
  department TEXT NOT NULL DEFAULT '',
  tanggal TEXT NOT NULL,            -- ISO date
  intime TEXT, outtime TEXT, it1 TEXT, ot1 TEXT,  -- 'HH:mm', nullable
  whour REAL, bhour REAL, othour_recorded REAL,
  kategori TEXT NOT NULL,
  imported_at TEXT NOT NULL,
  imported_by TEXT NOT NULL DEFAULT '',
  source_filename TEXT NOT NULL DEFAULT '',
  UNIQUE (nik, tanggal)
);
CREATE INDEX IF NOT EXISTS idx_raw_attendance_tanggal ON raw_attendance(tanggal);
CREATE INDEX IF NOT EXISTS idx_raw_attendance_nik ON raw_attendance(nik);
```

**`calculated_attendance`**:
```sql
CREATE TABLE IF NOT EXISTS calculated_attendance (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  raw_id INTEGER NOT NULL REFERENCES raw_attendance(id) ON DELETE RESTRICT,
  day_type TEXT NOT NULL,
  bracket_used TEXT NOT NULL DEFAULT '',
  system_calculated_oth REAL,       -- nullable: NULL kalau lookupBracket tidak ketemu rentang -> status "Cek Manual"
  final_oth REAL,                   -- nullable: NULL untuk baris "Tidak Berlaku" (field jam kosong, tidak dihitung sama sekali)
  status TEXT NOT NULL,             -- 'Sesuai' | 'Tidak Sesuai' | 'Dikoreksi Manual' | 'Cek Manual' | 'Tidak Berlaku'
  corrected_by TEXT, corrected_at TEXT, correction_note TEXT,
  calculated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_calculated_attendance_raw ON calculated_attendance(raw_id);
CREATE INDEX IF NOT EXISTS idx_calculated_attendance_status ON calculated_attendance(status);
```

**FK `raw_id` -> `RESTRICT`, bukan `CASCADE`** (koreksi dari draft awal
spec ini, diputuskan lewat addendum langkah 4): `raw_attendance` adalah
"sumber kebenaran" dan `calculated_attendance` bisa menyimpan koreksi
manual (`correction_note`/`corrected_by`) yang punya nilai audit sendiri —
menghapus `raw_attendance` yang sudah pernah dihitung TIDAK BOLEH diam-diam
membuang jejak koreksi itu. Ini beda dari satu-satunya preseden FK+CASCADE
yang ada di project (`export_template_sheets`/`export_template_columns`),
tapi itu murni data komposisi tanpa nilai audit — kasusnya beda. Ditegakkan
lewat DDL (SQLite: `PRAGMA foreign_keys = ON` sudah aktif di
`sqlite-connection.ts`, jadi DDL saja cukup, tidak perlu enforcement
tambahan di level aplikasi/adapter; Postgres: FK selalu enforced). Ditest
lewat "mencoba hapus raw_attendance yang masih punya calculated_attendance
terkait -> ditolak" — lulus (SQLite melempar `SQLITE_CONSTRAINT` saat
`DELETE FROM raw_attendance` dicoba).

**`runCrosscheck(rawIds?)` — semantik idempotency**: `rawIds` diisi -> paksa
hitung ulang baris itu meski sudah punya `calculated_attendance`
(dipakai untuk refresh setelah `bracket_master` berubah, dan oleh test).
`rawIds` kosong/undefined -> hanya proses `raw_attendance` yang belum
punya `calculated_attendance` sama sekali (`NOT EXISTS` subquery di
SQLite; filter di sisi aplikasi di Postgres karena PostgREST tidak
punya `NOT EXISTS` langsung — cukup untuk volume attendance bulanan).
Untuk baris yang sudah `status = "Dikoreksi Manual"`: hanya
`system_calculated_oth`/`day_type`/`bracket_used` yang di-refresh,
`final_oth`/`status`/`corrected_by`/`corrected_at`/`correction_note`
dibiarkan — persis requirement addendum. Status "Cek Manual" dipakai kalau
`lookupBracket` tidak menemukan rentang yang cocok (di luar tabel
bracket); "Tidak Berlaku" untuk baris dengan field jam kosong (langkah 5
di rule engine — tidak dihitung sama sekali, bukan error).

**Test yang lulus** (`__tests__/attendance/attendance-adapter.test.ts`,
SQLite `:memory:`, 8/8):
```
✓ importRawAttendance menerima array kosong tanpa error
✓ importRawAttendance mendeteksi konflik nik+date yang sudah ada
✓ updateBracketMaster menulis snapshot ke bracket_master_history sebelum update
✓ updateBracketMaster history dan update terjadi dalam satu transaksi (rollback kalau salah satu gagal)
✓ runCrosscheck tidak menimpa final_oth yang statusnya Dikoreksi Manual
✓ runCrosscheck bersifat idempotent - dipanggil 2x hasil sama untuk raw_id yang sama
✓ ensureSchema() aman dipanggil berkali-kali tanpa error (idempotent) untuk 3 tabel baru ini
✓ mencoba hapus raw_attendance yang masih punya calculated_attendance terkait -> ditolak
```
**KNOWN GAP — perlu verifikasi manual sebelum deploy ke Postgres**:
`postgres-attendance.ts` (termasuk fungsi `update_bracket_master()` yang
menulis `bracket_master_history` + update `bracket_master` lewat satu
panggilan `.rpc()`) ditulis mengikuti pola `postgres-users.ts`/
`postgres-online-registrations.ts` persis, tapi **tidak** ikut di-test di
sini dan **belum pernah benar-benar dieksekusi** — tidak ada instance
Supabase/kredensial live di lingkungan development ini. Jangan anggap
jalur Postgres ini production-ready hanya karena kodenya sudah ada;
sebelum `DATABASE_PROVIDER=postgres` dipakai untuk modul ini, jalankan
`npm run db:init:postgres` lalu uji manual ke-8 skenario yang sama dengan
test SQLite di atas terhadap Supabase sungguhan — terutama transaksi
`update_bracket_master` (satu-satunya bagian yang butuh atomicity
lintas-statement, satu-satunya yang punya risiko nyata beda perilaku dari
SQLite kalau ada bug di SQL function-nya).

## Rule engine — logika TIDAK berubah, hanya bahasa

`lib/attendance/day-type.ts`:
```ts
export type DayType = "Senin-Jumat" | "Sabtu" | "Minggu";

export function getDayType(tanggalISO: string): DayType {
  const day = new Date(tanggalISO + "T00:00:00Z").getUTCDay(); // 0=Minggu..6=Sabtu
  if (day === 0) return "Minggu";
  if (day === 6) return "Sabtu";
  return "Senin-Jumat";
}
```

`lib/attendance/bracket-table.ts` — **catatan implementasi**: berbeda dari
draft awal spec ini (yang punya `lookupBracket()` memanggil
`getAttendanceAdapter()` secara langsung), versi yang diimplementasikan
menaruh `lookupBracket` sebagai **parameter yang diinject** ke
`calculateOvertime()`, bukan diimpor global. Alasannya: `overtime-rules.ts`
jadi pure function yang bisa ditest di Vitest tanpa koneksi database sama
sekali (mirror `lookup_bracket(selisih_hours, day_type, session)` di spec
Python asli — session juga diterima sebagai parameter, bukan modul
global). Implementasi konkret yang query ke `bracket_master` lewat
`AttendanceDatabaseAdapter` baru dibuat nanti di langkah 4 (belum
dikerjakan) dan diberikan sebagai argumen oleh caller (`attendance-service.ts`),
bukan oleh `overtime-rules.ts` sendiri:
```ts
export type BracketLookupFn = (selisihHours: number, dayType: DayType) => number | null | Promise<number | null>;
```

`lib/attendance/overtime-rules.ts` — port persis 5 langkah dari spec asli:

```ts
export interface OvertimeInput {
  intime: string; it1: string; outtime: string; ot1: string; // 'HH:mm'
  tanggal: string; // ISO date
  kategori: string;
}

function toHours(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h + m / 60;
}

/** Bulatkan ke kelipatan 0.5 jam: sisa menit 0-30 turun, 31-45 -> +0.5, 46-60 -> +1. */
function roundToHalfHour(hours: number): number {
  const flooredHour = Math.floor(hours);
  const minutes = Math.round((hours - flooredHour) * 60);
  if (minutes <= 30) return flooredHour;
  if (minutes <= 45) return flooredHour + 0.5;
  return flooredHour + 1;
}

export async function calculateOvertime(input: OvertimeInput, lookupBracket: BracketLookupFn): Promise<number | null> {
  const dayType = getDayType(input.tanggal);

  if (input.kategori === "Hari Libur/Lembur") {
    const start = Math.max(toHours(input.intime), toHours(input.it1));
    const workingHour = toHours(input.ot1) - start;
    const roundedWh = roundToHalfHour(workingHour);
    return roundedWh > 4 ? roundedWh - 1 : roundedWh;
  }

  if (dayType === "Senin-Jumat" || dayType === "Sabtu") {
    const selisih = toHours(input.ot1) - toHours(input.outtime);
    if (selisih <= 0) return 0;
    return lookupBracket(selisih, dayType);
  }

  // dayType === "Minggu" && kategori bukan "Hari Libur/Lembur" — fallback jarang terjadi, "seperti langkah 3" (selisih <= 0 tetap 0)
  const selisih = toHours(input.ot1) - toHours(input.outtime);
  if (selisih <= 0) return 0;
  return lookupBracket(selisih, "Minggu");
}
```

Kategori dengan field kosong (Ijin, Hari Libur-Minggu, SKD, dst) di-skip
di layer `attendance-service.ts` sebelum memanggil `calculateOvertime` —
statusnya langsung "Tidak Berlaku", bukan lewat rule engine.

## Test wajib (Vitest) — 4 case dari spec asli, tidak berubah

`lib/attendance/overtime-rules.test.ts` — status: **implementasi selesai,
4/4 lulus** (`npm run test`). `lookupBracket` di-pass sebagai fungsi yang
`throw` kalau sampai terpanggil, sebagai jaminan eksplisit bahwa ke-4 case
ini memang tidak menyentuh bracket table sama sekali:
```ts
import { describe, it, expect } from "vitest";
import { calculateOvertime } from "@/lib/attendance/overtime-rules";
import type { BracketLookupFn } from "@/lib/attendance/bracket-table";

const lookupBracketShouldNotBeCalled: BracketLookupFn = () => {
  throw new Error("lookupBracket should not be called for this case");
};

describe("calculateOvertime", () => {
  it("Laily, Minggu, Hari Libur/Lembur — IT1 lebih telat dari InTime, working hour > 4 jam", async () => {
    const hasil = await calculateOvertime({
      intime: "07:30", it1: "08:17", outtime: "15:30", ot1: "15:30",
      tanggal: "2026-08-09", kategori: "Hari Libur/Lembur",
    }, lookupBracketShouldNotBeCalled);
    expect(hasil).toBe(6.0);
  });

  it("Kholib, Sabtu, Hari Libur/Lembur — kategori Hari Libur/Lembur jatuh di hari Sabtu", async () => {
    const hasil = await calculateOvertime({
      intime: "07:30", it1: "07:32", outtime: "14:30", ot1: "14:32",
      tanggal: "2026-08-01", kategori: "Hari Libur/Lembur",
    }, lookupBracketShouldNotBeCalled);
    expect(hasil).toBe(6.0);
  });

  it("Puji, batas 4 jam — 4:03 dibulatkan jadi 4.0, TIDAK > 4, tidak dipotong break", async () => {
    const hasil = await calculateOvertime({
      intime: "07:30", it1: "07:20", outtime: "11:30", ot1: "11:33",
      tanggal: "2026-08-09", kategori: "Hari Libur/Lembur",
    }, lookupBracketShouldNotBeCalled);
    expect(hasil).toBe(4.0);
  });

  it("Normal, pulang tepat waktu — OT1 == OutTime, 0 jam overtime", async () => {
    const hasil = await calculateOvertime({
      intime: "07:30", it1: "07:20", outtime: "15:30", ot1: "15:30",
      tanggal: "2026-08-06", kategori: "Normal", // Kamis
    }, lookupBracketShouldNotBeCalled);
    expect(hasil).toBe(0.0);
  });
});
```

Keempat case ini sengaja tidak menyentuh `lookupBracket` (3 kasus
"Hari Libur/Lembur" pakai rumus khusus, 1 kasus "selisih <= 0" return 0
lebih dulu) — jadi test-nya jalan murni tanpa DB/mock, persis semangat
spec asli "regression test pengaman kalau rule berubah".

Tambahan di `package.json`:
```json
"scripts": {
  "test": "vitest run"
},
"devDependencies": {
  "vitest": "^3"
}
```

## Importer (`lib/attendance/importer.ts`) — status: implementasi selesai, 8/8 test lulus

Ditambahkan lewat addendum (`importer-prompt-addendum.md`) setelah rule
engine lulus test. Sengaja dipisah dari `lib/attendance-import.ts` (yang
masih belum dikerjakan, langkah 5 di roadmap): `importer.ts` murni parsing
+ validasi Excel -> array `RawAttendanceParsedRow`, **tidak menyentuh
database sama sekali** — alasan yang sama dengan kenapa `overtime-rules.ts`
menerima `lookupBracket` lewat parameter, bukan impor global: supaya bisa
ditest cepat tanpa DB. `attendance-import.ts` nanti tinggal memanggil
`parseAttendanceImportWorkbook()` lalu meneruskan hasilnya ke
`AttendanceDatabaseAdapter.importRawAttendance()` untuk resolusi konflik
`(nik, tanggal)` (Timpa/Lewati) dan insert sesungguhnya.

**Fixture**: `attendance_import_fixture.xlsx` yang disebut di addendum
tidak ditemukan di lokasi manapun saat implementasi — struktur sheet-nya
("Data Cross Check NK", "Durasi Jam antara", "Jam kerja", termasuk kolom
bantu "InTime (Jam)"/"IT1 (Jam)" yang harus diabaikan importer) ternyata
cocok persis dengan file nyata `Crosscheck Absensi NK_Formula.xlsx` yang
dipakai user sehari-hari — kemungkinan itu yang jadi acuan penulisan
addendum. Fixture di-generate ulang lewat script sekali-pakai, mengikuti persis
tabel 8-baris-kasus di `importer-prompt-addendum.md` (baris 2-9: normal,
jam-kosong, normal x3, Hari Libur/Lembur, desimal-koma, Ijin), dan
disimpan sebagai binary di `__tests__/fixtures/attendance_import_fixture.xlsx`.

**Whitelist kolom** (`WHITELIST_HEADERS` di `importer.ts`) — case-insensitive & trim:
```
RowNo, LastDeptname, NIK, Nama, Date, HK56, InTime, OutTime,
IT1, OT1, WHour, BHour, OTHour, Description, QuitDate
```
Kolom di luar whitelist ini diabaikan sepenuhnya lewat `findHeaderRow()` —
hanya kolom yang namanya cocok yang masuk `columnKeyByIndex`, sisanya
tidak pernah dibaca.

**Deteksi baris header**: `findHeaderRow()` scan 10 baris pertama sheet
"Data Cross Check NK" (atau sheet pertama kalau nama itu tidak ada), pilih
baris dengan jumlah kecocokan whitelist header terbanyak, minimal 5 kolom
cocok — tidak mengasumsikan header selalu di baris 1.

**Parsing tanggal** (`parseDateCell` / `parseDDMMYYYYText`): kalau cell
berupa `Date` instance (Excel serial asli, ExcelJS sudah decode benar
lewat epoch UTC) dipakai langsung; kalau teks "DD/MM/YYYY", dipecah manual
`match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)` lalu `Date.UTC(yyyy, mm-1, dd)`
— **tidak pernah** `new Date(stringnya)` langsung, karena itu rawan
salah baca jadi MM/DD/YYYY tergantung locale environment.

**Parsing desimal koma** (`parseDecimal`): kalau string mengandung koma
tanpa titik, koma diganti titik sebelum `parseFloat` — `"0,75"` -> `0.75`,
bukan `NaN` atau `75`.

**Parsing jam** (`parseTimeCell`): terima `null`/`undefined`/`""` (jadi
`null`, bukan reject baris), `Date` instance (dibaca pakai `getUTCHours()`
/`getUTCMinutes()` — bukan `getHours()` lokal, karena ExcelJS
mengonstruksi Date time-of-day dari epoch UTC 1899-12-30, sama seperti
`excelSerialToISODate()` di `lib/employee-import.ts`), angka pecahan hari
Excel (`0.3125` = `07:30`), atau teks `"HH:mm"`.

**Validasi minimal**: `NIK`, `Nama`, `Date` wajib ada nilainya — baris yang
gagal masuk `rejected: RawAttendanceRejectedRow[]` dengan alasannya,
**tidak menggagalkan baris lain** (loop lanjut, bukan throw).

`__tests__/attendance/importer.test.ts` — 8 test (7 dari addendum + 1
tambahan mengecek kategori "Hari Libur/Lembur" ke-import dengan benar),
semua lulus lewat `npm run test`. Ditaruh di `__tests__/` (bukan
colocated seperti `overtime-rules.test.ts`) karena butuh baca file fixture
binary dari disk — pola yang wajar untuk test yang punya fixture file,
mengikuti persis lokasi yang diminta addendum
(`__tests__/attendance/importer.test.ts`,
`__tests__/fixtures/attendance_import_fixture.xlsx`).

## Halaman — 3 page, pola App Router + komponen client fetch API

### Page 1 — `app/(app)/attendance/import/page.tsx`

Sama pola dengan `app/(app)/settings/master-data/page.tsx`: `Tabs` dengan
2 tab.

**Tab "Import Data Absensi"** (`AttendanceImportPanel.tsx`):
- Upload `.xlsx` — reuse pola `lib/employee-import.ts` (baca header row,
  cocokkan ke daftar kolom wajib nik/nama/tanggal/intime/outtime/it1/ot1/kategori,
  serial-date Excel handling yang sudah ada di sana)
- Konflik `(nik, tanggal)` yang sudah ada di DB → preview, tombol
  **Timpa** / **Lewati baris ini** (parameter `onConflict` di
  `importRawAttendance()`)
- Ringkasan hasil pakai `sonner` toast + summary card, pola sama seperti
  `ImportEmployeesDialog.tsx`
- `AttendanceImportHistory.tsx` — tabel riwayat (source_filename,
  imported_at, jumlah baris) di bawahnya
- Tidak ada tombol edit — read-only, sama seperti spec asli

**Tab "Master Durasi Jam antara"** (`BracketMasterManager.tsx`):
- Sama persis pola `MasterDataManager.tsx`: `Select`/`Radio` day_type,
  tabel + tombol Add/Edit lewat dialog form (bukan `st.data_editor` grid —
  project ini tidak punya pola grid inline-edit di mana pun, jadi ikut
  pola table+dialog yang sudah konsisten dipakai)
- Validasi `durasi_start < durasi_end` di `schemas/attendance.schema.ts`
  (Zod `.refine()`), overlap antar rentang di-warn tapi tetap boleh
  simpan — sama seperti spec asli
- Catatan kecil di bawah tabel: perubahan di sini langsung berlaku ke
  crosscheck berikutnya

### Page 2 — `app/(app)/attendance/calculation/page.tsx`

- Tombol "Jalankan Crosscheck" → `POST /api/attendance/crosscheck`
- `CrosscheckTable.tsx` — tabel dengan `Badge` variant per status (hijau
  Sesuai, merah Tidak Sesuai, kuning Cek Manual — `components/ui/badge.tsx`
  sudah ada, tinggal pilih variant)
- Filter tanggal range / department / status di atas tabel
- Klik baris "Tidak Sesuai" → `CorrectionDialog.tsx` (pola
  `MasterDataDialog.tsx`), field `final_oth` + `correction_note` wajib
  diisi (Zod `.min(1)`)
- Setelah simpan, status → "Dikoreksi Manual" (bukan otomatis "Sesuai") —
  histori tetap jujur, sama seperti spec asli
- `system_calculated_oth` ditampilkan di kolom sebelah `final_oth`

### Page 3 — `app/(app)/attendance/report/page.tsx`

- `AttendanceReportPanel.tsx`: filter tanggal + department, 3 tombol
  Generate & Download
- Pola download: `fetch("/api/attendance/report", { method: "POST", body })`
  → `blob()` → `URL.createObjectURL` → anchor `download` — **persis** pola
  yang sudah ada di `components/export/ExportPreview.tsx`, bukan
  `st.download_button`
- `lib/attendance-report-service.ts` generate 3 jenis lewat `exceljs`
  (pola `lib/export-service.ts`): Rekap per karyawan, Rekap per
  departemen, Laporan eksepsi (`status IN ('Tidak Sesuai', 'Dikoreksi Manual')`)
- Semua 3 report ambil dari `final_oth`, bukan `system_calculated_oth`
- Endpoint report mewajibkan session dan permission `attendanceReport`; export SQLite dicatat melalui `audit_log` dengan jenis report, periode, department, jumlah baris, dan total Final OTH. Project belum memiliki audit-log export lintas provider yang seragam; Postgres audit export belum ditambahkan karena writer audit yang tersedia memang SQLite-only.
- **KNOWN GAP produksi:** `npm install` melaporkan 5 moderate severity vulnerabilities pada dependency tree. Belum dijalankan `npm audit fix` karena dapat mengubah versi dependency dan berpotensi memicu regresi; lakukan review dependency terpisah sebelum deployment.

## Integrasi ke shell aplikasi (bagian yang tidak ada padanannya di spec asli sama sekali)

Karena ini bukan project berdiri sendiri, modul baru harus didaftarkan ke
3 tempat yang sudah ada:

**`config/navigation.ts`** — tambah item baru di `MAIN_NAV` (pakai icon
lucide-react, misal `ClipboardCheck` atau `CalendarClock`):
```ts
{
  label: "Attendance",
  href: "/attendance/import",
  icon: ClipboardCheck,
  children: [
    { label: "NK Attendance Data", href: "/attendance/import" },
    { label: "MPP Calculation", href: "/attendance/calculation" },
    { label: "Overtime Report", href: "/attendance/report" },
  ],
},
```

**`config/module-permissions.ts`** — tambah 3 key baru ke
`PERMISSION_MODULES`, mengikuti pola `employeesActive`/`employeesInactive`
(satu key per sub-halaman, bukan satu key gabungan):
```ts
{ key: "attendanceImport", label: "Attendance - NK Attendance Data" },
{ key: "attendanceCalculation", label: "Attendance - MPP Calculation" },
{ key: "attendanceReport", label: "Attendance - Overtime Report" },
```

**`lib/api-error.ts`** — tambah handling untuk error class baru
(`AttendanceProviderNotSupportedError`, dan kalau perlu
`AttendanceNotFoundError` untuk raw_id yang tidak ketemu saat koreksi),
mirror `if` block yang sudah ada untuk `MasterDataNotFoundError` dkk.

## Langkah kerja yang disarankan (mirror urutan di spec asli)

1. Skema DB: edit `sqlite-init.ts` + `postgres-init.ts` (3 tabel baru),
   `lib/database/types.ts` (tipe baru)
2. `lib/attendance/day-type.ts`, `bracket-table.ts`, `overtime-rules.ts`
   lengkap sesuai spec di atas
3. Setup Vitest (`vitest.config.ts`, script `test`), tulis
   `overtime-rules.test.ts`, pastikan 4 test PASS — **sebelum lanjut**,
   sama seperti requirement spec asli
4. `lib/database/attendance-adapter.ts` + implementasi SQLite & Postgres
5. `schemas/attendance.schema.ts`, service layer
   (`attendance-import.ts`, `attendance-service.ts`,
   `attendance-report-service.ts`), lalu API routes
6. 3 halaman + komponen, daftarkan ke `navigation.ts` &
   `module-permissions.ts` di langkah terakhir

Rule engine teruji dulu (langkah 1-3) sebelum lanjut ke UI — urutan ini
dipertahankan persis dari spec asli karena alasannya sama: kalau rule
salah, semua di atasnya (adapter, halaman, report) ikut salah.

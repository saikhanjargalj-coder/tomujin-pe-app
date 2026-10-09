# Tomujin PE

Tomujin Alternative School-ийн биеийн тамирын веб апп: ангиуд, сурагчид, фитнес тест (baseline / mid / final), үнэлгээ (20/30/15/15/10/10), хичээлийн сан, сурагчийн дасгалын бүртгэл (Loading Form, RPE), тайлан ба CSV.

**#JustShowUp**

## Бүтэц

| Хэсэг | Юу вэ |
|---|---|
| `index.html`, `assets/` | Build хийх шаардлагагүй, цэвэр HTML/JS frontend. Vercel дээр шууд ажиллана |
| `assets/config.js` | Supabase-ийн URL болон **publishable** түлхүүр. Эдгээрийг нийтэд ил байлгахад аюулгүй |
| `supabase/migrations/` | Өгөгдлийн сангийн бүтэц, нэвтрэх хаалга болон эрхийн (RLS) дүрмүүд |
| `tests/` | RLS тест (Postgres), unit тест (Node), browser smoke тест (Playwright) |

### Хамгаалалт хэрхэн ажилладаг вэ

Хамгаалалт товч нуухад биш, **өгөгдлийн сан дотор** ажилладаг.

- Зөвхөн `@tomujin.edu.mn` хаягаар нэвтэрнэ.
- Тухайн хаяг **Багш нар** жагсаалтад эсвэл ангийн **сурагчдын** жагсаалтад байх ёстой. Бусад хаягаар нэвтрэхийг database өөрөө татгалзана.
- **Багш:** бүх өгөгдлийг уншиж, бичиж чадна. **Админ:** үүн дээр нэмж багш нэмж, хасах эрхтэй.
- **Сурагч:** зөвхөн өөрийн мэдээлэл, тест, үнэлгээ болон ангийнхаа хичээлүүдийг **уншина**. Зөвхөн өөрийн дасгалын бүртгэлийг **нэмж** чадна, засах, устгах боломжгүй.
- Сурагчийг "идэвхгүй" болгомогц тэр сурагчийн нэвтрэх эрх шууд хаагдана.

---

## Суулгах заавар (нэг удаа, ~30 минут)

### 1. Supabase: өгөгдлийн сан
1. supabase.com → **New project** (нэр: `tomujin-pe`, region: Singapore). Database password-ыг өөртөө хадгална.
2. Зүүн цэс → **SQL Editor** → **New query**.
3. `supabase/migrations/20261009000001_init.sql` файлын агуулгыг бүхэлд нь хуулж буулгаад → **Run** дарна.
4. "Success" гарвал болсон. Анхны админ эрх `saikhanjargal.j@tomujin.edu.mn` хаягт автоматаар олгогдоно.

### 2. Supabase: нэвтрэлтийн тохиргоо
**Authentication → URL Configuration** хэсэгт:
- **Site URL:** `https://<таны-vercel-хаяг>.vercel.app`
- **Redirect URLs:** `https://<таны-vercel-хаяг>.vercel.app/**`

> Хуучин апп-ийн login эвдэрсэн нэг шалтгаан нь Site URL `localhost:3000` хэвээр үлдсэн байсан явдал. Энэ хэсгийг заавал зөв бөглөөрэй.

### 3. Google-ээр нэвтрэх (сурагчдад хамгийн тохиромжтой)
Supabase-ийн үнэгүй email үйлчилгээ **цагт хэдхэн email** илгээх хязгаартай. Тиймээс бүтэн анги нэг дор email-ээр нэвтэрвэл хязгаарт хүрнэ. Google login-д ийм хязгаар байхгүй.

1. console.cloud.google.com руу **сургуулийн хаягаараа** нэвтэрч, шинэ project үүсгэнэ.
2. **APIs & Services → OAuth consent screen** → **Internal** сонгоно. Ингэснээр зөвхөн tomujin.edu.mn хаягтай хүмүүс нэвтэрнэ.
3. **Credentials → Create credentials → OAuth client ID** → **Web application** сонгоно.
   - Authorized redirect URI: `https://<supabase-project-ref>.supabase.co/auth/v1/callback`
4. Үүссэн Client ID болон Client Secret-ийг Supabase → **Authentication → Providers → Google** хэсэгт оруулаад Enable хийнэ.

> Хэрэв сургуулийн IT админ гуравдагч аппыг хязгаарласан бол Google Workspace Admin дээр зөвшөөрөл авах шаардлагатай байж магадгүй.
> Google тохируулахгүй бол `assets/config.js` файлд `GOOGLE_LOGIN: false` гэж тохируулна. Тэгвэл зөвхөн email линкээр нэвтэрнэ.

### 4. config.js бөглөх
Supabase → **Project Settings → API** хэсгээс:
- `SUPABASE_URL` = Project URL
- `SUPABASE_KEY` = **Publishable key** (`sb_publishable_...`)

> ⚠️ **service_role / secret** түлхүүрийг ХЭЗЭЭ Ч энд бүү оруулаарай.

### 5. Vercel: сайтаа нийтлэх
1. vercel.com → **Add New → Project** → `tomujin-pe-app`-ийг import хийнэ.
2. Framework Preset: **Other**. Build Command болон Output Directory хоосон үлдэнэ → **Deploy**.
3. Сурагчид сайт руу ороход Vercel-ийн нэвтрэх хуудас гарч ирвэл: **Settings → Deployment Protection → Vercel Authentication**-ийг production дээр унтраана.

### 6. Анхны ажлууд
1. Өөрийн хаягаар нэвтэрнэ.
2. **Ангиуд** → анги нэмнэ → сурагчдыг нэмнэ. Excel-ээс *нэр, овог, email, код, хүйс* гэсэн баганаар хуулж буулгаж болно.
3. Сурагчид өөрсдийн сургуулийн хаягаар нэвтэрнэ.
4. Бусад багш нарыг **Багш нар** хэсэгт нэмнэ.

---

## Тест

```bash
node tests/unit.test.mjs                 # тооцоолол, CSV импорт, XSS хамгаалалт
python3 tests/ui/smoke_test.py           # бүх хуудас browser дээр (Playwright)
# RLS: Postgres 16 дээр tests/supabase_mock.sql → migration → tests/rls_test.sql
```

## Хуучин системийн тухай

Хуучин `tomujin-pe-ready` (Vercel) болон Supabase `xzwitpwbcvxyfwncwhpf` төслүүдэд **хүрээгүй, өөрчлөөгүй**. Тэнд хэрэгтэй өгөгдөл байгаа эсэхийг шалгаж, шаардлагатай бол CSV хэлбэрээр шилжүүлсний дараа л хаана.

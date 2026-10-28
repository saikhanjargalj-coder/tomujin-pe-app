# Strava холболт — асаах заавар

Сайт дээр **"Миний хэсэг → Миний Strava"** хуудас нэмэгдсэн:

- **Сурагч бүр өөрийн Strava-г холбоно.** Сүүлийн 30 хоногийн гүйлт, дугуй, бэлтгэл нь тухайн сурагчид л харагдана. Аль нэгийг нь нэг товчоор **бэлтгэлийн тэмдэглэлд** оруулна: минут нь Strava-аас бөглөгдөнө, хэр хүнд байсан, биеийн мэдрэмжийг сурагч өөрөө сонгоно.
- **Багш** сурагчийн Strava-г харахгүй. Сурагч тэмдэглэлд оруулсан бэлтгэл (минут, оноо, Strava холбоос) л багшийн самбарт гарна.
- **Strava холбоосыг гараар** оруулах талбар бэлтгэлийн тэмдэглэлд байна (холбоогүй сурагчид ч ашиглана).
- **Tomujin PE Strava клуб** ба **Жак багшийн бэлтгэл** хэсгийг та засах горимоос тохируулна.

`config.js` дотор `STRAVA_ON: false` байгаа тул одоогоор "удахгүй нээгдэнэ" гэж харагдана. Доорх алхмуудыг хийсний дараа асаана.

## Яагаад ийм бүтэцтэй вэ (Strava-гийн дүрэм, 2026 оны 6-р сараас)

| Дүрэм | Сайт дээр |
|---|---|
| Хүний Strava өгөгдлийг зөвхөн тэр хүнд нь харуулна | Сурагч зөвхөн өөрийнхөө бэлтгэлийг харна. Багш, ангийнхан харахгүй |
| Strava өгөгдлийг 7 хоногоос удаан хадгалахгүй | Бэлтгэлүүдийг тухай бүр Strava-аас авна. 10 минутын түр хуулбар 24 цагийн дотор устна. Газрын зураг, байршил огт авахгүй |
| Шинэ апп өөрөө **10 хүн** хүртэл холбоно | 10-аас олон сурагчид Strava-д хянуулах хүсэлт илгээнэ (баталгаагүй) |
| Апп эзэмшигч **Strava subscription**-тэй байна | Таны Strava акаунт subscription-тэй байх ёстой |
| Strava 13-аас дээш насныханд | 1, 6–7-р ангийнхан ихэнх нь хамрагдахгүй |
| Түлхүүр (secret) хөтөч рүү очихгүй | Strava-тай зөвхөн сервер (Cloud Functions) ярина |

## Асаах алхмууд (нэг удаа, ~40 минут)

### 1. Strava API апп үүсгэх
1. **strava.com/settings/api** руу өөрийн Strava-гаар орно.
2. Бөглөнө:
   - Application Name: `Tomujin PE`
   - Website: `https://tomujin-pe.web.app`
   - Authorization Callback Domain: `asia-east1-tomujin-pe.cloudfunctions.net`
   - Icon: Tomujin PE лого
3. **Client ID** ба **Client Secret**-ийг харна (Secret-ийг хэнд ч бүү үзүүлээрэй, энд ч бүү бичээрэй).
4. Мөн хуудсанд **athlete capacity**-г 1-ээс **10** болгоно (хянуулахгүйгээр болдог).
5. 10-аас олон сурагч холбох бол тэр хуудаснаас **review** хүсэлт илгээнэ. Тайлбарт: сургуулийн биеийн тамирын сайт, сурагч зөвхөн өөрийн өгөгдлийг харна, багшид харуулахгүй, өгөгдөл хадгалахгүй, AI-д ашиглахгүй.

### 2. Firebase-ийг Blaze план руу шилжүүлэх
Cloud Functions зөвхөн Blaze (төлбөртэй, хэрэглээгээрээ) план дээр ажилладаг.
1. **console.firebase.google.com** → `tomujin-pe` → зүүн доод буланд **Upgrade** → **Blaze**.
2. Төлбөрийн карт холбоно. **Budget alert**-ийг $5 гэж тавина (хэтэрвэл имэйл ирнэ).
3. Ийм бага хэрэглээ (хэдэн арван сурагч) ихэвчлэн үнэгүй хэмжээндээ багтдаг.

### 3. Сервер хэсгийг байршуулах (Cloud Shell)
**shell.cloud.google.com** → сургуулийн акаунт. Мөр бүрийг хуулж буулгаад Enter:

```bash
cd ~/tomujin-pe-app || git clone https://github.com/saikhanjargalj-coder/tomujin-pe-app ~/tomujin-pe-app && cd ~/tomujin-pe-app
git fetch origin && git checkout firebase-app && git pull
cd strava-fn
npm install
npx -y firebase-tools@13 functions:secrets:set STRAVA_CLIENT_ID --project tomujin-pe
npx -y firebase-tools@13 functions:secrets:set STRAVA_CLIENT_SECRET --project tomujin-pe
npx -y firebase-tools@13 deploy --only functions --project tomujin-pe
```

- `secrets:set` бүр дээр утгаа (1-р алхмын Client ID, дараа нь Client Secret) буулгаад Enter дарна. Дэлгэц дээр харагдахгүй нь хэвийн.
- "How many days do you want to keep container images?" гэж асуувал `1` гэж бичнэ.
- Шалгах: хөтөчөөр `https://asia-east1-tomujin-pe.cloudfunctions.net/strava/ping` нээхэд `{"ok":true}` гарна.

### 4. Сайт дээр асаах
1. GitHub дээр `web/config.js` (firebase-app салбар) → ✏️ → `STRAVA_ON: false` мөрийг `STRAVA_ON: true` болгоно → **Commit changes**.
2. Cloud Shell дээр:
```bash
cd ~/tomujin-pe-app && git pull
npx -y firebase-tools@13 deploy --only hosting,firestore:rules --project tomujin-pe
```
3. Өөрийн акаунтаар **Миний хэсэг → Миний Strava → Strava-аар холбох** дарж туршина.

### 5. (Заавал биш) Strava дээр салгахад шууд устгах
Сурагч Strava-гийн тохиргооноос Tomujin PE-г устгавал холболт нь манай талд ч шууд устдаг болгох. Cloud Shell дээр `ID`, `SECRET`-ийг өөрийнхөөрөө солиод нэг удаа:

```bash
curl -X POST https://www.strava.com/api/v3/push_subscriptions \
  -F client_id=ID -F client_secret=SECRET \
  -F callback_url=https://asia-east1-tomujin-pe.cloudfunctions.net/strava/webhook \
  -F verify_token=tomujin-pe-strava
```
Үүнгүй ч болно: Strava холболт салсныг сайт дараагийн удаа анзаарч устгадаг.

## Клуб ба багшийн Strava
- Засах горим → **Миний Strava** → **✎ Клуб ба багшийн Strava-г засах**.
- Клуб: Strava дээр клуб үүсгээд холбоосыг (`https://www.strava.com/clubs/...`) буулгана. Клубын embed код заавал биш.
- Багшийн бэлтгэл: strava.com → профайл → **Share your Activities** кодыг, эсвэл бэлтгэл бүрийн **Share → Embed** кодыг буулгана. Strava-гийн embed зөвхөн "Everyone" гэж нээлттэй бэлтгэлийг харуулдаг.
- Нүүр хуудасны "Холбоо барих" хэсэгт Strava профайлаа нэмэх бол `config.js` → `CONTACT.strava`.
- Буулгасан кодноос зөвхөн Strava-гийн хаягийг авч ашиглана; өөр сайтын код, script хэзээ ч хуудсанд орохгүй.

## Файлууд
| Файл | Юу вэ |
|---|---|
| `src/strava.js` | "Миний Strava" хуудас, тэмдэглэлд оруулах, клуб, багшийн хэсэг |
| `strava-fn/` | Cloud Functions: Strava-аар нэвтрэх, бэлтгэл авах, салгах, өдөр бүрийн цэвэрлэгээ. Сайтын ердийн `firebase deploy`-д ордоггүй, тусдаа байршина |
| `strava-fn/test.js` | Серверийн хэсгийн тест (`node strava-fn/test.js`) |
| `tests/ui/strava.py` | Хөтөч дээрх тест (preview өгөгдөл дээр) |
| `firestore.rules` | `stravaTokens`, `stravaState`, `stravaCache`: хэн ч уншиж чадахгүй. `users/{uid}/strava`: зөвхөн тухайн сурагч |

## Анхаарах
- Strava-гийн `oauth/deauthorize` 2027 оны 6-р сарын 1-нд хаагдана. Түүнээс өмнө `strava-fn/lib.js` дотор `/oauth/revoke` руу шилжүүлнэ.
- Strava-гийн review-д илгээхийн өмнө холбох товчийг Strava-гийн албан ёсны "Connect with Strava" зургаар солих шаардлага гарч магадгүй.

# ✉ Letter Draft Assistant v2.0 (सुरक्षित पत्र-प्रारूप एवं मदवार पंजी प्रणाली)

एक पूर्णतः सुरक्षित, द्विभाषी (**हिंदी Unicode + English**) कार्यालयी पत्र-प्रारूपण, जावक/आवक पंजी (Outward/Inward Register), **Major Head (मुख्य शीर्ष / मद)** खोज, तथा **Word (`.docx`), PDF (`.pdf`), Excel (`.xlsx`)** और **Google Sheets Live Sync** से युक्त वेब ऐप सिस्टम — जिसे किसी भी Windows लैपटॉप/पीसी, Mac, Linux या क्लाउड पर 1-क्लिक में चलाया व होस्ट किया जा सकता है।

---

## ✨ प्रमुख विशेषताएँ (Key Highlights)

1. **🔒 मज़बूत लॉगिन एवं पूर्ण सुरक्षा (Enterprise-Grade Security)**
   - बिना लॉगिन के कोई भी पेज, पत्र, रजिस्टर या हस्ताक्षर/मुहर एक्सेस नहीं हो सकता।
   - **Scrypt पासवर्ड हैशिंग (Random Salt)**, **CSRF सुरक्षा**, **Brute-Force Rate Limiting (5 गलत प्रयास पर लॉक)**, और **Security Audit Log**।
   - **Role-Based Access Control (RBAC)**: `Admin` (प्राचार्य/प्रशासक), `Staff` (कार्यालय लिपिक), एवं `Viewer` (अवलोकनकर्ता)।
   - निजी हस्ताक्षर एवं मुहर (`sign.png`) पब्लिक फ़ोल्डर से बाहर `storage/` में सुरक्षित रहते हैं।

2. **🎯 20+ सटीक द्विभाषी टेम्पलेट्स एवं स्मार्ट प्लेसहोल्डर इंजन**
   - 20 तैयार सरकारी/विद्यालय प्रारूप (Request, Reminder, Forwarding, Clarification/Reply, Bonafide, Character, Fee Certificate, Office Order, Notice, Circular, Financial Sanction/Bill, Quotation/Purchase Order, Staff Relieving/Joining, Experience, NOC, Leave, Parent Intimation, Invitation, Permission, Custom Blank)।
   - **ऑटो सिस्टम प्लेसहोल्डर**: `{{ref_no}}`, `{{date}}`, `{{academic_session}}`, `{{financial_year}}`, `{{major_head}}`, `{{sub_head}}`, `{{school_name_en}}`, `{{school_name_hi}}`, `{{school_address_en}}`, `{{school_address_hi}}`, `{{udise_code}}`, `{{cbse_aff_no}}`, `{{signatory_name}}`, आदि।
   - **कस्टम प्लेसहोल्डर ऑटो-डिटेक्शन**: पत्र में कहीं भी `{{कोई_भी_नाम}}` लिखते ही उसका इनपुट बॉक्स स्वतः बन जाता है और खाली छूटने पर पीले रंग में चेतावनी देता है!

3. **🔤 फ़ॉन्ट की कोई समस्या नहीं + Word (`.docx`), PDF (`.pdf`) व Excel (`.xlsx`) डाउनलोड**
   - **एम्बेडेड यूनिफाइड देवनागरी + इंग्लिश फ़ॉन्ट्स (`Karma Serif` एवं `Mukta Sans`)** रिपॉज़िटरी में शामिल हैं — इंटरनेट न होने पर भी हर कंप्यूटर व मोबाइल पर 100% समान व स्पष्ट हिंदी-अंग्रेज़ी दिखती है।
   - **असली Microsoft Word (`.docx`)**: `dolanmiu/docx` द्वारा जनित OpenXML `.docx` फ़ाइल (`Times New Roman` + `Nirmala UI` / `Mangal` Complex Script सपोर्ट के साथ — बिना किसी टूटे मात्रा/अक्षर के)।
   - **असली एम्बेडेड-फ़ॉन्ट PDF (`.pdf`)**: `pdfkit` + `fontkit` OpenType देवनागरी शेपिंग के साथ सीधा डाउनलोड।
   - **KrutiDev → Unicode कन्वर्टर बटन**: पुराने Word दस्तावेज़ों से कॉपी किए गए KrutiDev टेक्स्ट को 1-क्लिक में मानक Unicode हिंदी में बदलें।

4. **📊 Excel एवं Google Sheets में सारा डेटा सेव व Major Head खोज**
   - प्रत्येक पत्र के साथ **Letter No. (पत्रांक)**, **Major Head (मुख्य शीर्ष — जैसे `ADM`, `STD`, `EST`, `FIN`, `SCH`, `PUR`, `BRD`, `EVT`, `LGL`, `NOT`)** और **Sub-Head / संचिका संख्या** सेव होती है।
   - सर्वर पर स्वतः `data/Master_Letter_Register.xlsx` (3 शीट: *Outward Register*, *Inward Register*, *Major Head Summary* + AutoFilter) अपडेट होती है।
   - **Google Sheets Live Sync**: ऐप के `☁ Google & Excel` टैब में दिए गए 2-मिनट Apps Script से अपनी Google Sheet जोड़ें — हर नया पत्र स्वतः आपकी Google Sheet में भी सेव होगा!

---

## 🚀 किसी भी लैपटॉप / पीसी या क्लाउड पर डिप्लॉय कैसे करें (Super-Easy Deployment)

### विकल्प A: किसी भी Windows Laptop / Office PC पर (1-क्लिक)
1. एक बार [nodejs.org](https://nodejs.org) से **Node.js LTS** इंस्टॉल करें।
2. इस फ़ोल्डर में **`start.bat`** पर डबल-क्लिक करें (Linux/Mac पर `./start.sh` चलाएँ)।
3. पहली बार यह स्वतः आवश्यक पैकेज इंस्टॉल करेगा और ब्राउज़र में `http://localhost:3000` खोल देगा।
4. पहली बार खुलने पर **First-Time Admin Setup** स्क्रीन पर अपना एडमिन यूज़रनेम और मज़बूत पासवर्ड सेट करें।
5. **ऑफिस Wi-Fi पर अन्य पीसी/मोबाइल से चलाने हेतु**: टर्मिनल या `Settings & Deploy` पेज पर दिख रहे ऑफिस LAN लिंक (`http://192.168.x.x:3000`) को खोलें और लॉगिन करें।

### विकल्प B: मुफ़्त इंटरनेट लिंक (Cloudflare Tunnel द्वारा ऑफिस पीसी से)
```bash
cloudflared tunnel --url http://localhost:3000
```

### विकल्प C: क्लाउड होस्टिंग (Render / Railway / Docker — 1-क्लिक)
- **Render.com**: इस GitHub रिपॉज़िटरी को Render में **Blueprint (`render.yaml`)** के रूप में कनेक्ट करें — 1-क्लिक में लाइव!
- **Railway.app**: GitHub रेपो चुनें (`railway.json` स्वतः डिटेक्ट होगा)।
- **Docker (किसी भी VPS/Server पर)**:
  ```bash
  docker compose up -d
  ```

---

## 🧪 सुरक्षा एवं सिस्टम परीक्षण (Run Automated Tests)
```bash
npm test
npm run security-audit
```

---

## 🙏 प्रयुक्त ओपन-सोर्स GitHub प्रोजेक्ट्स (Open-Source Credits)
- [`dolanmiu/docx`](https://github.com/dolanmiu/docx) — OpenXML Microsoft Word `.docx` generation
- [`foliojs/pdfkit`](https://github.com/foliojs/pdfkit) & [`foliojs/fontkit`](https://github.com/foliojs/fontkit) — OpenType Devanagari shaping & `.pdf` generation
- [`exceljs/exceljs`](https://github.com/exceljs/exceljs) — Multi-sheet `.xlsx` Excel register generation & import
- [`google/fonts`](https://github.com/google/fonts) (`Karma` & `Mukta` by Indian Type Foundry / Ek Type, OFL-1.1) — Unified Devanagari + Latin typography

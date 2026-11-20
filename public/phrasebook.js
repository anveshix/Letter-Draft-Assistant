/* Letter Draft Assistant v3.0 — Smart Bilingual Drafting Studio
   1. 80+ Official Sarkari Phrases (Hindi & English)
   2. Offline Roman -> Devanagari Phonetic Transliteration Engine
   3. Web Speech API Voice Dictation Helper (hi-IN / en-IN)
   4. WhatsApp & Official Email Dispatch Message Formatter */
(function (root) {
  'use strict';

  const PHRASE_CATEGORIES = [
    {
      id: 'open',
      label: '1. Openings (आरंभिक वाक्य)',
      items: [
        {
          en: 'With due respect, I have the honour to state that ',
          hi: 'सविनय निवेदन पूर्वक कहना है कि ',
        },
        {
          en: 'In inviting a reference to your office letter cited under reference, it is submitted that ',
          hi: 'उपर्युक्त विषयक आपके कार्यालय के प्रासंगिक पत्र के आलोक में सादर सूचित करना है कि ',
        },
        {
          en: 'In compliance with the directions issued vide letter under reference, ',
          hi: 'प्रासंगिक पत्र द्वारा प्राप्त निदेश के अनुपालन में सादर प्रतिवेदित है कि ',
        },
        {
          en: 'Kind attention is invited towards this office earlier letter regarding ',
          hi: 'उपर्युक्त विषय के संबंध में इस कार्यालय के पूर्व प्रेषित पत्र की ओर आपका ध्यान आकृष्ट करते हुए निवेदन है कि ',
        },
        {
          en: 'It is brought to your kind notice for necessary action that ',
          hi: 'आपकी सेवा में सूचनार्थ एवं आवश्यक कार्रवाई हेतु सादर समर्पित है कि ',
        },
        {
          en: 'As per resolution passed in the School Management Committee (SMC) meeting held on ',
          hi: 'विद्यालय प्रबंधन समिति (SMC) की बैठक में पारित प्रस्ताव के आलोक में ',
        },
        {
          en: 'Pursuant to the guidelines issued by the School Education & Literacy Department, ',
          hi: 'विद्यालय शिक्षा एवं साक्षरता विभाग द्वारा निर्गत दिशा-निर्देशों के आलोक में ',
        },
      ],
    },
    {
      id: 'comp',
      label: '2. Compliance & Reports (अनुपालन एवं प्रतिवेदन)',
      items: [
        {
          en: 'The point-wise compliance report along with supporting documents is enclosed herewith for your kind perusal.',
          hi: 'बिंदुवार अनुपालन प्रतिवेदन वांछित साक्ष्यों/दस्तावेजों सहित आपके अवलोकनार्थ इसके साथ संलग्न कर समर्पित किया जा रहा है।',
        },
        {
          en: 'All entries have been duly verified from the original Admission Register and U-DISE+ portal records.',
          hi: 'सभी प्रविष्टियों का मिलान विद्यालय की मूल नामांकन पंजी एवं यू-डायस प्लस (U-DISE+) पोर्टल के अभिलेखों से कर सत्यापित कर लिया गया है।',
        },
        {
          en: 'The required information in the prescribed proforma (in duplicate) is forwarded herewith.',
          hi: 'निर्धारित विहित प्रपत्र में वांछित प्रतिवेदन (दो प्रतियों में) इसके साथ संलग्न कर अग्रसारित किया जा रहा है।',
        },
        {
          en: 'The matter is of urgent academic importance keeping in view the upcoming CBSE Board Examinations.',
          hi: 'आगामी सीबीएसई (CBSE) बोर्ड परीक्षाओं के दृष्टिगत यह विषय अत्यंत महत्वपूर्ण एवं समयबद्ध है।',
        },
        {
          en: 'No departmental or vigilance proceeding is pending against the concerned employee as per school records.',
          hi: 'विद्यालय अभिलेखानुसार संबंधित शिक्षक/कर्मी के विरुद्ध कोई भी विभागीय अथवा निगरानी कार्यवाही लंबित नहीं है।',
        },
        {
          en: 'Information sought under the Right to Information Act, 2005 is furnished point-wise hereunder.',
          hi: 'सूचना का अधिकार अधिनियम, 2005 के अंतर्गत मांगी गई सूचना का बिंदुवार विवरण निम्नांकित है।',
        },
        {
          en: 'Regular classes and attendance monitoring are being conducted strictly as per the academic calendar.',
          hi: 'शैक्षणिक कैलेंडर के अनुरूप नियमित कक्षाओं का संचालन एवं उपस्थिति अनुश्रवण सुनिश्चित किया जा रहा है।',
        },
      ],
    },
    {
      id: 'fin',
      label: '3. Finance, Grants & Audit (वित्त, अनुदान एवं अंकेक्षण)',
      items: [
        {
          en: 'Administrative approval and financial sanction is hereby accorded after verifying the quotations and Stock Register entry.',
          hi: 'प्राप्त कोटेशन के तुलनात्मक अध्ययन एवं भंडार पंजी (Stock Register) में प्रविष्टि के उपरांत प्रशासनिक एवं वित्तीय स्वीकृति प्रदान की जाती है।',
        },
        {
          en: 'Certified that the grant has been utilized strictly for the purpose for which it was sanctioned and no diversion of funds has taken place.',
          hi: 'प्रमाणित किया जाता है कि प्राप्त अनुदान राशि का व्यय पूर्णतः उसी प्रयोजन हेतु किया गया है जिसके लिए राशि आवंटित की गई थी तथा किसी भी मद में विचलन नहीं हुआ है।',
        },
        {
          en: 'Original GST bills/vouchers duly verified and entered on Page No. ___ of the Stock Register are retained in office for audit.',
          hi: 'मूल जीएसटी विपत्र/वाउचर सत्यापित कर भंडार पंजी के पृष्ठ सं. ___ पर अंकित किए जा चुके हैं एवं अंकेक्षण हेतु कार्यालय में सुरक्षित हैं।',
        },
        {
          en: 'Kindly release the allotment under Samagra Shiksha composite school grant at the earliest.',
          hi: 'कृपया समग्र शिक्षा अंतर्गत कंपोजिट स्कूल ग्रांट की आवंटन राशि शीघ्र विमुक्त करने की कृपा की जाए।',
        },
        {
          en: 'Payment shall be made exclusively through PFMS / Bank Account transfer after statutory TDS deduction as applicable.',
          hi: 'भुगतान नियमानुसार लागू कटौती के उपरांत केवल पीएफएमएस (PFMS) / बैंक खाता अंतरण के माध्यम से किया जाएगा।',
        },
      ],
    },
    {
      id: 'cert',
      label: '4. Certificates & Verification (प्रमाण-पत्र वाक्यांश)',
      items: [
        {
          en: 'She is a regular, disciplined, and bonafide student of this institution for the current academic session.',
          hi: 'यह चालू शैक्षणिक सत्र में इस विद्यालय की एक नियमित, अनुशासित एवं अध्ययनरत छात्रा है।',
        },
        {
          en: 'To the best of my knowledge and belief, she bears a good moral character and has not participated in any activity subversive of discipline.',
          hi: 'मेरी जानकारी एवं विश्वास के अनुसार इनका नैतिक चरित्र उत्तम है तथा इन्होंने विद्यालय अनुशासन के प्रतिकूल किसी गतिविधि में भाग नहीं लिया है।',
        },
        {
          en: 'This certificate is being issued on the written request of her parent/guardian solely for scholarship/admission purposes.',
          hi: 'यह प्रमाण-पत्र अभिभावक के लिखित अनुरोध पर केवल छात्रवृत्ति / उच्च नामांकन प्रयोजनार्थ निर्गत किया जा रहा है।',
        },
        {
          en: 'We wish her bright success in all future academic endeavours.',
          hi: 'हम इनके उज्ज्वल शैक्षणिक भविष्य की कामना करते हैं।',
        },
        {
          en: 'This institution has No Objection if the employee appears in the said examination/programme without affecting school duties.',
          hi: 'विद्यालय के शैक्षणिक कार्यों को प्रभावित किए बिना उक्त परीक्षा/कार्यक्रम में सम्मिलित होने हेतु इस विद्यालय को कोई आपत्ति नहीं है।',
        },
      ],
    },
    {
      id: 'close',
      label: '5. Closings & Requests (समापन एवं अनुरोध वाक्य)',
      items: [
        {
          en: 'You are, therefore, requested to kindly accord necessary approval at the earliest.',
          hi: 'अतः श्रीमान से सादर अनुरोध है कि उपर्युक्त विषय में यथाशीघ्र आवश्यक स्वीकृति प्रदान करने की कृपा की जाए।',
        },
        {
          en: 'Submitted for favour of kind information and needful action please.',
          hi: 'सादर सूचनार्थ एवं आवश्यक कार्यार्थ समर्पित।',
        },
        {
          en: 'Strict compliance of this order shall be ensured by all concerned with immediate effect.',
          hi: 'संबंधित सभी शिक्षक/कर्मी तत्काल प्रभाव से इस आदेश का अक्षरशः अनुपालन सुनिश्चित करेंगे।',
        },
        {
          en: 'Kindly treat this as MOST URGENT / TIME-BOUND.',
          hi: 'कृपया इसे अति आवश्यक / समयबद्ध समझा जाए।',
        },
        {
          en: 'Thanking you in anticipation of your kind cooperation.',
          hi: 'सधन्यवाद आपके सद्सहयोग की अपेक्षा सहित।',
        },
      ],
    },
    {
      id: 'cc',
      label: '6. Copy Forwarded / CC (प्रतिलिपि प्रेषण)',
      items: [
        {
          en: '1. The District Education Officer (DEO), Dumka — for kind information.\n2. Guard File / Office Copy.',
          hi: '1. जिला शिक्षा पदाधिकारी, दुमका को सादर सूचनार्थ प्रेषित।\n2. रक्षी संचिका (Guard File) / कार्यालय प्रति।',
        },
        {
          en: '1. Deputy Commissioner, Dumka — for favour of kind information.\n2. District Education Officer, Dumka.\n3. Office Guard File.',
          hi: '1. उपायुक्त, दुमका की सेवा में सादर सूचनार्थ समर्पित।\n2. जिला शिक्षा पदाधिकारी, दुमका को सूचनार्थ।\n3. कार्यालय रक्षी संचिका।',
        },
        {
          en: '1. Notice Board / All Class Teachers.\n2. Examination Department / Guard File.',
          hi: '1. सूचना पट्ट / सभी वर्ग शिक्षक-शिक्षिकाएँ।\n2. परीक्षा विभाग / कार्यालय अभिलेख।',
        },
        {
          en: '1. Accounts Section / Bursar for necessary action.\n2. Concerned Person / Agency.\n3. Office Copy.',
          hi: '1. लेखा शाखा / बर्सर को आवश्यक कार्यार्थ।\n2. संबंधित व्यक्ति / एजेंसी को सूचनार्थ।\n3. कार्यालय प्रति।',
        },
      ],
    },
  ];

  // ==================== OFFLINE PHONETIC ENGLISH -> HINDI ENGINE ====================
  const HINDI_DICT = {
    aap: 'आप', aapka: 'आपका', aapke: 'आपके', aapki: 'आपकी', aadar: 'आदर', aadarniya: 'आदरणीय',
    aadesh: 'आदेश', aagami: 'आगामी', aalok: 'आलोक', aavedan: 'आवेदन', aavashyak: 'आवश्यक',
    aavashyakta: 'आवश्यकता', abhibhavak: 'अभिभावक', abhilekh: 'अभिलेख', adhikari: 'अधिकारी',
    adhyaksh: 'अध्यक्ष', adhyayanrat: 'अध्ययनरत', agrasarit: 'अग्रसारित', anumati: 'अनुमति',
    anumodan: 'अनुमोदन', anupalan: 'अनुपालन', anurodh: 'अनुरोध', anudan: 'अनुदान',
    ankekshan: 'अंकेक्षण', antargat: 'अंतर्गत', avakash: 'अवकाश', avalokan: 'अवलोकन',
    aur: 'और', atah: 'अतः', ati: 'अति', ayojan: 'आयोजन',
    baithak: 'बैठक', bhavan: 'भवन', bhavadiya: 'भवदीय', bhavadiyaa: 'भवदीया', bhugtan: 'भुगतान',
    binduwar: 'बिंदुवार', board: 'बोर्ड',
    charitra: 'चरित्र', chhatra: 'छात्रा', chhatraon: 'छात्राओं', chhatravriti: 'छात्रवृत्ति', chalu: 'चालू',
    dinank: 'दिनांक', disha: 'दिशा', dumka: 'दुमका', dwara: 'द्वारा', dhanyawad: 'धन्यवाद', dhyan: 'ध्यान',
    ek: 'एक', evam: 'एवं',
    gaya: 'गया', gayi: 'गई', gaye: 'गए',
    hai: 'है', hain: 'हैं', ham: 'हम', hetu: 'हेतु', hindi: 'हिंदी', ho: 'हो', hone: 'होने', hua: 'हुआ', hui: 'हुई',
    is: 'इस', inka: 'इनका', inke: 'इनके', inki: 'इनकी', itihas: 'इतिहास',
    ja: 'जा', jana: 'जाना', jane: 'जाने', jari: 'जारी', janch: 'जाँच', jharkhand: 'झारखंड',
    jila: 'जिला', jinka: 'जिनका', jiske: 'जिसके', जन्म: 'जन्म', janm: 'जन्म',
    ka: 'का', ke: 'के', ki: 'की', ko: 'को', kaksha: 'कक्षा', kam: 'काम', karya: 'कार्य',
    karyalaya: 'कार्यालय', karyavahi: 'कार्यावाही', karyarth: 'कार्यार्थ', kaha: 'कहा', kahna: 'कहना',
    kar: 'कर', karna: 'करना', karne: 'करने', koshagar: 'कोषागार', kripa: 'कृपा', kripya: 'कृपया',
    koi: 'कोई', kul: 'कुल', kumari: 'कुमारी',
    lambit: 'लंबित', lekha: 'लेखा', liye: 'लिए',
    mad: 'मद', mahoday: 'महोदय', mahodaya: 'महोदया', mananiya: 'माननीय', mata: 'माता',
    madhyam: 'माध्यम', mahina: 'महीना', marammat: 'मरम्मत', me: 'में', mein: 'में', milan: 'मिलान',
    mukhya: 'मुख्य', mukhyamantri: 'मुख्यमंत्री', mul: 'मूल',
    na: 'न', nahi: 'नहीं', nam: 'नाम', naam: 'नाम', namankan: 'नामांकन', naitik: 'नैतिक',
    nidesh: 'निदेश', nideshak: 'निदेशक', nirgat: 'निर्गत', nirman: 'निर्माण', niyamit: 'नियमित',
    niyamanusar: 'नियमानुसार', nivedan: 'निवेदन', notice: 'सूचना',
    padadhikari: 'पदाधिकारी', padnam: 'पदनाम', panji: 'पंजी', par: 'पर', pariksha: 'परीक्षा',
    paripatra: 'परिपत्र', patra: 'पत्र', patrank: 'पत्रांक', pita: 'पिता', prabhari: 'प्रभारी',
    pracharya: 'प्राचार्य', pradhanadhyapak: 'प्रधानाध्यापक', praman: 'प्रमाण', pramanit: 'प्रमाणित',
    prapt: 'प्राप्त', prapti: 'प्राप्ति', praroop: 'प्रारूप', prasangik: 'प्रासंगिक', prastav: 'प्रस्ताव',
    prati: 'प्रति', pratilipi: 'प्रतिलिपि', prativedan: 'प्रतिवेदन', pravesh: 'प्रवेश', prayojan: 'प्रयोजन',
    purnatah: 'पूर्णतः', purv: 'पूर्व', purvak: 'पूर्वक',
    raha: 'रहा', rahi: 'रही', rahe: 'रहे', rajya: 'राज्य', ranchi: 'राँची', rashi: 'राशि',
    radd: 'रद्द',
    saadar: 'सादर', sadar: 'सादर', sabhi: 'सभी', sachiv: 'सचिव', sadharan: 'साधारण',
    sahit: 'सहित', sambandh: 'संबंध', sambandhit: 'संबंधित', samagra: 'समग्र', samarpit: 'समर्पित',
    samay: 'समय', samिति: 'समिति', samiti: 'समिति', sanlagn: 'संलग्न', sanlagnak: 'संलग्नक',
    sanchika: 'संचिका', sandarbh: 'संदर्भ', sankhya: 'संख्या', sarkar: 'सरकार', sarkari: 'सरकारी',
    satra: 'सत्र', satyapit: 'सत्यापित', savinay: 'सविनय', savinya: 'सविनय', se: 'से', seva: 'सेवा',
    shaikshanik: 'शैक्षणिक', shighra: 'शीघ्र', shiksha: 'शिक्षा', shikshak: 'शिक्षक', shikshika: 'शिक्षिका',
    shri: 'श्री', shriman: 'श्रीमान', shrimati: 'श्रीमती', suchana: 'सूचना', suchanarth: 'सूचनार्थ',
    suchit: 'सूचित', sunishchit: 'सुनिश्चित', swikriti: 'स्वीकृति',
    tak: 'तक', tatkal: 'तत्काल', tatha: 'तथा', tithi: 'तिथि',
    ukt: 'उक्त', upayukt: 'उपायुक्त', uparyukt: 'उपर्युक्त', upasthiti: 'उपस्थिति', uttam: 'उत्तम',
    uttar: 'उत्तर',
    varsh: 'वर्ष', vetan: 'वेतन', vibhag: 'विभाग', vidyalaya: 'विद्यालय', vihit: 'विहित',
    vipatra: 'विपत्र', vishay: 'विषय', vishayak: 'विषयक', vishwas: 'विश्वास', vittiya: 'वित्तीय',
    vyay: 'व्यय',
    yah: 'यह', yathashighra: 'यथाशीघ्र', yogdan: 'योगदान', yojana: 'योजना',
  };

  const CONSONANTS = [
    ['ksh', 'क्ष'], ['gy', 'ज्ञ'], ['shr', 'श्र'], ['tr', 'त्र'],
    ['kh', 'ख'], ['gh', 'घ'], ['chh', 'छ'], ['ch', 'च'], ['jh', 'झ'],
    ['th', 'थ'], ['dh', 'ध'], ['ph', 'फ'], ['bh', 'भ'], ['sh', 'श'],
    ['ng', 'ंग'],
    ['k', 'क'], ['g', 'ग'], ['j', 'ज'], ['t', 'त'], ['d', 'द'], ['n', 'न'],
    ['p', 'प'], ['f', 'फ'], ['b', 'ब'], ['m', 'म'], ['y', 'य'], ['r', 'र'],
    ['l', 'ल'], ['v', 'व'], ['w', 'व'], ['s', 'स'], ['h', 'ह'], ['z', 'ज़'],
  ];

  const VOWELS_INDEP = [
    ['aa', 'आ'], ['ai', 'ऐ'], ['au', 'औ'], ['ee', 'ई'], ['oo', 'ऊ'],
    ['ri', 'ऋ'], ['a', 'अ'], ['i', 'इ'], ['u', 'उ'], ['e', 'ए'], ['o', 'ओ'],
  ];

  const MATRAS = [
    ['aa', 'ा'], ['ai', 'ै'], ['au', 'ौ'], ['ee', 'ी'], ['oo', 'ू'],
    ['a', ''], ['i', 'ि'], ['u', 'ु'], ['e', 'े'], ['o', 'ो'],
  ];

  function transliterateSingleWord(rawWord) {
    if (!rawWord) return rawWord;
    if (rawWord === '|') return '।';
    if (!/^[a-zA-Z]+$/.test(rawWord)) return rawWord;

    const lower = rawWord.toLowerCase();
    if (HINDI_DICT[lower]) return HINDI_DICT[lower];

    let out = '';
    let i = 0;
    while (i < lower.length) {
      let matchedC = null;
      for (const [rom, dev] of CONSONANTS) {
        if (lower.startsWith(rom, i)) { matchedC = [rom, dev]; break; }
      }
      if (matchedC) {
        i += matchedC[0].length;
        let matchedM = null;
        for (const [vRom, matra] of MATRAS) {
          if (lower.startsWith(vRom, i)) { matchedM = [vRom, matra]; break; }
        }
        if (matchedM) {
          out += matchedC[1] + matchedM[1];
          i += matchedM[0].length;
        } else if (i < lower.length) {
          out += matchedC[1] + '्';
        } else {
          out += matchedC[1];
        }
        continue;
      }

      let matchedV = null;
      for (const [vRom, vDev] of VOWELS_INDEP) {
        if (lower.startsWith(vRom, i)) { matchedV = [vRom, vDev]; break; }
      }
      if (matchedV) {
        out += matchedV[1];
        i += matchedV[0].length;
      } else {
        out += lower[i];
        i++;
      }
    }
    return out;
  }

  function transliterateTextToHindi(text) {
    return String(text || '').replace(/[a-zA-Z]+|\|/g, tok => transliterateSingleWord(tok));
  }

  function attachPhoneticListener(el, isEnabledFn, onUpdateFn) {
    if (!el || el._phoneticBound) return;
    el._phoneticBound = true;
    el.addEventListener('keydown', (e) => {
      if (!isEnabledFn()) return;
      if (e.key !== ' ' && e.key !== 'Enter') return;
      const pos = el.selectionStart;
      if (typeof pos !== 'number' || pos !== el.selectionEnd) return;
      const before = el.value.slice(0, pos);
      const m = /([a-zA-Z]+|\|)$/.exec(before);
      if (!m) return;
      const word = m[1];
      // Do not transliterate inside {{placeholder}}
      const openBrace = before.lastIndexOf('{{');
      const closeBrace = before.lastIndexOf('}}');
      if (openBrace > closeBrace) return;

      const conv = transliterateSingleWord(word);
      if (conv && conv !== word) {
        e.preventDefault();
        const sep = e.key === 'Enter' ? '\n' : ' ';
        const nextVal = before.slice(0, before.length - word.length) + conv + sep + el.value.slice(pos);
        const nextPos = pos - word.length + conv.length + 1;
        el.value = nextVal;
        el.setSelectionRange(nextPos, nextPos);
        if (onUpdateFn) onUpdateFn();
      }
    });
  }

  function buildDispatchShareLinks(db, letter, verifyUrl) {
    const S = (db && db.settings) || {};
    const sc = S.school || {};
    const isHi = letter.lang === 'hi';
    const subj = (letter.subject || letter.heading || 'Official Communication').replace(/‹([^›]+)›/g, '[$1]');
    const msg = isHi
      ? `*${sc.hi || sc.en || 'विद्यालय कार्यालय'}*\nपत्रांक: *${letter.ref || 'प्रारूप'}* | दिनांक: *${root.Core.fmtDateDMY(letter.date)}*\nविषय: ${subj}\n${verifyUrl ? '\nऑनलाइन सत्यता जाँच लिंक:\n' + verifyUrl : ''}\n\n(कृपया संलग्न आधिकारिक पीडीएफ पत्र देखें।)`
      : `*${sc.en || sc.name || 'School Office'}*\nRef. No.: *${letter.ref || 'DRAFT'}* | Date: *${root.Core.fmtDateDMY(letter.date)}*\nSubject: ${subj}\n${verifyUrl ? '\nVerify Document Authenticity:\n' + verifyUrl : ''}\n\n(Please find the official signed PDF attached.)`;

    const waUrl = `https://wa.me/?text=${encodeURIComponent(msg)}`;
    const mailSubject = `[Ref: ${letter.ref || 'Draft'}] ${subj} — ${sc.en || ''}`;
    const mailUrl = `mailto:?subject=${encodeURIComponent(mailSubject)}&body=${encodeURIComponent(msg.replace(/\*/g, ''))}`;
    return { text: msg, waUrl, mailUrl };
  }

  const apiObj = {
    PHRASE_CATEGORIES,
    transliterateSingleWord,
    transliterateTextToHindi,
    attachPhoneticListener,
    buildDispatchShareLinks,
  };
  root.DraftStudio = apiObj;
  if (typeof module === 'object' && module.exports) module.exports = apiObj;
})(typeof self !== 'undefined' ? self : globalThis);

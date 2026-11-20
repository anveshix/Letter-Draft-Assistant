/* Letter templates. Fields are shared by EN and HI versions, so switching language keeps what you typed.
   {{k}} = required (shows ‹label› if empty)   {{k?prefix %}} = optional, % replaced by the value. */
(function (root) {
  const F = (k, l, o) => Object.assign({ k, l, t: 'text' }, o || {});
  const T = [
    { id: 'req', name: 'Request / Application (अनुरोध / आवेदन)', layout: 'letter',
      fields: [F('topic', 'Request about (अनुरोध का विषय)', { ph: 'grant of permission for …' }), F('details', 'Background (पृष्ठभूमि)', { t: 'area' }), F('ask', 'What you request (अनुरोध)', { t: 'area' })],
      en: { subject: 'Request regarding {{topic}}', salutation: 'Respected Sir/Madam,', closing: 'Yours respectfully,',
        body: 'With due respect, I wish to bring to your kind notice that {{details}}\n\n{{ask}}\n\nI shall be highly obliged for your kind consideration and necessary action.' },
      hi: { subject: '{{topic}} के संबंध में अनुरोध', salutation: 'महोदय/महोदया,', closing: 'भवदीय,',
        body: 'सविनय निवेदन है कि {{details}}\n\n{{ask}}\n\nअतः आपसे विनम्र अनुरोध है कि उपर्युक्त बिंदुओं पर सहानुभूतिपूर्वक विचार कर आवश्यक कार्रवाई करने की कृपा करें।' } },
    { id: 'rem', name: 'Reminder (स्मरण-पत्र)', layout: 'letter',
      fields: [F('refno', 'Earlier letter Ref. & date (पूर्व पत्र)', { ph: '210/26 dated 12/08/2026' }), F('topic', 'Matter (विषय)')],
      en: { subject: 'Reminder regarding {{topic}}', salutation: 'Respected Sir/Madam,', closing: 'Yours respectfully,',
        body: 'I wish to draw your kind attention to our earlier letter {{refno}} regarding {{topic}}, on which we are yet to receive a response.\n\nYou are requested to kindly look into the matter and take necessary action at the earliest.' },
      hi: { subject: '{{topic}} के संबंध में स्मरण-पत्र', salutation: 'महोदय/महोदया,', closing: 'भवदीय,',
        body: 'आपका ध्यान इस विद्यालय के पत्रांक {{refno}} की ओर आकृष्ट कराना है, जो {{topic}} से संबंधित है, जिस पर अब तक कोई उत्तर प्राप्त नहीं हुआ है।\n\nअनुरोध है कि कृपया इस मामले को देखते हुए यथाशीघ्र आवश्यक कार्रवाई करने की कृपा करें।' } },
    { id: 'fwd', name: 'Forwarding / Submission (प्रेषण पत्र)', layout: 'letter',
      fields: [F('docs', 'Documents sent (संलग्न दस्तावेज़)', { ph: 'the list of … / report of …' }), F('purpose', 'Purpose (प्रयोजन)', { ph: 'your kind perusal' })],
      en: { subject: 'Submission of {{docs}}', salutation: 'Respected Sir/Madam,', closing: 'Yours respectfully,',
        body: 'Please find enclosed herewith {{docs}} for {{purpose}}.\n\nYou are requested to kindly acknowledge receipt and do the needful.' },
      hi: { subject: '{{docs}} का प्रेषण', salutation: 'महोदय/महोदया,', closing: 'भवदीय,',
        body: '{{purpose}} हेतु {{docs}} इस पत्र के साथ संलग्न कर प्रेषित किया जा रहा है।\n\nकृपया प्राप्ति की पावती देते हुए आवश्यक कार्रवाई करने की कृपा करें।' } },
    { id: 'inv', name: 'Invitation (आमंत्रण)', layout: 'letter',
      fields: [F('event', 'Event (कार्यक्रम)'), F('date', 'Date (तिथि)', { t: 'date' }), F('time', 'Time (समय)', { ph: '10:00 AM' }), F('venue', 'Venue (स्थान)', { def: 'the school premises' })],
      en: { subject: 'Invitation for {{event}}', salutation: 'Respected Sir/Madam,', closing: 'With warm regards,',
        body: 'It gives us great pleasure to invite you to {{event}} of our school, to be held on {{date}} at {{time}} at {{venue}}.\n\nYour gracious presence and blessings would be a source of great encouragement for our students and staff.\n\nWe look forward to welcoming you.' },
      hi: { subject: '{{event}} हेतु आमंत्रण', salutation: 'महोदय/महोदया,', closing: 'सादर,',
        body: 'हमारे विद्यालय में {{date}} को {{time}} बजे {{venue}} में {{event}} का आयोजन किया जा रहा है, जिसमें आपको आमंत्रित करते हुए हमें अत्यंत हर्ष हो रहा है।\n\nआपकी गरिमामयी उपस्थिति एवं आशीर्वाद से हमारी छात्राओं तथा शिक्षकों का उत्साहवर्धन होगा।\n\nहम आपकी प्रतीक्षा करेंगे।' } },
    { id: 'perm', name: 'Permission for an event (आयोजन की अनुमति)', layout: 'letter',
      fields: [F('event', 'Event (कार्यक्रम)'), F('date', 'Date (तिथि)', { t: 'date' }), F('details', 'Details (विवरण)', { t: 'area' })],
      en: { subject: 'Permission to organise {{event}}', salutation: 'Respected Sir/Madam,', closing: 'Yours respectfully,',
        body: 'I respectfully submit that our school proposes to organise {{event}} on {{date}}. {{details}}\n\nIt is therefore requested that permission may kindly be granted for the same.' },
      hi: { subject: '{{event}} के आयोजन की अनुमति हेतु अनुरोध', salutation: 'महोदय/महोदया,', closing: 'भवदीय,',
        body: 'सविनय निवेदन है कि विद्यालय द्वारा {{date}} को {{event}} का आयोजन प्रस्तावित है। {{details}}\n\nअतः आपसे अनुरोध है कि उक्त आयोजन हेतु अनुमति प्रदान करने की कृपा करें।' } },
    { id: 'leave', name: 'Leave application (अवकाश आवेदन)', layout: 'letter',
      fields: [F('type', 'Type of leave (अवकाश का प्रकार)', { def: 'Casual' }), F('from', 'From (से)', { t: 'date' }), F('to', 'To (तक)', { t: 'date' }), F('days', 'Days (दिन)', { ph: '2' }), F('reason', 'Reason (कारण)')],
      en: { subject: 'Application for {{type}} leave', salutation: 'Respected Sir/Madam,', closing: 'Yours obediently,',
        body: 'I respectfully request you to kindly grant me {{type}} leave for {{days}} day(s), from {{from}} to {{to}}, due to {{reason}}.\n\nI shall be grateful for your kind consideration.' },
      hi: { subject: '{{type}} अवकाश हेतु आवेदन', salutation: 'महोदय/महोदया,', closing: 'भवदीय,',
        body: 'सविनय निवेदन है कि {{reason}} के कारण मुझे {{from}} से {{to}} तक ({{days}} दिन) {{type}} अवकाश की आवश्यकता है।\n\nअतः उक्त अवधि का अवकाश स्वीकृत करने की कृपा करें।' } },
    { id: 'pm', name: 'Call parent to school (अभिभावक को बुलावा)', layout: 'letter',
      fields: [F('name', 'Student name (छात्रा का नाम)'), F('cls', 'Class (कक्षा)', { ph: 'X-A' }), F('reason', 'Matter (विषय)', { t: 'area', ph: 'has been irregular in attendance' }), F('date', 'Meeting date (तिथि)', { t: 'date' }), F('time', 'Time (समय)', { def: '10:00 AM' })],
      en: { to: 'The Parent / Guardian of {{name}},\nClass {{cls}}.', subject: 'Request to meet the school Principal regarding {{name}}', salutation: 'Dear Parent/Guardian,', closing: 'Yours sincerely,',
        body: 'This is to inform you that your ward {{name}} of Class {{cls}} {{reason}}.\n\nYou are requested to kindly meet the undersigned on {{date}} at {{time}} in the school office.' },
      hi: { to: '{{name}} (कक्षा {{cls}}) के अभिभावक,', subject: '{{name}} के संबंध में विद्यालय आने का अनुरोध', salutation: 'महोदय/महोदया,', closing: 'भवदीय,',
        body: 'सूचित किया जाता है कि आपकी पुत्री {{name}}, कक्षा {{cls}}, {{reason}}।\n\nअनुरोध है कि आप {{date}} को {{time}} बजे विद्यालय कार्यालय में आकर प्राचार्य से मिलने की कृपा करें।' } },
    { id: 'thx', name: 'Thank-you letter (धन्यवाद पत्र)', layout: 'letter',
      fields: [F('for', 'Thanks for (किसके लिए)'), F('impact', 'Impact / note (प्रभाव)', { t: 'area' })],
      en: { subject: 'Thanks for {{for}}', salutation: 'Respected Sir/Madam,', closing: 'With sincere regards,',
        body: 'On behalf of {{school}}, I extend my sincere thanks for {{for}}.\n\n{{impact}}\n\nWe look forward to your continued support.' },
      hi: { subject: '{{for}} हेतु धन्यवाद', salutation: 'महोदय/महोदया,', closing: 'सादर,',
        body: 'विद्यालय परिवार की ओर से {{for}} के लिए आपका हार्दिक आभार।\n\n{{impact}}\n\nभविष्य में भी आपके सहयोग की अपेक्षा रहेगी।' } },
    { id: 'not', name: 'Notice (सूचना)', layout: 'notice',
      fields: [F('title', 'Notice title (शीर्षक)'), F('details', 'Notice text (सूचना)', { t: 'area' })],
      en: { heading: 'NOTICE', subject: '{{title}}', body: '{{details}}' },
      hi: { heading: 'सूचना', subject: '{{title}}', body: '{{details}}' } },
    { id: 'circ', name: 'Circular (परिपत्र)', layout: 'notice',
      fields: [F('title', 'Circular subject (विषय)'), F('details', 'Text (पाठ)', { t: 'area' })],
      en: { heading: 'CIRCULAR', to: 'All Teaching and Non-Teaching Staff', subject: '{{title}}', body: '{{details}}' },
      hi: { heading: 'परिपत्र', to: 'समस्त शिक्षक एवं शिक्षकेतर कर्मी', subject: '{{title}}', body: '{{details}}' } },
    { id: 'bon', name: 'Bonafide certificate (अध्ययनरत प्रमाण-पत्र)', layout: 'cert',
      fields: [F('name', 'Student name (छात्रा का नाम)'), F('father', 'Father / guardian (पिता / अभिभावक)'), F('adm', 'Admission No. (प्रवेश संख्या)', { opt: true }), F('cls', 'Class (कक्षा)'), F('session', 'Session (सत्र)', { def: '__session__' }), F('purpose', 'Purpose (प्रयोजन)')],
      en: { heading: 'BONAFIDE CERTIFICATE', subject: '',
        body: 'This is to certify that {{name}}, daughter of {{father}}{{adm?, Admission No. %}}, is a bonafide student of this school, studying in Class {{cls}} during the academic session {{session}}.\n\nThis certificate is issued on her request for {{purpose}}.' },
      hi: { heading: 'अध्ययनरत प्रमाण-पत्र', subject: '',
        body: 'प्रमाणित किया जाता है कि {{name}}, पुत्री श्री {{father}}{{adm?, प्रवेश संख्या %}}, इस विद्यालय की कक्षा {{cls}} की नियमित छात्रा है तथा शैक्षणिक सत्र {{session}} में अध्ययनरत है।\n\nयह प्रमाण-पत्र छात्रा के अनुरोध पर {{purpose}} हेतु निर्गत किया जा रहा है।' } },
    { id: 'char', name: 'Character certificate (चरित्र प्रमाण-पत्र)', layout: 'cert',
      fields: [F('name', 'Student name (छात्रा का नाम)'), F('father', 'Father / guardian (पिता / अभिभावक)'), F('cls', 'Class (कक्षा)'), F('from', 'Studied from (से)', { ph: '2023' }), F('to', 'Studied till (तक)', { ph: '2026' }), F('conduct', 'Conduct (आचरण)', { ph: 'good / अच्छा' })],
      en: { heading: 'CHARACTER CERTIFICATE', subject: '',
        body: 'This is to certify that {{name}}, daughter of {{father}}, was a student of this school from {{from}} to {{to}} (Class {{cls}}). During this period, her conduct and character were found to be {{conduct}}.\n\nWe wish her all success in future.' },
      hi: { heading: 'चरित्र प्रमाण-पत्र', subject: '',
        body: 'प्रमाणित किया जाता है कि {{name}}, पुत्री श्री {{father}}, {{from}} से {{to}} तक इस विद्यालय में कक्षा {{cls}} की छात्रा रही हैं। इस अवधि में उनका आचरण एवं चरित्र {{conduct}} पाया गया।\n\nहम उनके उज्ज्वल भविष्य की कामना करते हैं।' } },
    { id: 'blank', name: 'Blank letter (खाली पत्र)', layout: 'letter', fields: [],
      en: { subject: '', salutation: 'Respected Sir/Madam,', closing: 'Yours respectfully,', body: '' },
      hi: { subject: '', salutation: 'महोदय/महोदया,', closing: 'भवदीय,', body: '' } },
  ];
  const fmtVal = v => /^\d{4}-\d{2}-\d{2}$/.test(v) ? v.split('-').reverse().join('/') : v;
  function render(str, vals, fields, ctx) {
    return (str || '').replace(/\{\{(\w+)(\?([^}]*))?\}\}/g, (m, k, q, opt) => {
      const v = ctx && ctx[k] !== undefined ? ctx[k] : (vals || {})[k];
      if (v !== undefined && String(v).trim() !== '') return q !== undefined ? opt.replace('%', fmtVal(v)) : fmtVal(v);
      if (q !== undefined) return '';
      const f = fields.find(x => x.k === k); return '‹' + (f ? f.l.split(' (')[0] : k) + '›';
    });
  }
  root.Tpl = { list: T, get: id => T.find(t => t.id === id) || T[0], render };
})(typeof self !== 'undefined' ? self : this);

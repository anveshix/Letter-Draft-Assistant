/* Letter Draft Assistant — Official Bilingual Templates & Placeholder Engine
   Shared by Browser and Node.js Server.
   Syntax:
     {{key}}              -> Required placeholder (renders ‹Label› marker when empty)
     {{key?prefix %}}     -> Optional placeholder (% is replaced by value if provided, else omitted)
*/
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.Tpl = api;
  root.TEMPLATES = api.list;
})(typeof self !== 'undefined' ? self : globalThis, function () {
  'use strict';

  const F = (k, l, o) => Object.assign({ k, l, t: 'text' }, o || {});

  const T = [
    // 1. Official Request / Application
    {
      id: 'req',
      majorHead: 'ADM',
      name: 'Official Request / Requisition (अनुरोध / मांग-पत्र)',
      layout: 'letter',
      fields: [
        F('topic', 'Subject / Matter (अनुरोध का विषय)', { ph: 'allotment of funds / sanction of ...' }),
        F('ref_context', 'Reference Letter / Order if any (संदर्भ पत्रांक, यदि हो)', { opt: true, ph: 'Memo No. 412 dated 10/10/2026' }),
        F('details', 'Background & Facts (पृष्ठभूमि एवं विवरण)', { t: 'area', ph: 'State background facts clearly...' }),
        F('ask', 'Specific Request / Action Sought (प्रार्थित कार्रवाई / मांग)', { t: 'area', ph: 'Kindly grant approval / release...' }),
      ],
      en: {
        subject: 'Request regarding {{topic}}',
        salutation: 'Respected Sir/Madam,',
        closing: 'Yours faithfully,',
        body: 'With due respect{{ref_context?, and with reference to %,}} I have the honour to bring to your kind notice that {{details}}\n\n{{ask}}\n\nI shall remain grateful for your kind consideration and early favourable action.',
      },
      hi: {
        subject: '{{topic}} के संबंध में अनुरोध।',
        salutation: 'महोदय/महोदया,',
        closing: 'भवदीय,',
        body: 'सविनय निवेदन है कि{{ref_context? प्रासंगिक पत्र % के आलोक में}} आपके संज्ञान में लाना है कि {{details}}\n\n{{ask}}\n\nअतः आपसे विनम्र अनुरोध है कि उपर्युक्त तथ्यों पर सहानुभूतिपूर्वक विचार करते हुए यथाशीघ्र आवश्यक कार्रवाई करने की कृपा की जाए।',
      },
    },

    // 2. Reminder Letter
    {
      id: 'rem',
      majorHead: 'ADM',
      name: 'Official Reminder (स्मरण-पत्र / अनुस्मारक)',
      layout: 'letter',
      fields: [
        F('rem_no', 'Reminder Stage (स्मरण संख्या)', { t: 'select', opts: ['First Reminder / प्रथम स्मरण-पत्र', 'Second Reminder / द्वितीय स्मरण-पत्र', 'Urgent Reminder / अति आवश्यक अनुस्मारक'], def: 'First Reminder / प्रथम स्मरण-पत्र' }),
        F('refno', 'Earlier Letter Ref. No. & Date (पूर्व पत्रांक एवं दिनांक)', { ph: '210/26 dated 12/08/2026' }),
        F('topic', 'Matter / Subject (विषय)', { ph: 'repair of boundary wall' }),
        F('urgency', 'Additional Urgency Note (अतिरिक्त विवरण)', { t: 'area', opt: true }),
      ],
      en: {
        subject: '{{rem_no}}: Regarding {{topic}}',
        salutation: 'Respected Sir/Madam,',
        closing: 'Yours faithfully,',
        body: 'Kindly refer to this office earlier letter Ref. No. {{refno}} regarding {{topic}}, on which requisite action / response is still awaited.\n\n{{urgency?%\n\n}}You are therefore requested to kindly accord priority to the matter and do the needful at the earliest.',
      },
      hi: {
        subject: '{{topic}} के संबंध में ({{rem_no}})।',
        salutation: 'महोदय/महोदया,',
        closing: 'भवदीय,',
        body: 'उपर्युक्त विषयक इस कार्यालय के पूर्व पत्रांक {{refno}} की ओर आपका ध्यान आकृष्ट कराना है, जो {{topic}} से संबंधित है। उक्त पत्र पर अब तक अपेक्षित कार्रवाई/प्रतिउत्तर अप्राप्त है।\n\n{{urgency?%\n\n}}अतः पुनः अनुरोध है कि मामले की गंभीरता को देखते हुए प्राथमिकता के आधार पर आवश्यक कार्रवाई करने की कृपा करें।',
      },
    },

    // 3. Forwarding / Compliance Submission
    {
      id: 'fwd',
      majorHead: 'ADM',
      name: 'Forwarding / Compliance Report (प्रेषण / अनुपालन प्रतिवेदन)',
      layout: 'letter',
      fields: [
        F('order_ref', 'Dept. Order / Letter Ref. (विभागीय पत्रांक एवं दिनांक)', { opt: true, ph: 'Letter No. 845 dated 05/11/2026' }),
        F('docs', 'Documents / Report Enclosed (संलग्न प्रतिवेदन / दस्तावेज़)', { ph: 'Monthly Attendance Statement & UDISE Report' }),
        F('pages', 'No. of Pages / Enclosures (पृष्ठों की संख्या)', { opt: true, ph: '04 pages' }),
        F('purpose', 'Purpose (प्रयोजन)', { def: 'kind perusal and necessary action' }),
      ],
      en: {
        subject: 'Submission / Forwarding of {{docs}}',
        salutation: 'Respected Sir/Madam,',
        closing: 'Yours faithfully,',
        body: 'In compliance with {{order_ref?your office %}} instructions, please find enclosed herewith {{docs}}{{pages? (total %)}} of {{school_name_en}} (U-DISE: {{udise_code}}) for {{purpose}}.\n\nKindly acknowledge receipt of the same.',
      },
      hi: {
        subject: '{{docs}} के प्रेषण / अनुपालन प्रतिवेदन के संबंध में।',
        salutation: 'महोदय/महोदया,',
        closing: 'भवदीय,',
        body: 'उपर्युक्त विषयक{{order_ref? आपके कार्यालय के प्रसंगिक पत्र % के अनुपालन में}} {{school_name_hi}} (U-DISE: {{udise_code}}) से संबंधित {{docs}}{{pages? (कुल %)}} {{purpose}} हेतु इस पत्र के साथ संलग्न कर सादर समर्पित किया जा रहा है।\n\nकृपया प्राप्ति की पावती प्रदान करने की कृपा करें।',
      },
    },

    // 4. Reply / Clarification
    {
      id: 'reply',
      majorHead: 'LGL',
      name: 'Official Reply / Clarification (प्रतिउत्तर / स्पष्टीकरण)',
      layout: 'letter',
      fields: [
        F('inward_ref', 'Received Letter No. & Date (प्राप्त पत्रांक एवं दिनांक)', { ph: 'Memo No. 512 dated 14/11/2026' }),
        F('topic', 'Subject Matter (विषय)', { ph: 'submission of data' }),
        F('explanation', 'Point-wise Reply / Clarification (बिंदुवार स्पष्टीकरण / उत्तर)', { t: 'area' }),
      ],
      en: {
        subject: 'Reply / Clarification with reference to {{inward_ref}} regarding {{topic}}',
        salutation: 'Respected Sir/Madam,',
        closing: 'Yours faithfully,',
        body: 'With reference to your office letter {{inward_ref}} on the subject cited above, I respectfully submit the point-wise factual position as under:\n\n{{explanation}}\n\nSubmitted for your kind information and perusal.',
      },
      hi: {
        subject: 'प्रासंगिक पत्र {{inward_ref}} के आलोक में {{topic}} विषयक प्रतिउत्तर / स्पष्टीकरण।',
        salutation: 'महोदय/महोदया,',
        closing: 'भवदीय,',
        body: 'उपर्युक्त विषयक आपके कार्यालय के पत्रांक {{inward_ref}} के संदर्भ में सादर तथ्यपरक प्रतिउत्तर / स्पष्टीकरण निम्नांकित है:\n\n{{explanation}}\n\nअतः उक्त प्रतिवेदन आपकी सेवा में सादर सूचनार्थ एवं आवश्यक कार्यार्थ समर्पित है।',
      },
    },

    // 5. Bonafide Certificate
    {
      id: 'bon',
      majorHead: 'STD',
      name: 'Bonafide / Studying Certificate (अध्ययनरत प्रमाण-पत्र)',
      layout: 'cert',
      fields: [
        F('name', 'Student Name (छात्रा/विद्यार्थी का नाम)', { ph: 'Kumari Anita Tudu' }),
        F('father', 'Father Name (पिता का नाम)', { ph: 'Shri Ramesh Tudu' }),
        F('mother', 'Mother Name (माता का नाम)', { opt: true, ph: 'Smt. Soni Tudu' }),
        F('adm', 'Admission No. (प्रवेश संख्या)', { opt: true, ph: 'ADM/2024/108' }),
        F('roll', 'Roll No. (क्रमांक)', { opt: true, ph: '14' }),
        F('dob', 'Date of Birth as per Register (जन्म तिथि)', { t: 'date', opt: true }),
        F('cls', 'Class & Section (कक्षा एवं वर्ग)', { ph: 'XII (Science)' }),
        F('session', 'Academic Session (शैक्षणिक सत्र)', { def: '__session__' }),
        F('purpose', 'Purpose of Certificate (प्रमाण-पत्र का प्रयोजन)', { ph: 'e-Kalyan Scholarship / Bank Account' }),
      ],
      en: {
        heading: 'BONAFIDE CERTIFICATE',
        subject: '',
        body: 'This is to certify that {{name}}, daughter/ward of {{father}}{{mother? and %}}{{adm?, Admission No. %}}{{roll?, Roll No. %}}, is a bonafide regular student of {{school_name_en}} (CBSE Affiliation No. {{cbse_aff_no}}, U-DISE Code: {{udise_code}}), studying in Class {{cls}} during the academic session {{session}}.{{dob? As per school admission register, her Date of Birth is %.}}\n\nThis certificate is issued on her request for the purpose of {{purpose}}.',
      },
      hi: {
        heading: 'अध्ययनरत प्रमाण-पत्र (BONAFIDE CERTIFICATE)',
        subject: '',
        body: 'प्रमाणित किया जाता है कि {{name}}, पुत्री श्री {{father}}{{mother? एवं श्रीमती %}}{{adm?, प्रवेश संख्या %}}{{roll?, क्रमांक %}}, {{school_name_hi}} (CBSE संबद्धता सं. {{cbse_aff_no}}, U-DISE कोड: {{udise_code}}) की कक्षा {{cls}} की नियमित छात्रा हैं तथा शैक्षणिक सत्र {{session}} में अध्ययनरत हैं।{{dob? विद्यालय अभिलेख के अनुसार इनकी जन्म-तिथि % है।}}\n\nयह प्रमाण-पत्र छात्रा के अनुरोध पर {{purpose}} हेतु निर्गत किया जा रहा है।',
      },
    },

    // 6. Character Certificate
    {
      id: 'char',
      majorHead: 'STD',
      name: 'Character & Conduct Certificate (चरित्र प्रमाण-पत्र)',
      layout: 'cert',
      fields: [
        F('name', 'Student Name (छात्रा का नाम)'),
        F('father', 'Father / Guardian Name (पिता का नाम)'),
        F('adm', 'Admission No. (प्रवेश संख्या)', { opt: true }),
        F('cls', 'Last Class Studied (अंतिम कक्षा)', { ph: 'XII (Arts)' }),
        F('from', 'Session / Year From (कब से)', { ph: '2024' }),
        F('to', 'Session / Year Till (कब तक)', { ph: '2026' }),
        F('exam', 'Board Exam Passed, if any (उत्तीर्ण परीक्षा)', { opt: true, ph: 'CBSE Senior School Certificate Examination 2026' }),
        F('conduct', 'Character & Conduct (आचरण एवं चरित्र)', { def: 'Good / उत्तम' }),
      ],
      en: {
        heading: 'CHARACTER CERTIFICATE',
        subject: '',
        body: 'This is to certify that {{name}}, daughter of {{father}}{{adm? (Admission No. %)}}, was a regular student of {{school_name_en}} from {{from}} to {{to}} in Class {{cls}}.{{exam? She appeared in / passed the %.}}\n\nDuring her stay in this institution, her moral character, discipline, and conduct were found to be {{conduct}}. Nothing adverse against her stands in the school records.\n\nWe wish her bright success in all future endeavours.',
      },
      hi: {
        heading: 'चरित्र प्रमाण-पत्र (CHARACTER CERTIFICATE)',
        subject: '',
        body: 'प्रमाणित किया जाता है कि {{name}}, पुत्री श्री {{father}}{{adm? (प्रवेश संख्या %)}}, इस विद्यालय ({{school_name_hi}}) में वर्ष {{from}} से {{to}} तक कक्षा {{cls}} की नियमित छात्रा रही हैं।{{exam? इन्होंने % परीक्षा उत्तीर्ण की है।}}\n\nविद्यालय में अध्ययन के दौरान इनका नैतिक चरित्र, अनुशासन एवं आचरण {{conduct}} पाया गया। विद्यालय अभिलेख में इनके विरुद्ध कोई प्रतिकूल प्रविष्टि अंकित नहीं है।\n\nहम इनके उज्ज्वल भविष्य की कामना करते हैं।',
      },
    },

    // 7. Fee / Expenditure Certificate
    {
      id: 'fee_cert',
      majorHead: 'STD',
      name: 'Fee / Scholarship Verification Certificate (शुल्क / छात्रवृत्ति प्रमाण-पत्र)',
      layout: 'cert',
      fields: [
        F('name', 'Student Name (छात्रा का नाम)'),
        F('father', 'Father Name (पिता का नाम)'),
        F('cls', 'Class (कक्षा)', { ph: 'XI-A' }),
        F('adm', 'Admission No. (प्रवेश संख्या)', { opt: true }),
        F('session', 'Academic Session (सत्र)', { def: '__session__' }),
        F('amount', 'Annual Fee Amount ₹ (वार्षिक शुल्क राशि ₹)', { ph: '0 (Govt. Free Education)' }),
        F('amount_words', 'Amount in Words (राशि शब्दों में)', { ph: 'Zero Rupees Only / निःशुल्क' }),
        F('purpose', 'Purpose (प्रयोजन)', { def: 'Scholarship / Reimbursement' }),
      ],
      en: {
        heading: 'FEE CERTIFICATE',
        subject: '',
        body: 'This is to certify that {{name}}, daughter of {{father}}{{adm?, Admission No. %}}, is studying in Class {{cls}} during academic session {{session}} at {{school_name_en}}.\n\nThe annual school tuition/development fee payable for the said session is ₹ {{amount}} ({{amount_words}}).\n\nIssued on request for {{purpose}}.',
      },
      hi: {
        heading: 'शुल्क प्रमाण-पत्र (FEE CERTIFICATE)',
        subject: '',
        body: 'प्रमाणित किया जाता है कि {{name}}, पुत्री श्री {{father}}{{adm?, प्रवेश संख्या %}}, शैक्षणिक सत्र {{session}} में {{school_name_hi}} की कक्षा {{cls}} में अध्ययनरत हैं।\n\nउक्त शैक्षणिक सत्र हेतु निर्धारित वार्षिक विद्यालय शुल्क ₹ {{amount}} ({{amount_words}}) है।\n\nयह प्रमाण-पत्र {{purpose}} के प्रयोजनार्थ निर्गत किया गया।',
      },
    },

    // 8. Office Order
    {
      id: 'oo',
      majorHead: 'NOT',
      name: 'Office Order / Duty Allotment (कार्यालय आदेश / कार्य आवंटन)',
      layout: 'notice',
      fields: [
        F('title', 'Order Subject (आदेश का विषय)', { ph: 'Constitution of Examination Committee' }),
        F('order_body', 'Order Details & Assigned Staff (आदेश का विवरण एवं नामित कर्मी)', { t: 'area', ph: '1. Smt./Shri ... — In-charge\n2. ...' }),
        F('eff_date', 'Effective Date (प्रभावी तिथि)', { t: 'date' }),
      ],
      en: {
        heading: 'OFFICE ORDER',
        subject: '{{title}}',
        to: 'All Concerned Staff Members',
        body: 'In the interest of smooth academic and administrative functioning of {{school_name_en}}, the following arrangement / duty allotment is hereby ordered with effect from {{eff_date}}:\n\n{{order_body}}\n\nAll concerned are directed to ensure strict compliance.',
      },
      hi: {
        heading: 'कार्यालय आदेश',
        subject: '{{title}}',
        to: 'संबंधित समस्त शिक्षक एवं शिक्षकेतर कर्मी',
        body: '{{school_name_hi}} के शैक्षणिक एवं प्रशासनिक कार्यों के सुचारु संचालन हेतु दिनांक {{eff_date}} से निम्नांकित व्यवस्था / कार्य आवंटन तत्काल प्रभाव से लागू किया जाता है:\n\n{{order_body}}\n\nसंबंधित सभी कर्मियों को निदेश दिया जाता है कि उक्त आदेश का ससमय अनुपालन सुनिश्चित करें।',
      },
    },

    // 9. Notice
    {
      id: 'not',
      majorHead: 'NOT',
      name: 'Notice (सूचना)',
      layout: 'notice',
      fields: [
        F('title', 'Notice Heading / Subject (सूचना का विषय)'),
        F('audience', 'Target Group (लक्षित समूह)', { def: 'All Students, Parents and Staff / समस्त छात्राएँ, अभिभावक एवं शिक्षकवृंद' }),
        F('details', 'Notice Text (सूचना का विवरण)', { t: 'area' }),
      ],
      en: {
        heading: 'NOTICE',
        to: '{{audience}}',
        subject: '{{title}}',
        body: '{{details}}',
      },
      hi: {
        heading: 'आवश्यक सूचना',
        to: '{{audience}}',
        subject: '{{title}}',
        body: '{{details}}',
      },
    },

    // 10. Circular
    {
      id: 'circ',
      majorHead: 'NOT',
      name: 'Circular (परिपत्र)',
      layout: 'notice',
      fields: [
        F('title', 'Circular Subject (परिपत्र का विषय)'),
        F('to_group', 'Addressed To (संबोधित समूह)', { opt: true }),
        F('details', 'Circular Guidelines (परिपत्र का पाठ)', { t: 'area' }),
      ],
      en: {
        heading: 'CIRCULAR',
        to: '{{to_group?%}}',
        subject: '{{title}}',
        body: 'All teaching and non-teaching staff of {{school_name_en}} are hereby informed as follows:\n\n{{details}}\n\nPlease note the above instructions for strict adherence.',
      },
      hi: {
        heading: 'परिपत्र (CIRCULAR)',
        to: '{{to_group?%}}',
        subject: '{{title}}',
        body: '{{school_name_hi}} के समस्त शिक्षक एवं शिक्षकेतर कर्मियों को एतद्द्वारा सूचित किया जाता है कि:\n\n{{details}}\n\nकृपया उपर्युक्त निर्देशों का अक्षरशः अनुपालन सुनिश्चित करें।',
      },
    },

    // 11. Financial Sanction / Bill / UC Submission
    {
      id: 'sanction',
      majorHead: 'FIN',
      name: 'Financial Sanction / Bill / UC Forwarding (वित्तीय स्वीकृति / विपत्र / उपयोगिता प्रेषण)',
      layout: 'letter',
      fields: [
        F('fund_name', 'Fund / Grant / Scheme Head (मद / योजना का नाम)', { ph: 'Samagra Shiksha Composite School Grant 2026-27' }),
        F('bill_no', 'Bill / Voucher / Sanction Ref. (विपत्र / वाउचर संख्या)', { ph: 'BILL/2026/18' }),
        F('bill_date', 'Bill Date (विपत्र तिथि)', { t: 'date' }),
        F('amount', 'Total Amount ₹ (कुल राशि ₹)', { ph: '48,500/-' }),
        F('amount_words', 'Amount in Words (राशि शब्दों में)', { ph: 'Forty-Eight Thousand Five Hundred Only' }),
        F('payee', 'Vendor / Payee Name (भुगतान प्राप्तकर्ता / एजेंसी)', { opt: true }),
        F('purpose', 'Work / Item Description (कार्य / सामग्री का विवरण)', { t: 'area' }),
      ],
      en: {
        subject: 'Financial sanction / forwarding of Bill No. {{bill_no}} for ₹ {{amount}} under {{fund_name}}',
        salutation: 'Respected Sir/Madam,',
        closing: 'Yours faithfully,',
        body: 'With reference to the subject cited above, Bill/Voucher No. {{bill_no}} dated {{bill_date}} amounting to ₹ {{amount}} (Rupees {{amount_words}}){{payee? in favour of %}} under {{fund_name}} is hereby processed / forwarded towards {{purpose}}.\n\nAll relevant stock entries, GST invoices, and verification certificates have been duly recorded as per financial rules.',
      },
      hi: {
        subject: '{{fund_name}} मद के अंतर्गत विपत्र सं. {{bill_no}} (राशि ₹ {{amount}}) की स्वीकृति / प्रेषण के संबंध में।',
        salutation: 'महोदय/महोदया,',
        closing: 'भवदीय,',
        body: 'उपर्युक्त विषयक {{fund_name}} मद के अंतर्गत {{purpose}} हेतु विपत्र/वाउचर संख्या {{bill_no}}, दिनांक {{bill_date}}, कुल राशि ₹ {{amount}} (रुपये {{amount_words}} मात्र){{payee?, भुगतान प्राप्तकर्ता — %,}} एतद्द्वारा स्वीकृत / अग्रेतर कार्रवाई हेतु प्रेषित किया जाता है।\n\nसंबंधित सामग्री की भंडार पंजी (Stock Register) में प्रविष्टि एवं भौतिक सत्यापन नियमानुसार पूर्ण कर लिया गया है।',
      },
    },

    // 12. Quotation / Purchase Order
    {
      id: 'quot',
      majorHead: 'PUR',
      name: 'Quotation Notice / Purchase Order (कोटेशन आमंत्रण / क्रय आदेश)',
      layout: 'letter',
      fields: [
        F('doc_mode', 'Document Type (प्रकार)', { def: 'Quotation Invitation / कोटेशन आमंत्रण सूचना' }),
        F('items', 'Items / Work Specification (सामग्री / कार्य का विवरण)', { t: 'area', ph: '1. Science Lab Chemicals...\n2. Whiteboards...' }),
        F('last_date', 'Last Date of Submission / Delivery (अंतिम तिथि)', { t: 'date' }),
        F('terms', 'Terms & GST Conditions (शर्तें)', { opt: true, def: 'Rates must be inclusive of GST and F.O.R. school premises.' }),
      ],
      en: {
        subject: '{{doc_mode}} for supply/work at {{school_name_en}}',
        salutation: 'Dear Sir/Madam,',
        closing: 'Yours faithfully,',
        body: 'Sealed quotations / supplies are invited by {{school_name_en}}, {{school_address_en}}, for the following items/works on or before {{last_date}}:\n\n{{items}}\n\n{{terms?Terms & Conditions: %}}',
      },
      hi: {
        subject: '{{school_name_hi}} हेतु सामग्री आपूर्ति / कार्य के संबंध में ({{doc_mode}})।',
        salutation: 'महोदय,',
        closing: 'भवदीय,',
        body: '{{school_name_hi}}, {{school_address_hi}} में निम्नांकित सामग्री की आपूर्ति / कार्य संपादन हेतु दिनांक {{last_date}} तक मुहरबंद दर-पत्र (कोटेशन) / आपूर्ति आमंत्रित की जाती है:\n\n{{items}}\n\n{{terms?नियम एवं शर्तें: %}}',
      },
    },

    // 13. Staff Relieving / Joining Report
    {
      id: 'relieve',
      majorHead: 'EST',
      name: 'Staff Relieving / Joining Letter (विरमन / योगदान पत्र)',
      layout: 'letter',
      fields: [
        F('action_type', 'Letter Type (पत्र का प्रकार)', { t: 'select', opts: ['Relieving Order / विरमन आदेश', 'Joining Acceptance / योगदान प्रतिवेदन'], def: 'Relieving Order / विरमन आदेश' }),
        F('staff_name', 'Teacher / Staff Name (शिक्षक / कर्मी का नाम)'),
        F('designation', 'Designation & Subject (पदनाम एवं विषय)', { ph: 'PGT (Mathematics)' }),
        F('emp_id', 'Employee / HRMS ID (कर्मी आईडी)', { opt: true }),
        F('order_ref', 'Transfer / Deputation Order No. & Date (आदेश पत्रांक एवं दिनांक)', { ph: 'Memo No. 1290 dated 15/11/2026' }),
        F('relieve_date', 'Effective Date (प्रभावी तिथि)', { t: 'date' }),
        F('slot', 'Forenoon / Afternoon (पूर्वाह्न / अपराह्न)', { def: 'Afternoon (अपराह्न)' }),
        F('target_office', 'Destination School / Office (नव पदस्थापित विद्यालय / कार्यालय)', { ph: 'DEO Office, Dumka' }),
      ],
      en: {
        subject: '{{action_type}} in respect of {{staff_name}}, {{designation}}',
        salutation: 'Respected Sir/Madam,',
        closing: 'Yours faithfully,',
        body: 'In compliance with Order {{order_ref}}, {{staff_name}}, {{designation}}{{emp_id? (Employee ID: %)}}, is hereby relieved / reported at {{school_name_en}} on {{relieve_date}} ({{slot}}) to join {{target_office}}.\n\nThis is for your kind information and necessary record.',
      },
      hi: {
        subject: '{{staff_name}}, {{designation}} के संबंध में ({{action_type}})।',
        salutation: 'महोदय/महोदया,',
        closing: 'भवदीय,',
        body: 'आदेश पत्रांक {{order_ref}} के अनुपालन में {{staff_name}}, पदनाम — {{designation}}{{emp_id? (कर्मी आईडी: %)}} को दिनांक {{relieve_date}} के {{slot}} से {{target_office}} में योगदान करने हेतु इस विद्यालय ({{school_name_hi}}) से विरमित किया जाता है / योगदान स्वीकृत किया जाता है।\n\nयह आपकी सेवा में सादर सूचनार्थ एवं आवश्यक कार्यार्थ प्रेषित है।',
      },
    },

    // 14. Experience / Service Certificate
    {
      id: 'exp',
      majorHead: 'EST',
      name: 'Staff Experience / Service Certificate (अनुभव / सेवा प्रमाण-पत्र)',
      layout: 'cert',
      fields: [
        F('staff_name', 'Staff Name (शिक्षक / कर्मी का नाम)'),
        F('father_or_spouse', 'Father / Spouse Name (पिता / पति का नाम)', { opt: true }),
        F('designation', 'Designation (पदनाम)', { ph: 'TGT (English)' }),
        F('from_date', 'Worked From (कार्यकाल प्रारंभ तिथि)', { t: 'date' }),
        F('to_date', 'Worked Till (कार्यकाल समाप्ति / वर्तमान)', { ph: 'Till Date / आज तक' }),
        F('remarks_work', 'Performance & Conduct (कार्य एवं आचरण)', { def: 'sincere, dedicated and satisfactory / निष्ठापूर्ण एवं संतोषजनक' }),
      ],
      en: {
        heading: 'EXPERIENCE CERTIFICATE',
        subject: '',
        body: 'This is to certify that {{staff_name}}{{father_or_spouse?, son/daughter/spouse of %,}} has worked / is working at {{school_name_en}} as {{designation}} from {{from_date}} to {{to_date}}.\n\nDuring this tenure, their teaching/administrative work and professional conduct have been {{remarks_work}}.\n\nWe wish them continued success.',
      },
      hi: {
        heading: 'अनुभव प्रमाण-पत्र (EXPERIENCE CERTIFICATE)',
        subject: '',
        body: 'प्रमाणित किया जाता है कि {{staff_name}}{{father_or_spouse?, पिता/पति श्री %,}} ने {{school_name_hi}} में {{designation}} के पद पर दिनांक {{from_date}} से {{to_date}} तक कार्य किया है / कार्यरत हैं।\n\nइस कार्यावधि में इनका शैक्षणिक/कार्यालयी कार्य एवं आचरण {{remarks_work}} रहा है।\n\nहम इनके उज्ज्वल भविष्य की कामना करते हैं।',
      },
    },

    // 15. NOC
    {
      id: 'noc',
      majorHead: 'EST',
      name: 'No Objection Certificate — NOC (अनापत्ति प्रमाण-पत्र)',
      layout: 'cert',
      fields: [
        F('person_name', 'Name of Staff / Student (नाम)'),
        F('designation_cls', 'Designation / Class (पदनाम / कक्षा)'),
        F('id_no', 'ID / Admission No. (पहचान / प्रवेश संख्या)', { opt: true }),
        F('purpose', 'Purpose of NOC (अनापत्ति का प्रयोजन)', { ph: 'appearing in higher competitive examination / passport application' }),
      ],
      en: {
        heading: 'NO OBJECTION CERTIFICATE (NOC)',
        subject: '',
        body: 'This is to certify that {{person_name}}, {{designation_cls}}{{id_no? (ID: %)}}, is presently working / studying at {{school_name_en}}.\n\nThis institution has no objection to {{person_name}} {{purpose}}, subject to the condition that official / academic duties are not adversely affected.',
      },
      hi: {
        heading: 'अनापत्ति प्रमाण-पत्र (NOC)',
        subject: '',
        body: 'प्रमाणित किया जाता है कि {{person_name}}, {{designation_cls}}{{id_no? (पहचान संख्या: %)}}, {{school_name_hi}} में कार्यरत / अध्ययनरत हैं।\n\nइस संस्था को {{person_name}} द्वारा {{purpose}} किए जाने पर कोई आपत्ति नहीं है, बशर्ते कि इससे विद्यालय के नियमित पठन-पाठन एवं शासकीय दायित्वों पर कोई प्रतिकूल प्रभाव न पड़े।',
      },
    },

    // 16. Leave Application / Sanction
    {
      id: 'leave',
      majorHead: 'EST',
      name: 'Leave Application / Forwarding (अवकाश आवेदन / अग्रेषण)',
      layout: 'letter',
      fields: [
        F('type', 'Type of Leave (अवकाश का प्रकार)', { def: 'Casual Leave (आकस्मिक अवकाश)' }),
        F('from', 'From Date (कब से)', { t: 'date' }),
        F('to', 'To Date (कब तक)', { t: 'date' }),
        F('days', 'Total Days (कुल दिन)', { ph: '02' }),
        F('reason', 'Reason for Leave (अवकाश का कारण)', { ph: 'urgent domestic work / medical treatment' }),
      ],
      en: {
        subject: 'Application regarding {{type}} for {{days}} day(s)',
        salutation: 'Respected Sir/Madam,',
        closing: 'Yours obediently,',
        body: 'With due respect, I beg to state that due to {{reason}}, I am unable to attend duty for {{days}} day(s) from {{from}} to {{to}}.\n\nYou are kindly requested to grant me {{type}} for the aforesaid period.',
      },
      hi: {
        subject: '{{days}} दिन के {{type}} की स्वीकृति के संबंध में।',
        salutation: 'महोदय/महोदया,',
        closing: 'भवदीय,',
        body: 'सविनय निवेदन है कि {{reason}} के कारण मैं दिनांक {{from}} से {{to}} तक (कुल {{days}} दिन) विद्यालय में उपस्थित होने में असमर्थ हूँ।\n\nअतः श्रीमान् से विनम्र प्रार्थना है कि उक्त अवधि का {{type}} स्वीकृत करने की कृपा करें।',
      },
    },

    // 17. Parent Call Letter
    {
      id: 'pm',
      majorHead: 'STD',
      name: 'Parent / Guardian Intimation (अभिभावक बुलावा / सूचना पत्र)',
      layout: 'letter',
      fields: [
        F('name', 'Student Name (छात्रा का नाम)'),
        F('father', 'Parent / Guardian Name (अभिभावक का नाम)', { opt: true }),
        F('cls', 'Class & Section (कक्षा एवं वर्ग)', { ph: 'X-A' }),
        F('roll', 'Roll No. (क्रमांक)', { opt: true }),
        F('reason', 'Matter to Discuss (विषय / कारण)', { t: 'area', ph: 'irregular attendance in classes and upcoming CBSE Board Examination preparation' }),
        F('date', 'Meeting Date (बैठक की तिथि)', { t: 'date' }),
        F('time', 'Time (समय)', { def: '10:30 AM' }),
      ],
      en: {
        to: 'To,\n{{father?% (Parent/Guardian),\n}}Parent / Guardian of {{name}},\nClass {{cls}}{{roll?, Roll No. %}}.',
        subject: 'Intimation to meet the Principal regarding {{name}} (Class {{cls}})',
        salutation: 'Dear Parent/Guardian,',
        closing: 'Yours sincerely,',
        body: 'This is to inform you regarding your ward {{name}}, studying in Class {{cls}}{{roll? (Roll No. %)}} of {{school_name_en}}, concerning {{reason}}.\n\nYou are requested to kindly visit the Principal\'s Office on {{date}} at {{time}} positively in the interest of your ward\'s academic progress.',
      },
      hi: {
        to: '{{father?श्री/श्रीमती %,\n}}अभिभावक — {{name}}, कक्षा {{cls}}{{roll?, क्रमांक %}}।',
        subject: 'आपकी पुत्री {{name}} (कक्षा {{cls}}) के संबंध में विद्यालय में संपर्क करने हेतु सूचना।',
        salutation: 'आदरणीय अभिभावक,',
        closing: 'भवदीय,',
        body: 'आपको सूचित किया जाता है कि इस विद्यालय ({{school_name_hi}}) की कक्षा {{cls}}{{roll? (क्रमांक %)}} की छात्रा {{name}} के संबंध में {{reason}} पर आपसे विचार-विमर्श आवश्यक है।\n\nअतः छात्रा के शैक्षणिक हित में आपसे अनुरोध है कि दिनांक {{date}} को प्रातः/अपराह्न {{time}} बजे विद्यालय कार्यालय में प्राचार्य से अवश्य संपर्क करने की कृपा करें।',
      },
    },

    // 18. Official Invitation
    {
      id: 'inv',
      majorHead: 'EVT',
      name: 'Official Invitation Letter (आमंत्रण-पत्र)',
      layout: 'letter',
      fields: [
        F('event', 'Event / Function Name (समारोह / कार्यक्रम का नाम)', { ph: 'Annual Sports Day & Prize Distribution Ceremony' }),
        F('role', 'Invited As (गरिमामयी भूमिका, यदि हो)', { opt: true, ph: 'Chief Guest / मुख्य अतिथि' }),
        F('date', 'Event Date (आयोजन तिथि)', { t: 'date' }),
        F('time', 'Time (समय)', { def: '10:00 AM' }),
        F('venue', 'Venue (आयोजन स्थल)', { def: 'School Auditorium, CM School of Excellence Girls, Dumka' }),
      ],
      en: {
        subject: 'Cordial Invitation for {{event}} on {{date}}',
        salutation: 'Respected Sir/Madam,',
        closing: 'With warm regards,',
        body: 'It gives us immense pleasure to inform you that {{school_name_en}} is organizing {{event}} on {{date}} at {{time}} at {{venue}}.\n\nWe cordially invite your goodself{{role? to grace the occasion as % and}} to bless and encourage our students with your benign presence.',
      },
      hi: {
        subject: 'दिनांक {{date}} को आयोजित {{event}} में सादर आमंत्रण।',
        salutation: 'महोदय/महोदया,',
        closing: 'सादर,',
        body: 'हमें यह सूचित करते हुए अत्यंत हर्ष हो रहा है कि {{school_name_hi}} के तत्वावधान में दिनांक {{date}} को समय {{time}} बजे {{venue}} में "{{event}}" का आयोजन किया जा रहा है।\n\nइस पावन अवसर पर{{role? % के रूप में}} आपकी गरिमामयी उपस्थिति एवं आशीर्वचन हेतु हम आपको सादर आमंत्रित करते हैं। आपकी उपस्थिति से छात्राओं एवं विद्यालय परिवार का उत्साहवर्धन होगा।',
      },
    },

    // 19. Event / Excursion Permission
    {
      id: 'perm',
      majorHead: 'EVT',
      name: 'Permission for Event / Excursion (आयोजन / भ्रमण की अनुमति)',
      layout: 'letter',
      fields: [
        F('event', 'Programme / Excursion (प्रस्तावित कार्यक्रम / भ्रमण)'),
        F('date', 'Proposed Date (प्रस्तावित तिथि)', { t: 'date' }),
        F('participants', 'Participants Count (प्रतिभागी संख्या)', { opt: true, ph: '80 students and 04 escort teachers' }),
        F('details', 'Programme & Safety Details (विवरण एवं व्यवस्था)', { t: 'area' }),
      ],
      en: {
        subject: 'Seeking permission to organize {{event}} on {{date}}',
        salutation: 'Respected Sir/Madam,',
        closing: 'Yours faithfully,',
        body: 'With due respect, I submit that {{school_name_en}} proposes to organize {{event}} on {{date}}{{participants? involving %}}. {{details}}\n\nKindly accord necessary permission for the same.',
      },
      hi: {
        subject: 'दिनांक {{date}} को {{event}} के आयोजन की अनुमति प्रदान करने के संबंध में।',
        salutation: 'महोदय/महोदया,',
        closing: 'भवदीय,',
        body: 'सविनय निवेदन है कि {{school_name_hi}} द्वारा दिनांक {{date}} को {{event}} का आयोजन प्रस्तावित है{{participants?, जिसमें कुल % सम्मिलित होंगे}}। {{details}}\n\nअतः श्रीमान् से अनुरोध है कि उक्त आयोजन हेतु आवश्यक अनुमति प्रदान करने की कृपा करें।',
      },
    },

    // 20. Blank / Custom Official Letter (supports any dynamic {{placeholder}}!)
    {
      id: 'blank',
      majorHead: 'ADM',
      name: 'Custom / Blank Official Letter (कस्टम / खाली कार्यालयी पत्र)',
      layout: 'letter',
      fields: [],
      en: {
        subject: '',
        salutation: 'Respected Sir/Madam,',
        closing: 'Yours faithfully,',
        body: '',
      },
      hi: {
        subject: '',
        salutation: 'महोदय/महोदया,',
        closing: 'भवदीय,',
        body: '',
      },
    },
  ];

  const fmtVal = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v).split('-').reverse().join('/') : String(v));

  function render(str, vals, fields, ctx) {
    return String(str || '').replace(/\{\{([\w\u0900-\u097F]+)(\?([^}]*))?\}\}/g, (m, k, q, opt) => {
      const fromVal = vals && vals[k] !== undefined && String(vals[k]).trim() !== '' ? vals[k] : undefined;
      const fromCtx = ctx && ctx[k] !== undefined && String(ctx[k]).trim() !== '' ? ctx[k] : undefined;
      const v = fromVal !== undefined ? fromVal : fromCtx;
      if (v !== undefined && String(v).trim() !== '') {
        return q !== undefined ? opt.replace(/%/g, fmtVal(v)) : fmtVal(v);
      }
      if (q !== undefined) return '';
      const f = (fields || []).find(x => x.k === k);
      return '‹' + (f ? f.l.split(' (')[0] : k) + '›';
    });
  }

  function extractPlaceholders(strings) {
    const found = new Set();
    const re = /\{\{([\w\u0900-\u097F]+)(?:\?[^}]*)?\}\}/g;
    for (const s of strings || []) {
      let m;
      const text = String(s || '');
      while ((m = re.exec(text))) {
        found.add(m[1]);
      }
    }
    return [...found];
  }

  function allList(customTemplates) {
    return T.concat(Array.isArray(customTemplates) ? customTemplates : []);
  }

  function get(id, customTemplates) {
    const list = allList(customTemplates);
    return list.find(t => t.id === id) || T[0];
  }

  return { list: T, allList, get, render, extractPlaceholders, fmtVal };
});

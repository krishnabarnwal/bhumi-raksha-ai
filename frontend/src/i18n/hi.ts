// Hindi (हिन्दी) dictionary. Typed as `Record<TranslationKey, string>` so the
// build fails if a key is missing or extra — keeping it in lock-step with en.ts.
// Only UI chrome is translated; backend-generated content and technical tokens
// (risk levels, priority tiers, DEMO/SIMULATED, units) are intentionally left as
// the server/system emits them. See en.ts for the honesty-boundary note.

import type { TranslationKey } from "./en";

export const hi: Record<TranslationKey, string> = {
  // --- shell / header ---
  "app.tagline": "पूर्वानुमान · सुरक्षा · रोकथाम",
  "nav.command": "कमांड सेंटर",
  "nav.citizen": "नागरिक ऐप",
  "lang.label": "भाषा",
  "theme.label": "थीम",
  "theme.light": "उजाला",
  "theme.dark": "अँधेरा",

  // --- map overlays ---
  "map.pickLocation": "रिपोर्ट का स्थान तय करने के लिए मानचित्र पर क्लिक करें",
  "map.activeSos": "{count} सक्रिय SOS",

  // --- rainfall scenario names ---
  "scenario.current": "वर्तमान",
  "scenario.normal": "सामान्य",
  "scenario.heavy": "भारी",
  "scenario.extreme": "अत्यधिक",

  // --- responder status labels ---
  "status.pending": "लंबित",
  "status.assigned": "नियुक्त",
  "status.acknowledged": "स्वीकृत",
  "status.en_route": "रास्ते में",
  "status.on_site": "मौके पर",
  "status.resolved": "हल हुआ",

  // --- ScenarioControl ---
  "scn.title": "वर्षा परिदृश्य",
  "scn.hint": "लाइव जोखिम तय करता है",
  "scn.recomputing": "सभी क्षेत्रों का जोखिम पुनर्गणना हो रही है…",
  "scn.switchHint": "जोखिम इंजन दोबारा चलाने के लिए परिदृश्य बदलें।",

  // --- CommandMetrics (Operations) ---
  "ops.title": "संचालन",
  "ops.hint": "लाइव SOS फ़ीड",
  "ops.total": "कुल",
  "ops.critical": "गंभीर",
  "ops.pending": "लंबित",
  "ops.active": "सक्रिय",
  "ops.resolved": "हल हुआ",
  "ops.total.tip": "फ़ीड में सभी SOS घटनाएँ",
  "ops.critical.tip": "P1 — सर्वोच्च AI प्राथमिकता स्तर",
  "ops.pending.tip": "टीम नियुक्ति की प्रतीक्षा",
  "ops.active.tip": "नियुक्त और कार्य जारी (अभी हल नहीं)",
  "ops.resolved.tip": "रिस्पॉन्डर ने घटना को हल चिह्नित किया",
  "ops.responseTimes": "प्रतिक्रिया समय",
  "ops.fromTimestamps": "दर्ज समयछापों से",
  "ops.noResponses": "अभी कोई प्रतिक्रिया दर्ज नहीं",
  "ops.acknowledge": "स्वीकृति",
  "ops.onSite": "मौके पर",
  "ops.resolve": "समाधान",

  // --- IncidentQueue ---
  "queue.title": "घटना सूची",
  "queue.empty": "अभी कोई SOS घटना नहीं। नागरिक का SOS यहाँ लाइव दिखेगा।",
  "queue.escalated": "प्रतिक्रिया नेटवर्क को भेजा गया (सिम्युलेटेड)",
  "queue.trapped": "फँसे",
  "queue.medical": "चिकित्सा",

  // --- AlertsPanel ---
  "alerts.title": "पूर्व चेतावनियाँ",
  "alerts.empty": "इस परिदृश्य में कोई HIGH या CRITICAL क्षेत्र नहीं।",

  // --- PriorityList ---
  "priority.title": "प्रतिक्रिया प्राथमिकता",
  "priority.hint": "जोखिम × संवेदनशीलता",
  "priority.empty": "प्राथमिकता देने के लिए अभी कोई क्षेत्र नहीं।",
  "priority.scoreExposed": "स्कोर {score} · {n} प्रभावित",
  "priority.disclaimer":
    "डेमो / सिम्युलेटेड प्राथमिकता — निर्णय सहायता, कोई गारंटीड पूर्वानुमान नहीं।",

  // --- RiskPanel ---
  "risk.title": "जोखिम आसूचना",
  "risk.computing": "गणना हो रही है…",
  "risk.empty":
    "इसका जोखिम स्कोर, योगदान कारक और अनुशंसित कार्रवाई देखने के लिए मानचित्र पर एक क्षेत्र चुनें।",
  "risk.confidence": "विश्वास",
  "risk.scenarioTag": "परिदृश्य: {scenario}",
  "risk.computed": "गणना {time}",
  "risk.factorsTitle": "योगदान कारक",
  "risk.impact": "{impact} प्रभाव",
  "risk.weight": "भार {weight}",
  "risk.recommendedTitle": "अनुशंसित कार्रवाई",

  // --- ReportForm ---
  "report.title": "फ़ील्ड रिपोर्ट",
  "report.hint": "ज़मीनी सच्चाई",
  "report.location": "स्थान",
  "report.clickMap": "मानचित्र पर क्लिक करें…",
  "report.repick": "मानचित्र पर फिर चुनें",
  "report.pickOnMap": "📍 मानचित्र पर चुनें",
  "report.cancel": "रद्द करें",
  "report.noLocation": "कोई स्थान नहीं चुना",
  "report.type": "प्रकार",
  "report.severity": "गंभीरता",
  "report.description": "विवरण",
  "report.descPlaceholder": "आपने ज़मीन पर क्या देखा?",
  "report.photo": "फ़ोटो (वैकल्पिक)",
  "report.submit": "रिपोर्ट भेजें",
  "report.submitting": "भेजा जा रहा है…",
  "report.submitted": "रिपोर्ट #{id} भेजी गई{photo}।",
  "report.withPhoto": " फ़ोटो सहित",
  "cat.slope_crack": "ढलान दरार",
  "cat.rockfall": "चट्टान गिरना",
  "cat.water_seepage": "पानी का रिसाव",
  "cat.slope_movement": "ढलान खिसकाव",
  "cat.road_blockage": "सड़क अवरोध",
  "cat.landslide": "भूस्खलन",
  "cat.other": "अन्य",
  "sev.low": "कम",
  "sev.medium": "मध्यम",
  "sev.high": "उच्च",

  // --- SosPanel (operator detail) ---
  "sos.title": "SOS घटना",
  "sos.empty":
    "इसकी गंभीरता, AI प्राथमिकता और अनुशंसित प्रतिक्रिया देखने के लिए मानचित्र पर एक SOS मार्कर चुनें।",
  "sos.incident": "घटना #{id}",
  "sos.f.location": "स्थान",
  "sos.f.reported": "सूचित",
  "sos.f.severity": "गंभीरता",
  "sos.f.currentRisk": "वर्तमान जोखिम",
  "sos.f.people": "प्रभावित लोग",
  "sos.f.trapped": "फँसे",
  "sos.f.medical": "चिकित्सा",
  "sos.yes": "हाँ",
  "sos.no": "नहीं",
  "sos.outsideRegion": "निगरानी क्षेत्र के बाहर",
  "sos.aiPriority": "AI प्राथमिकता",
  "sos.priScore": "स्कोर {score}/100",
  "sos.deterministicNote": "निर्धारक, व्याख्येय स्कोर — कोई ML पूर्वानुमान नहीं।",
  "sos.recommendedResponse": "अनुशंसित प्रतिक्रिया",
  "sos.noTeamMatch": "इस घटना से मेल खाती कोई उपलब्ध टीम अभी नहीं।",
  "sos.estDistance": "~{km} किमी (अनुमानित दूरी)",
  "sos.fromBase": "· {base} से",
  "sos.coverage": "· कवरेज {pct}%",
  "sos.responseNetwork": "प्रतिक्रिया नेटवर्क",
  "sos.routeRecommended": "अनुशंसित",
  "sos.escalateToLabel": "आगे भेजें",
  "sos.supporting": "सहायक",
  "sos.escalated": "✓ आगे भेजा गया",
  "sos.ref": "संदर्भ {ref}",
  "sos.escalateBtn": "प्रतिक्रिया नेटवर्क को भेजें",
  "sos.escalating": "भेजा जा रहा है…",
  "sos.responseTeam": "प्रतिक्रिया",
  "sos.updating": "अपडेट हो रहा है…",
  "sos.incidentResolved": "✓ घटना हल हुई",
  "sos.timeline": "समयरेखा",
  "sos.assignTeam": "{team} नियुक्त करें",
  "sos.assigning": "नियुक्त किया जा रहा है…",
  "sos.noTeamToAssign": "नियुक्त करने के लिए कोई टीम नहीं",
  "sos.overridePick": "ओवरराइड — टीम चुनें…",
  "sos.assign": "नियुक्त करें",
  "sos.unavailable": " (अनुपलब्ध)",
  "cap.search_rescue": "खोज और बचाव",
  "cap.medical": "चिकित्सा",
  "cap.field_verification": "फ़ील्ड सत्यापन",
  "cap.relief": "राहत",
  "cap.engineering": "इंजीनियरिंग",
  "sos.action.acknowledged": "स्वीकार करें",
  "sos.action.en_route": "रास्ते में चिह्नित करें",
  "sos.action.on_site": "मौके पर चिह्नित करें",
  "sos.action.resolved": "घटना हल करें",

  // --- CitizenApp ---
  "citizen.conn.syncing": "ऑनलाइन — {count} सहेजे गए SOS सिंक हो रहे हैं…",
  "citizen.conn.online": "ऑनलाइन — कमांड सेंटर से जुड़ा",
  "citizen.conn.offline": "ऑफ़लाइन — आप फिर भी SOS भेज सकते हैं",
  "citizen.conn.offlineQueued": "ऑफ़लाइन — आप फिर भी SOS भेज सकते हैं · {count} कतार में",
  "citizen.loc.title": "डेमो स्थान सिम्युलेटर",
  "citizen.loc.gps": "GPS लॉक (सिम्युलेटेड)",
  "citizen.loc.conditions": "स्थितियाँ: {scenario}",
  "citizen.loc.sub.north": "उत्तर सिक्किम",
  "citizen.loc.sub.capital": "राजधानी",
  "citizen.loc.sub.outside": "क्षेत्र के बाहर",
  "citizen.safety.checking": "आपके क्षेत्र की जाँच हो रही है…",
  "citizen.safety.unavailable": "जोखिम स्थिति उपलब्ध नहीं।",
  "citizen.safety.risk": "जोखिम {score}/100",
  "citizen.safety.note":
    "यह एक बदलता जोखिम अनुमान है, किसी सटीक भूस्खलन का पूर्वानुमान नहीं। स्थानीय प्रशासन के निर्देशों का पालन करें।",
  "citizen.sos.sentBadge": "SOS भेजा गया",
  "citizen.sos.sentBody":
    "आपका आपातकालीन संकेत कमांड सेंटर तक पहुँच गया है और उस पर कार्रवाई हो रही है। यदि सुरक्षित हो तो वहीं रुकें।",
  "citizen.sos.sendAnother": "एक और अपडेट भेजें",
  "citizen.sos.deliveredBadge": "SOS पहुँचाया गया",
  "citizen.sos.savedBadge": "SOS सहेजा गया — कतार में",
  "citizen.sos.deliveredBody":
    "कनेक्शन वापस आने पर आपका कतारबद्ध SOS अब कमांड सेंटर तक पहुँच गया है। रिस्पॉन्डर समन्वयित किए जा रहे हैं।",
  "citizen.sos.savedBody": "SOS सहेजा गया। कनेक्शन लौटने पर यह स्वतः भेज दिया जाएगा।",
  "citizen.sos.waitingSync": "{count} SOS सिंक के लिए प्रतीक्षारत",
  "citizen.sos.addAnother": "एक और SOS जोड़ें",
  "citizen.sos.sending": "भेजा जा रहा है…",
  "citizen.sos.pressHelp": "आपातकालीन सहायता के लिए दबाएँ",
  "citizen.sos.addDetails": "+ विवरण जोड़ें (वैकल्पिक)",
  "citizen.sos.hideDetails": "− विवरण छिपाएँ",
  "citizen.sos.people": "प्रभावित लोग",
  "citizen.sos.peoplePlaceholder": "जैसे 3",
  "citizen.sos.trapped": "लोग फँसे हैं",
  "citizen.sos.medical": "चिकित्सा आपातकाल",
  "citizen.sos.description": "विवरण",
  "citizen.sos.descPlaceholder": "जो भी रिस्पॉन्डर की मदद करे…",
  "citizen.hazard.title": "ख़तरे की सूचना दें",
  "citizen.hazard.landslide": "भूस्खलन",
  "citizen.hazard.flood": "बाढ़",
  "citizen.hazard.road": "सड़क अवरुद्ध",
  "citizen.hazard.other": "अन्य",
  "citizen.hazard.offlineNote":
    "ख़तरे की सूचना के लिए कनेक्शन ज़रूरी है। आपका SOS ऑफ़लाइन भी काम करता है।",
  "citizen.hazard.reported": "{label} की सूचना दी गई (#{id})। धन्यवाद — अधिकारियों को सूचित किया गया।",

  // --- CitizenApp: bottom navigation ---
  "citizen.nav.home": "होम",
  "citizen.nav.report": "रिपोर्ट",
  "citizen.nav.reports": "मेरी रिपोर्ट",
  "citizen.nav.info": "सुरक्षा",

  // --- CitizenApp: Report page ---
  "citizen.report.from": "{location} से रिपोर्ट कर रहे हैं",

  // --- CitizenApp: My Reports page ---
  "citizen.myReports.title": "मेरी रिपोर्ट",
  "citizen.myReports.note": "इस डिवाइस पर सहेजा गया",
  "citizen.myReports.empty":
    "आपने इस डिवाइस से अभी तक कोई रिपोर्ट नहीं भेजी है।",
  "citizen.myReports.sos": "SOS संकेत",
  "citizen.myReports.offline": "ऑफ़लाइन कतार में",

  // --- CitizenApp: Emergency Info page ---
  "citizen.info.title": "आपातकालीन जानकारी",
  "citizen.info.intro":
    "आपके क्षेत्र में भूस्खलन और बाढ़ के लिए त्वरित तैयारी मार्गदर्शन।",
  "citizen.info.emergencyNumber": "राष्ट्रीय आपातकालीन नंबर (भारत)",
  "citizen.info.call": "112 पर कॉल करें",
  "citizen.info.landslide.title": "यदि भूस्खलन की आशंका हो",
  "citizen.info.landslide.1":
    "खड़ी ढलानों, नालों और ढीली या जलभराव वाली मिट्टी से दूर हटें।",
  "citizen.info.landslide.2":
    "नई दरारों, झुकते पेड़ों या धारा के बहाव में अचानक बदलाव पर ध्यान दें।",
  "citizen.info.landslide.3":
    "यदि निकासी की सलाह दी जाए, तो जल्दी निकलें और सुझाए गए मार्ग का उपयोग करें।",
  "citizen.info.flood.title": "बाढ़ की स्थिति में",
  "citizen.info.flood.1":
    "ऊँची जगह पर जाएँ; बहते पानी में कभी न चलें और न वाहन चलाएँ।",
  "citizen.info.flood.2":
    "पीने का पानी, टॉर्च और चार्ज किया हुआ फ़ोन पास रखें।",
  "citizen.info.flood.3":
    "तेज़ बहते पानी के पास के पुलों और सड़कों से दूर रहें।",
  "citizen.info.disclaimer":
    "सामान्य तैयारी मार्गदर्शन — आधिकारिक चेतावनियों का विकल्प नहीं। हमेशा स्थानीय प्रशासन के निर्देशों का पालन करें।",
};

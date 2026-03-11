/* =======================================================
   MISSION: CONNECTED v6 — DATA.JS
   MOS Database · Symptoms · Diagnoses
======================================================= */

const MOS_BY_BRANCH = {
  'Army': [
    {code:'09L',label:'Interpreter/Translator',noise:'Low',tera:false,notes:'Often embedded with combat units. PTSD risk is high despite a non-combat role. Deployment to hostile fire zones is common.'},
    {code:'11B',label:'Infantryman',noise:'High',tera:false,notes:'Among the highest rates of tinnitus, hearing loss, musculoskeletal injury, PTSD, and TBI of any MOS. Combat deployments add significant claim opportunities.'},
    {code:'11C',label:'Indirect Fire Infantryman',noise:'High',tera:false,notes:'Mortar crews face extreme noise exposure. High rates of tinnitus, hearing loss, and shoulder/back injuries from heavy equipment carry.'},
    {code:'12B',label:'Combat Engineer',noise:'High',tera:false,notes:'Frequent demolitions and blast exposure. Elevated TBI and PTSD risk. Physical demands produce significant musculoskeletal injury.'},
    {code:'13B',label:'Cannon Crewmember',noise:'Very High',tera:false,notes:'Artillery produces some of the highest noise levels in the military. Tinnitus and hearing loss are near-universal. Concussive blast overpressure is a significant TBI risk.'},
    {code:'13F',label:'Fire Support Specialist',noise:'High',tera:false,notes:'Forward observer role combines extreme artillery noise with direct combat exposure. Tinnitus, hearing loss, and PTSD are extremely common.'},
    {code:'19D',label:'Cavalry Scout',noise:'High',tera:false,notes:'Long vehicle operations cause spinal and joint stress. Forward combat role adds PTSD/TBI risk. High noise from vehicle engines and weapons.'},
    {code:'25B',label:'IT Specialist',noise:'Low',tera:false,notes:'If deployed, all burn pit exposure applies. Screen-intensive work causes headaches and eye strain. Ergonomic musculoskeletal risk.'},
    {code:'25U',label:'Signal Support Specialist',noise:'Moderate',tera:false,notes:'RF/EMF exposure from communications equipment is documented. Tinnitus common from headset use. If deployed, burn pit exposure applies.'},
    {code:'31B',label:'Military Police',noise:'Moderate',tera:false,notes:'Law enforcement duties with potential combat exposure. Significant PTSD risk from handling casualties and high-stress incidents.'},
    {code:'35F',label:'Intelligence Analyst',noise:'Low',tera:false,notes:'High psychological stress from classified operational work. Sleep disruption is well-documented. If deployed, burn pit exposure applies.'},
    {code:'42A',label:'Human Resources Specialist',noise:'Low',tera:false,notes:'Administrative MOS. PTSD from witnessing casualties is documented for deployed HR specialists. Burn pit exposure if deployed.'},
    {code:'68W',label:'Combat Medic',noise:'Moderate',tera:false,notes:'High PTSD rates from traumatic patient care in combat. Physical demands of carrying patients cause significant musculoskeletal injury.'},
    {code:'74D',label:'CBRN Specialist',noise:'Moderate',tera:true,notes:'FORMALLY RECOGNIZED under TERA. Documented exposure to chemical, biological, radiological, and nuclear agents during training and operations.'},
    {code:'88M',label:'Motor Transport Operator',noise:'Moderate-High',tera:false,notes:'Significant spinal injury from heavy vehicle operations on rough terrain. IED exposure on supply routes creates major PTSD and TBI risk.'},
    {code:'89D',label:'EOD Specialist',noise:'High',tera:false,notes:'Extreme blast exposure from EOD operations. Very high TBI rates. Among the highest-risk MOSs for blast injury and PTSD.'},
    {code:'91B',label:'Wheeled Vehicle Mechanic',noise:'Moderate-High',tera:false,notes:'Diesel exhaust and hydraulic fluid exposure. Significant musculoskeletal stress from mechanical work. Hearing loss from engine noise.'},
    {code:'92A',label:'Automated Logistical Specialist',noise:'Moderate',tera:false,notes:'Deployed supply specialists often work in areas with significant burn pit exposure from logistics hubs in Iraq and Afghanistan.'},
    {code:'92Y',label:'Unit Supply Specialist',noise:'Moderate',tera:false,notes:'Physical demands of supply operations. If deployed, burn pit exposure at FOBs is significant.'},
    {code:'Other-Army',label:'Other Army MOS',noise:'Varies',tera:false,notes:'Even without specific MOS data, noise exposure (tinnitus) and deployment-related conditions are widely recognized across all Army MOSs.'},
  ],
  'Navy': [
    {code:'ABE',label:"Aviation Boatswain's Mate",noise:'Very High',tera:false,notes:'Flight deck is one of the most hazardous environments in the military. Extreme noise, jet blast, and chemical exposure. Tinnitus and hearing loss near-universal.'},
    {code:'BM',label:"Boatswain's Mate",noise:'High',tera:false,notes:'Deck operations with significant noise exposure. Physical demands of maritime operations. Older vessels carry asbestos exposure risk.'},
    {code:'EN',label:'Engineman',noise:'Very High',tera:false,notes:'Engine room exposure to extreme noise, diesel exhaust, and heat. Tinnitus and hearing loss near-universal. Asbestos exposure on older vessels is significant.'},
    {code:'EOD',label:'Explosive Ordnance Disposal',noise:'High',tera:false,notes:'Extreme blast exposure. Very high TBI and PTSD rates. Among the highest-risk rates for blast injury.'},
    {code:'GM',label:"Gunner's Mate",noise:'Very High',tera:false,notes:'Weapons testing and maintenance produces extreme noise. Hearing loss and tinnitus very common. Blast exposure from ordnance handling.'},
    {code:'HM',label:'Hospital Corpsman',noise:'Low-Moderate',tera:false,notes:'When deployed with Marine units, faces full combat PTSD exposure. Bloodborne pathogen exposure. Radiation exposure if assigned to radiology.'},
    {code:'MM',label:"Machinist's Mate",noise:'High',tera:false,notes:'Engine room and machinery with extreme noise, heat, and chemical agents. Asbestos exposure on older vessels very significant. Hearing loss common.'},
    {code:'SO',label:'Special Warfare Operator (SEAL)',noise:'High',tera:false,notes:'Extremely high rates of musculoskeletal injury, TBI, and PTSD. Multiple combat deployments are common.'},
    {code:'Other-Navy',label:'Other Navy Rate',noise:'Varies',tera:false,notes:'Shipboard service often includes noise, chemical, and asbestos exposure depending on vessel age and rate. Deployment history drives most claims.'},
  ],
  'Marine Corps': [
    {code:'0311',label:'Rifleman',noise:'High',tera:false,notes:'Among highest combat exposure rates of any military occupation. PTSD, hearing loss, TBI, and musculoskeletal injury rates are very high.'},
    {code:'0321',label:'Reconnaissance Marine',noise:'High',tera:false,notes:'Extreme physical demands causing significant musculoskeletal injury. High combat exposure and PTSD rates.'},
    {code:'0331',label:'Machine Gunner',noise:'Very High',tera:false,notes:'Extreme noise from machine gun fire. Tinnitus and hearing loss near-universal. Physical demands from heavy weapon carry.'},
    {code:'0341',label:'Mortarman',noise:'High',tera:false,notes:'Mortar blast noise and overpressure causes hearing loss and TBI risk. Heavy equipment carry causes musculoskeletal injury.'},
    {code:'0811',label:'Field Artillery Cannoneer',noise:'Very High',tera:false,notes:'Among highest noise exposure of any military occupation. Tinnitus and hearing loss extremely common.'},
    {code:'1371',label:'Combat Engineer',noise:'High',tera:false,notes:'Demolitions and blast exposure create TBI risk. Physically demanding work causing musculoskeletal injury.'},
    {code:'3531',label:'Motor Vehicle Operator',noise:'Moderate-High',tera:false,notes:'Spinal stress from heavy vehicle operations. IED exposure if deployed on convoy routes. Diesel exhaust exposure documented.'},
    {code:'Other-USMC',label:'Other Marine Corps MOS',noise:'Varies',tera:false,notes:'Combat-centric service means most Marine MOSs carry noise, blast, and deployment-related exposures relevant to VA claims.'},
  ],
  'Air Force': [
    {code:'1A2X1',label:'Aircraft Loadmaster',noise:'Very High',tera:false,notes:'Extreme aircraft cargo hold noise. Physical demands of loading operations cause significant musculoskeletal injury. Hearing loss common.'},
    {code:'1C2X1',label:'Combat Control (CCT)',noise:'High',tera:false,notes:'Special operations role with extreme physical demands. High combat exposure and PTSD rates. Multiple deployments to hostile areas.'},
    {code:'1C4X1',label:'TACP',noise:'Very High',tera:false,notes:'Embedded with Army/Marine ground units. Full combat exposure. Extreme noise from directing airstrikes. High PTSD, TBI, and musculoskeletal injury rates.'},
    {code:'2A3X3',label:'Tactical Aircraft Maintenance',noise:'Very High',tera:false,notes:'Fighter aircraft engine maintenance creates extreme noise. Tinnitus and hearing loss very common. Chemical exposure from fuels, hydraulic fluids, and solvents.'},
    {code:'3P0X1',label:'Security Forces',noise:'Moderate',tera:false,notes:'Law enforcement with weapons noise exposure. Combat exposure if deployed. PTSD rates elevated.'},
    {code:'4N0X1',label:'Aerospace Medical Technician',noise:'Low-Moderate',tera:false,notes:'Patient care stress causing secondary traumatic stress/PTSD. Bloodborne pathogen exposure.'},
    {code:'Other-USAF',label:'Other Air Force AFSC',noise:'Varies',tera:false,notes:'Air Force service history and specific assignment determine applicable exposures. Deployment conditions drive most claims.'},
  ],
  'Coast Guard': [
    {code:'AST',label:'Aviation Survival Technician (Rescue Swimmer)',noise:'High',tera:false,notes:'Extreme physical demands causing significant musculoskeletal injury. PTSD from rescue operations and witnessing maritime casualties.'},
    {code:'BM',label:"Boatswain's Mate",noise:'High',tera:false,notes:'Small boat operations with significant noise. Physical demands of maritime law enforcement. Cold water exposure causing musculoskeletal conditions.'},
    {code:'MK',label:'Machinery Technician',noise:'Very High',tera:false,notes:'Engine room work with extreme noise, heat, and chemical exposure. Asbestos exposure on older vessels. Tinnitus and hearing loss very common.'},
    {code:'Other-CG',label:'Other Coast Guard Rate',noise:'Varies',tera:false,notes:'Shipboard and maritime service typically involves noise, chemical, and possible asbestos exposure depending on vessel and assignment.'},
  ],
  'Space Force': [
    {code:'1C6X1',label:'Space Systems Operations',noise:'Low',tera:false,notes:'Significant psychological stress from space operations responsibility. Sleep disruption from 24/7 operational schedules.'},
    {code:'Other-SF',label:'Other Space Force AFSC',noise:'Varies',tera:false,notes:'Space Force is newly established. Many Guardians transferred from Air Force with prior service exposure history.'},
  ]
};

const SYMPTOMS = [
  {icon:'🔔',label:'Ringing in ears (Tinnitus)',note:'Lay testimony ok'},
  {icon:'🤕',label:'Headaches / Migraines',note:'Lay testimony ok'},
  {icon:'😰',label:'Anxiety / Panic attacks',note:'Lay testimony ok'},
  {icon:'😔',label:'Depression',note:null},
  {icon:'😱',label:'PTSD / Nightmares / Flashbacks',note:null},
  {icon:'🧠',label:'TBI symptoms / Memory issues',note:null},
  {icon:'👂',label:'Hearing loss',note:'Very common claim'},
  {icon:'🦴',label:'Lower back pain',note:null},
  {icon:'🦴',label:'Neck / Upper back pain',note:null},
  {icon:'🦵',label:'Knee pain / instability',note:null},
  {icon:'🦴',label:'Hip pain',note:null},
  {icon:'🦶',label:'Foot / Ankle pain',note:null},
  {icon:'💪',label:'Shoulder pain / injury',note:null},
  {icon:'👋',label:'Wrist / Elbow pain',note:null},
  {icon:'😴',label:'Sleep apnea',note:'Secondary to PTSD'},
  {icon:'😩',label:'Chronic insomnia',note:null},
  {icon:'😤',label:'Breathing difficulty / Asthma',note:'PACT Act eligible'},
  {icon:'🫁',label:'COPD / Chronic bronchitis',note:'PACT Act eligible'},
  {icon:'🫀',label:'Heart condition / Chest pain',note:null},
  {icon:'🩺',label:'High blood pressure',note:'AO / sleep apnea sec.'},
  {icon:'🩸',label:'Diabetes (Type 2)',note:'Agent Orange presumptive'},
  {icon:'⚡',label:'Nerve pain / Numbness / Tingling',note:null},
  {icon:'🧬',label:'Cancer (any type)',note:'Check PACT Act'},
  {icon:'🔥',label:'Skin condition / Rash',note:null},
  {icon:'🤢',label:'Digestive / GI problems',note:'PTSD secondary'},
  {icon:'🧪',label:'Kidney / Urinary issues',note:null},
  {icon:'👁️',label:'Vision problems',note:null},
  {icon:'💥',label:'Dizziness / Balance issues',note:'TBI related'},
  {icon:'🌡️',label:'Chronic fatigue',note:'Gulf War presumptive'},
  {icon:'😤',label:'Erectile dysfunction',note:'SMC-K eligible'},
  {icon:'🦴',label:'Arthritis / Joint pain',note:null},
  {icon:'😬',label:'TMJ / Jaw pain',note:null},
  {icon:'🩹',label:'Scar / Keloid',note:null},
  {icon:'🤧',label:'Chronic sinusitis / Allergies',note:null},
  {icon:'🧠',label:'Cognitive difficulties / Brain fog',note:null},
  {icon:'😡',label:'Anger / Irritability',note:'PTSD related'},
  {icon:'👫',label:'Social withdrawal / Isolation',note:null},
  {icon:'💊',label:'Chronic pain (general)',note:null},
  {icon:'🦠',label:'Fibromyalgia',note:'Gulf War presumptive'},
  {icon:'😶',label:'Numbness in hands/feet',note:null},
  {icon:'🩺',label:'Thyroid condition',note:null},
  {icon:'🏃',label:'Flat feet / Plantar fasciitis',note:null},
  {icon:'🔄',label:'Constrictive bronchiolitis',note:'PACT Act covered'},
  {icon:'😮‍💨',label:'Shortness of breath on exertion',note:'PACT Act eligible'},
];

const DIAGNOSES = [
  {icon:'📋',label:'PTSD'},{icon:'📋',label:'Major Depression'},{icon:'📋',label:'Generalized Anxiety Disorder'},
  {icon:'📋',label:'TBI (Traumatic Brain Injury)'},{icon:'📋',label:'Lumbar Disc Herniation'},
  {icon:'📋',label:'Degenerative Disc Disease'},{icon:'📋',label:'Obstructive Sleep Apnea'},
  {icon:'📋',label:'Tinnitus'},{icon:'📋',label:'Sensorineural Hearing Loss'},
  {icon:'📋',label:'Hypertension'},{icon:'📋',label:'Type 2 Diabetes'},
  {icon:'📋',label:'Asthma'},{icon:'📋',label:'COPD'},
  {icon:'📋',label:'Peripheral Neuropathy'},{icon:'📋',label:'Plantar Fasciitis'},
  {icon:'📋',label:'Migraines'},{icon:'📋',label:'Rotator Cuff Tear'},
  {icon:'📋',label:'Knee Meniscus Injury'},{icon:'📋',label:'Hip Labral Tear'},
  {icon:'📋',label:'Fibromyalgia'},{icon:'📋',label:'Chronic Fatigue Syndrome'},
  {icon:'📋',label:'IBS / Functional GI disorder'},{icon:'📋',label:'Ischemic Heart Disease'},
  {icon:'📋',label:'Cancer (any)'},{icon:'📋',label:'Cervical Disc Disease'},
  {icon:'📋',label:'Constrictive Bronchiolitis'},{icon:'📋',label:'Anxiety Disorder'},
];

const RATED_CONDS = [
  {icon:'🧠',label:'PTSD'},{icon:'😔',label:'Depression / Anxiety'},{icon:'🦴',label:'Lower Back Condition'},
  {icon:'🦵',label:'Knee Condition'},{icon:'👂',label:'Tinnitus'},{icon:'👂',label:'Hearing Loss'},
  {icon:'😴',label:'Sleep Apnea'},{icon:'🧠',label:'TBI'},{icon:'💔',label:'Heart Condition'},
  {icon:'🩸',label:'Diabetes'},{icon:'😤',label:'Respiratory Condition'},{icon:'💪',label:'Shoulder Condition'},
  {icon:'🦶',label:'Foot / Ankle Condition'},{icon:'🩺',label:'Hypertension'},
  {icon:'⚡',label:'Peripheral Neuropathy'},{icon:'🔥',label:'Skin Condition'},
  {icon:'🦴',label:'Hip Condition'},{icon:'🧪',label:'Kidney Condition'},
];

// Alias for app.js compatibility
window.MOS_DATA = MOS_BY_BRANCH;
window.APP_SYMPTOMS = SYMPTOMS;
window.APP_DIAGNOSES = DIAGNOSES;
window.APP_RATED_CONDS = RATED_CONDS;

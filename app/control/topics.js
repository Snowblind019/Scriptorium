// Small topical concordance for the Bible "smart" search: typing a topic (e.g. "Duhul Sfint",
// "mintuire", "holy spirit") also finds verses that use related words or names for it.
// Every phrase is matched after folding (no diacritics, â/î → i), as a word-prefix phrase.
// Extend freely: [English name, Romanian name, ...related phrases (RO and EN)]
const TOPICS = [
  ['Holy Spirit', 'Duhul Sfînt', 'duhul sfint', 'duh sfint', 'duhul lui dumnezeu', 'duhul domnului', 'duhul adevarului', 'mingiietorul', 'duhul tatalui', 'duhul lui hristos', 'duhul meu', 'botezul cu duhul', 'holy spirit', 'spirit of god', 'spirit of the lord', 'spirit of truth', 'advocate', 'comforter'],
  ['Jesus Christ', 'Isus Hristos', 'isus', 'hristos', 'mintuitorul', 'fiul omului', 'fiul lui dumnezeu', 'mielul lui dumnezeu', 'mesia', 'domnul isus', 'jesus', 'christ', 'son of man', 'son of god', 'lamb of god', 'messiah'],
  ['God the Father', 'Dumnezeu Tatăl', 'tatal nostru', 'tatal ceresc', 'dumnezeu tatal', 'tatal meu', 'father in heaven', 'heavenly father', 'our father'],
  ['Salvation', 'Mîntuire', 'mintuire', 'mintui', 'mintuit', 'rascump', 'izbavi', 'salvation', 'saved', 'save', 'redeem', 'redemption', 'deliver'],
  ['Grace', 'Har', 'harul', 'har ', 'indurare', 'bunatate', 'grace', 'favor', 'mercy'],
  ['Mercy', 'Milă', 'mila', 'milostiv', 'indurare', 'indurator', 'mercy', 'merciful', 'compassion'],
  ['Forgiveness', 'Iertare', 'iert', 'iertare', 'iertarea pacatelor', 'forgive', 'forgiven', 'forgiveness', 'pardon'],
  ['Sin', 'Păcat', 'pacat', 'nelegiuire', 'faradelege', 'vina', 'sin', 'sins', 'iniquity', 'transgression', 'wickedness'],
  ['Repentance', 'Pocăință', 'pocait', 'pocaint', 'intoarce', 'repent', 'repentance', 'turn back'],
  ['Faith', 'Credință', 'credint', 'crede', 'increde', 'faith', 'believe', 'trust'],
  ['Hope', 'Nădejde', 'nadejde', 'speranta', 'astepta', 'hope', 'wait for the lord'],
  ['Love', 'Dragoste', 'dragoste', 'iubire', 'iubi', 'dragostea lui dumnezeu', 'love', 'beloved', 'loved'],
  ['Peace', 'Pace', 'pace', 'liniste', 'odihna', 'peace', 'rest', 'quiet'],
  ['Joy', 'Bucurie', 'bucur', 'veselie', 'joy', 'rejoice', 'glad'],
  ['Prayer', 'Rugăciune', 'rugaciun', 'roaga', 'rugati', 'cerere', 'mijlocire', 'pray', 'prayer', 'supplication', 'intercession'],
  ['Praise', 'Laudă', 'lauda', 'laudati', 'slavi', 'mari pe domnul', 'cintati', 'aleluia', 'osana', 'praise', 'glorify', 'sing to the lord', 'hallelujah'],
  ['Thanksgiving', 'Mulțumire', 'multum', 'recunostint', 'thank', 'thanksgiving', 'gratitude'],
  ['Cross', 'Cruce', 'cruce', 'rastign', 'golgota', 'calvar', 'cross', 'crucified', 'golgotha'],
  ['Resurrection', 'Înviere', 'invie', 'inviere', 'a inviat', 'mormintul gol', 'resurrection', 'risen', 'raised from the dead'],
  ['Second coming', 'A doua venire', 'venirea domnului', 'vine curind', 'ziua domnului', 'venirea fiului omului', 'coming of the lord', 'day of the lord', 'son of man coming'],
  ['Heaven', 'Cer', 'ceruri', 'imparatia cerurilor', 'raiul', 'noul ierusalim', 'heaven', 'kingdom of heaven', 'paradise', 'new jerusalem'],
  ['Hell / judgement', 'Iad / judecată', 'iad', 'gheena', 'iazul de foc', 'judecat', 'osinda', 'hell', 'judgment', 'condemn', 'lake of fire'],
  ['Kingdom of God', 'Împărăția lui Dumnezeu', 'imparatia lui dumnezeu', 'imparatia cerurilor', 'kingdom of god', 'kingdom of heaven'],
  ['Church', 'Biserica', 'biserica', 'adunare', 'trupul lui hristos', 'frati', 'church', 'assembly', 'body of christ', 'brothers'],
  ['Baptism', 'Botez', 'boteza', 'botez', 'baptize', 'baptism'],
  ['Lord\'s Supper', 'Cina Domnului', 'cina', 'fringe piinea', 'paharul', 'trupul meu', 'singele meu', 'supper', 'bread', 'cup', 'my body', 'my blood'],
  ['Blood of Christ', 'Sîngele lui Hristos', 'singele', 'singe', 'blood'],
  ['Holiness', 'Sfințenie', 'sfint', 'sfinti', 'sfintenie', 'curat', 'holy', 'holiness', 'sanctify', 'pure'],
  ['Righteousness', 'Neprihănire', 'neprihan', 'dreptate', 'drept', 'righteous', 'righteousness', 'justice'],
  ['Obedience', 'Ascultare', 'asculta', 'pazi poruncile', 'implini', 'obey', 'obedience', 'keep my commandments'],
  ['Commandments / Law', 'Poruncile / Legea', 'porunc', 'legea', 'lege', 'commandment', 'law', 'statutes'],
  ['Word of God', 'Cuvîntul lui Dumnezeu', 'cuvintul', 'scriptur', 'word of god', 'scripture', 'your word'],
  ['Shepherd', 'Păstor', 'pastor', 'oi', 'turma', 'shepherd', 'sheep', 'flock'],
  ['Light', 'Lumină', 'lumina', 'lumineaza', 'light', 'lamp'],
  ['Living water', 'Apa vieții', 'apa vie', 'apa vietii', 'izvor', 'living water', 'water of life', 'spring', 'fountain'],
  ['Bread of life', 'Pîinea vieții', 'piinea vietii', 'piine', 'mana', 'bread of life', 'bread', 'manna'],
  ['Eternal life', 'Viața veșnică', 'viata vesnica', 'viata vesnic', 'eternal life', 'everlasting life'],
  ['Angels', 'Îngeri', 'inger', 'heruvim', 'serafim', 'angel', 'cherub', 'seraph'],
  ['Satan', 'Satana', 'satana', 'diavol', 'cel rau', 'sarpele cel vechi', 'satan', 'devil', 'evil one'],
  ['Blessing', 'Binecuvîntare', 'binecuvint', 'ferice', 'fericit', 'bless', 'blessed', 'blessing'],
  ['Humility', 'Smerenie', 'smer', 'umil', 'blind', 'humble', 'humility', 'meek'],
  ['Patience / perseverance', 'Răbdare', 'rabda', 'rabdare', 'statornic', 'patience', 'perseverance', 'endure'],
  ['Trials / suffering', 'Încercări / suferință', 'incercar', 'necaz', 'suferint', 'strimtorare', 'trial', 'suffering', 'tribulation', 'affliction'],
  ['Fear not', 'Nu te teme', 'nu te teme', 'nu va temeti', 'fear not', 'do not be afraid', 'do not fear'],
  ['Healing', 'Vindecare', 'vindec', 'tamadu', 'heal', 'healing', 'healed'],
  ['Strength', 'Putere / tărie', 'putere', 'tarie', 'stinca', 'cetatuie', 'strength', 'rock', 'fortress', 'refuge'],
  ['Faithfulness of God', 'Credincioșia lui Dumnezeu', 'credincios', 'credinciosia', 'faithful', 'faithfulness'],
  ['Creation', 'Creația', 'facut cerurile', 'la inceput', 'ziditor', 'creat', 'created', 'creator', 'in the beginning'],
  ['Wisdom', 'Înțelepciune', 'intelep', 'pricepere', 'wisdom', 'wise', 'understanding'],
  ['Marriage / family', 'Căsătorie / familie', 'nevasta', 'barbat', 'sotie', 'copii', 'parinti', 'husband', 'wife', 'children', 'parents'],
  ['Giving', 'Dărnicie', 'da cu', 'zeciuial', 'darnic', 'give', 'tithe', 'generous'],
  ['Evangelism', 'Evanghelizare', 'evanghelia', 'propovaduiti', 'mergeti si faceti ucenici', 'gospel', 'preach', 'make disciples'],
];

// returns [{ name, phrases }] for every topic the query refers to
function topicsFor(q) {
  const f = ' ' + fold(q) + ' ';
  const out = [];
  for (const tp of TOPICS) {
    const [en, ro, ...ph] = tp;
    const q = f.trim();
    const names = [fold(en), fold(ro)].filter(Boolean);
    const multi = ph.map(fold).filter(p => p.includes(' '));
    const hit = names.some(n => f.includes(' ' + n + ' ') || (q.length >= 5 && n.startsWith(q)))
      || multi.some(p => f.includes(' ' + p + ' '))
      || ph.map(fold).some(p => p === q);
    if (hit) out.push({ name: en, ro, phrases: [...new Set(ph.map(fold))] });
  }
  return out;
}

/**
 * Kuratierte deutsche Wortliste für barrierefreie Kurzlinks
 *
 * Kriterien:
 * - Kurze, einfache Wörter (4-8 Buchstaben)
 * - Häufig verwendete Substantive
 * - Keine verwechselbaren Wörter
 * - Keine anstößigen Wörter
 * - Keine Fremdwörter
 * - Leicht aussprechbar
 */

export const GERMAN_WORDS = [
  // Natur (60 Wörter)
  'sonne', 'mond', 'stern', 'berg', 'tal', 'wald', 'see', 'fluss',
  'meer', 'wiese', 'blume', 'baum', 'blatt', 'rose', 'tulpe', 'gras',
  'fels', 'sand', 'stein', 'erde', 'luft', 'wind', 'regen', 'schnee',
  'wolke', 'nebel', 'frost', 'glut', 'feuer', 'welle', 'bach', 'teich',
  'insel', 'bucht', 'klippe', 'dune', 'heide', 'moor', 'quelle', 'ufer',
  'gipfel', 'hang', 'mulde', 'hain', 'linde', 'eiche', 'birke', 'tanne',
  'kiefer', 'buche', 'weide', 'ahorn', 'erle', 'fichte', 'palme', 'efeu',
  'moos', 'farn', 'klee', 'distel',

  // Tiere (60 Wörter)
  'hund', 'katze', 'vogel', 'fisch', 'pferd', 'kuh', 'schaf', 'ziege',
  'hase', 'fuchs', 'wolf', 'biene', 'frosch', 'adler', 'eule', 'rabe',
  'spatz', 'schwan', 'ente', 'gans', 'huhn', 'hahn', 'taube', 'falke',
  'hirsch', 'reh', 'dachs', 'igel', 'maus', 'hamster', 'biber', 'otter',
  'lachs', 'forelle', 'hecht', 'karpfen', 'krebs', 'muschel', 'krabbe', 'wal',
  'delfin', 'robbe', 'pinguin', 'storch', 'kranich', 'reiher', 'drossel', 'amsel',
  'fink', 'meise', 'specht', 'elster', 'kauz', 'habicht', 'bussard', 'milan',
  'marder', 'wiesel', 'luchs', 'elch',

  // Farben (20 Wörter)
  'rot', 'blau', 'gruen', 'gelb', 'gold', 'silber', 'rosa', 'lila',
  'orange', 'braun', 'grau', 'weiss', 'schwarz', 'beige', 'türkis', 'kupfer',
  'bronze', 'indigo', 'ocker', 'safran',

  // Objekte & Möbel (60 Wörter)
  'tisch', 'stuhl', 'buch', 'auto', 'haus', 'turm', 'boot', 'zug',
  'rad', 'uhr', 'lampe', 'tasse', 'korb', 'kiste', 'dose', 'flasche',
  'teller', 'kanne', 'topf', 'pfanne', 'messer', 'gabel', 'schere', 'nadel',
  'faden', 'stoff', 'seide', 'wolle', 'leder', 'holz', 'glas', 'metall',
  'papier', 'kerze', 'spiegel', 'bild', 'rahmen', 'vase', 'decke', 'kissen',
  'bank', 'regal', 'schrank', 'truhe', 'kommode', 'sofa', 'sessel', 'hocker',
  'bett', 'wiege', 'leiter', 'zaun', 'tor', 'pforte', 'kette', 'ring',
  'perle', 'krone', 'harfe', 'glocke',

  // Gebäude & Orte (40 Wörter)
  'kirche', 'schloss', 'burg', 'mauer', 'brunnen', 'garten', 'park', 'platz',
  'markt', 'hafen', 'werft', 'mühle', 'scheune', 'stall', 'hütte', 'zelt',
  'brücke', 'tunnel', 'damm', 'deich', 'kai', 'pier', 'anker', 'mast',
  'segel', 'ruder', 'kiel', 'planke', 'balken', 'säule', 'bogen', 'kuppel',
  'giebel', 'erker', 'turm', 'zinne', 'graben', 'wall', 'rampe', 'treppe',

  // Lebensmittel (50 Wörter)
  'apfel', 'birne', 'kirsche', 'pflaume', 'traube', 'orange', 'zitrone', 'banane',
  'beere', 'melone', 'pfirsich', 'mango', 'feige', 'dattel', 'olive', 'nuss',
  'mandel', 'kastanie', 'brot', 'kuchen', 'torte', 'keks', 'nudel', 'reis',
  'bohne', 'linse', 'erbse', 'mais', 'weizen', 'hafer', 'roggen', 'gerste',
  'salat', 'tomate', 'gurke', 'karotte', 'zwiebel', 'lauch', 'kohl', 'spinat',
  'kürbis', 'paprika', 'aubergine', 'zucchini', 'radieschen', 'rettich', 'rübe', 'sellerie',
  'honig', 'zucker',

  // Wetter & Himmel (20 Wörter)
  'himmel', 'blitz', 'donner', 'hagel', 'tau', 'reif', 'eis', 'gletscher',
  'lawine', 'flut', 'ebbe', 'sturm', 'brise', 'böe', 'orkan', 'tornado',
  'regenbogen', 'aurora', 'dämmerung', 'morgen',

  // Körper & Kleidung (30 Wörter)
  'hand', 'fuss', 'kopf', 'herz', 'auge', 'ohr', 'nase', 'mund',
  'zahn', 'haar', 'haut', 'knochen', 'muskel', 'nerv', 'blut', 'atem',
  'hut', 'mütze', 'schal', 'mantel', 'jacke', 'hemd', 'kleid', 'rock',
  'hose', 'schuh', 'stiefel', 'sandal', 'gürtel', 'tasche',

  // Werkzeuge & Geräte (30 Wörter)
  'hammer', 'säge', 'bohrer', 'zange', 'feile', 'meißel', 'hobel', 'axt',
  'beil', 'spaten', 'harke', 'sense', 'sichel', 'pflug', 'egge', 'walze',
  'amboss', 'esse', 'blasebalg', 'schmelze', 'gießkanne', 'eimer', 'besen', 'mopp',
  'pinsel', 'rolle', 'spachtel', 'kelle', 'waage', 'kompass',

  // Musik & Kunst (25 Wörter)
  'lied', 'klang', 'ton', 'takt', 'rhythmus', 'melodie', 'trommel', 'flöte',
  'geige', 'cello', 'bass', 'orgel', 'klavier', 'gitarre', 'laute', 'horn',
  'posaune', 'pauke', 'becken', 'triangel', 'bild', 'skulptur', 'mosaik', 'fresko',
  'tapete',

  // Zeit & Zahlen (20 Wörter)
  'tag', 'nacht', 'woche', 'monat', 'jahr', 'stunde', 'minute', 'sekunde',
  'epoche', 'ära', 'eins', 'zwei', 'drei', 'vier', 'fünf', 'sechs',
  'sieben', 'acht', 'neun', 'zehn',

  // Abstraktes & Gefühle (25 Wörter)
  'freude', 'glück', 'liebe', 'friede', 'ruhe', 'stille', 'kraft', 'mut',
  'stolz', 'ehre', 'treue', 'güte', 'weisheit', 'wahrheit', 'schönheit', 'anmut',
  'wunder', 'zauber', 'traum', 'hoffnung', 'glaube', 'seele', 'geist', 'sinn',
  'wille',

  // Berufe & Rollen (30 Wörter)
  'könig', 'kaiser', 'fürst', 'graf', 'ritter', 'held', 'bauer', 'fischer',
  'jäger', 'schmied', 'weber', 'töpfer', 'bäcker', 'koch', 'maler', 'dichter',
  'sänger', 'tänzer', 'lehrer', 'arzt', 'richter', 'wächter', 'bote', 'kurier',
  'pilger', 'mönch', 'nonne', 'priester', 'weise', 'meister',

  // Sonstiges (30 Wörter)
  'brief', 'siegel', 'fahne', 'flagge', 'wappen', 'schild', 'schwert', 'lanze',
  'bogen', 'pfeil', 'helm', 'rüstung', 'sattel', 'zügel', 'sporn', 'peitsche',
  'netz', 'angel', 'falle', 'schlinge', 'seil', 'tau', 'knoten', 'schleife',
  'band', 'kordel', 'schnur', 'draht', 'nagel', 'schraube',
];

// Anzahl der Wörter für Debugging/Info
export const WORD_COUNT = GERMAN_WORDS.length;

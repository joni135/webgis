// Laden aller benötigten Bibliotheken
const fs = require('fs');
const express = require('express');
const path = require('path');
const morgan = require('morgan'); // Logging HTTP-Requests
const winston = require('winston'); // Logging Prozess
const {Pool} = require('pg'); // PostgreSQL

// Einrichten der Logging-Funktionen
const logger = winston.createLogger({
    level: 'http', // Mindest-Log-Level
    format: winston.format.combine(
        winston.format.timestamp({format: 'YYYY-MM-DD HH:mm:ss'}),
        // winston.format.colorize(), // funktioniert nur in Konsole
        winston.format.printf(({timestamp, level, message, ...meta}) => {
            const metaStr = Object.keys(meta).length ? JSON.stringify(meta) : '';
            return `[${timestamp}] ${level}: ${message} ${metaStr}`;
    })
    ),
    transports: [
        new winston.transports.Console({level: 'debug'}), // Ausgabe in Terminal
        new winston.transports.File({filename: 'app.log'}), // In Datei
        new winston.transports.File({filename: 'error.log', level: 'error'}) // Nur Fehler
    ]
});


// Lesen der Konfigurationsdatei
const configFile = fs.readFileSync('app.conf');
const config = JSON.parse(configFile);


// Erstelle Webapp auf Port 8080 (wird über Docker umgeleitet) und gebe Ordner frei
const app = express();
const port = 8080;
app.set('query parser', 'extended'); // Express 5: Array-Syntax (?attributes[]=...) wieder erlauben
app.use(express.json());
app.use(express.static(path.join(__dirname, config.maininfos.system.publicfolder))); // Public-Ordner freigeben (für CSS, JS, etc.)
// app.use(morgan('combined', { // Alle HTTP-Requests werden geloggt
//   stream: {
//     write: (message) => logger.http(message.trim())
//   }
// }));


// ════════════════════════════════════════════════════════════════
//    CONFIG API
// ════════════════════════════════════════════════════════════════

const ALLOWED_CONFIGS = ['basemaps', 'layers', 'featureinfo', 'filterattributes'];

// GET /api/config    → alle Configs in einem Objekt
app.get('/api/config', (req, res) => {
    let profileconfig = {};
    const requestedprofile = req.query.profile

    // Profil auslesen
    if (requestedprofile && config.profiles.hasOwnProperty(requestedprofile)) {
        logger.info('GET-Request an /api/config auf gültiges Profil', {requestedProfile: requestedprofile});
        profileconfig = config.profiles[requestedprofile];
    } else {
        logger.warn('GET-Request an /api/config auf UNGÜLTIGES Profil', {requestedProfile: requestedprofile || null});
        return res.status(400).json({error: 'Der URL-Parameter PROFILE ist nicht oder falsch angegeben! Dieser Parameter ist ein Pflichtattribut...'});
    };

    // Configs laden
    try {
        const data = {};
        ALLOWED_CONFIGS.forEach(name => {
            const filePath = path.join(__dirname, config.maininfos.system.profilesfolder, requestedprofile, `${name}.json`);
            logger.debug('Konfigurationen werden geladen', {requestedProfile: requestedprofile, filePath})
            data[name] = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        });
        res.json(data);
    } catch (err) {
        logger.error(`Konfigurations-Ladefehler: ${err.message}`, {requestedProfile: requestedprofile});
        res.status(500).json({error: 'Config konnte nicht geladen werden', detail: err.message});
    }
});

// GET /api/config/:file    → einzelne Config
app.get('/api/config/:file', (req, res) => {
    let profileconfig = {};
    const requestedprofile = req.query.profile
    const name = req.params.file;

    // Profil auslesen
    if (requestedprofile && config.profiles.hasOwnProperty(requestedprofile)) {
        logger.info('GET-Request an /api/config:file auf gültiges Profil', {requestedProfile: requestedprofile, file: name});
        profileconfig = config.profiles[requestedprofile];
    } else {
        logger.warn('GET-Request an /api/config:file auf UNGÜLTIGES Profil', {requestedProfile: requestedprofile || null, file: name});
        return res.status(400).json({error: 'Der URL-Parameter PROFILE ist nicht oder falsch angegeben! Dieser Parameter ist ein Pflichtattribut...'});
    };

    // Config-File verifizieren
    if (!ALLOWED_CONFIGS.includes(name)) {
        logger.warn('GET-Request an /api/config:file auf UNGÜLTIGE Konfigurationsdatei', {requestedProfile: requestedprofile, file: name});
        return res.status(404).json({ error: `Unbekannte Config "${name}"`});
    };

    // Config laden
    try {
        const filePath = fs.readFileSync(path.join(__dirname, config.maininfos.system.profilesfolder, requestedprofile, `${name}.json`), 'utf8');
        logger.debug('Konfigurationen werden geladen', {requestedProfile: requestedprofile, filePath})
        res.json(JSON.parse(filePath));
    } catch (err) {
        logger.error(`Konfigurations-Ladefehler: ${err.message}`, {requestedProfile: requestedprofile});
        res.status(500).json({ error: err.message });
    }
});

// POST /api/config/:file    → Config überschreiben
// app.post('/api/config/:file', (req, res) => {
//     profileconfig = {};
//     const requestedprofile = req.query.profile
//     const name = req.params.file;
//     const data = req.body

//     // Profil auslesen
//     if (requestedprofile && config.profiles.hasOwnProperty(requestedprofile)) {
//         logger.info('POST-Request an /api/config:file auf gültiges Profil', {requestedProfile: requestedprofile, file: name});
//         profileconfig = config.profiles[requestedprofile];
//     } else {
//         logger.warn('POST-Request an /api/config:file auf UNGÜLTIGES Profil', {requestedProfile: requestedprofile || null, file: name});
//         return res.status(400).json({error: 'Der URL-Parameter PROFILE ist nicht oder falsch angegeben! Dieser Parameter ist ein Pflichtattribut...'});
//     };

//     // Config-File verifizieren
//     if (!ALLOWED_CONFIGS.includes(name)) {
//         logger.warn('POST-Request an /api/config:file auf UNGÜLTIGE Konfigurationsdatei', {requestedProfile: requestedprofile, file: name});
//         return res.status(404).json({ error: `Unbekannte Config "${name}"`});
//     };

//     // Post-Body auslesen
//     if (!data || Object.keys(data).length === 0) {
//         logger.warn('POST-Request an /api/config:file ohne Inhalt', {requestedProfile: requestedprofile, file: name});
//         return res.status(400).json({ error: `Kein Request-Body`});
//     };

//     // Config archivieren und überschreiben
//     try {
//         const filePath = path.join(__dirname, config.maininfos.system.profilesfolder, requestedprofile, `${name}.json`);
//         // Backup anlegen
//         const backupPath = path.join(__dirname, config.maininfos.system.profilesfolder, requestedprofile, 'backup', `${name}.json`);
//         if (fs.existsSync(filePath)) {
//             fs.copyFileSync(filePath, backupPath);
//             logger.debug(`Backup der Konfigurationen erstellt: ${backupPath}`, {requestedProfile: requestedprofile, filePath})
//         };
//         // Neue Config schreiben
//         fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
//         res.json({ok: true, saved: name});
//         logger.info('Konfigurationen wurden überschrieben', {requestedProfile: requestedprofile, filePath})
//     } catch (err) {
//         logger.error(`Konfigurations-Schreibefehler: ${err.message}`, {requestedProfile: requestedprofile})
//         res.status(500).json({error: err.message});
//     }
// });


// ════════════════════════════════════════════════════════════════
//    DATA API (Filterwerte laden)
// ════════════════════════════════════════════════════════════════
// SQL-Datenabfrage
// - profile (Profil, für DB-Connection)
// - table (Selektierte Tabelle)
// - attributes (Selektierte Attribute, Kommasepariert oder als Array (?attributes=col1,col2  ODER  ?attributes[]=col1&attributes[]=col2))
// - filter (Optional, JSON-Array mit Bedingungen, werden mit AND verknüpft)
//     z.B. ?filter=[{"attribute":"speed_gps","operator":">","value":3},{"attribute":"narrative","operator":"IS NOT NULL"}]
// - orderattribute (Optional, nur ein Attribut als Text)

// Erlaubte Vergleichsoperatoren für den Filter (alles andere wird abgelehnt)
const FILTER_OPERATORS = ['=', '!=', '<', '<=', '>', '>=', 'LIKE', 'ILIKE'];
const FILTER_OPERATORS_NOVALUE = ['IS NULL', 'IS NOT NULL'];

// Schutz gegen SQL-Injection: nur alphanumerisch + Unterstrich erlaubt, optional mit Schema (schema.tabelle)
const isValidIdentifier = (str) => typeof str === 'string' && /^[a-zA-Z_][a-zA-Z0-9_]*(\.[a-zA-Z_][a-zA-Z0-9_]*)?$/.test(str);
const quoteIdentifier = (str) => str.split('.').map(part => `"${part}"`).join('.');

// Filter-JSON in parametrisierte WHERE-Bedingung umwandeln (Werte werden als $1, $2, ... übergeben)
const buildWhereClause = (filter) => {
    const conditions = JSON.parse(filter);
    if (!Array.isArray(conditions)) {
        throw new Error('Filter muss ein Array sein');
    };

    const values = [];
    const clauses = conditions.map(cond => {
        const operator = typeof cond.operator === 'string' ? cond.operator.toUpperCase() : null;
        if (!isValidIdentifier(cond.attribute)) {
            throw new Error(`Ungültiges Filter-Attribut "${cond.attribute}"`);
        };
        if (FILTER_OPERATORS_NOVALUE.includes(operator)) {
            return `${quoteIdentifier(cond.attribute)} ${operator}`;
        };
        if (!FILTER_OPERATORS.includes(operator)) {
            throw new Error(`Ungültiger Filter-Operator "${cond.operator}"`);
        };
        values.push(cond.value);
        return `${quoteIdentifier(cond.attribute)} ${operator} $${values.length}`;
    });

    return {clause: clauses.join(' AND '), values};
};

const createPool = (dbConn) => new Pool({
    host:     dbConn.host,
    port:     dbConn.port,
    database: dbConn.dbname,
    user:     dbConn.user,
    password: dbConn.password,
    max: 1,                  // Nur 1 Verbindung, da Pool sofort wieder zerstört wird
    idleTimeoutMillis: 1000, // Schnell aufräumen
});

app.get('/data', async (req, res) => {
    let profileconfig = {};
    const requestedprofile = req.query.profile
    const table = req.query.table;
    const attributes = req.query.attributes;
    const filter = req.query.filter;
    const orderby = req.query.orderattribute;
    if (!table || !attributes) {
        return res.status(400).json({error: 'table und attributes sind erforderlich'});
    }

    // Profil auslesen
    if (requestedprofile && config.profiles.hasOwnProperty(requestedprofile)) {
        logger.info('GET-Request an /data auf gültiges Profil', {requestedProfile: requestedprofile || null, table, attributes});
        profileconfig = config.profiles[requestedprofile];
    } else {
        return res.status(400).json({error: 'Der URL-Parameter PROFILE ist nicht oder falsch angegeben! Dieser Parameter ist ein Pflichtattribut...'});
    };

    // attributes kann als kommagetrennte Liste oder als Array ankommen
    // ?attributes=col1,col2  ODER  ?attributes[]=col1&attributes[]=col2
    const attrArray = Array.isArray(attributes)
        ? attributes
        : String(attributes).split(',').map(a => a.trim());

    if (attrArray.length === 0) {
        return res.status(400).json({error: 'Mindestens ein Attribut erforderlich'});
    };

    if (!isValidIdentifier(table)) {
        return res.status(400).json({error: 'Ungültige Table'});
    };
    if (!attrArray.every(isValidIdentifier)) {
        return res.status(400).json({error: 'Ungültige Attribute'});
    };
    if (orderby && !isValidIdentifier(orderby)) {
        return res.status(400).json({error: 'Ungültiges Sortier-Attribut'});
    };

    // Querry zusammenbauen
    const cols = attrArray.map(quoteIdentifier).join(', ');
    let query = `SELECT ${cols} FROM ${quoteIdentifier(table)}`;
    let values = [];
    if (filter) {
        try {
            const where = buildWhereClause(filter);
            if (where.clause) {
                query = query+` WHERE ${where.clause}`;
                values = where.values;
            };
        } catch (err) {
            logger.warn('Ungültiger Filter', {requestedprofile, filter, error: err.message});
            return res.status(400).json({error: 'Ungültiger Filter', detail: err.message});
        };
    };
    if (orderby) {
        query = query+` ORDER BY ${quoteIdentifier(orderby)}`;
    };


    // Connection Pool erstellen
    const dbConn = profileconfig.db_conn;
    const pool = createPool(dbConn);

    try {
        logger.info('DB-Abfrage', {requestedprofile, table, query, values});

        const result = await pool.query(query, values);

        logger.info('DB-Abfrage erfolgreich', {rows: result.rowCount});
        return res.json({table: table, attributes: attrArray, count: result.rowCount, rows: result.rows});

    } catch (err) {
        logger.error('Datenbankfehler', {error: err.message, query});
        return res.status(500).json({error: 'Datenbankfehler', detail: err.message});
    } finally {
        await pool.end(); // ← Verbindung immer schliessen, auch bei Fehler
    };
});


// ════════════════════════════════════════════════════════════════
//    MAIN PAGE
// ════════════════════════════════════════════════════════════════
// Request eines Profiles
app.get('/', (req, res) => {
    const Errors = [];
    let profileconfig = {};

    // Profil auslesen
    const requestedprofile = req.query.profile
    if (requestedprofile && config.profiles.hasOwnProperty(requestedprofile)) {
        logger.info('Anfrage an Webapp auf gültiges Profil', {requestedProfile: requestedprofile});
        profileconfig = config.profiles[requestedprofile];
    } else {
        Errors.push ({
            'title': `Parameter "PROFILE" nicht oder falsch angegeben`,
            'content': `Der URL-Parameter PROFILE ist nicht oder falsch angegeben! Dieser Parameter ist ein Pflichtattribut...`,
            'fatal': true
        });
    };


    // Erstelle Abfragenspezifisches Skript, dass dem Client im HTML gesendet wird
    // "<" wird escaped, damit URL-Parameter wie "</script>" nicht aus dem Skript ausbrechen können (XSS)
    const toScriptJson = (obj) => JSON.stringify(obj).replace(/</g, '\\u003c');
    const customScript = `
        <script type="text/javascript">
            const reqparam = ${toScriptJson(req.query)};
            const errors = ${toScriptJson(Errors)};
            const sitetitle = "${config.maininfos.sitetitleprefix+profileconfig.name}";
            const siteauthor = "${config.maininfos.siteauthor}";
            const favicon = "${profileconfig.favicon}";
        </script>`;

    
    // Prüfe Prozess auf fatale Fehler
    let fatalErrorCount = 0;
    for (let Error of Errors) {
        if (Error.fatal == true) {
            fatalErrorCount += 1;
        };
    };


    // Generiere Pfad des zu sendenden HTML-Files, abhängig von Fehlern und Konfiguration
    let htmlFilePath;
    if (fatalErrorCount == 0) {
        htmlFilePath = path.join(__dirname, config.maininfos.system.profilesfolder, requestedprofile, `index.html`);
    } else {
        htmlFilePath = path.join(__dirname, config.maininfos.system.publicfolder, `error.html`);
    };


    // Lese die HTML-Datei und sende sie an Client
    fs.readFile(htmlFilePath, 'utf8', (err, data) => {
        if (err) {
            // Fehler beim Lesen der Datei
            logger.error(`HTML konnte nicht geladen werden: ${err.message}`, {requestedProfile: requestedprofile || null, htmlFilePath});
            return res.status(500).send({
                'title': `HTML konnte nicht geladen werden`,
                'content': err.message,
                'fatal': true
            });
        };

        // Gelesenem HTML Skript mit Plugins und Parameter und CSS hinzufügen
        data = data.replace('</head>', `${customScript}</head>`);

        // Sende die HTML-Datei als Antwort
        res.writeHead(200, {'Content-Type': 'text/html'});
        res.end(data);
    });
});


// Profil-Ordner einmalig beim Start freigeben (für CSS, JS, etc.)
// index: false, damit "/" weiterhin über die Route oben läuft
// Backup-Ordner sperren (dekodierter Pfad, damit z.B. "/%62ackup/" nicht durchrutscht)
app.use((req, res, next) => {
    let decodedPath;
    try {
        decodedPath = decodeURIComponent(req.path);
    } catch (err) {
        return res.status(400).end();
    };
    if (decodedPath.split('/').some(segment => segment.toLowerCase() === 'backup')) {
        logger.warn('Zugriff auf Backup-Ordner blockiert', {path: req.path});
        return res.status(404).end();
    };
    next();
});
Object.keys(config.profiles).forEach(profile => {
    app.use(express.static(path.join(__dirname, config.maininfos.system.profilesfolder, profile), {index: false}));
});


// Default-Abfrage von Favicon handlen
app.get('/favicon.ico', function(req, res) {
    res.status(200).send();
});


// debug listen port
app.listen(port, () => {
    logger.info(`Leaflet-WebGIS läuft auf Port ${port}`);
    logger.info(`Die Prozess-ID dieser Node.js-App ist ${process.pid}`);
});
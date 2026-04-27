// Laden aller benötigten Bibliotheken
const fs = require('fs');
const express = require('express');
const path = require('path');
const morgan = require('morgan'); // Logging HTTP-Requests
const winston = require('winston'); // Logging Prozess
const {Pool} = require('pg'); // PostgreSQL
const { execFile } = require('child_process');
const http = require('http');
const https = require('https');

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
    profileconfig = {};
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
    profileconfig = {};
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
app.post('/api/config/:file', (req, res) => {
    profileconfig = {};
    const requestedprofile = req.query.profile
    const name = req.params.file;
    const data = req.body

    // Profil auslesen
    if (requestedprofile && config.profiles.hasOwnProperty(requestedprofile)) {
        logger.info('POST-Request an /api/config:file auf gültiges Profil', {requestedProfile: requestedprofile, file: name});
        profileconfig = config.profiles[requestedprofile];
    } else {
        logger.warn('POST-Request an /api/config:file auf UNGÜLTIGES Profil', {requestedProfile: requestedprofile || null, file: name});
        return res.status(400).json({error: 'Der URL-Parameter PROFILE ist nicht oder falsch angegeben! Dieser Parameter ist ein Pflichtattribut...'});
    };

    // Config-File verifizieren
    if (!ALLOWED_CONFIGS.includes(name)) {
        logger.warn('POST-Request an /api/config:file auf UNGÜLTIGE Konfigurationsdatei', {requestedProfile: requestedprofile, file: name});
        return res.status(404).json({ error: `Unbekannte Config "${name}"`});
    };

    // Post-Body auslesen
    if (!data || Object.keys(data).length === 0) {
        logger.warn('POST-Request an /api/config:file ohne Inhalt', {requestedProfile: requestedprofile, file: name});
        return res.status(400).json({ error: `Kein Request-Body`});
    };

    // Config archivieren und überschreiben
    try {
        const filePath = path.join(__dirname, config.maininfos.system.profilesfolder, requestedprofile, `${name}.json`);
        // Backup anlegen
        const backupPath = path.join(__dirname, config.maininfos.system.profilesfolder, requestedprofile, 'backup', `${name}.json`);
        if (fs.existsSync(filePath)) {
            fs.copyFileSync(filePath, backupPath);
            logger.debug(`Backup der Konfigurationen erstellt: ${backupPath}`, {requestedProfile: requestedprofile, filePath})
        };
        // Neue Config schreiben
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
        res.json({ok: true, saved: name});
        logger.info('Konfigurationen wurden überschrieben', {requestedProfile: requestedprofile, filePath})
    } catch (err) {
        logger.error('Konfigurations-Schreibefehler: ${err.message}', {requestedProfile: requestedprofile})
        res.status(500).json({error: err.message});
    }
});


// ════════════════════════════════════════════════════════════════
//    DATA API (Filterwerte laden)
// ════════════════════════════════════════════════════════════════
// SQL-Datenabfrage
// - profile (Profil, für DB-Connection)
// - table (Selektierte Tabelle)
// - attributes (Selektierte Attribute, Kommasepariert oder als Array (?attributes=col1,col2  ODER  ?attributes[]=col1&attributes[]=col2))
// - filter (Optional, Filter-Statement ohne WHERE)
// - orderattribute (Optional, nur ein Attribut als Text)
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
    profileconfig = {};
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
        : attributes.split(',').map(a => a.trim());

    if (attrArray.length === 0) {
        return res.status(400).json({error: 'Mindestens ein Attribut erforderlich'});
    };

    // Schutz gegen SQL-Injection: nur alphanumerisch + Unterstrich erlaubt
    const isValidIdentifier = (str) => /^[a-zA-Z_][a-zA-Z0-9_.]*$/.test(str);

    if (!isValidIdentifier(table)) {
        return res.status(400).json({error: 'Ungültige Table'});
    };
    if (!attrArray.every(isValidIdentifier)) {
        return res.status(400).json({error: 'Ungültige Attribute'});
    };

    // Querry zusammenbauen
    const cols = attrArray.map(a => `"${a}"`).join(', ');
    var query = `SELECT ${cols} FROM "${table}"`;
    if (filter) {
        query = query+` WHERE ${filter}`;
    };
    if (orderby) {
        query = query+` ORDER BY "${orderby}"`;
    };
    

    // Connection Pool erstellen
    const dbConn = profileconfig.db_conn;
    const pool = createPool(dbConn);

    try {
        logger.info('DB-Abfrage', {requestedprofile, table, query});

        const result = await pool.query(query);

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
    Errors = [];
    profileconfig = {};

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
    customScript = `
        <script type="text/javascript">
            const reqparam = ${JSON.stringify(req.query)};
            const errors = ${JSON.stringify(Errors)};
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
    if (fatalErrorCount == 0) {
        htmlFilePath = path.join(__dirname, config.maininfos.system.profilesfolder, requestedprofile, `index.html`);
        app.use(express.static(path.join(__dirname, config.maininfos.system.profilesfolder, requestedprofile))); // Profil-Ordner freigeben (für CSS, JS, etc.)
    } else {
        htmlFilePath = path.join(__dirname, config.maininfos.system.publicfolder, `error.html`);
    };


    // Lese die HTML-Datei und sende sie an Client
    fs.readFile(htmlFilePath, 'utf8', (err, data) => {
        if (err) {
            // Fehler beim Lesen der Datei
            res.status(500).send({
                'title': `HTML konnte nicht geladen werden`,
                'content': err,
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


// Default-Abfrage von Favicon handlen
app.get('/favicon.ico', function(req, res) {
    res.status(200).send();
});


// debug listen port
app.listen(port, () => {
    logger.info(`Leaflet-WebGIS läuft auf Port ${port}`);
    logger.info(`Die Prozess-ID dieser Node.js-App ist ${process.pid}`);
});
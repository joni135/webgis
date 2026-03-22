// Laden aller benötigten Bibliotheken
const fs = require('fs');
const express = require('express');
const path = require('path');
const morgan = require('morgan'); // Logging HTTP-Requests
const winston = require('winston'); // Logging Prozess

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
        new winston.transports.Console(), // Ausgabe in Terminal
        new winston.transports.File({filename: 'app.log'}), // In Datei
        new winston.transports.File({filename: 'error.log', level: 'error'}) // Nur Fehler
    ]
});


// Lesen der Konfigurationsdatei
const configFile = fs.readFileSync('index.conf');
const config = JSON.parse(configFile);


// Erstelle Webapp auf Port 8080 (wird über Docker umgeleitet) und gebe Ordner frei
const app = express();
const port = 8080;
app.use(express.static(path.join(__dirname, config.maininfos.system.publicfolder)));
app.use(express.static(path.join(__dirname, config.maininfos.system.profilesfolder)));
app.use(morgan('combined', { // Alle HTTP-Requests werden geloggt
  stream: {
    write: (message) => logger.http(message.trim())
  }
}));


// Provisorisch hier das einzige Profil direkt eingebunden, das kann natürlich auch noch Geil gemacht werden
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
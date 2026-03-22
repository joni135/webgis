function initSite() {
    // Allfällige Fehler und Warnungen ausgeben
    if (errors) {
        //console.warn('Vom Server wurden einige Fehler (oder Warnungen) zurückgegeben:')
        for (let i = 0; i < errors.length; i++) {
            if (errors[i].fatal == true) {
                console.error(errors[i].title+':\n'+errors[i].content)
            } else {
                console.warn(errors[i].title+':\n'+errors[i].content)
            };
        };
    };

    // Lade Index-Javascript-Funktionen
    updateClock();
};


// Liste der Fehler auf der Webseite laden
function renderErrors(errorsToRender) {

    // Suche Tag, wo die Alben gespeichert werden sollen und leere Tag
    const errorList = document.getElementById('error-list');
    errorList.innerHTML = '';
  
    // Jedes Album durchlaufen
    for (let error of errorsToRender) {
        errorList.innerHTML += `
            <li id="error-fatal-${error.fatal}" class="error">
                <h3 id="error-fatal-${error.fatal}-title" class="errortitle">${error.title}</h3>
                <p id="error-fatal-${error.fatal}-content" class="errorinfo">${error.content}</p>
            </li>
        `;
    };
  
    console.log(`Alle Fehler wurden geladen. Insgesammt wurden ${errorsToRender.length} gerendert!`);
};


// Aktualisiere Uhr auf Monitor
function updateClock() {
    var currentTime = new Date();
    var year = currentTime.getFullYear();
    var month = currentTime.getMonth() + 1; // Monate beginnen mit 0 (Januar)
    var day = currentTime.getDate();
    var hours = currentTime.getHours();
    var minutes = currentTime.getMinutes();
    var seconds = currentTime.getSeconds();

    // Füge führende Nullen hinzu, wenn nötig
    month = (month < 10 ? "0" : "") + month;
    day = (day < 10 ? "0" : "") + day;
    hours = (hours < 10 ? "0" : "") + hours;
    minutes = (minutes < 10 ? "0" : "") + minutes;
    seconds = (seconds < 10 ? "0" : "") + seconds;

    // Setze Datum bei current-date
    if (document.getElementById("current-date")) {
        document.getElementById("current-date").innerHTML = day + "." + month + "." + year;
    };

    // Setze Zeit bei current-time
    if (document.getElementById("current-time")) {
        document.getElementById("current-time").innerHTML = hours + ":" + minutes;
    };

    // Setze Datum und Zeit bei current-date-time
    if (document.getElementById("current-date-time")) {
        //document.getElementById("current-date-time").innerHTML = day + "." + month + "." + year + "<br>" + hours + ":" + minutes;
        document.getElementById("current-date-time").innerHTML = `${day}.${month}.${year}<br><span class="textsizedouble">${hours}:${minutes}</span>`;
    };

    // warte eine Sekunde und führe Funktion nochmals aus (dauerschleife)
    setTimeout(updateClock, 1000);
};
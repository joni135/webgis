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
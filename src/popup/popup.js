const browser = chrome || browser;
let settings;
let currentUrl;

const pageElements = {
    convertAutoCheckbox: document.querySelector('#auto'),
    convertSelectionCheckbox: document.querySelector('#selection'),
    integrateBadgerCheckbox: document.querySelector('#badger'),
    ignoreList: document.querySelector('.ignore-list ul'),
    ignoreBtn: document.querySelector('.ignore-add-btn'),
    helpBtn: document.querySelector('.helper')
}

function updateCurrentUrl() {
    browser.tabs.query({ active: true, currentWindow: true }, function(tabs) {
        currentUrl = new URL(tabs[0].url);
    });
}

// checkbox change settings
pageElements.convertAutoCheckbox.addEventListener('change', function() {
    settings.convertAuto = this.checked;
    // disable conversion on selection if auto
    if(this.checked) {
        pageElements.convertSelectionCheckbox.checked = false;
        settings.convertSelection = false;
    }
    saveSettings();
});
pageElements.convertSelectionCheckbox.addEventListener('change', function() {
    settings.convertSelection = this.checked;
    // disable conversion on auto if selection setting true
    if(this.checked) {
        pageElements.convertAutoCheckbox.checked = false;
        settings.convertAuto = false;
    }
    saveSettings();
});
pageElements.integrateBadgerCheckbox.addEventListener('change', function() {
    settings.integrateBadger = this.checked;
    saveSettings();
});

// ignore btn click
pageElements.ignoreBtn.addEventListener('click', function() {
    const hostname = currentUrl.hostname;
    if(hostname && settings.ignoreDomains.indexOf(hostname) < 0) settings.ignoreDomains.push(hostname);
    saveSettings(displaySettings);
});

// help icon clicked
pageElements.helpBtn.addEventListener('click', function() {
    try {
        browser.tabs.create({ url: 'https://sterlingbeason.github.io/SnappyCash/help.html' });
    } catch(error) {
        console.log('error opening help page', error);
    }
});

function saveSettings(callback) {
    browser.storage.local.set({settings: settings}, function() {
        console.log('updated settings');
        if(callback) callback();
    })
}

function displaySettings() {
    console.log(settings);
    // check and uncheck settings
    pageElements.convertAutoCheckbox.checked = settings.convertAuto;
    pageElements.convertSelectionCheckbox.checked = settings.convertSelection;
    pageElements.integrateBadgerCheckbox.checked = settings.integrateBadger;

    // populate ignore list
    pageElements.ignoreList.innerHTML = ""; // clear list items
    settings.ignoreDomains.sort(); // alphabetic sort array
    // move domain to top of list if same as current url
    if(settings.ignoreDomains.indexOf(currentUrl.hostname) > 0) {
        delete settings.ignoreDomains[settings.ignoreDomains.indexOf(currentUrl.hostname)];
        settings.ignoreDomains.unshift(currentUrl.hostname);
    }
    settings.ignoreDomains.forEach(function(domain) {
        let li = document.createElement('li');
        let span = document.createElement('span');
        li.innerText = domain;
        span.innerText = '-';
        span.setAttribute('data-domain', domain);
        span.setAttribute('title', 'remove from ignore list');

        span.addEventListener('click', function() {
            const domain = this.getAttribute('data-domain');
            delete settings.ignoreDomains[settings.ignoreDomains.indexOf(domain)];
            saveSettings();
            this.parentNode.style.maxHeight = '0';
            this.parentNode.style.padding = '0';
            this.parentNode.style.border = '0'; // can i reduse these to one line?
            console.log('domain removed');
        });
        li.appendChild(span);
        pageElements.ignoreList.appendChild(li);
    })
}

document.addEventListener('DOMContentLoaded', function() {
    browser.storage.local.get('settings', function(data) {
        settings = data.settings;

        displaySettings();
    });
});

updateCurrentUrl();
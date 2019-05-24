require("babel-polyfill");

import { findAndConvert, insertBadgerTest, startObserver, insertToastContainer, insertToastMessage, shareBadgerSetting, deactivateListeningAttr, checkSelection, badgerWalletBlocked } from './utils.js';
const style = require('./style.css');

const browser = chrome || browser;

let settings; // extension settings
let isBadgerInstalled = false; // Badger Wallet API on page test result
let toastContainer; // transaction message will go here after inserted to page
let url = new URL(location);

// get settings and run main
browser.storage.local.get('settings', async function(data) {
    settings = data.settings;
    shareBadgerSetting(settings.integrateBadger); // add Badger Wallet setting to utils.js scope

    await main();
});

// listen for messages from background js
browser.runtime.onMessage.addListener(msg => {
    switch (msg.action) {
        case 'transaction':
            let value = parseFloat(msg.transaction.value);
            let tx = msg.transaction.tx;
            let cashAddress = msg.cashAddress;
            let price = parseFloat(msg.transaction.price);
            let toastContent = `${value} ($${price.toFixed(2)}) <a href='https://explorer.bitcoin.com/bch/tx/${tx}' target='_blank'>view</a>`;
            insertToastMessage(toastContainer, toastContent);
            break;

        case 'subscriptionExpired':
            let address = msg.address;
            deactivateListeningAttr(address);
            break;
    }
});

async function main() {
    if(settings.ignoreDomains.indexOf(url.hostname) < 0) {
        // site not ignored

        // insert style sheet if extension essentially activated
        if(settings.convertAuto || settings.convertSelection) {
            (async () => {
                style.use(); // insert css style sheet
            })();

            toastContainer = insertToastContainer();
        }

        // convert if setting true
        if(settings.convertAuto) {
            
            startObserver();

            findAndConvert();

            // badger wallet integration
            if(settings.integrateBadger) {
                // integrate badger wallet
                // badger api test
                insertBadgerTest();
                
                // allow time to inject script and check badger status 
                setTimeout(function() {
                    try {
                        isBadgerInstalled = document.querySelector('#badger-check').value === 'true';
                        if(isBadgerInstalled) {
                            console.log('Badger Wallet is installed!');

                        } else {
                            console.log('Badger Wallet is NOT installed or page blocks our access to it.');
                            badgerWalletBlocked();
                        }
                    } catch (error) {
                        console.log('error testing badger api', error);
                    }
                    
                }, 500);
            }
        }
        
        // convert on selection events if setting true
        if(settings.convertSelection) {
            console.log('selection conversion enabled');
            
            document.addEventListener('mouseup', function(e) {
                let selection = window.getSelection();
                if(selection.type === 'Range' && selection.anchorNode === selection.focusNode && Math.abs(selection.anchorOffset - selection.focusOffset) > 35) { // 35 is arbitrary to quickly filter selection shorter than address length
                    checkSelection(selection); // checks and converts if address found
                }
            });
        } else {
            console.log('selection converted disabled');
        }
    } else {
        // current site in ignore list
        console.log('ignoring site');
    }
}
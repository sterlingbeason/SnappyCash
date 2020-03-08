require("babel-polyfill");

import { firstInstall, convertToLegacy, startTransactionSocket, updatePrice } from './utils.js';

const browser = chrome || browser;

let isSocketListening = false; // tracks status of bch transactions socket
let transactionSubscribers = []; // holds tabs that are waiting for transactions and the addresses to listen for

let bchPrice = {
    timestamp: 0, // Math.floor(Date.now() / 1000) [seconds]
    price: 0,
    expire: 300 // seconds (5 minutes)
}

// on install event
browser.runtime.onInstalled.addListener(function(details){
    console.log(`Details reason: ${details.reason}`);
    if(details.reason === 'install') {
            firstInstall();
    }
});

browser.browserAction.setBadgeText({text: "0"});
browser.browserAction.setBadgeBackgroundColor({color: "#ff8c01"});
try {
    browser.browserAction.setBadgeTextColor({color: "#ffffff"}); // broke chrome
} catch(error) {
    console.log("can't set badge text color", error);
}

browser.runtime.onMessage.addListener((msg, sender, callback) => {
    switch (msg.action) {
        case 'badge':
            // badge update
            browser.browserAction.setBadgeText({text: msg.badge, tabId: sender.tab.id});
            callback();
            break;

        case 'price':
            // BCH price request
            let currentTimestamp = Math.floor(Date.now() / 1000);
            if(currentTimestamp - bchPrice.timestamp > bchPrice.expire) {
                // update price
                console.log('new price');
                updatePrice()
                    .then((price) => {
                        let currentTimestamp = Math.floor(Date.now() / 1000); // timestamp in seconds
                        bchPrice.timestamp = currentTimestamp;
                        bchPrice.price = price;
                        callback(price);
                    })
                    .catch((error) => {
                        console.log('error getting price', error);
                    });
                return true; // indicates to event listener that responce is asynchronous
            } else {
                console.log('old price');
                callback(bchPrice.price);
            }
            break;

        case 'transactions':
            // subscribe address to matching transactions
            console.log('subscribe');
            let address = convertToLegacy(msg.address);
            if(address) {
                console.log(address);
                transactionSubscribers.push({
                    tabId: sender.tab.id, // tab that requested
                    cashAddress: msg.address, // original cash address
                    address: address, // address to watch
                    expire: Math.floor(Date.now() / 1000) + 120 // expire in ~2 minutes
                });
                console.log(`socket open: ${isSocketListening}`);
                // check status of transaction socket
                if(!isSocketListening){
                    // socket closed, start
                    isSocketListening = true;
                    startTransactionSocket(transactionSubscribers, function() {
                        isSocketListening = false;
                    });
                }
                callback();
            } else {
                console.log('Address may not be valid');
            }
            break;

        default:
            callback();
    }
});
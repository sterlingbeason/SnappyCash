require("babel-polyfill");

import { Address } from 'bitbox-sdk/lib/Address';
import { Socket } from 'bitbox-sdk/lib/Socket';
import { Price } from 'bitbox-sdk/lib/Price';

const browser = chrome || browser;

const bitboxAddress = new Address();
const bitboxPrice = new Price();

let price = 0;

/**
 * Save settings object to extension local storage.
 * @param {object} settings object with all settings
 */
export function setSettings(settings) {
    browser.storage.local.set(settings, function() {
        console.log('initialized settings');
    });
}

/**
 * Called on extension's first installation complete, sets default settings.
 */
export function firstInstall() {
    const initialSettings = {
        settings: {
            convertAuto: true, // whether to convert bch addresses on page load
            convertSelection: true, // whether to watch selections for bch addresses to convert
            integrateBadger: true, // whether to include badger option in conversion
            // disable extension on these (sub)domains
            ignoreDomains: [
                "explorer.bitcoin.com",
                "blockchair.com",
                "blockexplorer.com",
                "bitinfocharts.com"
            ]
        }
    }

    setSettings(initialSettings);

    // open installed landing page
    try {
        browser.tabs.create({ url: 'https://sterlingbeason.github.io/SnappyCash/installed.html' });
    } catch(error) {
        console.log('error opening installed landing page', error);
    }
}

/**
 * Get BCH price, return promise<number>
 */
export async function updatePrice() {
    price = await bitboxPrice.current('usd');
    return price;
}

/**
 * @private
 * Sends message to tab that requested the address transactions listening that a matching transaction occured. 
 * @param {object} subscription {tab, address, expire timestamp}
 * @param {object} transaction transaction message from socket
 */
function notifyTabOfTransaction(subscription, transaction) {
    let tabId = subscription.tabId;
    let cashAddress = subscription.cashAddress;
    let tx = transaction.format.txid;
    let value = transaction.outputs[0].value;
    browser.tabs.sendMessage(
        tabId,
        {
            action: 'transaction',
            transaction: {
                tx: tx,
                value: value,
                price: value * (price / 100),
                cashAddress: cashAddress
            }
        }
    );
}


function notifyTabOfUnsubscription(subscription) {
    let tabId = subscription.tabId;
    let address = subscription.cashAddress; // cash address
    browser.tabs.sendMessage(
        tabId,
        {
            action: 'subscriptionExpired',
            address: address
        }
    );
}

/**
 * @private
 * Check and remove subscriptions if the expire timestamp ~now. Called from a setInterval in startTransactionSocket()
 * @param {array} transactionSubscribers Array of transaction subscribers for an address match
 */
function cleanSubscriptions(transactionSubscribers) {
    for(let i = 0; i < transactionSubscribers.length; i++){
        let timestampNow = Math.floor(Date.now() / 1000);

        if(timestampNow > transactionSubscribers[i].expire) {
            console.log(`subscription expired: ${transactionSubscribers[i].address}`);

            notifyTabOfUnsubscription(transactionSubscribers[i]);

            transactionSubscribers.splice(i, 1); // remove subscription
        }
    }
}

/**
 * @private
 * Called for each transaction recieved from the BitBox transaction socket. Looks for a match between subscribers 
 * and transaction on the BCH blockchain. Lets tabs know of matching tranasction.
 * @param {object} transaction Parsed JSON message from BitBox transactions socket
 * @param {Array} transactionSubscribers Array of transaction subscribers for an address match
 */
function processTransaction(transaction, transactionSubscribers) {
    // NOTE: addresses from socket are legacy format
    console.log('transaction...');
    let stop = false;
    for(let o = 0; o < transaction.outputs.length && !stop; o++) {
        let addresses = transaction.outputs[o].scriptPubKey.addresses;

        for(let i = 0; i < addresses.length && !stop; i++) {
            for(let j = 0; j < transactionSubscribers.length; j++) {
                if(addresses[i] === transactionSubscribers[j].address) {
                    console.log('Transaction Match!');
                    notifyTabOfTransaction(transactionSubscribers[j], transaction);
                    stop = true;
                    break;
                }
            }
        }
    }
}

/**
 * Start a socket for BCH blockchain transactions (0-conf) broadcast from rest.bitcoin.com. Start subscription cleaning interval for expirations.
 * @param {array} transactionSubscribers Array of transaction subscribers for an address match
 * @param {function} onClose callback on socket disconnect
 */
export function startTransactionSocket(transactionSubscribers, onClose) {
    let socket = new Socket({callback: () => {
        console.log('connected');
    }, wsURL: 'wss://ws.bitcoin.com'});

    socket.listen('transactions', (message) => {
        let transaction = JSON.parse(message);
        processTransaction(transaction, transactionSubscribers);
    });

    updatePrice(); // update 'price' for conversion on transaction match

    // subscription cleaning interval
    let subscriptionCleanInterval = setInterval(function() {
        cleanSubscriptions(transactionSubscribers);
        if(transactionSubscribers.length === 0) {
            // no subscriptions remaining
            console.log('socket disconnected due to no subscribers');
            try {
                socket.socket.disconnect();
                onClose();
            } catch(error) {
                console.log('error disconnecting from socket', error);
            }
            clearInterval(subscriptionCleanInterval);
        }
    }, 120000); // 2 minutes
}

/**
 * Convert BCH address to legacy address.
 * @param {string} address BCH address
 * @returns {string} Legacy address
 * @returns {null} null if parameter was not a cashaddress
 */
export function convertToLegacy(address) {
    if(bitboxAddress.isCashAddress(address)) {
        let legAddress = bitboxAddress.toLegacyAddress(address);
        return legAddress;
    }
    return;
}
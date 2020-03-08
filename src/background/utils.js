require("babel-polyfill");

import { Address } from 'bitbox-sdk/lib/Address';
import { Socket } from 'bitbox-sdk/lib/Socket';
import { Price } from 'bitbox-sdk/lib/Price';
import { CashAccounts } from 'bitbox-sdk/lib/CashAccounts';

const browser = chrome || browser;

const bitboxAddress = new Address();
const bitboxPrice = new Price();
const bitboxCashAccounts = new CashAccounts();

let price = 0;

const initialStorage = {
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
    },
    cashAccounts: {
        known: {}, // previously queried
        invalid: [] // unregistered strings matchings cash account format
    }
}

/**
 * Save data object to extension local storage.
 * @param {object} data object with all key value pair
 */
export function setStorage(data) {
    browser.storage.local.set(data, function() {
        console.log('set ', Object.keys(data)[0]);
    });
}

/**
 * Called on extension update. Merge existing settings with new? default settings and set.
 */
export async function onUpdate() {
    // get settings from storage
    let dataSettings = await new Promise((resolve, reject) => {
        browser.storage.local.get('settings', function(data) {
            resolve(data);
        });
    });

    // merge storage settings with defaults
    let mergedSettings = {
        settings: {...initialStorage.settings, ...dataSettings.settings}
    }
    setStorage(mergedSettings);

    // get Cash Accounts cache from storage
    let dataCACache = await new Promise((resolve, reject) => {
        browser.storage.local.get('cashAccounts', function(data) {
            resolve(data);
        });
    });

    // merge storage Cash Accounts cache with defaults
    let mergedCACache = {
        cashAccounts: {...initialStorage.cashAccounts, ...dataCACache.cashAccounts}
    };
    setStorage(mergedCACache);
}

/**
 * Called on extension's first installation complete, sets default settings.
 */
export function firstInstall() {
    setStorage(initialStorage);

    // open installed landing page
    try {
        browser.tabs.create({ url: 'https://sterlingbeason.github.io/SnappyCash/installed.html' });
    } catch(error) {
        console.log('error opening installed landing page', error);
    }
}

/**
 * @private
 * Store Cash Account with address or as invalid/unregistered Cash Account formatted string.
 * @param {Boolean} isCashAccount 
 * @param {String} address 
 */
async function recordCashAccount(isCashAccount, cashAccount = null, address = null) {
    let data = await new Promise((resolve, reject) => {
        browser.storage.local.get('cashAccounts', async function(data) {
            resolve(data);
        });
    });

    if(isCashAccount) {
        // add cash account string to known accounts
        data.cashAccounts.known[cashAccount] = {
            address: address,
            time_queried: Date.now()
        }
    } else {
        // add cash account string to known invalid/unregistered accounts
        data.cashAccounts.invalid.push(cashAccount);
    }

    browser.storage.local.set(data, function() {
        console.log('Cash Account local registry updated.')
    });
}

/**
 * Lookup Cash Account for payment address. Notify of inregistered cash account formatted strings. First check previously seen format matched strings.
 * @param {String} cashAccount 
 */
export async function lookupCashAccount(cashAccount) {
    cashAccount = cashAccount.toLowerCase(); // normalize cash account strings

    // lookup from storage
    let data = await new Promise((resolve, reject) => {
        browser.storage.local.get('cashAccounts', async function(data) {
            resolve(data);
        });
    });

    if(data.cashAccounts.known.hasOwnProperty(cashAccount)) {
        // Cash Account previously lookedup
        console.log(cashAccount, 'previously known');
        return data.cashAccounts.known[cashAccount].address;

    } else if(data.cashAccounts.invalid.indexOf(cashAccount) >= 0) {
        // ignore cash account string. Previously verified as unregistered
        console.log(cashAccount, 'previously marked invalid');
        return false;
    }


    // lookup with online resource
    try {
        let cashAccountParts = cashAccount.split('#');
        let response = await bitboxCashAccounts.lookup(cashAccountParts[0], parseInt(cashAccountParts[1]));
        let address = response.information.payment[0].address;

        recordCashAccount(true, cashAccount, address);

        return address;

    } catch (error) {

        if(typeof error === "object" && error.hasOwnProperty('error') && error.error.match(/No account/i)) {
            // assume invalid/unregistered Cash Account
            recordCashAccount(false, cashAccount);
        } else {
            // unknown error
            console.log(error);
        }
        return false;
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
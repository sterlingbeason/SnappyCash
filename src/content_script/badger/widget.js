require("babel-polyfill");

const browser = chrome || browser;

/**
 * Get current BCH from background script.
 * @returns {promise} Price in cents 10000 -> $100.0
 */
function getCurrentPrice() {
    return new Promise(function(resolve, reject) {
        browser.runtime.sendMessage({action: 'price', currency: 'usd'}, function(current) { // 'usd' placeholder, not used currently
            resolve(current);
        });
    });
}

/**
 * Insert script into the page scope for communicating a transaction to the Badger Wallet API (web4bch). Callback reenables widget 'send' button
 * and creates toast of transaction result w/ txid. 
 * @param {string} widgetId DOM element id of requesting Badger Wallet widget.
 * @param {string} toAddress Recieving BCH address
 * @param {string|number} toValue Transaction amount 
 */
function requestTransaction(widgetId, toAddress, toValue) {
    let script = document.createElement('script');
    script.type = 'text/javascript';
    script.innerText = `if(typeof web4bch !== 'undefined') {\
        web4bch = new Web4Bch(web4bch.currentProvider);\
        let txParams = {\
            to: '${toAddress}',\
            from: web4bch.bch.defaultAccount,\
            value: '${toValue}'\
        };\
        web4bch.bch.sendTransaction(txParams, (err, txid) => {\
            let widgetContainer = document.getElementById('${widgetId}');\
            let sendBtn = widgetContainer.getElementsByClassName('bch-badger-btn')[0];\
            let bchtoastcontainer = document.getElementById('bch-toast-container');\
            let bchtoast = document.createElement('div');\
            if(err) {\
                sendBtn.classList.remove('bch-badger-btn-disabled');\
                bchtoast.innerText = 'Transaction not sent';\
                bchtoastcontainer.appendChild(bchtoast);\
                console.log('send error', err);\
            } else {\
                sendBtn.classList.remove('bch-badger-btn-disabled');\
                bchtoast.innerHTML = 'Transaction sent! <a href="https://explorer.bitcoin.com/bch/tx/' + txid + '" target="_blank">view tx</a>';\
                bchtoastcontainer.appendChild(bchtoast);\
                console.log('send success, transaction id:', txid);\
            }\
        });\
    }`;
    document.body.appendChild(script);
}

/**
 * Called by BCH amount input change listeners. Takes input value and converts to price in fiat currency. 
 * @param {element} priceSpan DOM element (span) that displays price of inputed BCH amount
 * @param {number} bchValue BCH amount for transaction
 */
function inputChange(priceSpan, bchValue) {
    let prom = getCurrentPrice();
        prom
            .then(function(price) {
                let conversion = parseFloat(bchValue) * price / 100;
                priceSpan.innerText = `$${conversion.toFixed(2)}`;
            })
            .catch(function(error) {
                console.log('Error getting price from background: ', error);
            });
}

/**
 * Create DOM elements that make up the Badger Wallet widget. Appends to page.
 * @param {string} address BCH address
 */
export function createWidget(address) {
    let widgetId = `badger-${Math.round(Math.random() * 10000, 0)}`; // used for inserted transaction script's callback

    let badgerOptionDiv = document.createElement('div');
    badgerOptionDiv.id = widgetId;
    badgerOptionDiv.classList.add('bchinner');
    badgerOptionDiv.classList.add('bch-badger');
    badgerOptionDiv.setAttribute('data-address', address);

    // widget title
    let header = document.createElement('span');
    header.classList.add('bch-badger-title');
    header.innerText = 'Badger Wallet';

    // balance ?
    /*<span class="bch-badger-balance-container">\
                                    BCH: \
                                    <span class=bch-badger-balance">1.00000000</span>\
                                </span>*/

    // price conversion 
    let priceSpan = document.createElement('span');
    priceSpan.classList.add('bch-badger-price');
    priceSpan.innerText = '$0.00';

    // BCH input 
    let bchInput = document.createElement('input');
    bchInput.type = 'number';
    bchInput.step = '0.00001';
    bchInput.min = '0.0000'
    bchInput.value = '0.0001';
    bchInput.classList.add('bch-badger-input');
    // input change events for price conversion
    bchInput.addEventListener('change', function()  {
        inputChange(priceSpan, bchInput.value);
    });
    bchInput.addEventListener('keyup', function()  {
        inputChange(priceSpan, bchInput.value);
    });

    // send button
    let sendBtn = document.createElement('div');
    sendBtn.classList.add('bch-badger-btn');
    sendBtn.innerText = 'send';
    sendBtn.addEventListener('click', function() {
        // send if not awaiting transaction
        if(!sendBtn.classList.contains('bch-badger-btn-disabled')) {
            let toValue = Math.round(parseFloat(bchInput.value) * 100000000, 0).toString(); // satoshis

            sendBtn.classList.add('bch-badger-btn-disabled');

            requestTransaction(widgetId, address, toValue);
        }
    });

    // append all elements 
    badgerOptionDiv.appendChild(header);
    badgerOptionDiv.appendChild(bchInput);
    badgerOptionDiv.appendChild(priceSpan);
    badgerOptionDiv.appendChild(sendBtn);
    
    return badgerOptionDiv;
}
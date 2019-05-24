require("babel-polyfill");

const QR = require('qrcode-generator');

const bwWidget = require('./badger/widget.js');

const browser = chrome || browser;

// qr params
const typeNumber = 4;
const errorCorrectionLevel = 'L';

const ignoreNodeList = ['SCRIPT', 'COMMENT', 'STYLE']; // ignore these textNodes Parents
//const regexBCH = new RegExp(/\b((bitcoincash:)?(q|p)[a-z0-9]{41})\b(.*)/s);
//const regexBCHExact = new RegExp(/\b((bitcoincash:)?(q|p)[a-z0-9]{41})\b/);

const regexBCH = new RegExp(/\b((q|p)[a-z0-9]{41})\b(.*)/s); // matches BCH address a multiline tail of 0+ characters
const regexBCHExact = new RegExp(/\b((q|p)[a-z0-9]{41})\b/); // matches BCH address 

let isBadgerEnabled = false; // user setting. Does the user want to integrate Badger Wallet
let isBadgerBlocked = false; // tracks our access to Badger Wallet API on page
let found = []; // array, details on found address and respective nodes

/**
 * @private
 * Send badge text value to background script for update. Value count of found addresses on page.
 */
function updateBadgeValue() {
    try {
        browser.runtime.sendMessage({action: 'badge', badge: found.length.toString()}, function() {
            if (chrome.runtime.lastError) {
                console.log(chrome.runtime.lastError.message);
            }
        });
    } catch(error) {
        console.log('error updating badge value', error);
    }
}

/**
 * Updates Badger Wallet widgets on page with CSS pseudo element "blocked" message. Sets setting to add message to 
 * additionally converted nodes.
 */
export function badgerWalletBlocked(){
    isBadgerBlocked = true; // no access to Badger Wallet API
    let badgerNodes = document.querySelectorAll('.bch-badger');
    badgerNodes.forEach(function(node) {
        node.classList.add('bch-badger-blocked');
    })
}

/**
 * Set utils.js scoped Badger Wallet integration setting.
 * @param {boolean} setting Whether user requests Badger Wallet integration
 */
export function shareBadgerSetting(setting) {
    isBadgerEnabled = setting;
}

/**
 * Directly adds a toast container element to page.
 * @returns toast container element
 */
export function insertToastContainer() {
    let toastContainer = document.createElement('div');
    toastContainer.id = 'bch-toast-container';
    document.body.appendChild(toastContainer);
    return toastContainer;
}

/**
 * Appends a toast message element to toast container.
 * @param {element} toastContainer 
 * @param {string} toastContent 
 */
export function insertToastMessage(toastContainer, toastContent) {
    let bchtoast = document.createElement('div');
    bchtoast.innerHTML = toastContent;
    toastContainer.appendChild(bchtoast);
}

/**
 * @private
 * Generates a QR code (SVG) from 'data-address' attribute that will contain the QR code. 
 * @param {element} qrNode 
 */
function fillQR(qrNode) {
    let address = qrNode.getAttribute('data-address');

    // construct qr code element
    var qr = QR(typeNumber, errorCorrectionLevel);
    qr.addData(address);
    qr.make();
    let svg = qr.createSvgTag({
        scalable: true
    });
    qrNode.innerHTML = svg;
}

/**
 * @private
 * Appends all child elements that make up the Badger Wallet widget.
 * @param {element} container 
 */
function fillBadger(container) {
    const address = container.getAttribute('data-address');
    const badgerWidget = bwWidget.createWidget(address);

    if(isBadgerBlocked) {
        badgerWidget.classList.add('bch-badger-blocked'); // add blocked message to widget
    }
    
    container.appendChild(badgerWidget);

    // add updated tag
    container.setAttribute('data-updated', 'true'); // note used...
}

/**
 * Update QR code node(s) with a 'false' value for the 'data-listening' attribute. Allows for future transactions listening.
 * @param {string} address BCH address
 */
export function deactivateListeningAttr(address) {
    let nodes = document.querySelectorAll(`.bch-qr[data-listening=true][data-address='${address}']`);
    nodes.forEach(function(node) {
        node.setAttribute('data-listening', 'false');
    });
}

/**
 * Checks if textNode has been processed before and has already got options.
 * @param {textNode} node 
 */
function hasNodeBeenConverted(node) {
    let i = 0;
    for(; i < found.length; i++) {
        if(found[i].textNode === node) {
            console.log('existing node');
            return i;
        }
    }
    return false;
}

/**
 * Determine if node is a textNode that fits some simple criteria for address containing potential. 
 * @param {textNode} node This should be a textNode, but that is what this is trying to determine.
 * @returns {boolean} false: fail to reject as suitable textNode, true: reject as suitable textNode
 */
function quickFilterNode(node) {
    try {
        let returnValue =   typeof node.data === 'undefined' || // assumption textNode should have 'data' property
                            node.parentNode === null || 
                            ignoreNodeList.indexOf(node.parentNode.nodeName) > -1 || // check if in ignoreNodeList
                            node.length < 35 ||  // arbitrary too short for address 
                            node.data.search(regexBCHExact) < 0 || // address found in text
                            (node.parentNode.hasOwnProperty('contentEditable') && node.parentNode.contentEditable === 'true'); // elements that act as inputs
        return returnValue;
    } catch (error) {
        // error filtering. reject default
        console.log('error filtering node', error);
        console.log(node);

        return false;
    }
}

/**
 * Duplicate functionality as quickFilterNode() with returns specific to a treewalker.
 * @param {textNode} node 
 * @returns {boolean} false: fail to reject as suitable textNode, true: reject as suitable textNode
 */
function walkerFilter(node) {
    try {
        if(quickFilterNode(node)) {
            return NodeFilter.FILTER_SKIP;
        } else {
            return NodeFilter.FILTER_ACCEPT;
        }
    } catch(error) {
        console.log('error filtering node', error);
        console.log(node);
    }
}

/**
 * Send message to background script to listen for transaction to this address.
 * @param {string} address BCH address
 * @param {function} callback Function to call from background listener on complete
 */
function subscribeToTransactions(address, callback) {
    browser.runtime.sendMessage({action: 'transactions', address: address}, callback);
}

/**
 * Takes textNode that has been determined to hold a BCH address and cut/append options to the right of the address.
 * @param {textNode} node textNode that has BCH address within it
 * @param {array} m RegExp match object of BCH address and other text
 * @returns {element} Appended options container
 */
export function convertTextNode(node, m) {
    let parent = node.parentNode;
    let text = node.data;

    //let head =      m[0]; no more head
    let address =   m[1];
    let tail =      m[3];

    // check if already accounted for
    if(parent.classList.contains('bchfound')){
        return;
    }
    node.data = text.slice(0, text.length - tail.length);

    //parent.insertBefore(document.createTextNode(head), node);

    let optionsContainer = parent.insertBefore(document.createElement('div'), node.nextSibling);
    optionsContainer.classList.add('bchouter');
    optionsContainer.setAttribute('data-address', address);

    let qrEl = document.createElement('div');
    qrEl.classList.add('bchinner');
    qrEl.classList.add('bch-qr');
    qrEl.setAttribute('data-address', address);
    qrEl.setAttribute('data-listening', 'false');

    // subscribe to transaction listener
    qrEl.addEventListener('mouseover', function() {
        let isTransactionListening = this.getAttribute('data-listening');
        if(isTransactionListening === 'false') {
            qrEl.setAttribute('data-listening', 'true');
            subscribeToTransactions(address, function() {});
        }
    });

    optionsContainer.appendChild(qrEl);

    (async () => {
        fillQR(qrEl);
    })();

    if(isBadgerEnabled) { // badger setting test
        (async() => {
            fillBadger(optionsContainer);
        })();
    }

    parent.insertBefore(document.createTextNode(tail), optionsContainer.nextSibling);

    // update badge value of newly found address
    (async () => {
        updateBadgeValue();
    })();

    return optionsContainer;
}

/**
 * Tests textNode for an address and creates a found object.
 * @param {textNode} node 
 * @returns {object} Found object
 */
function testNodeForAddress(node) {
    let text = node.data;
    let m = text.match(regexBCH); // 1: address, 2: q|p, 3: tail
    if(m) {
        let foundObj = {
            textNode: node, // text node where address was found
            optionsNode: null, // created options container node for QR and Badger
            address: m[1], // found address
            m: m
        }
        return foundObj;
    }
    return;
}

/**
 * @private
 * Set optionsNode value for found address object.
 * @param {textNode} node textNode that contains found address
 * @param {element} createdNode Options node appended next to address
 */
function setFoundObjectOptionsNode(node, createdNode) {
    for(let i = 0; i < found.length; i++) {
        if(found[i].textNode === node) {
            found[i].optionsNode = createdNode;
            break;
        }
    }
}

/**
 * Pass in found array that will hold all found objects.
 */
export async function findAndConvert() {
    const nodes = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, walkerFilter, null);
    
    try {
        let node;
        while (node = nodes.nextNode()) {
            if(hasNodeBeenConverted(node) === false) {
                let result = testNodeForAddress(node);
                if(result) {
                    found.push(result);
                    const createdNode = convertTextNode(node, result.m);

                    setFoundObjectOptionsNode(node, createdNode);
                }
            }
        }
    } catch (error) {
        console.error(error);
    }
}

/**
 * Inserts a script into page to get access to the Badger Wallet api (web4bch). Leaves a hidden input that informs content script of its existence.
 */
export function insertBadgerTest() {
    // insert script to check if badger wallet is installed
    let script = document.createElement('script');
    script.type = 'text/javascript';
    script.src = browser.runtime.getURL('./badger/badger_check.js');
    document.body.appendChild(script);
}

/**
 * Called by mutation observer, it processes a mutated/added node (textNode?) for BCH address testing and conversion.
 * @param {textNode?} target Node to test and process
 */
function observerNodeProcess(target) {
    let index = null;

    if(quickFilterNode(target) && (index = hasNodeBeenConverted(target)) === false) {
        // node doesn't match criteria

        return;
    }

    if(index === null) {
        index = hasNodeBeenConverted(target);
    }
    
    if(index === false) {
        // no matching nodes
        console.log('----new node----');
        let result = testNodeForAddress(target);
        if(result) {
            found.push(result);
            const createdNode = convertTextNode(target, result.m);
            
            setFoundObjectOptionsNode(node, createdNode);
        }
    } else {
        // node should have address that was previously found
        // check if address is still there
        let foundObj = found[index];
        
        if(target.data.search(foundObj.address) === -1) {
            // address not found where expected
            // remove found obj and options
            console.log('removing options for changed node w/o address');
            found[index].optionsNode.outerHTML = '';
            found.splice(index, 1);

            updateBadgeValue();
        }
    }
}

/**
 * Called by mutation observer, checks if this node is claimed by a found object in the found array. If so, removes the options for that address.
 * @param {NodeList} removedNodes nodes removed from page
 */
function checkRemovedNodes(removedNodes) {
    let stop = false;
    for(let i = 0; i < removedNodes.length && !stop; i++) {
        for(let j = 0; j < found.length && !stop; j++) {
            if(removedNodes[i] === found[j].textNode) {
                // node removed is apart of found address
                // remove address options
                console.log('removing options for deleted node');
                found[j].optionsNode.outerHTML = '';
                found.splice(j, 1);

                updateBadgeValue();
            }
        }
    }
}

/**
 * Called when a selection was detected. Tests focusNode for address and converts if found.
 * @param {Selection} selection Selection object https://developer.mozilla.org/en-US/docs/Web/API/Selection
 */
export function checkSelection(selection){
    const node = selection.focusNode;

    if(!quickFilterNode(node) && hasNodeBeenConverted(node) === false) {
        let result = testNodeForAddress(node);
        if(result) {
            found.push(result);
            const createdNode = convertTextNode(node, result.m);

            setFoundObjectOptionsNode(node, createdNode);

            updateBadgeValue();
        }
    }
}

/**
 * Initialize page mutation observer with its nested callback.
 * @returns {observer} observer
 */
export function startObserver() {
    console.log('starting observer');

    /*  config for observers scope.
    *   attribute filter, because the assumption is only textNodes have this property.
    *   chracterData true to focus on only text mutations.
    *   childList and subtree for entire page scope. */
    let config = { attributeFilter: ['data'], characterData : true, childList: true, subtree: true };

    let callback = function(mutationsList, observer) {
        (async () => {
            for(var mutation of mutationsList) {
                let addedNodes =    mutation.addedNodes;
                let target =        mutation.target;
                let removedNodes =  mutation.removedNodes;
    
                if(addedNodes.length) {
                    addedNodes.forEach(function(target) {
                        (async () => {
                            try {
                                observerNodeProcess(target);
                            } catch(error) {
                                console.log('unable to process observed added node', error);
                            }
                        })();
                    });
                }
    
                if(removedNodes.length) {
                    (async () => {
                        try {
                            checkRemovedNodes(removedNodes);
                        } catch(error) {
                            console.log('unable to process observed removed node', error);
                        }
                    })();
                }
    
                if(target !== null) {
                    (async () => {
                        try {
                            observerNodeProcess(target);
                        } catch(error) {
                            console.log('unable to process observed mutated node', error);
                        }
                    })();
                }
            }
        })();
    };

    let observer = new MutationObserver(callback);

    observer.observe(document.body, config);

    return observer;
}
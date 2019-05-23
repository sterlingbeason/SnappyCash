/**
 * Script to be inserted on page if Badger Wallet integration enabled. Creates a 
 * hidden input with the status of Badger Wallet API (web4bch) for use in content
 * script.
 */

{
    console.log('badger check...checking in.');
    let isBadgerInstalled = (typeof web4bch !== 'undefined'); // check if badger wallet api object (web4bch) exists on page

    // hidden input that will indicate whether badger wallet is installed to the content script
    let input = document.createElement('input');
    input.type = 'hidden';
    input.id = 'badger-check';
    input.value = isBadgerInstalled;

    document.body.appendChild(input);
}
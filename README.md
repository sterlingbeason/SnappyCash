# Snappy Cash
Browser extension that enhances plain-text Bitcoin Cash addresses with QR codes and integrated Badger Wallet widgets
[Youtube Video](https://www.youtube.com/watch?v=MRCQI_juVLk)

## Build/Run
### Requirements
* Node.js v11.2.0
* NPM v6.9.0
* Chrome or Firefox browser

### Production Build
```
npm install
npm run build
```

Load extension into your browser:

- Chrome:
  1. Type `chrome://extensions` in your address bar.
  2. Enable developer mode (checkbox/switch)
  3. Click the "Load unpacked extension" button, navigate to the `dist`, and click "Ok".
- Firefox
  1. Type `about:debugging` in your address bar.
  2. Click the `Load Temporary Add-on` button, navigate to the `dist/manifest.json` file, and click "Open".
  
## Credits
* [TaoJones](https://twitter.com/ColinAd33006332) for kick-starting the idea
* [cgcardona](https://twitter.com/cgcardona) helped with library troubleshooting 
* [Bitcoin.com](https://developer.bitcoin.com) developer packages

## Tipping
bitcoincash:qqxgjv4erfayzegy3h9p7dv4jja3jf6cs5ygtgk7tr

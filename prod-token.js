const crypto = require('crypto');
const fs = require('fs');
const https = require('https');
const dateTime = require('node-datetime');
const path = require('path');
const uuidv4 = require('uuid/v4');

// Tested with node-v10.9.0 and npm-6.2.0

var production = false;
var args = process.argv.slice(2);
if( args.length > 0 ) {
    production = (args[0].toLowerCase() == 'prod');
}

if (production === true) {
    console.log(`\n\n==== DOING PRODUCTION====\n\n`);

    var domain = 'api.ing.com';
    var keyId = '3e8e1c15-acac-434d-83c7-f138f59d6f1b'; // Application ID from portal
//TODO: Place back own certificates
    var signingKeyFile = 'example_client_signing.key';
    var signingKeyPass = 'changeit';
    var tlsCertFile = 'example_client_tls.cer';
    var tlsKeyFile = 'example_client_tls.key';
} else {
    console.log(`\n\n==== DOING SANDBOX====\n\n`);

    var domain = 'api.sandbox.ing.com';
    var keyId = 'example_client_id'; // Application ID
    var signingKeyFile = 'example_client_signing.key';
    var signingKeyPass = 'changeit';
    var tlsCertFile = 'example_client_tls.cer';
    var tlsKeyFile = 'example_client_tls.key';
}

// DEBUG - Using Charles as reverse proxy and no certificate pinning/validation
// process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
// port = 60103; // 443
var port = 443

var urlPath = '/oauth2/token'
var action = 'post';

console.log(`Host: [${domain}:${port}]`);
console.log(`Path: [${urlPath}]`);

if (production === true) {
    var scope = 'greetings:view';
    // TODO: any spaces should become +'s
    var body = `grant_type=client_credentials&scope=${encodeURIComponent(scope)}`;
} else {
    // Only valid body for sandbox
    var body = 'grant_type=client_credentials&scope=create_order+granting+payment-requests+payment-requests%3Aview+payment-requests%3Acreate+payment-requests%3Aclose+virtual-ledger-accounts%3Afund-reservation%3Acreate+virtual-ledger-accounts%3Afund-reservation%3Adelete+virtual-ledger-accounts%3Abalance%3Aview';
}
console.log(`Body: [${body}]`);

var contentType = 'application/x-www-form-urlencoded';
console.log(`Content-Type: [${contentType}]`);

var contentLength = body.length;
console.log(`Content-Length: [${contentLength}]`);

var hash = crypto.createHash('sha256');
hash.update(body);
var digest = `SHA-256=${hash.digest('base64')}`
console.log(`Digest: [${digest}]`);

var dt = dateTime.create();
var now = new Date();
var offset = now.getUTCHours() - now.getHours();
dt.offsetInHours(offset);
var date = `${dt.format('w, d n Y H:M:S')} GMT`;
console.log(`Date: [${date}]`);

var xIngReqID = uuidv4();
console.log(`X-ING-ReqID: [${xIngReqID}]`);

var privateKeyData = fs.readFileSync(path.join(__dirname, signingKeyFile));
var privateKey = { key: privateKeyData, passphrase: signingKeyPass };

const sign = crypto.createSign('RSA-SHA256');
var headers = `(request-target): ${action} ${urlPath}\ndate: ${date}\ndigest: ${digest}\nx-ing-reqid: ${xIngReqID}`;
sign.update(headers);
var headersSignature = sign.sign(privateKey, 'base64');

var signature = `keyId="${keyId}",algorithm="rsa-sha256",headers="(request-target) date digest x-ing-reqid",signature="${headersSignature}"`;
console.log(`Signature: [${signature}]`);

var tlsCertData = fs.readFileSync(path.join(__dirname, tlsCertFile));
var tlsKeyData = fs.readFileSync(path.join(__dirname, tlsKeyFile));

const options = {
    hostname: domain,
    port: port,
    path: urlPath,
    method: action.toUpperCase(),
    key: tlsKeyData,
    cert: tlsCertData,
    headers: {
        'Content-Type': contentType,
        'Content-Length': contentLength,
        'Date': date,
        'Digest': digest,
        'X-ING-ReqID': xIngReqID,
        'Signature': signature,
    }
};
options.agent = new https.Agent(options);

const req = https.request(options, (res) => {
    // ...
    console.log(`\n\nSTATUS: ${res.statusCode}`);
    console.log(`HEADERS: ${JSON.stringify(res.headers)}`);
    res.setEncoding('utf8');
    res.on('data', (chunk) => {
        console.log(`BODY: ${chunk}`);
    });
    res.on('end', () => {
        console.log('No more data in response.');
    });
});

req.on('error', (e) => {
    console.error(`problem with request: ${e.message}`);
});

req.write(body);
req.end();  
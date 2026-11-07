const webpush = require("web-push");

const keys = webpush.generateVAPIDKeys();
console.log("Set these server environment variables. Do not commit the private key:");
console.log(`VAPID_SUBJECT=mailto:admin@your-domain.example`);
console.log(`VAPID_PUBLIC_KEY=${keys.publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${keys.privateKey}`);

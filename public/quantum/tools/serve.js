/* Run the instrument locally: npm run serve, then open the printed address. */
const { start } = require('./server');

const PORT = Number(process.env.PORT) || 8080;

start(PORT).then(() => {
  console.log(`Quantum Lens  →  http://127.0.0.1:${PORT}/`);
  console.log('Use 127.0.0.1, not a LAN address: the camera and the service');
  console.log('worker both need a secure context, and localhost counts as one.');
});
